package nats

import (
	"errors"
	"fmt"
	"testing"

	"github.com/nats-io/nats.go/jetstream"
)

func TestRevisionConflicts(t *testing.T) {
	conflicts := []error{
		jetstream.ErrKeyExists,
		&jetstream.APIError{ErrorCode: jetstream.JSErrCodeStreamWrongLastSequence, Code: 400, Description: "wrong last sequence: 41"},
		// what a stream with replicas answers
		&jetstream.APIError{ErrorCode: 10164, Code: 400, Description: "wrong last sequence"},
		fmt.Errorf("nats: %w", &jetstream.APIError{ErrorCode: 10164, Code: 400}),
	}
	for _, err := range conflicts {
		if !isRevisionConflict(err) {
			t.Errorf("%v must be a conflict (retried)", err)
		}
	}
	others := []error{
		errors.New("timeout"),
		jetstream.ErrKeyNotFound,
		&jetstream.APIError{ErrorCode: jetstream.JSErrCodeStreamNotFound, Code: 404},
	}
	for _, err := range others {
		if isRevisionConflict(err) {
			t.Errorf("%v is not a conflict", err)
		}
	}
}
