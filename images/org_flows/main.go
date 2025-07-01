package main

import (
	"org_flows/admin"
	"org_flows/config"
	"org_flows/flows_manager"
	"org_flows/logger"
	"org_flows/nats"
	"org_flows/utils"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	// Logger
	log := logger.NewLogger()

	// Load config
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	log.Info("Number of replicas: ", cfg.NumReplicas)

	utils.AdminApiBackoff(log, cfg)

	nc, err := nats.Connect(cfg, log)
	if err != nil {
		log.Fatal("Application startup failed")
	}
	defer nc.Drain()

	js, err := nats.JetStreamConnect(nc, log)
	if err != nil {
		log.Fatal("Application startup failed")
	}

	// Create or update the stream
	stream, err := nats.CreateStream(cfg.ShardIndex, cfg.NumStreamReplicas, log, js)
	if err != nil {
		log.Fatal("Application startup failed")
	}

	// Create or update the consumer
	jsConsumer, err := nats.CreateConsumer(cfg.ShardIndex, cfg.ReplicaIndex, log, stream)
	if err != nil {
		log.Fatal("Application startup failed")
	}

	admin, err := admin.CreateAdmin(cfg, log)
	if err != nil {
		log.Fatal("Application startup failed: %v", err)
	}

	ctx, cancel := utils.ContextWithCancel()
	admin.StartAutoRefresh(ctx, time.Duration(2 * time.Minute))

	flows_manager.CreateFlowsManager(cfg, nc, js, jsConsumer, admin, log)

	utils.HealthCheck()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan
	cancel()
	log.Info("Received shutdown signal, shutting down gracefully...")
}
