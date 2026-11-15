package main

import (
	"context"
	"time"
)

type Org struct {
	ID                int64     `json:"id"`
	Version           int       `json:"version"`
	Name              string    `json:"name"`
	Address1          string    `json:"address1"`
	Address2          string    `json:"address2"`
	City              string    `json:"city"`
	State             string    `json:"state"`
	ZipCode           string    `json:"zip_code"`
	Country           string    `json:"country"`
	BillingEmail      string    `json:"billing_email"`
	Acronym           string    `json:"acronym"`
	Role              string    `json:"role"`
	BuildingID        int64     `json:"building_id"`
	OrgHash           string    `json:"org_hash"`
	MQTTAccessControl string    `json:"mqtt_access_control"`
	Created           time.Time `json:"created"`
	Updated           time.Time `json:"updated"`
}

func (m *AuthModel) GetOrgsManagedByUserId(userId int) ([]Org, error) {
	var orgs []Org
	// city and country are those of the organization's building (as admin_api reads them); without them the
	// query returned 7 columns for the 9 destinations of the Scan, and every organization administrator got no
	// permissions ("number of field descriptions must equal number of destinations, got 7 and 9")
	queryString := `SELECT grafanadb.org.id, COALESCE(grafanadb.org.name, ''),
	COALESCE(grafanadb.org.acronym, ''), COALESCE(grafanadb.org.role, ''),
	COALESCE(grafanadb.building.city, '') AS city,
	COALESCE(grafanadb.building.country, '') AS country,
	COALESCE(grafanadb.org.building_id, 0) AS "buildingId", COALESCE(grafanadb.org.org_hash, '') AS "orgHash",
	COALESCE(grafanadb.org.mqtt_access_control, 'None') AS "mqttAccessControl"
	FROM grafanadb.org
	INNER JOIN grafanadb.org_user ON grafanadb.org.id = grafanadb.org_user.org_id
	LEFT JOIN grafanadb.building ON grafanadb.building.id = grafanadb.org.building_id
	WHERE grafanadb.org_user.user_id = $1 AND grafanadb.org_user.role = $2
	ORDER BY grafanadb.org.id ASC`
	rows, err := m.db.Query(context.Background(), queryString, userId, "Admin")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var org Org
		err := rows.Scan(&org.ID,
			&org.Name,
			&org.Acronym,
			&org.Role,
			&org.City,
			&org.Country,
			&org.BuildingID,
			&org.OrgHash,
			&org.MQTTAccessControl,
		)
		if err != nil {
			return nil, err
		}
		orgs = append(orgs, org)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return orgs, nil
}
