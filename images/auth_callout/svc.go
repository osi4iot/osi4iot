package main

import (
	"context"
	"fmt"
	"time"

	"github.com/nats-io/jwt/v2"
)

type Service struct {
	ID          int64     `json:"id"`
	SvcHash     string    `json:"svc_hash"`
	GroupId     int64     `json:"group_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Created     time.Time `json:"created"`
	Updated     time.Time `json:"updated"`
}

func (m *AuthModel) GetServiceByHash(svcHash string) (*Service, error) {
	svc := &Service{}
	queryString := `SELECT id, svc_hash, group_id, name, description, created, updated 
	FROM grafanadb.nats_service 
	WHERE svc_hash = $1`
	err := m.db.QueryRow(context.Background(), queryString, svcHash).
		Scan(&svc.ID,
			&svc.SvcHash,
			&svc.GroupId,
			&svc.Name,
			&svc.Description,
			&svc.Created,
			&svc.Updated,
		)

	if err != nil {
		return nil, err
	}
	return svc, nil
}

func (m *AuthModel) GetServicesByGroupID(groupId int64) ([]*Service, error) {
	svcs := []*Service{}
	queryString := `SELECT id, svc_hash, group_id, name, description, created, updated 
	FROM grafanadb.nats_service 
	WHERE group_id = $1`
	rows, err := m.db.Query(context.Background(), queryString, groupId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		svc := &Service{}
		err := rows.Scan(&svc.ID,
			&svc.SvcHash,
			&svc.GroupId,
			&svc.Name,
			&svc.Description,
			&svc.Created,
			&svc.Updated,
		)
		if err != nil {
			return nil, err
		}
		svcs = append(svcs, svc)
	}
	return svcs, nil
}

func (s *Service) ServicePermissions(authModel *AuthModel) jwt.Permissions {
	groupId := s.GroupId
	group, err := authModel.GetGroupByID(groupId)
	if err != nil || group == nil {
		return defaultPermissions
	}

	svcHash := "svc_" + s.SvcHash
	return jwt.Permissions{
		Pub: jwt.Permission{
			Allow: []string{
				"_INBOX.*.*",
				fmt.Sprintf("%s.*", svcHash),
			},
		},
		Sub: jwt.Permission{
			Allow: []string{
				"$SRV.INFO",
				fmt.Sprintf("$SRV.INFO.%s", svcHash),
				fmt.Sprintf("$SRV.INFO.%s.*", svcHash),
				"$SRV.PING",
				fmt.Sprintf("$SRV.PING.%s", svcHash),
				fmt.Sprintf("$SRV.PING.%s.*", svcHash),
				"$SRV.STATS",
				fmt.Sprintf("$SRV.STATS.%s", svcHash),
				fmt.Sprintf("$SRV.STATS.%s.*", svcHash),
				fmt.Sprintf("%s.*", svcHash),
			},
		},
	}
}
