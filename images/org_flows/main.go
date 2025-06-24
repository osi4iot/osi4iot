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
	stream, err := nats.CreateStream(cfg, log, js)
	if err != nil {
		log.Fatal("Application startup failed")
	}

	// Create or update the consumer
	cons, err := nats.CreateConsumer(cfg, log, stream)
	if err != nil {
		log.Fatal("Application startup failed")
	}


	// Start Admin service
	admin.Listen(cfg, log, cons)

	utils.HealthCheck()

	flows_manager.CreateFlowsManager(cfg, nc, js, log)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan
}
