package tools

import (
	"bytes"
	"os"
)

func AltCtrlCharWindows(character string) string {
	byteString := []byte(character)
	if bytes.Equal(byteString, []byte{97, 108, 116, 43, 0}) {
		character = ""
	} else if bytes.Equal(byteString, []byte{97, 108, 116, 43, 124}) {
		character = "|"
	} else if bytes.Equal(byteString, []byte{97, 108, 116, 43, 35}) {
		character = "#"
	} else if bytes.Equal(byteString, []byte{97, 108, 116, 43, 226, 130, 172}) {
		character = "€"
	} else if bytes.Equal(byteString, []byte{97, 108, 116, 43, 99, 116, 114, 108, 43, 64}) {
		character = "@"
	} else if bytes.Equal(byteString, []byte{97, 108, 116, 43, 91}) {
		character = "["
	} else if bytes.Equal(byteString, []byte{97, 108, 116, 43, 93}) {
		character = "]"
	} else if bytes.Equal(byteString, []byte{97, 108, 116, 43, 123}) {
		character = "{"
	} else if bytes.Equal(byteString, []byte{97, 108, 116, 43, 125}) {
		character = "}"
	}
	return character
}

func CreateDirectoryIfNotExists(dirPath string) error {
	if _, err := os.Stat(dirPath); os.IsNotExist(err) {
		err := os.MkdirAll(dirPath, os.ModePerm)
		if err != nil {
			return err
		}
	}
	return nil
}
