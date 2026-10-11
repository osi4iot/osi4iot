package iotdb

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AssetState represents a row in the iot_data.assetState table
type AssetState struct {
	GroupUid    string         `json:"group_uid"`
	AssetUid    string         `json:"asset_uid"`
	State       map[string]any `json:"state"`
	LastUpdated *time.Time     `json:"last_updated,omitempty"`
}

// UpsertAssetState inserts or updates an asset state in the database.
func UpsertAssetState(ctx context.Context, pool *pgxpool.Pool, as AssetState) error {
	query := `
		INSERT INTO iot_data.assetState (group_uid, asset_uid, state, last_updated)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (group_uid, asset_uid)
		DO UPDATE SET
			state        = EXCLUDED.state,
			last_updated = NOW()
	`

	stateJSON, err := json.Marshal(as.State)
	if err != nil {
		return fmt.Errorf("marshal state: %w", err)
	}

	_, err = pool.Exec(ctx, query, as.GroupUid, as.AssetUid, stateJSON)
	if err != nil {
		return fmt.Errorf("UpsertAssetState: %w", err)
	}

	return nil
}

// GetStateFromAssetState retrieves the state of a specific asset.
func GetStateFromAssetState(ctx context.Context, pool *pgxpool.Pool, groupUid, assetUid string) (map[string]any, error) {
	query := `
		SELECT group_uid, asset_uid, state, last_updated
		FROM iot_data.assetState
		WHERE group_uid = $1 AND asset_uid = $2
	`

	row := pool.QueryRow(ctx, query, groupUid, assetUid)

	var as AssetState
	err := row.Scan(&as.GroupUid, &as.AssetUid, &as.State, &as.LastUpdated)
	if err != nil {
		return nil, fmt.Errorf("GetStateFromAssetState: %w", err)
	}

	return as.State, nil
}

// GetAssetStatesByGroup retrieves all asset states for a given group.
func GetAssetStatesByGroup(ctx context.Context, pool *pgxpool.Pool, groupUid string) (map[string]map[string]any, error) {
	query := `
		SELECT group_uid, asset_uid, state, last_updated
		FROM iot_data.assetState
		WHERE group_uid = $1
		ORDER BY asset_uid
	`

	rows, err := pool.Query(ctx, query, groupUid)
	if err != nil {
		return nil, fmt.Errorf("GetAssetStatesByGroup query: %w", err)
	}
	defer rows.Close()

	var results []AssetState
	for rows.Next() {
		var as AssetState
		if err := rows.Scan(&as.GroupUid, &as.AssetUid, &as.State, &as.LastUpdated); err != nil {
			return nil, fmt.Errorf("GetAssetStatesByGroup scan: %w", err)
		}
		results = append(results, as)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("GetAssetStatesByGroup rows: %w", err)
	}

	assetStates := make(map[string]map[string]any)
	for _, as := range results {
		assetStates[as.AssetUid] = as.State
	}

	return assetStates, nil
}
