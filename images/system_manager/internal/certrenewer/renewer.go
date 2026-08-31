package certrenewer

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"time"

	"system_manager/internal/config"
	"system_manager/internal/dockersvc"
	"system_manager/internal/platform"
	"system_manager/internal/schedule"
	"system_manager/internal/task"
)

const (
	stateDir           = "/data/certrenewer"
	stateFile          = stateDir + "/domain_certs.json"
	renewThresholdDays = 15 // matches certrenewer's own internal threshold
)

// Config holds everything needed to run the cert-renewal job.
type Config struct {
	domainName         string
	adminEmail         string
	awsAccessKeyID     string
	awsSecretAccessKey string
	awsRegion          string
	awsHostedZoneID    string
}

// LoadConfig reads the Route53/ACME configuration from the environment.
func LoadConfig() Config {
	return Config{
		domainName:         config.MustEnv("DOMAIN_NAME"),
		adminEmail:         config.MustEnv("PLATFORM_ADMIN_EMAIL"),
		awsAccessKeyID:     config.MustEnv("AWS_ACCESS_KEY_ID_ROUTE53"),
		awsSecretAccessKey: config.MustEnv("AWS_SECRET_ACCESS_KEY_ROUTE53"),
		awsRegion:          config.MustEnv("AWS_REGION_ROUTE53"),
		awsHostedZoneID:    config.MustEnv("AWS_HOSTED_ZONE_ID_ROUTE53"),
	}
}

// Renewer checks the live certificate's expiry and, if renewal is due,
// obtains/renews it via ACME and rolls the new secret out to every
// service that consumes it. It implements task.Scheduled: Subject/Run so
// it can be triggered on demand over NATS (via internal/natssvc), and
// NextRun so it also runs automatically once a day by default (via
// internal/schedule).
type Renewer struct {
	cfg        Config
	hour       int
	everyHours int // repeats every this many hours after hour; 24 (once a day) if unset — see schedule.EveryNHoursAt
}

var _ task.Scheduled = (*Renewer)(nil)

// New returns a Renewer configured from cfg, due to run automatically
// starting at hour:00 UTC and repeating every everyHours (see NextRun),
// in addition to being triggerable on demand over NATS. everyHours <= 0
// means once a day, at hour:00 — see schedule.EveryNHoursAt.
func New(cfg Config, hour, everyHours int) *Renewer {
	return &Renewer{cfg: cfg, hour: hour, everyHours: everyHours}
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

// loadDomainCerts reads previously persisted ACME account + cert material.
// A missing file (first run) is not an error — SetOrUpdateAcmeCerts treats
// an empty DomainCerts exactly like the CLI does: it obtains a fresh cert.
func loadDomainCerts() (platform.DomainCerts, error) {
	var dc platform.DomainCerts
	data, err := os.ReadFile(stateFile)
	if os.IsNotExist(err) {
		return dc, nil
	}
	if err != nil {
		return dc, err
	}
	err = json.Unmarshal(data, &dc)
	return dc, err
}

// saveDomainCerts persists pd's ACME state to disk via a temp file +
// rename, so a crash mid-write can never leave stateFile truncated or
// corrupt.
func saveDomainCerts(pd *platform.PlatformData) error {
	if err := os.MkdirAll(stateDir, 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(pd.DomainCerts, "", "  ")
	if err != nil {
		return err
	}
	tmp := stateFile + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, stateFile)
}

// daysToExpiry reads the certificate the platform is serving right now.
func daysToExpiry(domainName string) (int, error) {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", domainName+":443", nil)
	if err != nil {
		return 0, fmt.Errorf("could not connect to %s:443: %w", domainName, err)
	}
	defer conn.Close()

	peerCerts := conn.ConnectionState().PeerCertificates
	if len(peerCerts) == 0 {
		return 0, fmt.Errorf("no certificate presented by %s", domainName)
	}
	return int(time.Until(peerCerts[0].NotAfter).Hours() / 24), nil
}

// Run checks the live certificate's expiry and, if renewal is due,
// obtains/renews it via ACME and rolls the new secret out to every
// service that consumes it (via internal/dockersvc). It satisfies
// task.Task/task.Scheduled — the returned string is a short summary of
// what happened, relayed to NATS callers and logged the same way as
// every other task in this service. params is unused — nothing about
// cert renewal is caller-configurable today.
func (r *Renewer) Run(ctx context.Context, params map[string]any) (string, error) {
	log.Println("[certs] checking expiry")
	if days, err := daysToExpiry(r.cfg.domainName); err != nil {
		log.Printf("[certs] could not read live certificate (%v) — proceeding with renewal to be safe", err)
	} else {
		log.Printf("[certs] %d day(s) to expiry", days)
		if days > renewThresholdDays {
			return fmt.Sprintf("skipped: %d day(s) left on the live certificate (threshold %d)", days, renewThresholdDays), nil
		}
	}

	domainCerts, err := loadDomainCerts()
	if err != nil {
		return "", fmt.Errorf("loading local ACME state: %w", err)
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
	if err := saveDomainCerts(pd); err != nil {
		saveWarning = fmt.Sprintf("WARNING: could not persist ACME state: %v\n", err)
		log.Printf("[certs] %s", saveWarning)
	}

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
