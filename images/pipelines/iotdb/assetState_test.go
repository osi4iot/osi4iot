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
		`DROP TABLE IF EXISTS iot_data.asset_state_history`,
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

// The history columns and table, as init_metrics.sql.template creates them
// (without TimescaleDB: a plain table is enough here)
func addAssetStateHistory(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	for _, q := range []string{
		`ALTER TABLE iot_data.assetState
			ADD COLUMN IF NOT EXISTS history_status_changes BOOLEAN NOT NULL DEFAULT false,
			ADD COLUMN IF NOT EXISTS history_snapshot_minutes INTEGER NOT NULL DEFAULT 0,
			ADD COLUMN IF NOT EXISTS history_last_snapshot TIMESTAMPTZ`,
		`CREATE TABLE iot_data.asset_state_history (time TIMESTAMPTZ NOT NULL, group_uid VARCHAR(42) NOT NULL,
			asset_uid VARCHAR(42) NOT NULL, cause VARCHAR(16) NOT NULL, status VARCHAR(64) NOT NULL DEFAULT '',
			previous_status VARCHAR(64) NOT NULL DEFAULT '', writer VARCHAR(190) NOT NULL DEFAULT '', state JSONB)`,
	} {
		if _, err := pool.Exec(context.Background(), q); err != nil {
			t.Fatal(err)
		}
	}
	historyMissingUntil.Store(0)
}

type stateHistoryRow struct{ cause, status, previous, writer string }

func historyOf(t *testing.T, pool *pgxpool.Pool) []stateHistoryRow {
	t.Helper()
	rows, err := pool.Query(context.Background(),
		`SELECT cause, status, previous_status, writer FROM iot_data.asset_state_history ORDER BY time, cause`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []stateHistoryRow
	for rows.Next() {
		var h stateHistoryRow
		if err := rows.Scan(&h.cause, &h.status, &h.previous, &h.writer); err != nil {
			t.Fatal(err)
		}
		out = append(out, h)
	}
	return out
}

func setHistory(t *testing.T, pool *pgxpool.Pool, changes bool, minutes int) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		`UPDATE iot_data.assetState SET history_status_changes = $1, history_snapshot_minutes = $2, history_last_snapshot = NULL
		 WHERE group_uid = 'G' AND asset_uid = 'A'`, changes, minutes); err != nil {
		t.Fatal(err)
	}
}

// Without the history columns (a cluster older than them) the state is
// written as before.
func TestAssetStateWithoutHistoryColumns(t *testing.T) {
	pool := assetStateTestPool(t)
	historyMissingUntil.Store(0)
	ctx := context.Background()
	if err := MergeAssetStateBy(ctx, pool, "G", "A", map[string]any{"status": "OK"}, "", nil, "dt/n"); err != nil {
		t.Fatal(err)
	}
	if stateOf(t, pool)["status"] != "OK" {
		t.Fatal("state not written")
	}
	if historyAvailable() {
		t.Fatal("the missing history should wait a minute before being tried again")
	}
	historyMissingUntil.Store(0)
}

func TestAssetStateHistory(t *testing.T) {
	pool := assetStateTestPool(t)
	addAssetStateHistory(t, pool)
	ctx := context.Background()
	merge := func(status string) {
		t.Helper()
		if err := MergeAssetStateBy(ctx, pool, "G", "A", map[string]any{"status": status}, "", nil, "dt1/alarm1"); err != nil {
			t.Fatal(err)
		}
	}

	// off by default: nothing kept (a row created by the first write)
	merge("OK")
	merge("Warning")
	if h := historyOf(t, pool); len(h) != 0 {
		t.Fatalf("history while off: %v", h)
	}

	// the changes of status, and only them
	setHistory(t, pool, true, 0)
	merge("Warning")
	merge("Alarm")
	if err := UpsertAssetState(ctx, pool, AssetState{GroupUid: "G", AssetUid: "A", State: map[string]any{"status": "OK", "mode": "auto"}, Writer: "dt2/state1"}); err != nil {
		t.Fatal(err)
	}
	if err := UpsertAssetState(ctx, pool, AssetState{GroupUid: "G", AssetUid: "A", State: map[string]any{"status": "OK", "mode": "manual"}, Writer: "dt2/state1"}); err != nil {
		t.Fatal(err)
	}
	want := []stateHistoryRow{{"status_change", "Alarm", "Warning", "dt1/alarm1"}, {"status_change", "OK", "Alarm", "dt2/state1"}}
	if h := historyOf(t, pool); fmt.Sprint(h) != fmt.Sprint(want) {
		t.Fatalf("history of the changes: %v", h)
	}

	// a copy at most every so many minutes, taken when the state is written
	if _, err := pool.Exec(ctx, `DELETE FROM iot_data.asset_state_history`); err != nil {
		t.Fatal(err)
	}
	setHistory(t, pool, false, 15)
	merge("OK")
	merge("Warning")
	merge("Alarm")
	h := historyOf(t, pool)
	if len(h) != 1 || h[0].cause != "snapshot" || h[0].status != "OK" {
		t.Fatalf("one copy expected: %v", h)
	}
	// 15 minutes later: the next write copies again
	if _, err := pool.Exec(ctx, `UPDATE iot_data.assetState SET history_last_snapshot = NOW() - interval '16 minutes'`); err != nil {
		t.Fatal(err)
	}
	merge("OK")
	if h := historyOf(t, pool); len(h) != 2 || h[1].cause != "snapshot" || h[1].status != "OK" {
		t.Fatalf("a second copy expected: %v", h)
	}
}

// Writers at the same time neither lose nor repeat a change of status: each
// change is seen with the status it really came from.
func TestAssetStateHistoryConcurrentWriters(t *testing.T) {
	pool := assetStateTestPool(t)
	addAssetStateHistory(t, pool)
	ctx := context.Background()
	if err := MergeAssetState(ctx, pool, "G", "A", map[string]any{"status": "OK"}, "", nil); err != nil {
		t.Fatal(err)
	}
	setHistory(t, pool, true, 0)
	statuses := []string{"OK", "Warning", "Alarm"}
	var wg sync.WaitGroup
	for w := 0; w < 6; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := 0; i < 30; i++ {
				status := statuses[(w+i)%len(statuses)]
				if err := MergeAssetStateBy(ctx, pool, "G", "A", map[string]any{"status": status}, "", nil, fmt.Sprintf("w%d", w)); err != nil {
					t.Error(err)
					return
				}
			}
		}(w)
	}
	wg.Wait()
	// the chain of changes is unbroken: each one starts where the previous ended, and the last ends in the state
	rows, err := pool.Query(ctx, `SELECT status, previous_status FROM iot_data.asset_state_history ORDER BY time, ctid`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	last := "OK"
	n := 0
	for rows.Next() {
		var status, previous string
		if err := rows.Scan(&status, &previous); err != nil {
			t.Fatal(err)
		}
		if previous != last || status == previous {
			t.Fatalf("change %d: %s -> %s after %s", n, previous, status, last)
		}
		last = status
		n++
	}
	if final := stateOf(t, pool)["status"]; final != last {
		t.Fatalf("the history ends in %s, the state is %v", last, final)
	}
	if n == 0 {
		t.Fatal("no change recorded")
	}
}