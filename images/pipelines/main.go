package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pipelines/admin"
	"pipelines/config"
	"pipelines/flows_manager"
	"pipelines/logger"
	"pipelines/nats"
	"pipelines/utils"

	"github.com/jackc/pgx/v5/pgxpool"
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
	stream, err := nats.CreateAdminStream(cfg.ShardIndex, cfg.NumStreamReplicas, log, js)
	if err != nil {
		log.Fatal("Application startup failed")
	}

	// Create or update the consumer
	jsConsumer, err := nats.CreateAdminConsumer(cfg.ShardIndex, cfg.ReplicaIndex, log, stream)
	if err != nil {
		log.Fatal("Application startup failed")
	}

	admin, err := admin.CreateAdmin(cfg, log)
	if err != nil {
		log.Fatalf("Application startup failed: %v", err)
	}

	ctx, dbCancel := utils.ContextWithTimeoutAndCancel(5*time.Second)
	admin.StartAutoRefresh(ctx, time.Duration(2*time.Minute))

	// IOT Data DB connection
	config, err := pgxpool.ParseConfig(cfg.TimescaledbDNS())
	if err != nil {
		log.Fatalf("config parse error: %v", err)
	}

	dbpool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		log.Fatalf("pool creation error: %v", err)
	}
	defer dbpool.Close()

	// Verifica la conexión
	if err := dbpool.Ping(context.Background()); err != nil {
		log.Fatalf("ping error: %v", err)
	}

	log.Info("Connected to iot database")

	manager := flows_manager.CreateFlowsManager(cfg, nc, js, jsConsumer, dbpool, admin, log)

	utils.HealthCheck(cfg)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan
	manager.GracefullyShutdown()
	dbCancel()
	log.Info("Received shutdown signal, shutting down gracefully...")
	time.Sleep(2 * time.Second)
	os.Exit(0)
}
