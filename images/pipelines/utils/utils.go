package utils

import (
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

func HealthCheck(cfg *config.Config) {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})

	port := ":3300"
	if cfg.Mode == "local" {
		replicaIndex := cfg.ReplicaIndex
		port = fmt.Sprintf(":%d", 3300+replicaIndex-1)
	}

	srv := &http.Server{Addr: port, Handler: mux}
	go func() {
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()
}

func TopicToNatsSubject(topicType, groupUid, topicUid string) string {
	return fmt.Sprintf("%s.Group_%s.Topic_%s", topicType, groupUid, topicUid)
}

var SystemMonitoringTopicMap = map[string]string{
	"Log entries":       "system.observability.logs",
	"Host metrics":      "system.observability.host_metrics",
	"Host state":        "system.observability.host_state",
	"Container metrics": "system.observability.container_metrics",
	"Volume metrics":    "system.observability.volume_metrics",
	"System alert":      "system.observability.system_alert",
}

func SystemMonitoringNatsSubject(description string) string {
	natsSubject := ""
	if mapped, ok := SystemMonitoringTopicMap[description]; ok {
		natsSubject = mapped
	}
	return natsSubject
}
