package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/spf13/viper"
)

type Config struct {
	Env                 string `mapstructure:"ENV"`
	AccessTokenSecret   string `mapstructure:"ACCESS_TOKEN_SECRET"`
	DomainName          string `mapstructure:"DOMAIN_NAME"`
	PGHost              string `mapstructure:"PG_HOST"`
	PGPort              int    `mapstructure:"PG_PORT"`
	PGUserName          string `mapstructure:"PG_USERNAME"`
	PGPassword          string `mapstructure:"PG_PASSWORD"`
	PGDBName            string `mapstructure:"PG_DBNAME"`
	NatsHost            string `mapstructure:"NATS_HOST"`
	NatsPort            int    `mapstructure:"NATS_PORT"`
	NatsProtocol        string `mapstructure:"NATS_PROTOCOL"`
	NatsAdminUserName   string `mapstructure:"NATS_ADMIN_USERNAME"`
	NatsAdminPassword   string `mapstructure:"NATS_ADMIN_PASSWORD"`
	NatsIssuerSeed      string `mapstructure:"NATS_ISSUER_SEED"`
	NatsXkeySeed        string `mapstructure:"NATS_XKEY_SEED"`
	VectorNKeyPublic    string `mapstructure:"VECTOR_NATS_NKEY_PUBLIC"`
	AdminApiNKeyPublic  string `mapstructure:"ADMIN_API_NATS_NKEY_PUBLIC"`
	PipelinesNKeyPublic string `mapstructure:"PIPELINES_NATS_NKEY_PUBLIC"`
	DeployCliNKeyPublic string `mapstructure:"DEPLOY_CLI_NATS_NKEY_PUBLIC"`
	SystemManagerNKeyPublic string `mapstructure:"SYSTEM_MANAGER_NATS_NKEY_PUBLIC"`
}

func LoadConfig() (*Config, error) {
	var cfg Config

	// Set file name for environment configuration
	configFile := "./config.env"
	viper.SetConfigFile(configFile)
	viper.AutomaticEnv() // Read environment variables

	// Read the configuration file
	if err := viper.ReadInConfig(); err != nil {
		return nil, err
	}

	// Unmarshal into Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func DBConnectionPool(config *Config) *pgxpool.Pool {
	dbPort := fmt.Sprint(config.PGPort)
	dbURL := "postgres://" + config.PGUserName + ":" + config.PGPassword + "@" + config.PGHost + ":" + dbPort + "/" + config.PGDBName

	dbConfig, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		panic(fmt.Sprintf("Failed to create a config, error: %v", err))
	}

	dbConfig.MaxConns = 10
	dbConfig.MinConns = 2
	dbConfig.MaxConnLifetime = 30 * time.Minute
	dbConfig.MaxConnIdleTime = 10 * time.Minute
	dbConfig.HealthCheckPeriod = 10 * time.Minute
	dbConfig.ConnConfig.ConnectTimeout = time.Second * 5

	dbpool, err := pgxpool.NewWithConfig(context.Background(), dbConfig)
	if err != nil {
		errMsg := "Unable to create connection pool: %v\n"
		slog.Error(errMsg, slog.String("error=", err.Error()))
		panic(err)
	}
	slog.Info("Database connection pool created successfully")

	return dbpool
}

func NatsConnection(config *Config) (*nats.Conn, error) {
	natsUrl := fmt.Sprintf("%s://%s:%d", config.NatsProtocol, config.NatsHost, config.NatsPort)
	slog.Info("Connecting to NATS server", slog.String("url", natsUrl))
	natsUser := config.NatsAdminUserName
	natsPass := config.NatsAdminPassword

	if config.Env == "development" {
		tlsCfg := &tls.Config{
			ServerName:         config.DomainName,
			InsecureSkipVerify: true,
		}
		return nats.Connect(natsUrl, nats.UserInfo(natsUser, natsPass), nats.Secure(tlsCfg))
	} else {
		tlsCfg := &tls.Config{
			ServerName: config.DomainName,
			MinVersion: tls.VersionTLS12,
		}
		rootCAs, err := x509.SystemCertPool()
		if err != nil || rootCAs == nil {
			rootCAs = x509.NewCertPool()
		}
		tlsCfg.RootCAs = rootCAs

		return nats.Connect(natsUrl, nats.UserInfo(natsUser, natsPass), nats.Secure(tlsCfg))
	}
}