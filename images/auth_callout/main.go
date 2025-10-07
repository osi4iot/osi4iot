package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"

	"log/slog"

	"github.com/nats-io/jwt/v2"
	"github.com/nats-io/nats.go/micro"
	"github.com/nats-io/nkeys"
)

func main() {
	if err := run(); err != nil {
		slog.Error("An error occurred", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func run() error {
	// Load the configuration
	config, err := LoadConfig()
	if err != nil {
		return fmt.Errorf("error loading config: %s", err)
	}

	dbpool := DBConnectionPool(config)
	defer dbpool.Close()

	authModel := NewAuthModel(dbpool)

	nc, err := NatsConnection(config)
	if err != nil {
		return fmt.Errorf("error connecting to NATS: %s", err)
	}
	defer nc.Drain()
	slog.Info("Connected to NATS server successfully", slog.String("server", nc.ConnectedServerName()))

	// Parse the issuer account signing key.
	issuerKeyPair, err := nkeys.FromSeed([]byte(config.NatsIssuerSeed))
	if err != nil {
		return fmt.Errorf("error parsing issuer seed: %s", err)
	}

	// Parse the xkey seed if present.
	var curveKeyPair nkeys.KeyPair
	if len(config.NatsXkeySeed) > 0 {
		curveKeyPair, err = nkeys.FromCurveSeed([]byte(config.NatsXkeySeed))
		if err != nil {
			return fmt.Errorf("error parsing xkey seed: %s", err)
		}
	}

	// Helper function to construct an authorization response.
	respondMsg := func(req micro.Request, userName, userNkey, serverId, userJwt, errMsg string) {
		rc := jwt.NewAuthorizationResponseClaims(userNkey)
		rc.Audience = serverId
		rc.Error = errMsg
		rc.Jwt = userJwt

		token, err := rc.Encode(issuerKeyPair)
		if err != nil {
			slog.Error("error encoding response JWT", slog.String("error", err.Error()))
			req.Respond(nil)
			return
		}

		data := []byte(token)

		// Check if encryption is required.
		xkey := req.Headers().Get("Nats-Server-Xkey")
		if len(xkey) > 0 {
			data, err = curveKeyPair.Seal(data, xkey)
			if err != nil {
				slog.Error("error encrypting response JWT", slog.String("error", err.Error()))
				req.Respond(nil)
				return
			}
		}

		if errMsg != "" {
			if userName == "" {
				userName = "unknown"
			}
			slog.Error("Failed authorization for", slog.String("username", userName), slog.String("errorMsg", errMsg))
		} else {
			slog.Info("Successful authorization for", slog.String("username", userName))
		}

		req.Respond(data)
	}

	// Define the message handler for the authorization request.
	msgHandler := func(req micro.Request) {
		var token []byte

		// Check for Xkey header and decrypt
		xkey := req.Headers().Get("Nats-Server-Xkey")
		if len(xkey) > 0 {
			if curveKeyPair == nil {
				respondMsg(req, "", "", "", "", "xkey not supported")
				return
			}

			// Decrypt the message.
			token, err = curveKeyPair.Open(req.Data(), xkey)
			if err != nil {
				slog.Error("error decrypting message", slog.String("error", err.Error()))
				respondMsg(req, "", "", "", "", "error decrypting message")
				return
			}
		} else {
			token = req.Data()
		}

		// Decode the authorization request claims.
		rc, err := jwt.DecodeAuthorizationRequestClaims(string(token))
		if err != nil {
			respondMsg(req, "", "", "", "", err.Error())
			return
		}

		// Used for creating the auth response.
		userNkey := rc.UserNkey
		serverId := rc.Server.ID

		connOpts := rc.ConnectOptions

		var user *User = nil
		var group *Group = nil
		var svc *Service = nil

		userName := connOpts.Username
		password := connOpts.Password
		if userName != "" && password != "" {
			if len(userName) >= 4 && userName[:4] == "jwt_" {
				userName = userName[4:]
				jwtPayload, err := VerifyJWT(password, config.AccessTokenSecret)
				if err != nil || jwtPayload == nil || jwtPayload.Action != "access" {
					respondMsg(req, userName, userNkey, serverId, "", "invalid JWT")
					return
				}
				user, err = authModel.GetUserByUsernameOrEmail(jwtPayload.Email)
				if err != nil || user == nil {
					respondMsg(req, userName, userNkey, serverId, "", "user not found")
					return
				}
				if user.Username != userName {
					respondMsg(req, userName, userNkey, serverId, "", "Username does not match with jwt payload")
					return
				}

			} else {
				if len(userName) >= 6 && userName[:6] == "group_" {
					groupUid := userName[6:]
					group, err = authModel.GetGroupByUID(groupUid)
					if err != nil || group == nil {
						respondMsg(req, userName, userNkey, serverId, "", "group not found")
						return
					}
				} else if len(userName) >= 4 && userName[:4] == "svc_" {
					svciHash := userName[4:]
					svc, err = authModel.GetServiceByHash(svciHash)
					if err != nil || svc == nil {
						respondMsg(req, userName, userNkey, serverId, "", "service not found")
						return
					}
				}
				user, err = authModel.GetUserByUsernameOrEmail(userName)
				if err != nil || user == nil {
					fmt.Println("XXX user not found error=", err)
					respondMsg(req, userName, userNkey, serverId, "", "user not found")
					return
				}

				if !VerifyPassword(password, user.PasswordHash, user.Salt) {
					respondMsg(req, user.Username, userNkey, serverId, "", "invalid credentials")
					return
				}
			}
		} else if rc.ConnectOptions.Nkey != "" {
			user, err = authModel.GetUserByNatsNKey(rc.ConnectOptions.Nkey)
			if err != nil || user == nil {
				respondMsg(req, "", "", "", "", "error getting user by NKey")
				return
			}

			isValidSignature, err := authModel.VerifyNKeyAuth(connOpts, rc.ClientInformation.Nonce)
			if err != nil {
				respondMsg(req, user.Username, userNkey, serverId, "", "error verifying signature")
				return
			}
			if !isValidSignature {
				respondMsg(req, user.Username, userNkey, serverId, "", "invalid signature")
				return
			}

			userName = user.Username
			if len(userName) >= 6 && userName[:6] == "group_" {
				groupUid := userName[6:]
				group, err = authModel.GetGroupByUID(groupUid)
				if err != nil || group == nil {
					fmt.Println("group not found error=", err)
					respondMsg(req, userName, userNkey, serverId, "", "group not found")
					return
				}
			} else if len(userName) >= 4 && userName[:4] == "svc_" {
				svciHash := userName[4:]
				svc, err = authModel.GetServiceByHash(svciHash)
				if err != nil || svc == nil {
					fmt.Println("service not found error=", err)
					respondMsg(req, userName, userNkey, serverId, "", "service not found")
					return
				}
			}
		} else {
			respondMsg(req, "", userNkey, serverId, "", "no credentials provided")
			return
		}

		// Prepare a user JWT.
		uc := jwt.NewUserClaims(rc.UserNkey)
		authEntityUserName := user.GiveUserName()
		uc.Name = authEntityUserName

		// Audience contains the account in non-operator mode.
		uc.Audience = "APP"

		// Set the associated permissions if present.
		uc.Permissions = user.GetPermissions(authModel, group, svc)

		// Validate the claims.
		vr := jwt.CreateValidationResults()
		uc.Validate(vr)
		if len(vr.Errors()) > 0 {
			respondMsg(req, authEntityUserName, userNkey, serverId, "", "error validating claims")
			return
		}

		// Sign it with the issuer key since this is non-operator mode.
		ejwt, err := uc.Encode(issuerKeyPair)
		if err != nil {
			respondMsg(req, authEntityUserName, userNkey, serverId, "", "error signing user JWT")
			return
		}

		respondMsg(req, authEntityUserName, userNkey, serverId, ejwt, "")
	}

	// Create a service for auth callout with an endpoint binding to
	// the required subject. This allows for running multiple instances
	// to distribute the load, observe stats, and provide high availability.
	srv, err := micro.AddService(nc, micro.Config{
		Name:        "auth-callout",
		Version:     "0.0.1",
		Description: "Auth callout service.",
	})
	if err != nil {
		return err
	}

	g := srv.
		AddGroup("$SYS").
		AddGroup("REQ").
		AddGroup("USER")

	err = g.AddEndpoint("AUTH", micro.HandlerFunc(msgHandler))
	if err != nil {
		return err
	}

	slog.Info("auth callout service is running")

	go HealthCheck()

	// Block and wait for interrupt.
	sigch := make(chan os.Signal, 1)
	signal.Notify(sigch, os.Interrupt)
	<-sigch

	return nil
}

func HealthCheck() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(rw http.ResponseWriter, r *http.Request) { io.WriteString(rw, "Healthy") })
	err := http.ListenAndServe(fmt.Sprintf(":%s", "3300"), mux)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error listenging on port 3300: %v", err)
		os.Exit(1)
	}
}
