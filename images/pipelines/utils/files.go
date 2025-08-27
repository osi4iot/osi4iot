package utils

import (
	"fmt"
	"os"
	"path/filepath"
)

func SaveToFile(fileName string, data []byte) error {
    dir := filepath.Dir(fileName)
    
    if err := os.MkdirAll(dir, 0755); err != nil {
        return err
    }


    return os.WriteFile(fileName, data, 0644)
}

func ReadFromFile(fileName string) ([]byte, error) {
    data, err := os.ReadFile(fileName)
    if err != nil {
        return nil, fmt.Errorf("error reading file %s: %w", fileName, err)
    }
    return data, nil
}


func FileExists(fileName string) bool {
    _, err := os.Stat(fileName)
    return err == nil
}

func DeleteFile(fileName string) error {
    if !FileExists(fileName) {
        return fmt.Errorf("file %s does not exist", fileName)
    }

    err := os.Remove(fileName)
    if err != nil {
        return fmt.Errorf("error deleting file %s: %w", fileName, err)
    }
    return nil
}

func FolderExists(dirPath string) (bool, error) {
    info, err := os.Stat(dirPath)
    if err == nil {
        return info.IsDir(), nil
    }
    if os.IsNotExist(err) {
        return false, nil
    }
    return false, err // Otro tipo de error (permisos, etc.)
}

func DeleteFolder(folderPath string) error {
    exist, err := FolderExists(folderPath)
    if err != nil {
        return err
    }
    if !exist {
        return fmt.Errorf("folder %s does not exist", folderPath)
    }

    err = os.RemoveAll(folderPath)
    if err != nil {
        return fmt.Errorf("error deleting folder %s: %w", folderPath, err)
    }
    return nil
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
