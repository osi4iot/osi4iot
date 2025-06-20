package nats

import (
	"context"
	"fmt"
	"org_flows/config"
	"org_flows/logger"
	"strings"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

func Connect(cfg *config.Config, log *logger.Logger) (*nats.Conn, error) {
	nc, err := nats.Connect(
		strings.Join(cfg.NATS.ServersUrl, ","),
		nats.UserInfo(cfg.NATS.Username, cfg.NATS.Password),
	)
	if err != nil {
		log.Errorf("Error connecting to NATS: %v", err)
		return nil, err
	}
	log.Info("Connected to NATS")
	return nc, nil
}

func JetStreamConnect(nc *nats.Conn, log *logger.Logger) (jetstream.JetStream, error) {
	js, err := jetstream.New(nc)
	if err != nil {
		log.Errorf("Error getting JetStream context: %v", err)
		return nil, err
	}
	log.Info("JetStream instance created successfully")
	return js, nil
}

func CreateStream(
	cfg *config.Config,
	log *logger.Logger,
	js jetstream.JetStream,
) (jetstream.Stream, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	streamName := strings.ToUpper(fmt.Sprintf("ORG_%s", cfg.OrgHash))
	subject := fmt.Sprintf("org_%s.>", cfg.OrgHash)
	stream, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:     streamName,
		Subjects: []string{subject},
		Storage:  jetstream.FileStorage,
		Replicas: cfg.NumStreamReplicas,
		Retention: jetstream.LimitsPolicy,
		MaxAge: 1 * time.Hour, // Retain messages for 1 hour
	})

	if err != nil {
		log.Errorf("Error creating stream '%s': %v", streamName, err)
		return nil, err
	}

	log.Infof("Stream '%s' created successfully", streamName)
	log.Infof("Stream subject: '%s'", subject)
	return stream, nil
}

func CreateConsumer(cfg *config.Config, log *logger.Logger, stream jetstream.Stream) (jetstream.Consumer, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	consumerName := fmt.Sprintf("org_%s_%d", cfg.OrgHash, cfg.ReplicaIndex)
	ackWait := 10 * time.Second
	ackPolicy := jetstream.AckExplicitPolicy
	maxWaiting := 100
	maxAckPending := 1000

	consumer, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Name:          consumerName,
		Durable:       consumerName,
		AckPolicy:     ackPolicy,
		AckWait:       ackWait,
		MaxWaiting:    maxWaiting,
		MaxAckPending: maxAckPending,
		FilterSubject: fmt.Sprintf("org_%s.admin.>", cfg.OrgHash),
	})

	if err != nil {
		log.Errorf("Error creating consumer '%s': %v", consumerName, err)
		return nil, err
	}

	log.Infof("Consumer '%s' created successfully", consumerName)
	return consumer, nil
}
