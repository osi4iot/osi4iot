package utils

import (
    "crypto/rand"
    "math/big"
)

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

func GenerateNanoID(size int) (string, error) {
    if size <= 0 {
        size = 20
    }
    
    id := make([]byte, size)
    for i := range id {
        num, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
        if err != nil {
            return "", err
        }
        id[i] = alphabet[num.Int64()]
    }
    return string(id), nil
}