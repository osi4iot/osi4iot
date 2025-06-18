package utils

import (
	"fmt"
	"net/http"
	"org_flows/config"
	"org_flows/logger"
	"time"

	backoff "github.com/cenkalti/backoff/v4"
)

//AdminApiBackoff: Check Admin API with backoff and retry until the Admin API is available
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