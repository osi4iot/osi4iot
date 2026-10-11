package main

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"

	jwt_rc "github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/pbkdf2"
	"fmt"
)

type IJwtPayload struct {
	ID     int32 `json:"id"`
	Email  string `json:"email"`
	Action string `json:"action"`
	jwt_rc.RegisteredClaims
}

func VerifyPassword(password, matchHash, salt string) bool {
	iterations := 10000
	keyLength := 50

	userHash := pbkdf2.Key([]byte(password), []byte(salt), iterations, keyLength, sha256.New)
	userHashHex := hex.EncodeToString(userHash)
	return subtle.ConstantTimeCompare([]byte(userHashHex), []byte(matchHash)) == 1
}

func VerifyJWT(tokenString, jwtSecret string) (*IJwtPayload, error) {
	token, err := jwt_rc.ParseWithClaims(tokenString, &IJwtPayload{}, func(token *jwt_rc.Token) (interface{}, error) {
		if token.Method.Alg() != "HS256" {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(jwtSecret), nil
	})
	if err != nil {
		return nil, err
	}

	// Verify that the claims can be converted to *IJwtPayload and that the token is valid.
	if claims, ok := token.Claims.(*IJwtPayload); ok && token.Valid {
		return claims, nil
	}
	return nil, fmt.Errorf("invalid token")
}
