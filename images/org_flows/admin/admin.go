package admin

import (
	"org_flows/config"
	"org_flows/logger"

	"github.com/nats-io/nats.go/jetstream"
)

func Listen(cfg *config.Config, log *logger.Logger, cons jetstream.Consumer) {
	cons.Consume(func(msg jetstream.Msg) {
		log.Infof("Received message for %s: %s", msg.Subject(), string(msg.Data()))
		msg.Ack()
	})
	//cc.Stop()
}
