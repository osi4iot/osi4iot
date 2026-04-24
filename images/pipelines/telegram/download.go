package telegram

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type FileInfo struct {
	FileID   string `json:"file_id"`
	FilePath string `json:"file_path"`
}

type fileInfoResponse struct {
	OK     bool     `json:"ok"`
	Result FileInfo `json:"result"`
}

func DownloadFile(botToken string, fileID string) ([]byte, string, error) {
	// Paso 1: obtener la ruta del archivo
	url := fmt.Sprintf("https://api.telegram.org/bot%s/getFile?file_id=%s", botToken, fileID)
	resp, err := http.Get(url)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get file info: %w", err)
	}
	defer resp.Body.Close()

	var fileInfoResp fileInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&fileInfoResp); err != nil {
		return nil, "", fmt.Errorf("failed to decode file info response: %w", err)
	}
	if !fileInfoResp.OK {
		return nil, "", fmt.Errorf("telegram API error getting file info for fileID %s", fileID)
	}

	// Paso 2: descargar el archivo
	downloadURL := fmt.Sprintf("https://api.telegram.org/file/bot%s/%s", botToken, fileInfoResp.Result.FilePath)
	fileResp, err := http.Get(downloadURL)
	if err != nil {
		return nil, "", fmt.Errorf("failed to download file: %w", err)
	}
	defer fileResp.Body.Close()

	data, err := io.ReadAll(fileResp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("failed to read file data: %w", err)
	}

	return data, fileInfoResp.Result.FilePath, nil
}