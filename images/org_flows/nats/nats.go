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
	shardIndex int,
	numStreamReplicas int,
	log *logger.Logger,
	js jetstream.JetStream,
) (jetstream.Stream, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	streamName := strings.ToUpper(fmt.Sprintf("ORG_FLOWS_%d", shardIndex))
	subject := fmt.Sprintf("org_flows_%d.>", shardIndex)
	stream, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:     streamName,
		Subjects: []string{subject},
		Storage:  jetstream.FileStorage,
		Replicas: numStreamReplicas,
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

func CreateConsumer(
	shardIndex int,
	replicaIndex int,
	log *logger.Logger, 
	stream jetstream.Stream,
	) (jetstream.Consumer, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	consumerName := fmt.Sprintf("org_flows_shard_%d_replica_%d", shardIndex, replicaIndex)
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
		FilterSubject: fmt.Sprintf("org_flows_shard_%d.admin.>", shardIndex),
	})

	if err != nil {
		log.Errorf("Error creating consumer '%s': %v", consumerName, err)
		return nil, err
	}

	log.Infof("Consumer '%s' created successfully", consumerName)
	return consumer, nil
}

func CreateFlowKeyValueStore(
	orgHash string,
	flowUID string,
	log *logger.Logger,
	js jetstream.JetStream,
) (jetstream.KeyValue, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	kvName := fmt.Sprintf("org_%s-flow_%s", orgHash, flowUID)
	kv, err := js.CreateOrUpdateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket: kvName,
	})

	if err != nil {
		log.Errorf("Error creating KV store '%s': %v", kvName, err)
		return nil, err
	}

	log.Infof("KV store '%s' created successfully", kvName)
	return kv, nil
}

func DeleteFlowKeyValueStore(
	orgHash string,
	flowUID string,
	log *logger.Logger,
	js jetstream.JetStream,
) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	kvName := fmt.Sprintf("org_%s-flow_%s", orgHash, flowUID)
	err := js.DeleteKeyValue(ctx, kvName)

	if err != nil {
		log.Errorf("Error deleting KV store '%s': %v", kvName, err)
		return err
	}

	log.Infof("KV store '%s' deleted successfully", kvName)
	return nil
}
