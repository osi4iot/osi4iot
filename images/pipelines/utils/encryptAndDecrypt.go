package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
)

type Hash struct {
	IV      string `json:"iv"`
	Content string `json:"content"`
}

// Encrypt cifra un texto usando AES-256-CTR
func Encrypt(text string, secretKey string) (string, error) {
	// Validar que la clave tenga 32 bytes (256 bits)
	if len(secretKey) != 32 {
		return "", fmt.Errorf("secret key must be 32 bytes long")
	}

	// Crear el cipher block
	block, err := aes.NewCipher([]byte(secretKey))
	if err != nil {
		return "", err
	}

	// Generar IV aleatorio de 16 bytes
	iv := make([]byte, aes.BlockSize)
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return "", err
	}

	// Crear el stream cipher en modo CTR
	stream := cipher.NewCTR(block, iv)

	// Encriptar el texto
	plaintext := []byte(text)
	ciphertext := make([]byte, len(plaintext))
	stream.XORKeyStream(ciphertext, plaintext)

	// Crear el objeto hash
	hashObj := Hash{
		IV:      hex.EncodeToString(iv),
		Content: hex.EncodeToString(ciphertext),
	}

	// Convertir a JSON y luego a base64
	jsonData, err := json.Marshal(hashObj)
	if err != nil {
		return "", err
	}

	encryptedText := base64.StdEncoding.EncodeToString(jsonData)
	return encryptedText, nil
}

// Decrypt descifra un texto encriptado
func Decrypt(encryptedText string, secretKey string) (string, error) {
	// Validar que la clave tenga 32 bytes (256 bits)
	if len(secretKey) != 32 {
		return "", fmt.Errorf("secret key must be 32 bytes long")
	}

	// Decodificar de base64
	jsonData, err := base64.StdEncoding.DecodeString(encryptedText)
	if err != nil {
		return "", err
	}

	// Parsear JSON
	var hash Hash
	if err := json.Unmarshal(jsonData, &hash); err != nil {
		return "", err
	}

	// Decodificar IV y contenido desde hex
	iv, err := hex.DecodeString(hash.IV)
	if err != nil {
		return "", err
	}

	content, err := hex.DecodeString(hash.Content)
	if err != nil {
		return "", err
	}

	// Crear el cipher block
	block, err := aes.NewCipher([]byte(secretKey))
	if err != nil {
		return "", err
	}

	// Crear el stream cipher en modo CTR
	stream := cipher.NewCTR(block, iv)

	// Desencriptar
	plaintext := make([]byte, len(content))
	stream.XORKeyStream(plaintext, content)

	return string(plaintext), nil
}