package certrenewer

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"system_manager/internal/certstore"
	"system_manager/internal/config"
	"system_manager/internal/dockersvc"
	"system_manager/internal/platform"
	"system_manager/internal/schedule"
	"system_manager/internal/task"
)

const renewThresholdDays = 15 // matches certrenewer's own internal threshold

// Config holds everything needed to run the cert-renewal job.
type Config struct {
	domainName            string
	adminEmail            string
	awsAccessKeyID        string
	awsSecretAccessKey    string
	awsRegion             string
	awsHostedZoneID       string
	platformEncryptionKey string
}

// LoadConfig reads the Route53/ACME configuration from the environment.
// PLATFORM_ENCRYPTION_KEY comes from the same Docker secret as the rest
// (see the CLI's secrets/system_manager.go) and is required whenever
// cert renewal is enabled: without it this service cannot read or write
// its own state — see internal/certstore.
func LoadConfig() Config {
	return Config{
		domainName:            config.MustEnv("DOMAIN_NAME"),
		adminEmail:            config.MustEnv("PLATFORM_ADMIN_EMAIL"),
		awsAccessKeyID:        config.MustEnv("AWS_ACCESS_KEY_ID_ROUTE53"),
		awsSecretAccessKey:    config.MustEnv("AWS_SECRET_ACCESS_KEY_ROUTE53"),
		awsRegion:             config.MustEnv("AWS_REGION_ROUTE53"),
		awsHostedZoneID:       config.MustEnv("AWS_HOSTED_ZONE_ID_ROUTE53"),
		platformEncryptionKey: config.MustEnv("PLATFORM_ENCRYPTION_KEY"),
	}
}

// NewStore builds the certstore this package's tasks share. main calls
// it once and passes the result to both New and NewExporter, so a bad
// PLATFORM_ENCRYPTION_KEY fails at startup rather than at 00:00 UTC.
func NewStore(cfg Config) (*certstore.Store, error) {
	return certstore.New(cfg.platformEncryptionKey)
}

// Renewer checks the stored certificate's expiry and, if renewal is due,
// obtains/renews it via ACME and rolls the new secret out to every
// service that consumes it. It implements task.Scheduled: Subject/Run so
// it can be triggered on demand over NATS (via internal/natssvc), and
// NextRun so it also runs automatically once a day by default (via
// internal/schedule).
type Renewer struct {
	cfg        Config
	store      *certstore.Store
	hour       int
	everyHours int // repeats every this many hours after hour; 24 (once a day) if unset — see schedule.EveryNHoursAt

	// rollout serializes the two places that call
	// dockersvc.UpdateCertsInServices. task.Serialize already stops two
	// Runs from overlapping, but ReconcileAtStartup deliberately runs
	// outside that wrapper (it is not a task trigger), so without this
	// a boot-time reconciliation could collide with a NATS-triggered
	// renewal — two concurrent secret-create-and-swap passes over the
	// same services.
	rollout sync.Mutex
}

var _ task.Scheduled = (*Renewer)(nil)

// New returns a Renewer configured from cfg, due to run automatically
// starting at hour:00 UTC and repeating every everyHours (see NextRun),
// in addition to being triggerable on demand over NATS. everyHours <= 0
// means once a day, at hour:00 — see schedule.EveryNHoursAt.
func New(cfg Config, store *certstore.Store, hour, everyHours int) *Renewer {
	return &Renewer{cfg: cfg, store: store, hour: hour, everyHours: everyHours}
}

// Subject identifies this task for NATS routing and logging as
// "certs.renew", which natssvc turns into the subject
// "system_manager.certs.renew". See auth_callout's infra.go for the
// permissions granted to system_manager's NKey on this subject.
func (r *Renewer) Subject() string { return "certs.renew" }

// NextRun returns the next UTC occurrence of r's configured check
// schedule, satisfying task.Scheduled. See schedule.EveryNHoursAt.
func (r *Renewer) NextRun(now time.Time) time.Time {
	return schedule.EveryNHoursAt(now, r.hour, r.everyHours)
}

// Run checks the stored certificate's expiry and, if renewal is due,
// obtains/renews it via ACME and rolls the new secret out to every
// service that consumes it (via internal/dockersvc). It satisfies
// task.Task/task.Scheduled — the returned string is a short summary of
// what happened, relayed to NATS callers and logged the same way as
// every other task in this service. params is unused — nothing about
// cert renewal is caller-configurable today.
//
// Expiry is read from the certificate this service holds on disk, not
// from a TLS handshake against the public domain — see
// certstore.DaysToExpiry for why.
func (r *Renewer) Run(ctx context.Context, params map[string]any) (string, error) {
	log.Println("[certs] checking expiry")

	domainCerts, err := r.store.Load()
	switch {
	case errors.Is(err, certstore.ErrNoState):
		// First run on an empty volume with no seed secret either:
		// nothing to check, everything to obtain.
		log.Println("[certs] no stored certificates — obtaining a new one")
	case err != nil:
		// Undecryptable state. Deliberately NOT treated as "no state":
		// re-obtaining from Let's Encrypt on every scheduled run would
		// burn the duplicate-certificate rate limit while hiding a
		// misconfigured PLATFORM_ENCRYPTION_KEY. See certstore.Decrypt.
		return "", fmt.Errorf("loading local ACME state: %w", err)
	case certstore.IsEmpty(domainCerts):
		log.Println("[certs] stored state carries no certificate — obtaining a new one")
	default:
		// Before deciding whether to renew, make sure the services are
		// actually serving what's stored. A deployment from a stale CLI
		// state file can leave them on an older certificate, and that
		// drift is invisible to the expiry check below — which reads
		// the stored one and correctly concludes there's nothing to do.
		// See Reconcile.
		reconciled, err := r.reconcileWith(ctx, domainCerts)
		if err != nil {
			log.Printf("[certs] could not reconcile services with the stored certificate: %v", err)
		} else if reconciled != "" {
			log.Printf("[certs] %s", reconciled)
		}

		days, err := certstore.DaysToExpiry(domainCerts, time.Now())
		if err != nil {
			log.Printf("[certs] stored certificate has no usable expiry (%v) — proceeding with renewal to be safe", err)
		} else {
			log.Printf("[certs] %d day(s) to expiry", days)
			if days > renewThresholdDays {
				summary := fmt.Sprintf("skipped: %d day(s) left on the stored certificate (threshold %d)",
					days, renewThresholdDays)
				if reconciled != "" {
					summary += "\n" + reconciled
				}
				return summary, nil
			}
		}
	}

	pd := &platform.PlatformData{
		PlatformInfo: platform.PlatformInfo{
			DomainName:                r.cfg.domainName,
			PlatformAdminEmail:        r.cfg.adminEmail,
			AWSAccessKeyIDRoute53:     r.cfg.awsAccessKeyID,
			AWSSecretAccessKeyRoute53: r.cfg.awsSecretAccessKey,
			AWSRegionRoute53:          r.cfg.awsRegion,
			AWSHostedZoneIdRoute53:    r.cfg.awsHostedZoneID,
			DomainCertsType:           "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider",
		},
		DomainCerts: domainCerts,
	}

	log.Println("[certs] requesting/renewing via ACME (Route 53 DNS-01)")
	if err := SetOrUpdateAcmeCerts(pd); err != nil {
		return "", fmt.Errorf("requesting/renewing via ACME (Route 53 DNS-01): %w", err)
	}

	// Persist BEFORE touching Docker: if UpdateCertsInServices fails or
	// the process dies partway through, the next cycle should still see
	// the cert we just obtained (and retry the service rollout with it)
	// rather than re-requesting a new one from Let's Encrypt.
	saveWarning := ""
	if err := r.store.Save(pd.DomainCerts); err != nil {
		saveWarning = fmt.Sprintf("WARNING: could not persist ACME state: %v\n", err)
		log.Printf("[certs] %s", saveWarning)
	}

	r.rollout.Lock()
	defer r.rollout.Unlock()

	dc, err := dockersvc.NewClient()
	if err != nil {
		return saveWarning, fmt.Errorf("connecting to Docker: %w", err)
	}
	defer dc.Close()

	warnings, err := dockersvc.UpdateCertsInServices(ctx, dc, pd)
	if err != nil {
		return saveWarning + warnings, fmt.Errorf("updating services: %w", err)
	}
	if warnings != "" {
		log.Printf("[certs] warnings:\n%s", warnings)
	}

	log.Println("[certs] renewal complete")
	return "renewed and rolled out to traefik/nats\n" + saveWarning + warnings, nil
}
