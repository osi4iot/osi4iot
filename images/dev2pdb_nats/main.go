// main.go
package main

import (
	"context"
	"dev2pdb/internal/batcher"
	"dev2pdb/internal/config"
	"dev2pdb/internal/handler"
	"dev2pdb/internal/messaging"
	"dev2pdb/internal/models"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	backoff "github.com/cenkalti/backoff/v4"
	"github.com/jackc/pgx/v4/pgxpool"
	"go.uber.org/zap"
)

func main() {
	// Logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()
	sugar := logger.Sugar()

	// Load config
	cfg, err := config.Load()
	if err != nil {
		sugar.Fatalf("config load error: %v", err)
	}
	sugar.Info("Number of workers: ", cfg.NumWorkers)
	sugar.Info("Batch size: ", cfg.BatchSize)

	// Check Admin API with backoff and retry until the Admin API is available
	bo := backoff.NewExponentialBackOff()
	bo.MaxElapsedTime = 2 * time.Minute
	err = backoff.Retry(func() error {
		client := http.Client{Timeout: 5 * time.Second}
		resp, err := client.Get("http://admin_api:3200/health")
		if err != nil {
			sugar.Warnf("admin API not available: %v", err)
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("status %d", resp.StatusCode)
		}
		return nil
	}, bo)
	if err != nil {
		sugar.Fatal("Admin API not healthy after retries")
	}
	sugar.Info("Admin API healthy, proceeding...")

	// Write DB connection
	dbpool, err := pgxpool.Connect(context.Background(), cfg.TimescaledbDNS())
	if err != nil {
		sugar.Fatalf("db write connect error: %v", err)
	}
	defer dbpool.Close()
	sugar.Info("Connected to write database")

	// Read DB connection
	dbpoolRead, err := pgxpool.Connect(context.Background(), cfg.TimescaledbReadDNS())
	if err != nil {
		sugar.Fatalf("db read connect error: %v", err)
	}
	defer dbpoolRead.Close()
	sugar.Info("Connected to read database")

	// 1-) Connect to messaging broker (Mosquitto or NATS)
	natsClient, err := messaging.NewNATSClient(cfg)
	if err != nil {
		sugar.Fatalf("could not create messaging client: %v", err)
	}
	if err := natsClient.Connect(); err != nil {
		sugar.Fatalf("error connecting to broker: %v", err)
	}
	defer natsClient.Close()

	// 2-) Unified channel and batchers
	dataCh := make(chan models.ThingData, cfg.BatchSize)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	b := batcher.NewBatcher(
		ctx,
		dbpool,
		dataCh,
		cfg.NumWorkers,
		cfg.BatchSize,
		200*time.Millisecond,
		batcher.CopyFromSaver,
		sugar,
	)
	go b.Start()

	// 3) Defining subjects and their handlers
	subs := []struct {
		mqttSub string
		natsSub string
		ext     handler.RowExtractor
	}{
		{"dev2pdb/#", "dev2pdb.>", handler.BaseExtractor},
		{"dev2pdb_wt/#", "dev2pdb_wt.>", handler.TimestampExtractor},
		{"dev2pdb_ma/#", "dev2pdb_ma.>", handler.ArrayExtractor},
		{"dtm2pdb/#", "dtm2pdb.>", handler.BaseExtractor},
	}

	// 4-) Dynamic subscription
	for _, s := range subs {
		topic := s.natsSub
		sugar.Infof("subscribing to %s", topic)

		// en NATS natsClient.Subscribe invoca tu handler con (subject, payload)
		err := natsClient.Subscribe(topic, func(receivedTopic string, payload []byte) {
			// partir el subject usando "/" o "." según el broker
			parts := strings.Split(receivedTopic, ".")

			// extract rows
			rows, err := s.ext(parts, payload)
			if err != nil {
				sugar.Warnf("skipping message %q: %v", receivedTopic, err)
				return
			}
			// send all rows to the unified channel
			for _, row := range rows {
				dataCh <- row
			}
		})
		if err != nil {
			sugar.Fatalf("error subscribing to %s: %v", topic, err)
		}
	}

	// 5-) HTTP health endpoint
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})
	srv := &http.Server{Addr: ":3300", Handler: mux}
	go func() {
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			sugar.Fatalf("HTTP server error: %v", err)
		}
	}()

	// 6-) Graceful shutdown
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	<-sigs
	sugar.Info("Shutdown initiated…")
	cancel()
	ctxShut, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	srv.Shutdown(ctxShut)
	defer cancel()
	sugar.Info("Service shutdown complete")
}
