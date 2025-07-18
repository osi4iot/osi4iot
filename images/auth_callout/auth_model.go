package main

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/jwt/v2"
)

type AuthModel struct {
	db *pgxpool.Pool
}

func NewAuthModel(db *pgxpool.Pool) *AuthModel {
	return &AuthModel{
		db: db,
	}
}

var defaultPermissions = jwt.Permissions{
	Pub: jwt.Permission{
		Deny: []string{">"},
	},
	Sub: jwt.Permission{
		Deny: []string{">"},
	},
}

var topicTypeArray = []string{
	"dev2pdb",
	"dev2pdb_wt",
	"dev2pdb_ma",
	"sim2dtm",
	"dtm2sim",
	"dtm2pdb",
	"dev2dtm",
	"dtm2dev",
	"dev2sim",
	"sim2llm",
	"llm2sim",
	"dtmlog",
	"sim2state",
	"state2sim",
	"inject_1",
	"inject_2",
	"inject_3",
	"inject_4",
	"inject_5",
}

type AuthEntity interface {
	GetPermissions(authModel *AuthModel) jwt.Permissions
	GiveUserName() string
}

func GiveEntityUserName(ae AuthEntity) string {
	return ae.GiveUserName()
}
