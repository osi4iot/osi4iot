package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/spf13/viper"
)

type Config struct {
	Env        string `mapstructure:"ENV"`
	AccessTokenSecret string `mapstructure:"ACCESS_TOKEN_SECRET"`
	DomainName        string `mapstructure:"DOMAIN_NAME"`
	PGHost            string `mapstructure:"PG_HOST"`
	PGPort            int    `mapstructure:"PG_PORT"`
	PGUserName        string `mapstructure:"PG_USERNAME"`
	PGPassword        string `mapstructure:"PG_PASSWORD"`
	PGDBName          string `mapstructure:"PG_DBNAME"`
	NatsHost          string `mapstructure:"NATS_HOST"`
	NatsPort          int    `mapstructure:"NATS_PORT"`
	NatsProtocol      string `mapstructure:"NATS_PROTOCOL"`
	NatsUser          string `mapstructure:"NATS_USERNAME"`
	NatsPass          string `mapstructure:"NATS_PASSWORD"`
	NatsIssuerSeed    string `mapstructure:"NATS_ISSUER_SEED"`
	NatsXkeySeed      string `mapstructure:"NATS_XKEY_SEED"`
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
	natsUser := config.NatsUser
	natsPass := config.NatsPass

	if config.Env == "development" {
		tlsCfg := &tls.Config{
			ServerName: config.DomainName,
			InsecureSkipVerify: true,
		}
		return nats.Connect(natsUrl, nats.UserInfo(natsUser, natsPass), nats.Secure(tlsCfg))
	} else {
		caCert, err := os.ReadFile("/etc/nats/ca.pem")
		if err != nil {
			panic(fmt.Sprintf("ca.pem can not be read: %v", err))
		}

		rootCAs, err := x509.SystemCertPool()
		if err != nil || rootCAs == nil {
			rootCAs = x509.NewCertPool()
		}
		if ok := rootCAs.AppendCertsFromPEM(caCert); !ok {
			panic("failed to add ca.pem to CA pool")
		}

		tlsCfg := &tls.Config{
			ServerName: config.DomainName,
			RootCAs:    rootCAs,
		}
		return nats.Connect(natsUrl, nats.UserInfo(natsUser, natsPass), nats.Secure(tlsCfg))
	}
}
