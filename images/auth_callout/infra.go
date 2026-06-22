package main

import (
	"encoding/base64"
	"log/slog"

	"github.com/nats-io/jwt/v2"
	"github.com/nats-io/nkeys"
)

type InfraService struct {
	Name        string
	NKeyPublic  string
	Permissions jwt.Permissions
}

func buildInfraServices(config *Config) []InfraService {
	return []InfraService{
		{
			Name:       "vector",
			NKeyPublic: config.VectorNKeyPublic,
			Permissions: jwt.Permissions{
				Pub: jwt.Permission{
					Allow: []string{"system.observability.>"},
				},
				Sub: jwt.Permission{
					Deny: []string{">"},
				},
			},
		},
		{
			Name:       "admin_api",
			NKeyPublic: config.AdminApiNKeyPublic,
			Permissions: jwt.Permissions{
				Pub: jwt.Permission{
					Allow: []string{">"},
				},
				Sub: jwt.Permission{
					Allow: []string{">"},
				},
				Resp: &jwt.ResponsePermission{MaxMsgs: 1},
			},
		},
		{
			Name:       "pipelines",
			NKeyPublic: config.PipelinesNKeyPublic,
			Permissions: jwt.Permissions{
				Pub: jwt.Permission{
					Allow: []string{">"},
				},
				Sub: jwt.Permission{
					Allow: []string{">"},
				},
				Resp: &jwt.ResponsePermission{MaxMsgs: 1},
			},
		},
		{
			// deploy_cli identifies the osi4iot deployment CLI. Unlike
			// admin_api/pipelines, it doesn't need general pub/sub access to
			// application subjects — it only manages JetStream (creating,
			// deleting, snapshotting and restoring streams during a NATS
			// scale-up/down), so its permissions are scoped to the JetStream
			// subject space and its own inbox.
			//
			// Note it must allow the WHOLE "$JS.>" space, not just "$JS.API.>":
			// stream backup/restore use additional subjects outside the API
			// tree. A snapshot pushes data to the client and the client must
			// publish flow-control ACKs to "$JS.SNAPSHOT.ACK.>"; a restore
			// pushes chunks back on a server-assigned "$JS.SNAPSHOT.>" subject.
			// Granting only "$JS.API.>" lets the snapshot/restore request
			// through but then fails with "Permissions Violation for Publish
			// to $JS.SNAPSHOT.ACK..." mid-transfer.
			Name:       "deploy_cli",
			NKeyPublic: config.DeployCliNKeyPublic,
			Permissions: jwt.Permissions{
				Pub: jwt.Permission{
					Allow: []string{"$JS.>", "_INBOX.>"},
				},
				Sub: jwt.Permission{
					Allow: []string{"$JS.>", "_INBOX.>"},
				},
				Resp: &jwt.ResponsePermission{MaxMsgs: 1},
			},
		},
	}
}

func findInfraServiceByNKey(
	connOpts jwt.ConnectOptions,
	nonce string,
	infraServices []InfraService,
) *InfraService {
	if connOpts.Nkey == "" {
		return nil
	}

	for i, svc := range infraServices {
		if svc.NKeyPublic != connOpts.Nkey {
			continue
		}

		pubKey, err := nkeys.FromPublicKey(connOpts.Nkey)
		if err != nil {
			slog.Error("findInfraServiceByNKey: invalid public key",
				slog.String("service", svc.Name),
				slog.String("error", err.Error()))
			return nil
		}

		// The NATS server re-encodes the signature as standard base64
		// when embedding it in the auth callout JWT, so try both encodings.
		sig, err := base64.StdEncoding.DecodeString(connOpts.SignedNonce)
		if err != nil {
			sig, err = base64.RawURLEncoding.DecodeString(connOpts.SignedNonce)
			if err != nil {
				slog.Error("findInfraServiceByNKey: bad signed nonce",
					slog.String("service", svc.Name),
					slog.String("error", err.Error()))
				return nil
			}
		}

		if err := pubKey.Verify([]byte(nonce), sig); err != nil {
			slog.Error("findInfraServiceByNKey: signature verification failed",
				slog.String("service", svc.Name),
				slog.String("error", err.Error()))
			return nil
		}

		return &infraServices[i]
	}

	slog.Warn("findInfraServiceByNKey: no matching infra service found",
		slog.String("connNkey", connOpts.Nkey))
	return nil
}