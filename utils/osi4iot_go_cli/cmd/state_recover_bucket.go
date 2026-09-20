package cmd

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"golang.org/x/term"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
)

// `osi4iot state recover --from-bucket NAME` rebuilds the local state
// file from the backups an external bucket still holds.
//
// # Where it sits among the other sources
//
// --file installs a backup the operator downloaded themselves, and
// needs nothing: no platform, no network. --from-minio covers a local
// MinIO whose platform is stopped, where there is no console to
// download from. This one covers the case in between: an external
// bucket that outlived its platform, where the backups are reachable
// but nobody wants to go and find the right object by hand.
//
// It is also the piece that makes `init --from-bucket` less of a leap.
// That command does this and then rebuilds the whole platform; this one
// stops after the state file, which is what you want when the platform
// is going to be brought back some other way, or when you just need to
// read what the configuration was.
//
// # Credentials
//
// Asked for, not read from the state file — there is no state file yet,
// which is the whole point. The environment is used as the default so
// the command stays scriptable, and the secret key is read without
// echo. Nothing is written anywhere: the credentials live for the
// length of the command.

// bucketCredentials is what is needed to read someone's bucket.
type bucketCredentials struct {
	Bucket    string
	Region    string
	AccessKey string
	SecretKey string
	KeyPrefix string
}

// runStateRecoverFromBucket downloads a state file backup from an
// external bucket and installs it.
func runStateRecoverFromBucket(logger *log.Logger, flags bucketCredentials) error {
	creds, err := resolveBucketCredentials(flags)
	if err != nil {
		return err
	}

	ctx := context.Background()
	opts := docker.ExternalBucketOptions{
		Bucket:          creds.Bucket,
		KeyPrefix:       creds.KeyPrefix,
		Region:          creds.Region,
		AccessKeyID:     creds.AccessKey,
		SecretAccessKey: creds.SecretKey,
	}

	logger.Printf("Reading s3://%s ...", opts.Bucket)
	store, err := docker.OpenExternalBucket(ctx, opts)
	if err != nil {
		return err
	}
	defer store.Close()

	backups, err := docker.ListStateBackups(ctx, store, opts)
	if err != nil {
		return err
	}

	chosen, err := chooseStateBackup(logger, backups)
	if err != nil {
		return err
	}

	logger.Printf("Downloading %s ...", chosen.Key)
	blob, err := docker.FetchStateBackup(ctx, store, opts.Bucket, chosen.Key)
	if err != nil {
		return err
	}

	// From here on it is the same path --file takes: decrypt with the
	// passphrase, check the contents really are a state file, keep the
	// existing one as .bak, write the new one out under this machine's
	// passphrase.
	return installStateFile(logger, blob)
}

// resolveBucketCredentials fills in whatever the flags did not.
func resolveBucketCredentials(flags bucketCredentials) (bucketCredentials, error) {
	creds := flags
	creds.Bucket = strings.Trim(strings.TrimPrefix(strings.TrimSpace(creds.Bucket), "s3://"), "/")

	if creds.Bucket == "" {
		answer, err := promptLine("Bucket name: ")
		if err != nil {
			return creds, err
		}
		creds.Bucket = strings.Trim(strings.TrimPrefix(strings.TrimSpace(answer), "s3://"), "/")
		if creds.Bucket == "" {
			return creds, fmt.Errorf("a bucket name is required")
		}
	}

	if creds.Region == "" {
		creds.Region = os.Getenv("AWS_REGION")
	}
	if creds.Region == "" {
		creds.Region = os.Getenv("AWS_DEFAULT_REGION")
	}
	if creds.Region == "" {
		answer, err := promptLine("Region [us-east-1]: ")
		if err != nil {
			return creds, err
		}
		creds.Region = strings.TrimSpace(answer)
		if creds.Region == "" {
			creds.Region = "us-east-1"
		}
	}

	// The environment first, so a machine that already has a working
	// AWS setup needs nothing typed. Both halves or neither: a key id
	// from the environment and a secret from a prompt is the kind of
	// mix that produces a signature error nobody can explain.
	envKey := os.Getenv("AWS_ACCESS_KEY_ID")
	envSecret := os.Getenv("AWS_SECRET_ACCESS_KEY")
	if creds.AccessKey == "" && envKey != "" && envSecret != "" {
		creds.AccessKey, creds.SecretKey = envKey, envSecret
		fmt.Println("Using the AWS credentials from the environment.")
		return creds, nil
	}

	if creds.AccessKey == "" {
		answer, err := promptLine("Access key ID: ")
		if err != nil {
			return creds, err
		}
		creds.AccessKey = strings.TrimSpace(answer)
	}
	if creds.AccessKey == "" {
		return creds, fmt.Errorf("an access key is required")
	}

	if creds.SecretKey == "" {
		secret, err := promptSecret("Secret access key: ")
		if err != nil {
			return creds, err
		}
		creds.SecretKey = secret
	}
	if creds.SecretKey == "" {
		return creds, fmt.Errorf("a secret access key is required")
	}

	return creds, nil
}

// chooseStateBackup picks which backup to install.
//
// The newest is the default and is almost always right, but not always:
// recovering after someone broke the configuration means wanting the
// one from before they broke it, and only the operator knows when that
// was. So the recent ones are listed with their dates and the choice is
// offered rather than assumed.
func chooseStateBackup(logger *log.Logger, backups []docker.StateBackup) (docker.StateBackup, error) {
	const show = 10

	logger.Printf("\n%d state file backup(s) in the bucket:\n", len(backups))

	listed := backups
	if len(listed) > show {
		listed = listed[:show]
	}
	for i, backup := range listed {
		marker := " "
		if i == 0 {
			marker = "*"
		}
		logger.Printf("  %s %2d) %s   %s", marker, i+1,
			backup.Taken.Local().Format("Mon, 02 Jan 2006 15:04:05 MST"),
			humanBytes(backup.Size))
	}
	if len(backups) > show {
		logger.Printf("     ... and %d older", len(backups)-show)
	}

	answer, err := promptLine("\nWhich one? [1]: ")
	if err != nil {
		return docker.StateBackup{}, err
	}
	answer = strings.TrimSpace(answer)
	if answer == "" {
		return backups[0], nil
	}

	choice, err := strconv.Atoi(answer)
	if err != nil || choice < 1 || choice > len(listed) {
		return docker.StateBackup{}, fmt.Errorf("pick a number between 1 and %d", len(listed))
	}
	return backups[choice-1], nil
}

// promptSecret reads a line without echoing it.
//
// The secret key would otherwise sit in the terminal's scrollback for
// as long as the window is open, which is a worse place for it than the
// shell history a flag would have used.
func promptSecret(prompt string) (string, error) {
	fmt.Print(prompt)

	// Not a terminal — a pipe, or a test — so there is nothing to turn
	// off and reading normally is the only thing that works.
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return promptLine("")
	}

	secret, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return "", fmt.Errorf("error reading the secret key: %w", err)
	}
	return strings.TrimSpace(string(secret)), nil
}