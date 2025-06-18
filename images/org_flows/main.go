package main

import (
	"org_flows/config"
	"org_flows/logger"
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
		log.Fatalf("config load error: %v", err)
	}

	log.Info("Number of replicas: ", cfg.NumReplicas)

	utils.AdminApiBackoff(log, cfg)



	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan
}
