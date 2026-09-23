package cmd

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/snapshot"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// `osi4iot init --snapshot-file osi4iot_snapshot.zip` brings the same
// platform up on different machines, without losing what it held.
//
// # Why this is split in two
//
// The work happens either side of everything else init does, and it has
// to.
//
// PrepareInitFromSnapshot runs from main.go BEFORE the state file is
// read, because on a new machine there is no state file: main.go would
// set the platform state to Empty, skip building the Docker client map
// entirely, and checkState("init") would stop with "the platform
// configuration has not been defined yet". Installing the state file
// first turns the rest of the run into an ordinary init that happens to
// have found a configuration already there.
//
// finishInitFromSnapshot runs from cmdInit AFTER InitPlatform, because
// the object store cannot be seeded any earlier: admin_api's
// dataBaseInitialization creates the platform's bucket and EMPTIES it
// when it already exists, so anything written before admin_api's first
// run is deleted by it. See docker/snapshot_seed.go.
//
// # What it is not
//
// This moves a platform; it does not clone one. The domain, the
// certificates, the NATS credentials and every stored URL come across
// unchanged, so two platforms must not end up running from one snapshot
// at the same time. Cutting the DNS over is part of the procedure, not
// a detail.

const (
	snapshotFileFlag = "snapshot-file"
	assumeYesFlag    = "yes"
)

// SnapshotFileFromArgs returns the value of --snapshot-file in a raw
// argument list, or "" when it is not there.
//
// Hand-parsed because main.go has to know before Cobra runs: the
// decision of whether this init can proceed without a state file is
// made earlier than flag parsing.
func SnapshotFileFromArgs(args []string) string {
	for i, arg := range args {
		switch {
		case arg == "--"+snapshotFileFlag:
			if i+1 < len(args) {
				return args[i+1]
			}
		case strings.HasPrefix(arg, "--"+snapshotFileFlag+"="):
			return strings.TrimPrefix(arg, "--"+snapshotFileFlag+"=")
		}
	}
	return ""
}

// assumeYesFromArgs reports whether the operator passed --yes.
func assumeYesFromArgs(args []string) bool {
	for _, arg := range args {
		if arg == "--"+assumeYesFlag || arg == "-y" {
			return true
		}
	}
	return false
}

// PrepareInitFromSnapshot installs the state file carried by a snapshot
// so the rest of `init` can run normally. It is a no-op when the
// command is not `init --snapshot-file`.
//
// Called from main.go, immediately before utils.ExistStateFile().
func PrepareInitFromSnapshot(args []string) error {
	path := SnapshotFileFromArgs(args)
	if path == "" {
		return nil
	}

	logger := log.New(os.Stdout, "", 0)

	reader, err := snapshot.Open(path)
	if err != nil {
		return err
	}
	defer reader.Close()

	manifest := reader.Manifest()
	if err := manifest.CheckRestorable(); err != nil {
		return err
	}

	// A state file already here means one of two things, and they want
	// opposite answers.
	//
	// If it is a DIFFERENT platform, this is almost certainly a
	// mistyped command, and it is refused rather than backed up: a .bak
	// is no comfort if what was overwritten was a live platform.
	//
	// If it is the SAME platform, this is a retry. The whole command is
	// long — a deployment, a seed and two cluster restores — and the
	// restore in the middle is exactly the part that fails on a first
	// attempt at an unfamiliar migration. Refusing there would leave
	// the operator configured but unrestored, with no way back in.
	if utils.ExistStateFile() {
		existing, err := existingPlatformDomain()
		if err != nil {
			return fmt.Errorf("there is already a state file on this machine (%s) and it could "+
				"not be read: %w", utils.GetStateFilePath(), err)
		}
		if existing != manifest.Platform.Domain {
			return fmt.Errorf("this machine is already configured for a different platform (%s).\n"+
				"'init --snapshot-file' is for bringing a platform up somewhere it does not exist "+
				"yet. To replace the state file of an existing installation, use "+
				"'osi4iot state restore'", existing)
		}

		logger.Printf("This machine is already configured for '%s'; keeping its state file "+
			"and going on to the data.", existing)
		return nil
	}

	// Printed before the passphrase is asked for: it comes from the
	// manifest, which is plain text, and seeing what the bundle is
	// should not cost anything.
	logger.Print(manifest.Describe())

	assumeYes := assumeYesFromArgs(args)
	restored, err := stateFromSnapshot(logger, reader,
		flagValueFromArgs(args, nodesFileFlag), assumeYes)
	if err != nil {
		return err
	}

	// Checked against the decrypted state file, so this has to happen
	// after the passphrase and before anything is written.
	blocking, warnings := snapshotGuards(manifest, restored)
	for _, warning := range warnings {
		logger.Printf("\nWarning: %s", warning)
	}

	if len(blocking) > 0 {
		for _, problem := range blocking {
			logger.Printf("\n%s", problem)
		}
		if !assumeYes {
			return fmt.Errorf("stopping: see above. Pass --yes to go ahead anyway if this is " +
				"what you intend")
		}
		logger.Printf("\nProceeding anyway because --yes was passed.")
	}

	if !assumeYes {
		logger.Printf("\nThis will configure THIS machine as the platform above and start it.")
		logger.Printf("The platform it was taken from must not still be running: they share a domain,")
		logger.Printf("a certificate and, unless you change it, an object store.")
		answer, err := promptLine("\nContinue? [y/N]: ")
		if err != nil {
			return err
		}
		if !strings.EqualFold(answer, "y") && !strings.EqualFold(answer, "yes") {
			return fmt.Errorf("cancelled")
		}
	}

	*data.GetData() = *restored
	if err := utils.WritePlatformDataToFile(data.GetData()); err != nil {
		return fmt.Errorf("error saving the state file: %w", err)
	}

	logger.Printf("Configured this machine as platform '%s' (domain %s).",
		restored.PlatformInfo.PlatformName, restored.PlatformInfo.DomainName)
	return nil
}

// snapshotGuards checks the bundle against the configuration it carries,
// for the two things that make an init from it go wrong in ways that
// only show up an hour later.
//
// Split into blocking problems and warnings: a blocking one stops the
// command unless --yes overrides it, a warning is printed and the run
// continues.
func snapshotGuards(manifest *snapshot.Manifest, restored *pt.PlatformData) (blocking, warnings []string) {
	pi := restored.PlatformInfo

	// ── The object store is the same one ──────────────────────────
	//
	// Only possible with a real S3 bucket. With "Local Minio" the
	// bucket name is the same on both sides by construction and means
	// nothing: it is a different MinIO, on a different machine, with
	// its own storage.
	//
	// This matters more than a prefix collision would suggest, because
	// admin_api's dataBaseInitialization EMPTIES a bucket that already
	// exists. Standing this platform up against the old one's bucket
	// deletes the old one's backups before anything is seeded — and
	// what is seeded back is only what this snapshot happens to carry.
	bothAws := manifest.Source.BucketType == "Cloud AWS S3" && pi.S3BucketType == "Cloud AWS S3"
	if bothAws && manifest.Source.Bucket != "" && manifest.Source.Bucket == pi.S3BucketName {
		var shared []string
		for _, target := range manifest.IncludedTargets() {
			if target == snapshot.TargetState {
				continue
			}
			if source := manifest.Target(target).Prefix; source != "" &&
				source == snapshot.SourcePrefix(restored, target) {
				shared = append(shared, string(target))
			}
		}

		problem := fmt.Sprintf(
			"This platform would use the SAME AWS bucket the snapshot was taken from (%s).\n"+
				"  Starting it empties that bucket: admin_api deletes everything in a bucket that\n"+
				"  already exists, so the old platform's backups go first, and only what this\n"+
				"  snapshot carries comes back.", manifest.Source.Bucket)
		if len(shared) > 0 {
			problem += fmt.Sprintf("\n  The prefixes for %s are shared too, so if the old platform is\n"+
				"  still running, both would archive WAL over each other.",
				strings.Join(shared, ", "))
		}
		problem += "\n  Give this platform its own bucket, or make sure the old one is stopped and\n" +
			"  that this snapshot holds everything you need."
		blocking = append(blocking, problem)
	}

	// ── PostgreSQL major ──────────────────────────────────────────
	//
	// wal-g cannot fetch a backup into a different major. Caught here
	// rather than at restore time, which is after the whole platform
	// has been deployed.
	for _, target := range []snapshot.Target{snapshot.TargetPatroniAdmin, snapshot.TargetPatroniMetrics} {
		tm := manifest.Target(target)
		if tm == nil || tm.PgVersion == 0 {
			continue
		}
		snapshotMajor := tm.PgVersion / 10000

		image := patroniImageFor(restored, target)
		imageMajor := imagePgMajor(image)
		if imageMajor == 0 {
			warnings = append(warnings, fmt.Sprintf(
				"could not read a PostgreSQL version out of the %s image (%s), so it was not "+
					"checked against the snapshot's PostgreSQL %d", target, image, snapshotMajor))
			continue
		}
		if imageMajor != snapshotMajor {
			blocking = append(blocking, fmt.Sprintf(
				"The %s backups were written by PostgreSQL %d, but this platform deploys\n"+
					"  PostgreSQL %d (%s). wal-g cannot restore across majors, so the restore\n"+
					"  would fail after the whole platform had been brought up.",
				target, snapshotMajor, imageMajor, image))
		}
	}

	// ── wal-g compression ─────────────────────────────────────────
	//
	// A warning rather than a stop: wal-g picks the decompressor from
	// each object's extension when fetching, so a mismatch with the
	// configured method is usually harmless. Worth saying anyway,
	// because when it is not harmless the symptom is opaque.
	for _, target := range []snapshot.Target{snapshot.TargetPatroniAdmin, snapshot.TargetPatroniMetrics} {
		tm := manifest.Target(target)
		if tm == nil || tm.CompressionMethod == "" || pi.WalgCompressionMethod == "" {
			continue
		}
		if tm.CompressionMethod != pi.WalgCompressionMethod {
			warnings = append(warnings, fmt.Sprintf(
				"the %s backups were compressed with %s and this platform is configured for %s",
				target, tm.CompressionMethod, pi.WalgCompressionMethod))
		}
	}

	return blocking, warnings
}

// patroniImageFor returns the image this platform would deploy for one
// of the Patroni families.
func patroniImageFor(pd *pt.PlatformData, target snapshot.Target) string {
	if target == snapshot.TargetPatroniMetrics {
		return utils.GetServiceImage(pd, "patroni_metrics", "ghcr.io/osi4iot/patroni_metrics:2.29.1-pg18")
	}
	return utils.GetServiceImage(pd, "patroni_admin", "ghcr.io/osi4iot/patroni_admin:18.4-alpine3.24")
}

// imagePgMajor reads the PostgreSQL major out of an image reference, or
// 0 when it cannot.
//
// The two families tag differently: patroni_admin uses the server
// version first ("18.4-alpine3.24") while patroni_metrics leads with
// TimescaleDB's ("2.29.1-pg18"), so "pgNN" is looked for before falling
// back to a leading number.
func imagePgMajor(image string) int {
	tag := image
	if slash := strings.LastIndex(image, "/"); slash != -1 {
		tag = image[slash+1:]
	}
	colon := strings.LastIndex(tag, ":")
	if colon == -1 {
		return 0
	}
	tag = tag[colon+1:]

	if i := strings.Index(tag, "pg"); i != -1 {
		if major := leadingInt(tag[i+2:]); major != 0 {
			return major
		}
	}
	return leadingInt(tag)
}

// leadingInt reads the run of digits at the start of s.
func leadingInt(s string) int {
	end := 0
	for end < len(s) && s[end] >= '0' && s[end] <= '9' {
		end++
	}
	if end == 0 {
		return 0
	}
	major := 0
	for i := 0; i < end; i++ {
		major = major*10 + int(s[i]-'0')
	}
	return major
}

// existingPlatformDomain reads the domain out of the state file already
// on this machine.
//
// Reading it costs a passphrase prompt, which is the same passphrase
// the bundle needs anyway, so nothing is asked twice in the case that
// matters.
func existingPlatformDomain() (string, error) {
	existing, err := existingPlatformData()
	if err != nil {
		return "", err
	}
	return existing.PlatformInfo.DomainName, nil
}

// stateFromSnapshot decrypts the bundled state file and applies the
// editable node overlay, WITHOUT writing anything.
//
// Nothing lands on disk here so the guards can run against the result
// first. Deliberately a sibling of installStateFile rather than a call
// into it: that one restores a state file as it was, and this one has
// to change the part that describes the hardware. Everything else — the
// credentials, the certificates, the wal-g key — crosses untouched,
// which is what makes this a move of the same platform rather than the
// creation of a new one.
func stateFromSnapshot(logger *log.Logger, reader *snapshot.Reader, nodesPath string, assumeYes bool) (*pt.PlatformData, error) {
	blob, err := reader.StateFile()
	if err != nil {
		return nil, err
	}

	plaintext := blob
	if reader.Manifest().StateEncrypted {
		plaintext, err = decryptStateBackup(blob)
		if err != nil {
			return nil, err
		}
	}

	var restored pt.PlatformData
	if err := json.Unmarshal(plaintext, &restored); err != nil {
		return nil, fmt.Errorf("the state file decrypted, but its contents are not valid JSON: %w", err)
	}
	if restored.PlatformInfo.DomainName == "" {
		return nil, fmt.Errorf("the state file has no domain name in it — it does not look like one")
	}

	// --nodes wins over the overlay the bundle carries, so moving a
	// platform onto different machines no longer means unzipping,
	// editing state/nodes.json and zipping it back up.
	if err := resolveNodes(&restored, nodesPath, assumeYes, logger); err != nil {
		return nil, err
	}
	if nodesPath != "" {
		return &restored, nil
	}

	overlay, present, err := reader.Nodes()
	if err != nil {
		return nil, err
	}
	if !present {
		logger.Printf("The snapshot carries no state/nodes.json; keeping the machines it was taken from.")
	} else {
		if err := snapshot.ApplyNodes(&restored, overlay); err != nil {
			return nil, fmt.Errorf("state/nodes.json cannot be applied: %w", err)
		}
		for _, warning := range overlay.Warnings() {
			logger.Printf("Warning: %s", warning)
		}
		logger.Printf("Applied state/nodes.json: %d node(s), %s.",
			len(overlay.Nodes), overlay.DeploymentLocation)
	}

	return &restored, nil
}

// finishInitFromSnapshot seeds the object store and restores what the
// snapshot carried, on a platform that has just come up empty.
//
// Called from cmdInit after InitPlatform returns.
func finishInitFromSnapshot(pd *pt.PlatformData, snapshotPath string) error {
	logger := log.New(os.Stdout, "", 0)

	reader, err := snapshot.Open(snapshotPath)
	if err != nil {
		return err
	}
	defer reader.Close()

	dc, err := docker.GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %w", err)
	}

	// The bucket the seeding writes into is created by
	// EnsurePlatformBucket, from createSwarmServices, so it already
	// exists by the time InitPlatform returns. Nothing to do here.
	logger.Printf("\nSeeding the platform's object store from the snapshot...")
	if err := docker.SeedFromSnapshot(pd, dc, reader, docker.SeedOptions{}, logger); err != nil {
		return err
	}

	manifest := reader.Manifest()

	// Restored BY NAME, never LATEST. Between InitPlatform finishing and
	// this running, the platform is alive with empty databases, and
	// system_manager's scheduled backup can fire and push a backup of
	// those empty clusters into the bucket — which would then be the
	// most recent one.
	for _, target := range []snapshot.Target{snapshot.TargetPatroniAdmin, snapshot.TargetPatroniMetrics} {
		tm := manifest.Target(target)
		if tm == nil || tm.RestoreBackupName() == "" {
			continue
		}

		logger.Printf("\nRestoring %s from %s...", target, tm.RestoreBackupName())
		opts := docker.PatroniRestoreOptions{Backup: tm.RestoreBackupName()}

		// No confirmation prompt here: the operator already agreed to
		// this when they confirmed the snapshot, and the clusters being
		// rebuilt are the empty ones this init just created. There is
		// nothing to lose that confirming would protect.
		if target == snapshot.TargetPatroniAdmin {
			err = docker.RestorePatroniAdmin(pd, dc, opts, logger)
		} else {
			err = docker.RestorePatroniMetrics(pd, dc, opts, logger)
		}
		if err != nil {
			return fmt.Errorf("error restoring %s: %w", target, err)
		}
	}

	if tm := manifest.Target(snapshot.TargetNatsStreams); tm != nil && tm.Run != "" {
		if err := restoreSeededNatsRun(pd, dc, tm.Run, logger); err != nil {
			return err
		}
	}

	// Last, and only now: the services that read the database once at
	// startup. They were kept out of the deployment until this point —
	// see DeferredUntilRestored — so this is their FIRST start, and it
	// happens against the restored data rather than against the empty
	// databases the init created.
	logger.Printf("\nDeploying %s...", strings.Join(docker.DeferredUntilRestored, ", "))
	pd.PlatformInfo.ExcludedServices = []string{}
	if err := docker.RunSwarm(dc, pd); err != nil {
		return fmt.Errorf("error deploying %s: %w",
			strings.Join(docker.DeferredUntilRestored, ", "), err)
	}

	logger.Printf("\nThe platform is up with the data the snapshot carried.")
	logger.Printf("Two things are still yours to do:")
	logger.Printf("  - point %s at this machine, and make sure the old platform is stopped",
		pd.PlatformInfo.DomainName)
	logger.Printf("  - take a fresh snapshot once you are satisfied: osi4iot backup snapshot")
	return nil
}

// restoreSeededNatsRun restores the JetStream run the snapshot carried.
//
// RestoreNatsBackupFromS3 always takes the MOST RECENT run and offers no
// way to name one, so the only thing that can be done here is to check
// that the most recent run is the seeded one before asking for it. It
// usually is — the seeded run's name is a timestamp from the old
// platform — but "usually" is not a thing to leave implicit when the
// restore deletes the existing streams first.
func restoreSeededNatsRun(pd *pt.PlatformData, dc *pt.DockerClient, seededRun string, logger *log.Logger) error {
	runs, err := docker.ListNatsBackups(pd, dc)
	if err != nil {
		return fmt.Errorf("error listing the NATS backup runs: %w", err)
	}
	if len(runs) == 0 {
		return fmt.Errorf("the NATS streams were seeded but system_manager sees no runs in the bucket")
	}

	if runs[0].Name != seededRun {
		return fmt.Errorf("the newest NATS run in the bucket is %s, but the snapshot carried %s.\n"+
			"Restoring would take the newer one, which is not what this snapshot is for. "+
			"Remove the newer run from the bucket and restore by hand with "+
			"'osi4iot backup restore nats_streams'", runs[0].Name, seededRun)
	}

	logger.Printf("\nRestoring the NATS streams from run %s...", seededRun)
	output, err := docker.RestoreNatsBackupFromS3(pd, dc)
	if err != nil {
		return fmt.Errorf("error restoring the NATS streams: %w", err)
	}
	if strings.TrimSpace(output) != "" {
		logger.Printf("  %s", strings.TrimSpace(output))
	}
	return nil
}