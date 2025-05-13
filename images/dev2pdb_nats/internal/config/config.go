// internal/config/config.go
package config

import (
	"fmt"
	"time"

	"github.com/spf13/viper"
)

// Config holds the entire application configuration.
type Config struct {
	Mode          string            `mapstructure:"mode"`
	DomainName    string            `mapstructure:"domainName"`
	MessagingType string            `mapstructure:"messagingtype"`
	MQTT          MQTTConfig        `mapstructure:"mqtt"`
	NATS          NATSConfig        `mapstructure:"nats"`
	TimescaleDB   TimescaleDBConfig `mapstructure:"timescaledb"`
	NumWorkers    int               `mapstructure:"numWorkers"`
}

type Messaging struct {
	Type string `mapstructure:"type"`
}

type MQTTConfig struct {
	ClientID              string `mapstructure:"clientID"`
	Broker                string `mapstructure:"broker"`
	Port                  int    `mapstructure:"port"`
	Username              string `mapstructure:"username"`
	Password              string `mapstructure:"password"`
	TLSInsecureSkipVerify bool   `mapstructure:"tlsInsecureSkipVerify"`
}

type NATSConfig struct {
	ServersUrl []string      `mapstructure:"serversUrl"`
	Username   string        `mapstructure:"username"`
	Password   string        `mapstructure:"password"`
	Timeout    time.Duration `mapstructure:"timeout"`
}

type TimescaleDBConfig struct {
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	DBName   string `mapstructure:"dbName"`
	SSLMode  string `mapstructure:"sslmode"`
}

// Load reads configuration from config.yaml, environment variables, and defaults.
func Load() (*Config, error) {
	// 1) Tell Viper where to look for the config file
	viper.SetConfigName("config") // name of file (without extension)
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".") // look for config in the working directory

	// 2) Allow overriding via environment variables
	viper.AutomaticEnv() // optional prefix for env vars: APP_MODE, APP_POSTGRES_USER, etc.

	// 3) Set defaults for any keys that might be missing
	viper.SetDefault("mode", "dev")
	viper.SetDefault("messaging.type", "mqtt")

	viper.SetDefault("mqtt.port", 1883)
	viper.SetDefault("mqtt.tlsInsecureSkipVerify", false)

	viper.SetDefault("nats.serversUrl", []string{"nats://localhost:4222"})
	viper.SetDefault("nats.timeout", 5*time.Second)

	viper.SetDefault("timescaledb.port", 5432)
	viper.SetDefault("timescaledb.sslmode", "disable")

	viper.SetDefault("numWorkers", 5)

	// 4) Read in the file
	if err := viper.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("error reading config file: %w", err)
	}

	// 5) Unmarshal into our struct
	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unable to decode into config struct: %w", err)
	}

	return &cfg, nil
}

// PostgresDNS returns a PostgreSQL connection string based on the loaded config.
func (c *Config) TimescaledbDNS() string {
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=%s",
		c.TimescaleDB.User,
		c.TimescaleDB.Password,
		c.TimescaleDB.Host,
		c.TimescaleDB.Port,
		c.TimescaleDB.DBName,
		c.TimescaleDB.SSLMode,
	)
}
