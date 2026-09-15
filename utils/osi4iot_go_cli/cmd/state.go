package cmd

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/crypto"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// This file implements the platform state file's backups: the `state`
// target of `osi4iot backup` (see cmd/backup_commands.go) and
// `osi4iot state recover`.
//
// The file it protects is the most valuable artefact the platform has —
// every credential the deployment uses, the NATS issuer seed, the SSH
// keys, the ACME account key — and it normally exists in exactly one
// place, on one laptop. Losing it does not take the platform down, but
// it does end the ability to update, scale, renew or delete it.
//
// # What is stored is the file itself
//
// The object in S3 is a byte-for-byte copy of osi4iot_state.json as it
// sits on disk: already encrypted by internals/crypto under the
// operator's own passphrase, Argon2id-derived with a random salt
// carried inside the blob. Nothing is re-encrypted on the way out and
// there is no second key to manage.
//
// That choice is what makes recovery possible at all. An earlier design
// encrypted the backup under a random platform key held in the state
// file — which meant recovering the state file required the state file.
// A passphrase the operator chose and remembers has no such
// circularity, and it is the same one they already type to read the
// local copy.
//
// # Two entry points, on purpose
//
// `osi4iot backup trigger|restore|list state` is the backup subsystem,
// symmetric with nats_streams and the patroni targets, and needs the
// platform up.
//
// `osi4iot state recover` is what works when nothing is up.
// `--file` takes an object the operator downloaded however they liked —
// the AWS console, the MinIO console, `aws s3 cp`, `mc` — and does
// nothing but decrypt it, check it, and write it back out under this
// machine's passphrase. `--from-minio` gets the object first, out of a
// stopped MinIO's volume. Neither needs NATS, an S3 client, or an
// existing state file.

func init() {
	// Every successful write of the state file triggers a backup. See
	// utils.SetStateBackupHook for why this is a registered callback
	// and not a direct call.
	utils.SetStateBackupHook(backupStateFileQuietly)
}

// backupStateFileQuietly is the automatic path: it runs after every
// state file write, and must never turn a successful command into a
// failed one.
//
// Most of the time it does nothing at all, and silently: during
// `create` there is no platform yet, during `delete` there is no longer
// one, and neither is a situation to warn about. It only speaks up when
// a backup was actually attempted and failed, because that is the case
// where the operator's mental model ("my state file is backed up") has
// quietly stopped being true.
func backupStateFileQuietly(pd *pt.PlatformData, encoded []byte) {
	if pd.PlatformInfo.StateFileS3Prefix == "" {
		return
	}
	if crypto.IsNoEncrypt() {
		// --no-encrypt means the bytes on disk are plaintext JSON.
		// Shipping those to a bucket would put every password the
		// platform has in object storage in the clear, which is a far
		// worse trade than the local-only exposure the flag is asking
		// for. Refuse, and say so — silence here would look like a
		// working backup.
		fmt.Println("Warning: encryption is disabled, so the state file was NOT backed up.")
		return
	}

	dc, err := docker.GetManagerDC()
	if err != nil || !docker.IsSystemManagerRunning(dc) {
		return
	}

	if _, err := docker.BackupStateFile(pd, dc, string(encoded)); err != nil {
		fmt.Printf("Warning: could not back up the state file: %v\n", err)
	}
}

// triggerStateFileBackup backs the `state` target of
// `osi4iot backup trigger`, for when the operator wants a copy now
// rather than waiting for the next change to the file.
//
// pd and dc come from the caller because backup_commands.go has already
// obtained them for every target.
func triggerStateFileBackup(pd *pt.PlatformData, dc *pt.DockerClient) (string, error) {
	if pd.PlatformInfo.StateFileS3Prefix == "" {
		return "", fmt.Errorf("state file backups are not configured: " +
			"STATE_FILE_S3_PREFIX is empty in the platform state")
	}
	if crypto.IsNoEncrypt() {
		return "", fmt.Errorf("encryption is disabled (--no-encrypt): refusing to upload " +
			"an unencrypted state file to object storage")
	}

	// Read what is actually on disk rather than re-serializing pd: the
	// backup should be the file, not something that ought to equal it.
	encoded, err := os.ReadFile(utils.GetStateFilePath())
	if err != nil {
		return "", fmt.Errorf("error reading the state file: %w", err)
	}
	return docker.BackupStateFile(pd, dc, string(encoded))
}

// runStateList shows which backups exist, newest first.
func runStateList(logger *log.Logger) error {
	pd, dc, err := loadStateAndClient()
	if err != nil {
		return err
	}

	runs, err := docker.ListStateFileBackups(pd, dc)
	if err != nil {
		return err
	}
	if len(runs) == 0 {
		logger.Printf("No state file backups stored yet.")
		return nil
	}

	logger.Printf("State file backups (newest first):")
	for i, run := range runs {
		suffix := ""
		if i == 0 {
			suffix = "  (restored by default)"
		}
		logger.Printf("  %s  %s%s", run, formatRunName(run), suffix)
	}
	return nil
}

// runStateRestoreFromS3 downloads a stored state file through
// system_manager and installs it locally, backing the `state` target of
// `osi4iot backup restore`. run names a specific backup (as shown by
// `osi4iot backup list state`); empty means the newest.
//
// This is the convenient path, not the recovery path — it needs a
// working state file to reach the platform in the first place. See
// runStateRecover.
func runStateRestoreFromS3(logger *log.Logger, run string) error {
	pd, dc, err := loadStateAndClient()
	if err != nil {
		return err
	}

	blob, err := docker.RestoreStateFile(pd, dc, run)
	if err != nil {
		return err
	}
	return installStateFile(logger, []byte(blob))
}

// runStateRecover installs a state file backup WITHOUT going through
// the platform, from either a file the operator downloaded themselves
// or a stopped MinIO's volume.
//
// It is a separate verb from `osi4iot backup restore state` on purpose.
// That one is a backup operation: the platform hands back a copy, and
// it needs the platform up and the state file readable to ask. This is
// recovery: no NATS, no S3 client, no Docker in the --file case, and it
// has to work when the state file is unreadable or absent — which is
// why main.go's pre-run exempts action "state" specifically. Two verbs
// beat one verb whose meaning depends on which flag you passed.
func runStateRecover(logger *log.Logger, path, minioImage string, fromMinio bool) error {
	switch {
	case path != "":
		blob, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("error reading %s: %w", path, err)
		}
		return installStateFile(logger, blob)
	case fromMinio:
		return runStateRecoverFromMinio(logger, minioImage)
	default:
		return fmt.Errorf("nothing to recover from: pass --file <path> for a backup you " +
			"downloaded yourself, or --from-minio to read one out of a stopped MinIO's volume")
	}
}

// runStateRecoverFromMinio recovers a backup from a MinIO deployment
// whose platform is stopped — the one case neither of the paths above
// reaches. With MinIO down there is no endpoint to talk to at all, so
// this puts a temporary MinIO in front of the volume, reads the object
// out, and takes it down again. See docker.StartTempMinio.
//
// The node is found rather than asked for: this host first, then every
// node the state file knows about if it is still readable, and only
// then a question. Everything after that — bucket, prefix, run list —
// is discovered too. The operator supplies the platform admin
// credentials, which are MinIO's root credentials, and the passphrase.
func runStateRecoverFromMinio(logger *log.Logger, image string) error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	target, err := findMinioTarget(logger)
	if err != nil {
		return err
	}
	defer target.Close()
	logger.Printf("Found the minio_storage volume on %s.", target.Name)

	rootUser, rootPassword, image, err := minioRecoveryInputs(image)
	if err != nil {
		return err
	}

	logger.Printf("Starting a temporary MinIO against the volume...")
	tm, err := docker.StartTempMinio(ctx, target, rootUser, rootPassword, image)
	if err != nil {
		return err
	}
	// Two ways out, because leaving this container running is the one
	// outcome that must not happen: it serves every credential the
	// platform has on the node's loopback for as long as it lives.
	defer tm.Stop()
	stopOnSignal(tm)

	objects, err := docker.ListStateFileBackupsInMinio(ctx, tm, rootUser, rootPassword)
	if err != nil {
		return err
	}
	if len(objects) == 0 {
		return fmt.Errorf("no state file backups found in this MinIO volume")
	}

	chosen, err := chooseBackup(logger, objects)
	if err != nil {
		return err
	}

	logger.Printf("Downloading %s...", chosen.Name())
	blob, err := docker.DownloadFromMinio(ctx, tm, rootUser, rootPassword, chosen)
	if err != nil {
		return err
	}

	// Nothing below needs MinIO, so close the window now rather than at
	// the end of the function.
	tm.Stop()

	return installStateFile(logger, blob)
}

// findMinioTarget locates a host holding the minio_storage volume,
// trying the cheapest options first.
//
// Order matters for how much the operator is asked. Running the
// recovery on the node itself needs nothing at all, so that is tried
// first. A readable state file supplies node addresses, SSH users and
// the key, so that comes next and is still silent. Only with neither is
// there a question, and then it is a small one: address and user.
func findMinioTarget(logger *log.Logger) (*docker.RecoveryTarget, error) {
	ctx := context.Background()

	if target, err := docker.OpenLocalRecoveryTarget(); err == nil {
		if found, err := docker.HasMinioStorageVolume(ctx, target); err == nil && found {
			return target, nil
		}
		target.Close()
	}

	pd := data.GetData()
	if pd.PlatformInfo.DomainName == "" {
		// Best effort — the whole point of this path is that there may
		// be no state file to read.
		_ = utils.ReadPlatformDataFromFile(pd)
	}

	for _, sshTarget := range docker.SSHTargetsFromPlatformData(pd) {
		logger.Printf("Looking for the volume on %s...", sshTarget.Host)
		target, err := docker.OpenSSHRecoveryTarget(sshTarget)
		if err != nil {
			logger.Printf("  %v", err)
			continue
		}
		if found, err := docker.HasMinioStorageVolume(ctx, target); err == nil && found {
			return target, nil
		}
		target.Close()
	}

	return promptForMinioTarget(logger)
}

// promptForMinioTarget asks where to look, once everything automatic
// has come up empty.
func promptForMinioTarget(logger *log.Logger) (*docker.RecoveryTarget, error) {
	logger.Printf("Could not find the minio_storage volume automatically.")
	logger.Printf("It is on whichever node last ran MinIO — 'docker volume ls' there will confirm it.")

	host, err := promptLine("Node address: ")
	if err != nil {
		return nil, err
	}
	user, err := promptLine("SSH user: ")
	if err != nil {
		return nil, err
	}
	if host == "" || user == "" {
		return nil, fmt.Errorf("a node address and an SSH user are both required")
	}

	sshTarget := docker.SSHTarget{Host: host, User: user}
	target, err := docker.OpenSSHRecoveryTarget(sshTarget)

	// The SSH agent and the usual key locations are tried first, so
	// only ask for credentials once those have failed — and only when
	// the failure was authentication, not an unreachable host.
	if errors.Is(err, docker.ErrSSHAuth) {
		logger.Printf("No usable SSH agent or key found for %s@%s.", user, host)

		keyPath, promptErr := promptLine("Path to an SSH private key (empty to use a password): ")
		if promptErr != nil {
			return nil, promptErr
		}
		if keyPath != "" {
			sshTarget.KeyPath = keyPath
		} else {
			fmt.Print("🔑 SSH password: ")
			// PromptPassphrase reads without echoing, which is what is
			// wanted here even though this is a password rather than
			// the state file's passphrase. It returns []byte;
			// ssh.Password takes a string.
			password, promptErr := crypto.PromptPassphrase()
			fmt.Println()
			if promptErr != nil {
				return nil, fmt.Errorf("error reading the password: %w", promptErr)
			}
			sshTarget.Password = string(password)
		}
		target, err = docker.OpenSSHRecoveryTarget(sshTarget)
	}
	if err != nil {
		return nil, err
	}

	found, err := docker.HasMinioStorageVolume(context.Background(), target)
	if err != nil {
		target.Close()
		return nil, err
	}
	if !found {
		target.Close()
		return nil, fmt.Errorf("no minio_storage volume on %s. "+
			"If 'osi4iot delete' was run, the volume is gone and so are the backups", host)
	}
	return target, nil
}

// stopOnSignal tears the temporary MinIO down if the operator
// interrupts. A deferred Stop does not run on SIGINT, and this
// container is not one to leave behind.
func stopOnSignal(tm *docker.TempMinio) {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-signals
		fmt.Println("\nInterrupted — removing the temporary MinIO container.")
		tm.Stop()
		os.Exit(1)
	}()
}

// minioRecoveryInputs collects the only things this procedure cannot
// discover on its own.
//
// The credentials have to be the platform's real ones — MinIO encrypts
// its own config under them and will not start against this volume
// otherwise. They are the platform admin user and password, which the
// operator chose at creation, so this is a question with an answer
// rather than a lookup in the file they just lost.
func minioRecoveryInputs(image string) (string, string, string, error) {
	pd := data.GetData()

	rootUser := pd.PlatformInfo.PlatformAdminUserName
	if rootUser == "" {
		var err error
		if rootUser, err = promptLine("MinIO root user (the platform admin user): "); err != nil {
			return "", "", "", err
		}
	} else {
		fmt.Printf("Using the platform admin user '%s' as the MinIO root user.\n", rootUser)
	}

	rootPassword := pd.PlatformInfo.PlatformAdminPassword
	if rootPassword == "" {
		fmt.Print("🔑 MinIO root password (the platform admin password): ")
		// Read without echoing. []byte in, string out — it ends up in
		// the container's MINIO_ROOT_PASSWORD env var.
		pw, err := crypto.PromptPassphrase()
		fmt.Println()
		if err != nil {
			return "", "", "", fmt.Errorf("error reading the password: %w", err)
		}
		rootPassword = string(pw)
	}
	if rootUser == "" || rootPassword == "" {
		return "", "", "", fmt.Errorf("both the MinIO root user and password are required")
	}

	if image == "" {
		// Recovery should run the same MinIO version that wrote the
		// volume: a newer one may want to migrate the on-disk format,
		// which is not a thing to meet halfway through a recovery.
		image = utils.GetServiceImage(pd, "minio", docker.DefaultMinioImage)
	}
	return rootUser, rootPassword, image, nil
}

// chooseBackup shows what was found and asks which one to install,
// defaulting to the newest.
func chooseBackup(logger *log.Logger, objects []docker.StateFileObject) (docker.StateFileObject, error) {
	if len(objects) == 1 {
		logger.Printf("Found one backup: %s (%s)", objects[0].Name(), formatRunName(objects[0].Name()))
		return objects[0], nil
	}

	logger.Printf("Found %d backups (newest first):", len(objects))
	for i, obj := range objects {
		logger.Printf("  [%d] %s  %s", i+1, obj.Name(), formatRunName(obj.Name()))
	}

	answer, err := promptLine(fmt.Sprintf("Which one? [1-%d, default 1]: ", len(objects)))
	if err != nil {
		return docker.StateFileObject{}, err
	}
	if answer == "" {
		return objects[0], nil
	}
	choice, err := strconv.Atoi(answer)
	if err != nil || choice < 1 || choice > len(objects) {
		return docker.StateFileObject{}, fmt.Errorf("'%s' is not one of the listed options", answer)
	}
	return objects[choice-1], nil
}

// promptLine reads one trimmed line from stdin.
func promptLine(prompt string) (string, error) {
	fmt.Print(prompt)
	reader := bufio.NewReader(os.Stdin)
	line, err := reader.ReadString('\n')
	if err != nil && line == "" {
		return "", fmt.Errorf("error reading input: %w", err)
	}
	return strings.TrimSpace(line), nil
}

// installStateFile decrypts a backup, checks it, and writes it out as
// the local state file re-encrypted under this machine's passphrase.
func installStateFile(logger *log.Logger, blob []byte) error {
	plaintext, err := decryptStateBackup(blob)
	if err != nil {
		return err
	}

	// Parse before touching anything on disk: a state file that doesn't
	// unmarshal is not one to overwrite a working file with.
	var restored pt.PlatformData
	if err := json.Unmarshal(plaintext, &restored); err != nil {
		return fmt.Errorf("the backup decrypted, but its contents are not valid JSON: %w", err)
	}
	if restored.PlatformInfo.DomainName == "" {
		return fmt.Errorf("the backup has no domain name in it — it does not look like a state file")
	}

	// Keep the file we are about to replace. The reason to restore is
	// that something is wrong with the current one, and "something is
	// wrong" is not "this is worthless" — it may hold the only copy of
	// something that changed after the backup was taken.
	if backupPath, err := keepCurrentStateFile(); err != nil {
		return fmt.Errorf("error keeping a copy of the current state file: %w", err)
	} else if backupPath != "" {
		logger.Printf("Previous state file kept at %s", backupPath)
	}

	// Writing the restored file must not immediately upload it again —
	// see utils.DisableStateBackup.
	utils.DisableStateBackup()

	*data.GetData() = restored
	if err := utils.WritePlatformDataToFile(data.GetData()); err != nil {
		return fmt.Errorf("error saving the restored state file: %w", err)
	}

	logger.Printf("Restored the state file for platform '%s' (domain %s) to %s.",
		restored.PlatformInfo.PlatformName, restored.PlatformInfo.DomainName,
		utils.GetStateFilePath())
	return nil
}

// decryptStateBackup decrypts a stored backup, retrying with an
// explicitly prompted passphrase if the cached one doesn't open it.
//
// The retry is not defensive padding. crypto.GetPassphrase returns the
// passphrase from the environment, the OS keyring or the local file
// WITHOUT checking it against the data being decrypted — only its
// interactive branch verifies. So the cached value is simply whatever
// this machine last used, and an older backup taken before a passphrase
// change is opened by a different one. Each blob carries its own
// Argon2id salt, so old runs stay decryptable forever with the
// passphrase they were made under; the operator just has to be asked
// for it.
func decryptStateBackup(blob []byte) ([]byte, error) {
	if result, err := crypto.GetPassphrase(blob); err == nil && result != nil {
		if plaintext, err := crypto.Decrypt(blob, result.Value); err == nil {
			return plaintext, nil
		}
	}

	const attempts = 3
	for i := range attempts {
		fmt.Print("🔑 Enter the passphrase this backup was made with: ")
		passphrase, err := crypto.PromptPassphrase()
		fmt.Println()
		if err != nil {
			return nil, fmt.Errorf("error reading passphrase: %w", err)
		}

		plaintext, err := crypto.Decrypt(blob, passphrase)
		if err == nil {
			return plaintext, nil
		}
		if i < attempts-1 {
			fmt.Println("❌ That passphrase does not open this backup. Please try again.")
		}
	}
	return nil, fmt.Errorf("could not decrypt the backup: wrong passphrase, or the file is not " +
		"an osi4iot state file backup")
}

// keepCurrentStateFile copies the existing state file aside, returning
// where it went ("" if there was nothing to copy).
func keepCurrentStateFile() (string, error) {
	path := utils.GetStateFilePath()
	current, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}

	backupPath := fmt.Sprintf("%s.bak-%s", path, time.Now().UTC().Format("20060102T150405Z"))
	if err := os.WriteFile(backupPath, current, 0600); err != nil {
		return "", err
	}
	return backupPath, nil
}

// loadStateAndClient is the shared preamble for the commands that DO
// need a working platform: read the state file, check the feature is
// configured, and get a Docker client for a manager.
func loadStateAndClient() (*pt.PlatformData, *pt.DockerClient, error) {
	pd := data.GetData()
	if pd.PlatformInfo.DomainName == "" {
		if err := utils.ReadPlatformDataFromFile(pd); err != nil {
			return nil, nil, fmt.Errorf("error reading platform data: %w", err)
		}
	}

	if pd.PlatformInfo.StateFileS3Prefix == "" {
		return nil, nil, fmt.Errorf("state file backups are not configured: " +
			"STATE_FILE_S3_PREFIX is empty in the platform state")
	}

	dc, err := docker.GetManagerDC()
	if err != nil {
		return nil, nil, fmt.Errorf("error getting docker client: %w", err)
	}
	if !docker.IsSystemManagerRunning(dc) {
		return nil, nil, fmt.Errorf("system_manager is not running, so this command cannot reach " +
			"the bucket. If you are recovering a lost state file, download the backup from your " +
			"S3 or MinIO console and use: osi4iot state recover --file <downloaded file>")
	}
	return pd, dc, nil
}

// formatRunName turns a run's compact timestamp into something readable
// next to it in the listing.
func formatRunName(run string) string {
	t, err := time.Parse("20060102T150405Z", run)
	if err != nil {
		return ""
	}
	return t.Format(time.RFC850)
}
