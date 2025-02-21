package utils

import "os"


func ExistFile(filePath string) bool {
	existFile := false
	_, err := os.Stat(filePath)
	if err == nil {
		existFile = true
	} else {
		if os.IsNotExist(err) {
			existFile = false
		}
	}
	return existFile
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

