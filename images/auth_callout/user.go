package main

import (
	"context"
	"encoding/base64"
	"log/slog"
	"time"

	"github.com/nats-io/jwt/v2"
	"github.com/nats-io/nkeys"
)

type User struct {
	ID             int       `json:"id"`
	Username       string    `json:"login"`
	FirstName      string    `json:"first_name"`
	LastName       string    `json:"surname"`
	Email          string    `json:"email"`
	PasswordHash   string    `json:"password"`
	Salt           string    `json:"salt"`
	NatsNKey       string    `json:"nats_nkey"`
	IsGrafanaAdmin bool      `json:"is_admin"`
	IsDisabled     bool      `json:"is_disabled"`
	CreatedAt      time.Time `json:"created"`
	UpdatedAt      time.Time `json:"updated"`
}

func (u *User) GetPermissions(authModel *AuthModel, group *Group, nri *Nri, svc *Service) jwt.Permissions {
	if u.IsGrafanaAdmin {
		return jwt.Permissions{
			Pub: jwt.Permission{
				Allow: []string{">"},
			},
			Sub: jwt.Permission{
				Allow: []string{">"},
			},
			Resp: &jwt.ResponsePermission{
				MaxMsgs: 1,
			},
		}
	} else if u.Username == "dev2pdb" {
		subjectArrray := []string{}
		dev2pdbTopicTypeArray := []string{"dev2pdb", "dev2pdb_ma", "dev2pdb_wt", "dtm2pdb"}
		for _, topicType := range dev2pdbTopicTypeArray {
			topic := topicType + ".*.*"
			subjectArrray = append(subjectArrray, topic)
		}
		return jwt.Permissions{
			Pub: jwt.Permission{
				Deny : []string{">"},
			},
			Sub: jwt.Permission{
				Allow: subjectArrray,
			},
			Resp: &jwt.ResponsePermission{
				MaxMsgs: 1,
			},
		}
	} else if len(u.Username) >= 6 && u.Username[:6] == "group_" {
		return group.GroupPermissions(authModel)
	} else if len(u.Username) >= 4 && u.Username[:4] == "nri_" {
		return nri.NriPermissions(authModel)
	} else if len(u.Username) >= 4 && u.Username[:4] == "svc_" {
		return svc.ServicePermissions(authModel)
	} else {
		groupsManaged, err := authModel.GetGroupsManagedByUser(u)
		if err != nil {
			slog.Error("Error getting groups managed by user", "error", err)
			return defaultPermissions
		}

		pubSubjetArray := []string{}
		subSubjectArray := []string{}
		denyPub := []string{}
		denySub := []string{}
		respPermission := &jwt.ResponsePermission{
			MaxMsgs: 1,
		}

		for _, g := range groupsManaged {
			groupPermissions := g.GroupPermissions(authModel)
			pubSubjetArray = append(pubSubjetArray, groupPermissions.Pub.Allow...)
			subSubjectArray = append(subSubjectArray, groupPermissions.Sub.Allow...)
			denyPub = append(denyPub, groupPermissions.Pub.Deny...)
			denySub = append(denySub, groupPermissions.Sub.Deny...)
		}

		if len(pubSubjetArray) == 0 {
			denyPub = append(denyPub, ">")
		}

		if len(subSubjectArray) == 0 {
			denySub = append(denySub, ">")
		}

		return jwt.Permissions{
			Pub: jwt.Permission{
				Allow: pubSubjetArray,
				Deny:  denyPub,
			},

			Sub: jwt.Permission{
				Allow: subSubjectArray,
				Deny:  denySub,
			},
			Resp: respPermission,
		}
	}

}

func (u *User) GiveUserName() string {
	return u.Username
}

type SimulatedAuthorizationRequest struct {
	UserNkey  string
	Signature string
	Nonce     string
}

func (m *AuthModel) GetUserByUsernameOrEmail(username string) (*User, error) {
	var user User
	query := `SELECT grafanadb.user.id, grafanadb.user.login, grafanadb.user.first_name, 
	grafanadb.user.surname, grafanadb.user.password, grafanadb.user.salt, 
	grafanadb.user.nats_nkey, grafanadb.user.is_admin, grafanadb.user.is_disabled, 
	grafanadb.user.created, grafanadb.user.updated 
	FROM grafanadb.user WHERE grafanadb.user.login = $1 OR grafanadb.user.email = $1`
	err := m.db.QueryRow(context.Background(), query, username).
		Scan(&user.ID,
			&user.Username,
			&user.FirstName, &user.LastName,
			&user.PasswordHash, &user.Salt,
			&user.NatsNKey, &user.IsGrafanaAdmin,
			&user.IsDisabled, &user.CreatedAt,
			&user.UpdatedAt,
		)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (m *AuthModel) GetUserByNatsNKey(natsNKey string) (*User, error) {
	var user User
	query := `SELECT grafanadb.user.id, grafanadb.user.login, grafanadb.user.first_name, 
	grafanadb.user.surname, grafanadb.user.password, grafanadb.user.salt, 
	grafanadb.user.nats_nkey, grafanadb.user.is_admin, grafanadb.user.is_disabled, 
	grafanadb.user.created, grafanadb.user.updated 
	FROM grafanadb.user WHERE grafanadb.user.nats_nkey = $1`
	err := m.db.QueryRow(context.Background(), query, natsNKey).
		Scan(&user.ID,
			&user.Username,
			&user.FirstName,
			&user.LastName,
			&user.PasswordHash,
			&user.Salt,
			&user.NatsNKey,
			&user.IsGrafanaAdmin,
			&user.IsDisabled,
			&user.CreatedAt,
			&user.UpdatedAt,
		)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// verifyNKeyAuth verifies that the signature sent by the client is valid
// using their public NKey and the nonce that was previously sent to them.
func (m *AuthModel) VerifyNKeyAuth(connOpts jwt.ConnectOptions, sendedNonce string) (bool, error) {
	// Convert the public NKey to the nkeys structure.
	pubKey, err := nkeys.FromPublicKey(connOpts.Nkey)
	if err != nil {
		return false, err
	}
	// Decode the signature from base64.
	sig, err := base64.RawURLEncoding.DecodeString(connOpts.SignedNonce)
	if err != nil {
		return false, err
	}
	nonce := []byte(sendedNonce)
	// Verify the signature over the nonce.
	err = pubKey.Verify(nonce, sig)
	if err != nil {
		return false, err
	}

	return true, nil
}
