package duckdb

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"

	duckdbdrv "github.com/duckdb/duckdb-go/v2"

	"pipelines/config"
	"pipelines/logger"
)

// installOnce ensures extensions are installed only once per process.
var (
	installOnce sync.Once
	installErr  error
)

// extensionDir returns the directory where DuckDB extensions are pre-installed.
// In Docker it matches DUCKDB_EXT_DIR; locally falls back to ~/.duckdb/extensions.
func extensionDir() string {
	if dir := os.Getenv("DUCKDB_EXT_DIR"); dir != "" {
		return dir
	}
	home := os.Getenv("HOME")
	if home == "" || home == "/nonexistent" {
		home = "/tmp/duckdb"
	}
	return home + "/.duckdb/extensions"
}

// inDockerEnv returns true when DUCKDB_EXT_DIR is explicitly set,
// which signals that extensions are pre-downloaded on disk (Docker/CI).
// In local dev environments the variable is absent and DuckDB is allowed
// to pull extensions from extensions.duckdb.org on first run.
func inDockerEnv() bool {
	return os.Getenv("DUCKDB_EXT_DIR") != ""
}

// NewDB creates and configures an in-memory DuckDB connection with:
//   - httpfs, parquet, and postgres extensions loaded
//   - S3/MinIO credentials configured
//   - TimescaleDB/Postgres attached as "tsdb"
func NewDB(ctx context.Context, cfg *config.Config, log *logger.Logger) (*sql.DB, error) {
	if cfg == nil {
		return nil, errors.New("duckdb: config is required")
	}

	pgConnStr := buildPgConnStr(cfg)

	sc := SensitiveConfig{
		PgConnStr:         pgConnStr,
		PgUser:            cfg.TimescaleDB.User,
		PgPass:            cfg.TimescaleDB.Password,
		S3AccessKeyId:     cfg.AwsS3.AccessKeyId,
		S3SecretAccessKey: cfg.AwsS3.SecretAccessKey,
		S3BucketName:      cfg.AwsS3.Bucket,
	}

	docker := inDockerEnv()
	extDir := extensionDir()

	connector, err := duckdbdrv.NewConnector(":memory:", func(execer driver.ExecerContext) error {
		initCtx := context.Background()

		// Fix home directory for Docker environments where $HOME may not exist.
		homeDir := os.Getenv("HOME")
		if homeDir == "" || homeDir == "/nonexistent" {
			homeDir = "/tmp/duckdb"
		}
		if _, err := execer.ExecContext(initCtx,
			fmt.Sprintf("SET home_directory='%s'", escapeSQLString(homeDir)), nil,
		); err != nil {
			return fmt.Errorf("duckdb set home_directory: %w", err)
		}

		// Point DuckDB to the pre-downloaded extensions directory.
		// Must be set before any INSTALL or LOAD call.
		if _, err := execer.ExecContext(initCtx,
			fmt.Sprintf("SET extension_directory='%s'", escapeSQLString(extDir)), nil,
		); err != nil {
			return fmt.Errorf("duckdb set extension_directory: %w", err)
		}

		// In Docker, extensions are already on disk: disable all network access
		// so DuckDB never tries to reach extensions.duckdb.org.
		// In local dev, leave autoinstall enabled so the first run can pull them.
		if docker {
			for _, stmt := range []string{
				"SET autoinstall_known_extensions=false",
				"SET autoload_known_extensions=false",
			} {
				if _, err := execer.ExecContext(initCtx, stmt, nil); err != nil {
					return fmt.Errorf("duckdb set extension policy: %w", err)
				}
			}
		}

		// INSTALL runs only once per process lifetime.
		//
		// Docker:    installs from the local .duckdb_extension file on disk.
		//            parquet is built-in and only needs LOAD, never INSTALL.
		//
		// Local dev: installs from extensions.duckdb.org (network required on
		//            first run; subsequent runs find the cached files and no-op).
		installOnce.Do(func() {
			if docker {
				localExts := map[string]string{
					"httpfs":   "httpfs",
					"postgres": "postgres_scanner",
				}
				for ext, filename := range localExts {
					path := fmt.Sprintf("%s/%s.duckdb_extension", extDir, filename)
					if _, e := execer.ExecContext(initCtx,
						fmt.Sprintf("INSTALL '%s'", escapeSQLString(path)), nil,
					); e != nil {
						installErr = fmt.Errorf("duckdb install %s from %s: %w", ext, path, e)
						return
					}
				}
			} else {
				// Network install: DuckDB caches the result under extDir so
				// subsequent process starts skip the download entirely.
				for _, ext := range []string{"httpfs", "postgres"} {
					if _, e := execer.ExecContext(initCtx,
						fmt.Sprintf("INSTALL %s", ext), nil,
					); e != nil {
						installErr = fmt.Errorf("duckdb install %s: %w", ext, e)
						return
					}
				}
			}
		})

		// installOnce masks panics but not errors: surface any install failure
		// before attempting LOAD so the error message is actionable.
		if installErr != nil {
			return fmt.Errorf("duckdb extension setup: %w", installErr)
		}

		// LOAD is required for every new connection, even for built-ins like parquet.
		for _, ext := range []string{"httpfs", "parquet", "postgres"} {
			if _, err := execer.ExecContext(initCtx, "LOAD "+ext, nil); err != nil {
				return fmt.Errorf("duckdb load %s: %w", ext, err)
			}
		}

		// S3 / MinIO credentials.
		for _, stmt := range buildS3Stmts(cfg) {
			if _, err := execer.ExecContext(initCtx, stmt, nil); err != nil {
				return sc.Redact(fmt.Errorf("duckdb s3 config: %w", err))
			}
		}

		// Attach Postgres / TimescaleDB as "tsdb".
		attachStmt := fmt.Sprintf(
			"ATTACH '%s' AS tsdb (TYPE postgres)",
			escapeSQLString(pgConnStr),
		)
		if _, err := execer.ExecContext(initCtx, attachStmt, nil); err != nil {
			if !isAlreadyAttachedErr(err) {
				return sc.Redact(fmt.Errorf("duckdb attach tsdb: %w", err))
			}
			if log != nil {
				log.Warn("duckdb: tsdb already attached, reusing existing attachment")
			}
		}

		return nil
	})
	if err != nil {
		return nil, sc.Redact(fmt.Errorf("new duckdb connector: %w", err))
	}

	db := sql.OpenDB(connector)
	db.SetMaxOpenConns(cfg.DuckDB.MaxOpenConns)
	db.SetMaxIdleConns(cfg.DuckDB.MaxIdleConns)
	db.SetConnMaxLifetime(cfg.DuckDB.ConnMaxLifetime)
	db.SetConnMaxIdleTime(cfg.DuckDB.MaxIdleTime)

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, sc.Redact(fmt.Errorf("ping duckdb: %w", err))
	}

	return db, nil
}

// buildPgConnStr builds the Postgres DSN from configuration.
func buildPgConnStr(cfg *config.Config) string {
	return fmt.Sprintf(
		"host=%s port=%d dbname=%s user=%s password=%s sslmode=%s",
		cfg.TimescaleDB.Host,
		cfg.TimescaleDB.Port,
		cfg.TimescaleDB.DBName,
		cfg.TimescaleDB.User,
		cfg.TimescaleDB.Password,
		cfg.TimescaleDB.SSLMode,
	)
}

// buildS3Stmts builds the SET statements required to configure S3 or MinIO.
func buildS3Stmts(cfg *config.Config) []string {
	set := func(key, val string) string {
		return fmt.Sprintf("SET %s='%s'", key, escapeSQLString(val))
	}

	var stmts []string

	if cfg.AwsS3.Region != "" {
		stmts = append(stmts, set("s3_region", cfg.AwsS3.Region))
	}
	if cfg.AwsS3.AccessKeyId != "" {
		stmts = append(stmts, set("s3_access_key_id", cfg.AwsS3.AccessKeyId))
	}
	if cfg.AwsS3.SecretAccessKey != "" {
		stmts = append(stmts, set("s3_secret_access_key", cfg.AwsS3.SecretAccessKey))
	}

	if raw := strings.TrimSpace(cfg.AwsS3.Endpoint); raw != "" {
		useSSL := !strings.HasPrefix(raw, "http://")
		endpoint := strings.TrimRight(
			strings.TrimPrefix(strings.TrimPrefix(raw, "https://"), "http://"),
			"/",
		)
		stmts = append(stmts,
			set("s3_endpoint", endpoint),
			"SET s3_url_style='path'",
			fmt.Sprintf("SET s3_use_ssl=%v", useSSL),
		)
	}

	return stmts
}

// escapeSQLString escapes single quotes to prevent SQL injection.
func escapeSQLString(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

// isAlreadyAttachedErr detects DuckDB's idempotent ATTACH error
// when the "tsdb" alias already exists in that connection.
func isAlreadyAttachedErr(err error) bool {
	const needle = `database with name "tsdb" already exists`
	for e := err; e != nil; e = errors.Unwrap(e) {
		if strings.Contains(e.Error(), needle) {
			return true
		}
	}
	return false
}