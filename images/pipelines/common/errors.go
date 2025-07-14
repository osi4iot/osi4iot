package common

import "errors"

var (
	ErrNotFound = errors.New("not found")
	ErrAlreadyExists = errors.New("already exists")
	ErrInvalidInput = errors.New("invalid input")
	ErrUnauthorized = errors.New("unauthorized")
	ErrInternal = errors.New("internal error")
	ErrKeyNotFound = errors.New("key not found in store")
)

