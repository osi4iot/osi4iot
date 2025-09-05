package utils

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
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
    return false, err
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

func DeleteFilesInFolder(folderPath string) error {
	files, err := os.ReadDir(folderPath)
	if err != nil {
		return fmt.Errorf("error reading folder %s: %w", folderPath, err)
	}

	for _, file := range files {
		if !file.IsDir() {
			err := os.Remove(filepath.Join(folderPath, file.Name()))
			if err != nil {
				return fmt.Errorf("error deleting file %s: %w", file.Name(), err)
			}
		}
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

func IsDateNewerThanFile(dateStr, filePath string) (bool, error) {
	layouts := []string{
		// Zonas horarias europeas
		"Mon Jan 2 2006 15:04:05 GMT+0200 (Central European Summer Time)",
		"Mon Jan 2 2006 15:04:05 GMT+0100 (Central European Time)",
		"Mon Jan 2 2006 15:04:05 GMT+0200 (Central European Standard Time)",
		"Mon Jan 2 2006 15:04:05 GMT+0000 (Greenwich Mean Time)",
		"Mon Jan 2 2006 15:04:05 GMT+0100 (Western European Time)",
		"Mon Jan 2 2006 15:04:05 GMT+0200 (Eastern European Time)",
		
		// Zonas horarias de América
		"Mon Jan 2 2006 15:04:05 GMT-0500 (Eastern Standard Time)",
		"Mon Jan 2 2006 15:04:05 GMT-0400 (Eastern Daylight Time)",
		"Mon Jan 2 2006 15:04:05 GMT-0600 (Central Standard Time)",
		"Mon Jan 2 2006 15:04:05 GMT-0500 (Central Daylight Time)",
		"Mon Jan 2 2006 15:04:05 GMT-0700 (Mountain Standard Time)",
		"Mon Jan 2 2006 15:04:05 GMT-0600 (Mountain Daylight Time)",
		"Mon Jan 2 2006 15:04:05 GMT-0800 (Pacific Standard Time)",
		"Mon Jan 2 2006 15:04:05 GMT-0700 (Pacific Daylight Time)",
		
		// Otras zonas comunes
		"Mon Jan 2 2006 15:04:05 GMT+0900 (Japan Standard Time)",
		"Mon Jan 2 2006 15:04:05 GMT+0800 (China Standard Time)",
		"Mon Jan 2 2006 15:04:05 GMT+0530 (India Standard Time)",
		"Mon Jan 2 2006 15:04:05 GMT+1000 (Australian Eastern Standard Time)",
		"Mon Jan 2 2006 15:04:05 GMT+1100 (Australian Eastern Daylight Time)",
		
		// Formatos sin nombre de zona horaria (más genéricos)
		"Mon Jan 2 2006 15:04:05 GMT+0200",
		"Mon Jan 2 2006 15:04:05 GMT+0100",
		"Mon Jan 2 2006 15:04:05 GMT+0000",
		"Mon Jan 2 2006 15:04:05 GMT-0400",
		"Mon Jan 2 2006 15:04:05 GMT-0500",
		"Mon Jan 2 2006 15:04:05 GMT-0600",
		"Mon Jan 2 2006 15:04:05 GMT-0700",
		"Mon Jan 2 2006 15:04:05 GMT-0800",
		
		// Variaciones con MST/EST etc
		"Mon Jan 2 2006 15:04:05 MST",
		"Mon Jan 2 2006 15:04:05 EST",
		"Mon Jan 2 2006 15:04:05 PST",
		"Mon Jan 2 2006 15:04:05 UTC",
	}
	
	var parsedDate time.Time
	var parseErr error
	
	for _, layout := range layouts {
		parsedDate, parseErr = time.Parse(layout, dateStr)
		if parseErr == nil {
			break
		}
	}
	
	if parseErr != nil {
		return false, fmt.Errorf("error parsing date: %v", parseErr)
	}
	
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return true, fmt.Errorf("file does not exist: %s", filePath)
		}
		return false, fmt.Errorf("error accessing file: %v", err)
	}
	
	if fileInfo.IsDir() {
		return false, fmt.Errorf("path is a directory, not a file: %s", filePath)
	}
	
	fileModTime := fileInfo.ModTime()
	
	return parsedDate.After(fileModTime), nil
}
