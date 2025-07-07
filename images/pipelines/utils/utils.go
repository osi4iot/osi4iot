package utils

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"pipelines/config"
	"pipelines/logger"
	"time"

	backoff "github.com/cenkalti/backoff/v4"
)

// AdminApiBackoff: Check Admin API with backoff and retry until the Admin API is available
func AdminApiBackoff(log *logger.Logger, cfg *config.Config) {
	adminApiUrl := "http://admin_api:3200/health"
	if cfg.Mode == "local" {
		adminApiUrl = fmt.Sprintf("https://%s/admin_api/health", cfg.DomainName)
	}
	bo := backoff.NewExponentialBackOff()
	bo.MaxElapsedTime = 2 * time.Minute
	err := backoff.Retry(func() error {
		client := http.Client{Timeout: 5 * time.Second}
		resp, err := client.Get(adminApiUrl)
		if err != nil {
			log.Warnf("admin API not available: %v", err)
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("status %d", resp.StatusCode)
		}
		return nil
	}, bo)
	if err != nil {
		log.Fatal("Admin API not healthy after retries")
	}
	log.Info("Admin API healthy, proceeding...")
}

func HealthCheck() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})
	srv := &http.Server{Addr: ":3300", Handler: mux}
	go func() {
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()
}

func MarshalData(data interface{}) ([]byte, error) {
	bytesData, err := json.Marshal(data)
	if err != nil {
		log.Printf("Failed to marshal data: %v", err)
		return nil, err
	}
	return bytesData, nil
}

func UnmarshalData(data []byte, v interface{}) error {
	err := json.Unmarshal(data, v)
	if err != nil {
		log.Printf("Failed to unmarshal data: %v", err)
		return err
	}
	return nil
}

