package iotdb

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AssetState represents a row in the iot_data.assetState table
type AssetState struct {
	GroupUid    string         `json:"group_uid"`
	AssetUid    string         `json:"asset_uid"`
	State       map[string]any `json:"state"`
	LastUpdated *time.Time     `json:"last_updated,omitempty"`
}

// The sections of an asset state that nodes project into it (alarms of the
// Alarm nodes, states of the Machine state nodes): objects of entries keyed
// "<node uid>|<partition key>", each with the "digitalTwinUid" that wrote it.
// Setting the whole state (AssetState node) keeps them.
const (
	AssetStateAlarms   = "alarms"
	AssetStateMachines = "machines"
)

var projectedSections = []string{AssetStateAlarms, AssetStateMachines}

// UpsertAssetState inserts or updates an asset state in the database: the
// state replaces the stored one, except the sections that nodes project
// into it (alarms, machines), which are kept.
func UpsertAssetState(ctx context.Context, pool *pgxpool.Pool, as AssetState) error {
	query := `
		INSERT INTO iot_data.assetState AS a (group_uid, asset_uid, state, last_updated)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (group_uid, asset_uid)
		DO UPDATE SET
			state        = EXCLUDED.state || jsonb_strip_nulls(jsonb_build_object(
				'alarms', a.state->'alarms', 'machines', a.state->'machines')),
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

// GetStateFromAssetState retrieves the state of a specific asset: an
// empty state (not an error) when none has been stored for it yet.
func GetStateFromAssetState(ctx context.Context, pool *pgxpool.Pool, groupUid, assetUid string) (map[string]any, error) {
	query := `
		SELECT group_uid, asset_uid, state, last_updated
		FROM iot_data.assetState
		WHERE group_uid = $1 AND asset_uid = $2
	`

	row := pool.QueryRow(ctx, query, groupUid, assetUid)

	var as AssetState
	err := row.Scan(&as.GroupUid, &as.AssetUid, &as.State, &as.LastUpdated)
	if errors.Is(err, pgx.ErrNoRows) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("GetStateFromAssetState: %w", err)
	}
	if as.State == nil {
		as.State = map[string]any{}
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

// mergedState is the SQL of a state merged with $3 (top-level fields) and,
// when $4 is not empty, with $5 into the section $4 (an entry null removes
// it), in one expression: evaluated on the row locked by the upsert, so two
// writers never lose each other's changes.
func mergedState(base string) string {
	return fmt.Sprintf(`(%[1]s || $3::jsonb) || CASE WHEN $4::text = '' THEN '{}'::jsonb ELSE jsonb_build_object($4::text,
		(SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
		 FROM jsonb_each(CASE WHEN jsonb_typeof(%[1]s->$4::text) = 'object' THEN %[1]s->$4::text ELSE '{}'::jsonb END || $5::jsonb) AS e
		 WHERE e.value <> 'null'::jsonb)) END`, base)
}

// MergeAssetState merges into an asset's state, atomically: fields at the
// top level (e.g. status and state_description), and entries into a
// section (alarms, machines; "" none; an entry nil removes it). The other
// fields and entries are kept.
func MergeAssetState(ctx context.Context, pool *pgxpool.Pool, groupUid, assetUid string, fields map[string]any, section string, entries map[string]any) error {
	if fields == nil {
		fields = map[string]any{}
	}
	if entries == nil {
		entries = map[string]any{}
	}
	fieldsJSON, err := json.Marshal(fields)
	if err != nil {
		return fmt.Errorf("marshal fields: %w", err)
	}
	entriesJSON, err := json.Marshal(entries)
	if err != nil {
		return fmt.Errorf("marshal entries: %w", err)
	}
	query := `
		INSERT INTO iot_data.assetState AS a (group_uid, asset_uid, state, last_updated)
		VALUES ($1, $2, ` + mergedState("'{}'::jsonb") + `, NOW())
		ON CONFLICT (group_uid, asset_uid)
		DO UPDATE SET
			state        = ` + mergedState("a.state") + `,
			last_updated = NOW()
	`
	if _, err := pool.Exec(ctx, query, groupUid, assetUid, string(fieldsJSON), section, string(entriesJSON)); err != nil {
		return fmt.Errorf("MergeAssetState: %w", err)
	}
	return nil
}

// RemoveAssetStateEntries removes from a section the entries of a digital
// twin whose node is not in keepNodes (their keys begin with "<node uid>|"),
// or, with onlyNode set, the entries of that node (all its partition keys,
// or only onlyKey's when it is not nil). Says how many it removed.
func RemoveAssetStateEntries(ctx context.Context, pool *pgxpool.Pool, groupUid, assetUid, section, digitalTwinUid string, keepNodes []string, onlyNode string, onlyKey *string) (int, error) {
	if keepNodes == nil {
		keepNodes = []string{}
	}
	key := ""
	if onlyKey != nil {
		key = *onlyKey
	}
	query := `
		WITH old AS (
			SELECT state->$3::text AS section
			FROM iot_data.assetState
			WHERE group_uid = $1 AND asset_uid = $2 AND jsonb_typeof(state->$3::text) = 'object'
			FOR UPDATE
		), kept AS (
			SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) AS section,
			       (SELECT count(*) FROM old, jsonb_each(old.section)) - count(e.key) AS removed
			FROM old, jsonb_each(old.section) AS e
			WHERE NOT (
				e.value->>'digitalTwinUid' = $4
				AND CASE WHEN $6::text = '' THEN NOT (split_part(e.key, '|', 1) = ANY($5::text[]))
				         WHEN $7::boolean THEN e.key = $6::text || '|' || $8::text
				         ELSE split_part(e.key, '|', 1) = $6::text END
			)
		)
		UPDATE iot_data.assetState AS a
		SET state = jsonb_set(a.state, ARRAY[$3::text], COALESCE((SELECT section FROM kept), '{}'::jsonb)),
		    last_updated = NOW()
		FROM kept
		WHERE a.group_uid = $1 AND a.asset_uid = $2 AND kept.removed > 0
		RETURNING kept.removed
	`
	var removed int64
	err := pool.QueryRow(ctx, query, groupUid, assetUid, section, digitalTwinUid, keepNodes, onlyNode, onlyKey != nil, key).Scan(&removed)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("RemoveAssetStateEntries: %w", err)
	}
	return int(removed), nil
}

// ProjectedSections are the sections of an asset state written by nodes.
func ProjectedSections() []string {
	return append([]string(nil), projectedSections...)
}
