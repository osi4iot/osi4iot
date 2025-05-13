// internal/messsaging/mqtt.go
package messaging

import (
	"dev2pdb/internal/config"
	"fmt"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type mqttClient struct {
    client mqtt.Client
}

func NewMQTTClient(cfg *config.Config) *mqttClient {
    opts := mqtt.NewClientOptions().
        AddBroker(fmt.Sprintf("tcp://%s:%d", cfg.MQTT.Broker, cfg.MQTT.Port)).
        SetClientID(cfg.MQTT.ClientID).
        SetUsername(cfg.MQTT.Username).
        SetPassword(cfg.MQTT.Password)
    return &mqttClient{client: mqtt.NewClient(opts)}
}

func (m *mqttClient) Connect() error {
    token := m.client.Connect()
    if !token.WaitTimeout(5 * time.Second) {
        return fmt.Errorf("timeout connecting to MQTT")
    }
    return token.Error()
}

func (m *mqttClient) Subscribe(topic string, handler func(string, []byte)) error {
    return m.client.Subscribe(topic, 0, func(_ mqtt.Client, msg mqtt.Message) {
        handler(msg.Topic(), msg.Payload())
    }).Error()
}

func (m *mqttClient) Close() {
    m.client.Disconnect(250)
}