// internal/messaging/messaging.go
package messaging

import (
	"dev2pdb/internal/config"
	"fmt"
	"strings"
)

// Client es la abstracción común para MQTT o NATS.
type Client interface {
    Connect() error
    Subscribe(subject string, handler func(topic string, payload []byte)) error
    Close()
}

// NewClient construye la implementación adecuada según cfg.Messaging.Type.
func NewClient(cfg *config.Config) (Client, error) {
    switch strings.ToLower(cfg.MessagingType) {
    case "mqtt":
        return NewMQTTClient(cfg), nil
    case "nats":
        return NewNATSClient(cfg)
    default:
        return nil, fmt.Errorf("messaging type %q no soportado", cfg.MessagingType)
    }
}