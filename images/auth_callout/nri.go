package main

import (
	"context"
	"time"

	"github.com/nats-io/jwt/v2"
)

type Nri struct {
	ID        int64   `json:"id"`
	NriHash   string  `json:"nri_hash"`
	OrgId     int64   `json:"org_id"`
	GroupId   int64   `json:"group_id"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	IconRadio float64 `json:"icon_radio"`
	Deleted   bool    `json:"deleted"`
	Created   time.Time  `json:"created"`
	Updated   time.Time  `json:"updated"`
}

func (m *AuthModel) GetNriByHash(nriHash string) (*Nri, error) {
	nri := &Nri{}
	queryString := `SELECT id, nri_hash, org_id, group_id, 
	geolocation[0] AS longitude, geolocation[1] AS latitude,
	icon_radio, deleted, created, updated 
	FROM grafanadb.nodered_instance 
	WHERE nri_hash = $1 AND deleted = $2`
	err := m.db.QueryRow(context.Background(), queryString, nriHash, false).
		Scan(&nri.ID,
			&nri.NriHash,
			&nri.OrgId,
			&nri.GroupId,
			&nri.Longitude,
			&nri.Latitude,
			&nri.IconRadio,
			&nri.Deleted,
			&nri.Created,
			&nri.Updated,
		)

	if err != nil {
		return nil, err
	}
	return nri, nil
}

func (n *Nri) NriPermissions(authModel *AuthModel) jwt.Permissions {
	groupId := n.GroupId
	group, err := authModel.GetGroupByID(groupId)
	if err != nil || group == nil {
		return defaultPermissions
	}

	nriPermissions:= group.GroupPermissions(authModel)

	testTopic := "test." + "nri_" + n.NriHash
	nriPermissions.Pub.Allow = append(nriPermissions.Pub.Allow, testTopic)
	nriPermissions.Sub.Allow = append(nriPermissions.Sub.Allow, testTopic)

	return nriPermissions
}
