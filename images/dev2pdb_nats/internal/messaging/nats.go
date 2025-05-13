//internal/messaging/nats.go

package messaging

import (
	"crypto/tls"
	"crypto/x509"
	"dev2pdb/internal/config"
	"fmt"
	"os"
	"strings"

	"github.com/nats-io/nats.go"
)

type natsClient struct {
    conn *nats.Conn
}

func NewNATSClient(cfg *config.Config) (*natsClient, error) {
    opts := []nats.Option{
        nats.Timeout(cfg.NATS.Timeout),
    }
    if cfg.NATS.Username != "" || cfg.NATS.Password != "" {
        opts = append(opts, nats.UserInfo(cfg.NATS.Username, cfg.NATS.Password))
    }

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
		ServerName: cfg.DomainName,
		RootCAs:    rootCAs,
	}

    opts = append(opts, nats.Secure(tlsCfg))

    nc, err := nats.Connect(strings.Join(cfg.NATS.ServersUrl, ","), opts...)
    if err != nil {
        return nil, fmt.Errorf("failed to connect to NATS servers %v: %w", cfg.NATS.ServersUrl, err)
    }
    return &natsClient{conn: nc}, nil
}

func (n *natsClient) Connect() error {
    if n.conn.IsClosed() {
        return fmt.Errorf("nats connection is closed")
    }
    return nil
}

func (n *natsClient) Subscribe(subject string, handler func(string, []byte)) error {
    _, err := n.conn.Subscribe(subject, func(msg *nats.Msg) {
        handler(msg.Subject, msg.Data)
    })
    return err
}

func (n *natsClient) Close() {
    n.conn.Close()
}