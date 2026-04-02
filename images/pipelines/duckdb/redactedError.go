package duckdb

import (
	"fmt"
	"strings"
)

// ─── redactedError ────────────────────────────────────────────────────────────

// redactedError masks sensitive credentials in its message,
// while preserving the Unwrap() chain so errors.Is/As keep working.
type redactedError struct {
	cause    error
	replacer *strings.Replacer
}

func (e *redactedError) Error() string {
	return e.replacer.Replace(e.cause.Error())
}

func (e *redactedError) Unwrap() error {
	return e.cause
}

// newRedactedError creates an error with sensitive strings masked.
// Each value in sensitive is replaced with "***" in the error message.
func newRedactedError(err error, sensitive ...string) error {
	if err == nil {
		return nil
	}
	pairs := make([]string, 0, len(sensitive)*2)
	for _, s := range sensitive {
		if s != "" {
			pairs = append(pairs, s, "***")
		}
	}
	return &redactedError{
		cause:    err,
		replacer: strings.NewReplacer(pairs...),
	}
}

// ─── SensitiveConfig ─────────────────────────────────────────────────────────

// SensitiveConfig is the single source of truth for all sensitive values
// in the duckdb package. Build it once and pass it to newRedactedError.
//
// Fields map directly to the three sources of sensitive data:
//   - Postgres/TimescaleDB credentials (DSN, user, password)
//   - AWS S3 / MinIO credentials and bucket coordinates
//   - User-supplied query variable values
type SensitiveConfig struct {
	// Postgres
	PgConnStr string
	PgUser    string
	PgPass    string

	// S3 / MinIO
	S3AccessKeyId     string
	S3SecretAccessKey string
	S3BucketName      string
	S3BucketPath      string

	// Query variables (values only, not keys)
	QueryVariables map[string]any
}

// values returns the flat list of sensitive strings ready for newRedactedError.
// It is the only place where we decide what counts as sensitive.
func (sc SensitiveConfig) values() []string {
	var out []string

	add := func(s string) {
		if s != "" {
			out = append(out, s)
		}
	}

	// Postgres
	add(sc.PgConnStr)
	add(sc.PgUser)
	add(sc.PgPass)

	// S3 credentials
	add(sc.S3AccessKeyId)
	add(sc.S3SecretAccessKey)

	// S3 bucket coordinates: individual parts and composed URLs,
	// because DuckDB may surface any of these forms in error messages.
	add(sc.S3BucketName)
	add(sc.S3BucketPath)
	if sc.S3BucketName != "" {
		add(fmt.Sprintf("s3://%s", sc.S3BucketName))
		if sc.S3BucketPath != "" {
			add(fmt.Sprintf("s3://%s/%s", sc.S3BucketName, sc.S3BucketPath))
		}
	}

	// User variable values (keys are safe to expose for debugging)
	for _, v := range sc.QueryVariables {
		if s, ok := v.(string); ok {
			add(s)
		}
	}

	return out
}

// Redact wraps err masking all sensitive values defined in sc.
// Returns nil if err is nil.
func (sc SensitiveConfig) Redact(err error) error {
	return newRedactedError(err, sc.values()...)
}