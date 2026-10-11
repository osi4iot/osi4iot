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
// `osi4iot state recover` is what works when nothing is up. It has
// three sources, and which one to reach for is decided by what is left
// standing.
//
// `--file` takes an object the operator downloaded however they liked —
// the AWS console, `aws s3 cp`, `rclone` — and does nothing but decrypt
// it, check it, and write it back out under this machine's passphrase.
//
// `--from-garage` gets the object first, out of a stopped Garage's
// volumes: the case where there is nothing to download from because the
// object store was part of the platform that is down.
//
// `--from-bucket` reads an external bucket directly. DeletePlatform
// never touches S3, so a bucket outlives its platform, and this is the
// case in between the other two — the backups are reachable, but
// finding the right object by hand is work nobody should do during a
// recovery.
//
// None of the three needs NATS, and none needs an existing state file.

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
	return docker.BackupStateFileOnDisk(pd, dc)
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

// stateRecoverSource is where a recovery reads its backup from.
//
// A struct rather than a widening list of parameters, because the
// sources are ALTERNATIVES and this puts the rule that says so next to
// the code that acts on it. With the check in the command and the
// dispatch here, adding a third source meant remembering to edit both,
// and the two could disagree without anything noticing.
type stateRecoverSource struct {
	// File is a backup already on this machine.
	File string

	// FromGarage reads one out of a stopped Garage's volumes.
	FromGarage  bool
	GarageImage string

	// Bucket reads one out of an external S3 bucket. Its zero value
	// means "not this source"; see cmd/state_recover_bucket.go.
	Bucket bucketCredentials
}

// runStateRecover installs a state file backup WITHOUT going through
// the platform.
//
// It is a separate verb from `osi4iot backup restore state` on purpose.
// That one is a backup operation: the platform hands back a copy, and
// it needs the platform up and the state file readable to ask. This is
// recovery: no NATS, no S3 client, no Docker in the --file case, and it
// has to work when the state file is unreadable or absent — which is
// why main.go's pre-run exempts action "state" specifically. Two verbs
// beat one verb whose meaning depends on which flag you passed.
func runStateRecover(logger *log.Logger, src stateRecoverSource) error {
	given := 0
	for _, set := range []bool{src.File != "", src.FromGarage, src.Bucket.Bucket != ""} {
		if set {
			given++
		}
	}
	if given > 1 {
		return fmt.Errorf("--file, --from-garage and --from-bucket are alternative sources: " +
			"pick one")
	}

	switch {
	case src.File != "":
		blob, err := os.ReadFile(src.File)
		if err != nil {
			return fmt.Errorf("error reading %s: %w", src.File, err)
		}
		return installStateFile(logger, blob)

	case src.FromGarage:
		return runStateRecoverFromGarage(logger, src.GarageImage)

	case src.Bucket.Bucket != "":
		return runStateRecoverFromBucket(logger, src.Bucket)

	default:
		return fmt.Errorf("nothing to recover from. Pass one of:\n" +
			"  --file <path>          a backup you downloaded yourself\n" +
			"  --from-bucket <name>   read it out of an external S3 bucket\n" +
			"  --from-garage          read it out of a stopped Garage's volumes")
	}
}

// runStateRecoverFromGarage recovers a backup from a Garage deployment
// whose platform is stopped — the one case neither of the paths above
// reaches. With Garage down there is no endpoint to talk to at all, so
// this brings the Garage cluster back up as temporary containers on the
// nodes holding its volumes, reads the object out, and takes them down
// again. See docker.StartTempGarage.
//
// The nodes are found rather than asked for: this host, the nodes in the
// state file if it is still readable, and — through a swarm manager —
// every other node of the swarm, which survives `osi4iot stop`. Garage
// needs no credentials from the operator to open its own volumes; only
// SSH access to the nodes, and the passphrase to decrypt the backup.
func runStateRecoverFromGarage(logger *log.Logger, image string) error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	nodes, err := findGarageNodes(ctx, logger)
	if err != nil {
		return err
	}
	defer nodes.Close()

	hosts, err := docker.FindGarageVolumeHosts(ctx, nodes.targets)
	if err != nil {
		return err
	}
	if len(hosts) == 0 {
		return fmt.Errorf("no Garage volumes (garage_meta_<N> / garage_data_<N>) on any node " +
			"reached.\nIf 'osi4iot delete' was run, the volumes are gone and so are the backups")
	}
	for _, h := range hosts {
		logger.Printf("Found the volumes of Garage instance(s) %v on %s.", h.Instances, h.Target.Name)
	}

	if image == "" {
		// Recovery should run the same Garage version that wrote the
		// volumes: a newer one may want to migrate the metadata format,
		// which is not a thing to meet halfway through a recovery.
		image = utils.GetServiceImage(data.GetData(), utils.GarageServiceName, utils.DefaultGarageImage)
	}

	logger.Printf("Starting a temporary Garage against the volumes...")
	tg, err := docker.StartTempGarage(ctx, hosts, nodes.manager, image)
	if err != nil {
		return err
	}
	// Two ways out, because leaving these containers behind is not an
	// option: they hold the platform's object store open.
	defer tg.Stop()
	stopOnSignal(tg)

	if tg.LayoutInstances > 1 {
		logger.Printf("Rejoined %d of the cluster's %d Garage instances.", tg.Found, tg.LayoutInstances)
	}
	if tg.Degraded && tg.LayoutInstances > 1 {
		logger.Printf("%s", utils.StyleWarningMsg.Render(fmt.Sprintf("%d instance(s) missing: reading "+
			"with a single copy per object (still at least one of each with 3 copies).",
			tg.LayoutInstances-tg.Found)))
	}

	objects, err := docker.ListStateFileBackupsInGarage(ctx, tg)
	if err != nil {
		return err
	}
	if len(objects) == 0 {
		return fmt.Errorf("no state file backups found in these Garage volumes")
	}

	chosen, err := chooseBackup(logger, objects)
	if err != nil {
		return err
	}

	logger.Printf("Downloading %s...", chosen.Name())
	blob, err := docker.DownloadFromGarage(ctx, tg, chosen)
	if err != nil {
		return err
	}

	// Nothing below needs Garage, so close the window now rather than at
	// the end of the function.
	tg.Stop()

	return installStateFile(logger, blob)
}

// garageNodes are the nodes a recovery can reach, one connection each.
type garageNodes struct {
	targets []*docker.RecoveryTarget
	// manager is a swarm manager among them, if any: it lists the other
	// nodes and creates the network the temporary instances join.
	manager *docker.RecoveryTarget
	seen    map[string]bool // swarm node IDs
}

func (g *garageNodes) Close() {
	for _, t := range g.targets {
		t.Close()
	}
}

// add keeps a new connection unless it reaches a node already reached,
// and returns what the node says about its place in the swarm.
func (g *garageNodes) add(ctx context.Context, t *docker.RecoveryTarget) docker.SwarmInfo {
	info, err := docker.SwarmInfoOf(ctx, t)
	if err == nil && info.NodeID != "" {
		if g.seen[info.NodeID] {
			t.Close()
			return info
		}
		g.seen[info.NodeID] = true
	}
	if info.IsManager && g.manager == nil {
		g.manager = t
	}
	g.targets = append(g.targets, t)
	return info
}

// sshCredentials hands out SSH credentials per address: the state file's
// for the nodes it lists, otherwise ones asked for once and reused.
type sshCredentials struct {
	logger *log.Logger
	byHost map[string]docker.SSHTarget
	shared *docker.SSHTarget
}

func (c *sshCredentials) open(host string) (*docker.RecoveryTarget, error) {
	if t, ok := c.byHost[host]; ok {
		return docker.OpenSSHRecoveryTarget(t)
	}
	if c.shared != nil {
		t := *c.shared
		t.Host = host
		return docker.OpenSSHRecoveryTarget(t)
	}
	target, used, err := openSSHAsking(c.logger, docker.SSHTarget{Host: host}, true)
	if err != nil {
		return nil, err
	}
	c.shared = &used
	return target, nil
}

// findGarageNodes connects to every node that may hold Garage volumes,
// asking as little as possible. The swarm itself survives `osi4iot
// stop`, and its managers know every node: finding one is the point.
//
//  1. This host first. A manager is used as is. A worker knows where
//     its managers are (docker info: Swarm.RemoteManagers), so their
//     addresses need not be asked. A machine outside the swarm (the
//     operator's laptop) goes on to the next steps.
//  2. No manager yet: the ones this host knows, then the managers in the
//     state file if it can still be read, then one the operator names.
//  3. Through the manager, every node of the swarm — the authoritative
//     list, not the state file's, which may be out of date. The state
//     file only supplies SSH credentials, per address; for nodes it
//     does not know, the credentials are asked once and reused.
//  4. With no manager at all, the nodes in the state file.
//
// A node that cannot be reached is reported and skipped: StartTempGarage
// decides whether the instances found are enough.
func findGarageNodes(ctx context.Context, logger *log.Logger) (*garageNodes, error) {
	g := &garageNodes{seen: map[string]bool{}}

	pd := data.GetData()
	if pd.PlatformInfo.DomainName == "" {
		// Best effort — the whole point of this path is that there may
		// be no state file to read.
		_ = utils.ReadPlatformDataFromFile(pd)
	}
	stateTargets := docker.SSHTargetsFromPlatformData(pd)
	creds := &sshCredentials{logger: logger, byHost: map[string]docker.SSHTarget{}}
	var stateManagers []string
	for _, t := range stateTargets {
		creds.byHost[t.Host] = t
	}
	for _, node := range pd.PlatformInfo.NodesData {
		if node.NodeRole == "Manager" {
			stateManagers = append(stateManagers, node.NodeIP)
		}
	}

	// 1. This host.
	var knownManagers []string
	if local, err := docker.OpenLocalRecoveryTarget(); err == nil {
		info := g.add(ctx, local)
		switch {
		case info.IsManager:
			logger.Printf("This host is a swarm manager: the other nodes are listed through it.")
		case info.InSwarm:
			knownManagers = info.ManagerHosts
			logger.Printf("This host is a swarm worker; its managers: %s.", strings.Join(knownManagers, ", "))
		}
	}

	// 2. A manager.
	if g.manager == nil {
		tried := map[string]bool{}
		for _, host := range append(knownManagers, stateManagers...) {
			if tried[host] || g.manager != nil {
				continue
			}
			tried[host] = true
			target, err := creds.open(host)
			if err != nil {
				logger.Printf("Could not reach the manager %s: %v", host, err)
				continue
			}
			g.add(ctx, target)
		}
	}
	if g.manager == nil {
		logger.Printf("No swarm manager reached yet; the other nodes are found through one.")
		host, err := promptLine("Address of a manager node (empty to search only what is reachable): ")
		if err != nil {
			return nil, err
		}
		if host != "" {
			target, err := creds.open(host)
			if err != nil {
				return nil, err
			}
			g.add(ctx, target)
		}
	}

	// 3. Every node of the swarm, through the manager.
	if g.manager != nil {
		swarmNodes, err := docker.ListSwarmNodes(ctx, g.manager)
		if err != nil {
			return nil, err
		}
		for _, node := range swarmNodes {
			if g.seen[node.ID] || node.Address == "" || node.Address == "0.0.0.0" {
				continue
			}
			target, err := creds.open(node.Address)
			if err != nil {
				logger.Printf("Could not reach %s (%s): %v — its Garage instances, if any, "+
					"will be missing", node.Hostname, node.Address, err)
				continue
			}
			g.add(ctx, target)
		}
	} else {
		// 4. No manager: what the state file names.
		for _, t := range stateTargets {
			target, err := docker.OpenSSHRecoveryTarget(t)
			if err != nil {
				logger.Printf("Could not reach %s: %v", t.Host, err)
				continue
			}
			g.add(ctx, target)
		}
	}

	if len(g.targets) == 0 {
		return nil, fmt.Errorf("no node could be reached")
	}
	return g, nil
}

// openSSHAsking opens an SSH target, asking for what is missing: the
// user, and — only when the SSH agent and the usual key files are
// refused — a key file or a password. Returns the credentials that
// worked, to reuse on the other nodes.
func openSSHAsking(logger *log.Logger, sshTarget docker.SSHTarget, askUser bool) (*docker.RecoveryTarget, docker.SSHTarget, error) {
	if askUser && sshTarget.User == "" {
		user, err := promptLine(fmt.Sprintf("SSH user on the platform's nodes (%s): ", sshTarget.Host))
		if err != nil {
			return nil, sshTarget, err
		}
		if user == "" {
			return nil, sshTarget, fmt.Errorf("an SSH user is required")
		}
		sshTarget.User = user
	}

	target, err := docker.OpenSSHRecoveryTarget(sshTarget)

	// The SSH agent and the usual key locations are tried first, so
	// only ask for credentials once those have failed — and only when
	// the failure was authentication, not an unreachable host.
	if errors.Is(err, docker.ErrSSHAuth) {
		logger.Printf("No usable SSH agent or key found for %s@%s.", sshTarget.User, sshTarget.Host)

		keyPath, promptErr := promptLine("Path to an SSH private key (empty to use a password): ")
		if promptErr != nil {
			return nil, sshTarget, promptErr
		}
		if keyPath != "" {
			sshTarget.KeyPath = keyPath
		} else {
			fmt.Print("🔑 SSH password: ")
			// PromptPassphrase reads without echoing, which is what is
			// wanted here even though this is a password rather than
			// the state file's passphrase.
			password, promptErr := crypto.PromptPassphrase()
			fmt.Println()
			if promptErr != nil {
				return nil, sshTarget, fmt.Errorf("error reading the password: %w", promptErr)
			}
			sshTarget.Password = string(password)
		}
		target, err = docker.OpenSSHRecoveryTarget(sshTarget)
	}
	if err != nil {
		return nil, sshTarget, err
	}
	return target, sshTarget, nil
}

// stopOnSignal tears the temporary Garage down if the operator
// interrupts. A deferred Stop does not run on SIGINT, and this container
// is not one to leave behind.
func stopOnSignal(tg *docker.TempGarage) {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-signals
		fmt.Println("\nInterrupted — removing the temporary Garage container.")
		tg.Stop()
		os.Exit(1)
	}()
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
			"the bucket. If you are recovering a lost state file, use 'osi4iot state recover': " +
			"--from-bucket <name> reads an external bucket directly, --from-garage reads a " +
			"stopped Garage's volumes, and --file installs a backup you downloaded yourself")
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
