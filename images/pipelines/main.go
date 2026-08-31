package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pipelines/admin"
	"pipelines/config"
	"pipelines/duckdb"
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
		log.Fatalf("Application startup failed: %v", err)
	}
	defer nc.Drain()

	js, err := nats.JetStreamConnect(nc, log)
	if err != nil {
		log.Fatalf("Application startup failed: %v", err)
	}

	ctx, cancel := utils.ContextWithCancel()
	defer cancel()

	// Create or update the stream
	stream, err := nats.CreateAdminStream(ctx, cfg.ShardIndex, cfg.NumStreamReplicas, log, js)
	if err != nil {
		log.Fatalf("Application startup failed: %v", err)
	}

	// Create or update the consumer
	jsConsumer, err := nats.CreateAdminConsumer(ctx, cfg.ShardIndex, cfg.ReplicaIndex, log, stream)
	if err != nil {
		log.Fatalf("Application startup failed: %v", err)
	}

	admin, err := admin.CreateAdmin(cfg, log)
	if err != nil {
		log.Fatalf("Application startup failed: %v", err)
	}

	admin.StartAutoRefresh(ctx, time.Duration(2*time.Minute))

	// IOT Data DB connection
	pgxConfig, err := pgxpool.ParseConfig(cfg.TimescaledbDNS())
	if err != nil {
		log.Fatalf("config parse error: %v", err)
	}

	dbpool, err := pgxpool.NewWithConfig(ctx, pgxConfig)
	if err != nil {
		log.Fatalf("pool creation error: %v", err)
	}
	defer dbpool.Close()

	// Verify the write database connection
	pingCtx, pingCancel := context.WithTimeout(ctx, 10*time.Second)
	defer pingCancel()
	if err := dbpool.Ping(pingCtx); err != nil {
		log.Fatalf("ping error for write database: %v", err)
	}

	log.Info("Connected to iot write database")

	dbReadPool, err := pgxpool.NewWithConfig(ctx, pgxConfig)
	if err != nil {
		log.Fatalf("read pool creation error: %v", err)
	}
	defer dbReadPool.Close()

	// Verify the read database connection
	pingReadCtx, pingReadCancel := context.WithTimeout(ctx, 10*time.Second)
	defer pingReadCancel()
	if err := dbReadPool.Ping(pingReadCtx); err != nil {
		log.Fatalf("ping error for read database: %v", err)
	}

	log.Info("Connected to iot read database")

	// Create S3 client
	s3Client, err := utils.CreateS3Client(ctx, cfg.AwsS3, log)
	if err != nil {
		log.Fatalf("Failed to create AWS S3 client: %v", err)
	}

	// Create duckdb connection pool
	duckdbPool, err := duckdb.NewDB(ctx, cfg, log)
	if err != nil {
		log.Fatalf("Failed to create DuckDB connection pool: %v", err)
	}
	log.Infof("DuckDB connection pool created successfully")
	defer duckdbPool.Close()

	manager := flows_manager.CreateFlowsManager(
		ctx,
		cfg,
		nc,
		js,
		jsConsumer,
		dbpool,
		dbReadPool,
		duckdbPool,
		s3Client,
		admin,
		log)

	utils.HealthCheck(cfg)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	<-sigChan
	log.Info("Received shutdown signal, shutting down gracefully...")
	cancel()

	shutdownCtx, shutdownCancel := utils.ContextWithTimeout(10 * time.Second)
	defer shutdownCancel()
	manager.GracefullyShutdown(shutdownCtx)
}
