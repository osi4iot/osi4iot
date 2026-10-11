// Package config provides small helpers for reading configuration out of
// the process environment. It has no dependencies on any other internal
// package so every other package in this service can depend on it.
package config

import (
	"log"
	"os"
	"strconv"
)

// MustEnv returns the value of the named environment variable, or aborts
// the process if it is unset or empty. Used for configuration a job
// cannot sensibly run without.
func MustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("missing required env var %s", key)
	}
	return v
}

// EnvIntDefault returns the named environment variable parsed as an int,
// or def if the variable is unset. It aborts the process if the variable
// is set but not a valid integer.
func EnvIntDefault(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		log.Fatalf("invalid integer for %s: %v", key, err)
	}
	return n
}

// EnvStringDefault returns the named environment variable, or def if the
// variable is unset.
func EnvStringDefault(key, def string) string {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	return v
}
