package utils

import (
	"encoding/json"	
	"fmt"
	"io"
	"net/http"
	"time"
)

type malformedRequest struct {
	status int
	msg    string
}

func (mr *malformedRequest) Error() string {
	return mr.msg
}

var (
	client = &http.Client{
		Timeout: 10 * time.Second,
	}
)

type JsonResponse interface{}

func HttpGet(url string) (JsonResponse, error) {
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	if resp.Body != nil {
		defer resp.Body.Close()
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d %s", resp.StatusCode, resp.Status)
	}

	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, fmt.Errorf("failed to read response body: %v", readErr)
	}

	var jsonResponse JsonResponse
	if err := json.Unmarshal(body, &jsonResponse); err != nil {
		return nil, fmt.Errorf("failed to unmarshal JSON response: %v", err)
	}

	return jsonResponse, nil
}