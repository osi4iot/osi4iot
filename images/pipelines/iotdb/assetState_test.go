package iotdb

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// The asset state functions on a real PostgreSQL, when IOTDB_TEST_DSN is set
// (e.g. postgres://postgres@localhost:5432/postgres).
func assetStateTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("IOTDB_TEST_DSN")
	if dsn == "" {
		t.Skip("IOTDB_TEST_DSN not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	for _, q := range []string{
		`CREATE SCHEMA IF NOT EXISTS iot_data`,
		`DROP TABLE IF EXISTS iot_data.assetState`,
		`CREATE TABLE iot_data.assetState (group_uid varchar(42) NOT NULL, asset_uid varchar(42) NOT NULL,
			state jsonb NOT NULL, last_updated TIMESTAMPTZ, CONSTRAINT assetstate_pkey PRIMARY KEY (group_uid, asset_uid))`,
	} {
		if _, err := pool.Exec(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	return pool
}

func stateOf(t *testing.T, pool *pgxpool.Pool) map[string]any {
	t.Helper()
	s, err := GetStateFromAssetState(context.Background(), pool, "G", "A")
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestAssetStateMergeAndSections(t *testing.T) {
	pool := assetStateTestPool(t)
	ctx := context.Background()

	// the first write creates the row
	if err := MergeAssetState(ctx, pool, "G", "A", map[string]any{"status": "Warning", "state_description": "Temp"}, AssetStateAlarms,
		map[string]any{"N1|": map[string]any{"name": "Temp", "level": "Warning", "digitalTwinUid": "DT1"}}); err != nil {
		t.Fatal(err)
	}
	// a machine of another node, a custom field set by hand
	if err := MergeAssetState(ctx, pool, "G", "A", nil, AssetStateMachines,
		map[string]any{"M1|": map[string]any{"state": "Running", "digitalTwinUid": "DT1"}}); err != nil {
		t.Fatal(err)
	}
	if err := MergeAssetState(ctx, pool, "G", "A", map[string]any{"operator": "ana"}, "", nil); err != nil {
		t.Fatal(err)
	}
	s := stateOf(t, pool)
	if s["status"] != "Warning" || s["operator"] != "ana" || s["machines"].(map[string]any)["M1|"] == nil || s["alarms"].(map[string]any)["N1|"] == nil {
		t.Fatalf("merged state: %v", s)
	}

	// the AssetState node replaces the state but not the projected sections
	if err := UpsertAssetState(ctx, pool, AssetState{GroupUid: "G", AssetUid: "A", State: map[string]any{"status": "OK"}}); err != nil {
		t.Fatal(err)
	}
	s = stateOf(t, pool)
	if s["status"] != "OK" || s["operator"] != nil || s["alarms"] == nil || s["machines"] == nil {
		t.Fatalf("after the AssetState node: %v", s)
	}

	// null removes an entry
	if err := MergeAssetState(ctx, pool, "G", "A", nil, AssetStateAlarms, map[string]any{"N1|": nil}); err != nil {
		t.Fatal(err)
	}
	if a := stateOf(t, pool)["alarms"].(map[string]any); len(a) != 0 {
		t.Fatalf("alarms after removing: %v", a)
	}
}

func TestAssetStateRemoveEntries(t *testing.T) {
	pool := assetStateTestPool(t)
	ctx := context.Background()
	entries := map[string]any{
		"N1|":    map[string]any{"digitalTwinUid": "DT1"},
		"N2|S1":  map[string]any{"digitalTwinUid": "DT1"},
		"N2|S2":  map[string]any{"digitalTwinUid": "DT1"},
		"OTHER|": map[string]any{"digitalTwinUid": "DT2"}, // another digital twin of the asset
	}
	if err := MergeAssetState(ctx, pool, "G", "A", map[string]any{"status": "Alarm"}, AssetStateAlarms, entries); err != nil {
		t.Fatal(err)
	}
	keys := func() []string {
		var out []string
		for k := range stateOf(t, pool)["alarms"].(map[string]any) {
			out = append(out, k)
		}
		return out
	}
	// one key of a node
	s2 := "S2"
	if n, err := RemoveAssetStateEntries(ctx, pool, "G", "A", AssetStateAlarms, "DT1", nil, "N2", &s2); err != nil || n != 1 {
		t.Fatalf("one key: %d %v", n, err)
	}
	// the nodes of DT1 that are gone (N1); DT2's entry stays
	if n, err := RemoveAssetStateEntries(ctx, pool, "G", "A", AssetStateAlarms, "DT1", []string{"N2"}, "", nil); err != nil || n != 1 {
		t.Fatalf("prune: %d %v (%v)", n, err, keys())
	}
	if k := keys(); len(k) != 2 {
		t.Fatalf("left: %v", k)
	}
	// all the keys of a node
	if n, err := RemoveAssetStateEntries(ctx, pool, "G", "A", AssetStateAlarms, "DT1", nil, "N2", nil); err != nil || n != 1 {
		t.Fatalf("node: %d %v", n, err)
	}
	if k := keys(); len(k) != 1 || k[0] != "OTHER|" {
		t.Fatalf("left: %v", k)
	}
	if stateOf(t, pool)["status"] != "Alarm" {
		t.Fatal("the other fields are kept")
	}
	// nothing to remove, no row
	if n, err := RemoveAssetStateEntries(ctx, pool, "G", "NONE", AssetStateAlarms, "DT1", nil, "", nil); err != nil || n != 0 {
		t.Fatalf("no row: %d %v", n, err)
	}
}

// Many writers at once on the same asset (Alarm and Machine state nodes,
// several replicas): no change is lost.
func TestAssetStateConcurrentMerges(t *testing.T) {
	pool := assetStateTestPool(t)
	ctx := context.Background()
	const writers, each = 8, 25
	var wg sync.WaitGroup
	errs := make(chan error, writers*each)
	for w := 0; w < writers; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := 0; i < each; i++ {
				section := AssetStateAlarms
				if w%2 == 1 {
					section = AssetStateMachines
				}
				key := fmt.Sprintf("N%d|%d", w, i)
				if err := MergeAssetState(ctx, pool, "G", "A", map[string]any{fmt.Sprintf("w%d", w): i}, section,
					map[string]any{key: map[string]any{"digitalTwinUid": "DT"}}); err != nil {
					errs <- err
				}
			}
		}(w)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	s := stateOf(t, pool)
	if a, m := len(s["alarms"].(map[string]any)), len(s["machines"].(map[string]any)); a != writers/2*each || m != writers/2*each {
		t.Fatalf("entries: alarms %d machines %d, want %d each", a, m, writers/2*each)
	}
	for w := 0; w < writers; w++ {
		if s[fmt.Sprintf("w%d", w)] != float64(each-1) {
			t.Fatalf("field w%d = %v", w, s[fmt.Sprintf("w%d", w)])
		}
	}
}
