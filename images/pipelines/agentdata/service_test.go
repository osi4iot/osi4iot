package agentdata

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"pipelines/common"
	"pipelines/logger"
)

type fakeSource struct {
	sensorCalls int
}

func (f *fakeSource) GetGroup(id int) *common.Group {
	if id == 7 {
		return &common.Group{Id: 7, GroupUID: "Group_test_7"}
	}
	if id == 8 {
		return &common.Group{Id: 8, GroupUID: "Group_test_8"}
	}
	return nil
}

func (f *fakeSource) GetDigitalTwin(id int) *common.DigitalTwin {
	if id == 70 {
		return &common.DigitalTwin{Id: 70, GroupId: 7, AssetId: 1}
	}
	return nil
}

func (f *fakeSource) GetAssetsByGroupId(id int) []*common.Asset {
	if id != 7 {
		return nil
	}
	return []*common.Asset{
		{Id: 1, GroupId: 7, AssetUid: "a1", Description: "Portal frame", AssetType: "Structure"},
		{Id: 2, GroupId: 7, AssetUid: "a2", Description: "Pump", AssetType: "Pump"},
		{Id: 3, GroupId: 7, AssetUid: "a3", Description: "Pump", AssetType: "Pump"},
	}
}

func (f *fakeSource) SensorsInGroup(ctx context.Context, id int) ([]*common.Sensor, error) {
	f.sensorCalls++
	return []*common.Sensor{
		{GroupId: 7, AssetId: 2, AssetUid: "a2", SensorUid: "s2", SensorRef: "temp", Description: "Pump temperature",
			TopicUid: "t2", Measurements: map[string]any{"temperature": map[string]any{"type": "number", "label": "Temperature", "units": "°C"}}},
		{GroupId: 7, AssetId: 1, AssetUid: "a1", SensorUid: "s1", SensorRef: "load", Description: "Load cell",
			TopicUid: "t1", Measurements: map[string]any{
				"load":          map[string]any{"type": "number", "label": "Load", "units": "N"},
				"accelerations": map[string]any{"type": "array", "label": "Ax, Ay,Az", "units": "m/s^2"},
			}},
		{GroupId: 7, AssetId: 3, AssetUid: "a3", SensorUid: "s3", SensorRef: "load", Description: "Pump load",
			TopicUid: "t3", Measurements: map[string]any{"load": map[string]any{"type": "number", "label": "Load", "units": "N"}}},
		{GroupId: 9, AssetId: 9, AssetUid: "other", SensorUid: "s9", SensorRef: "load", TopicUid: "t9"},
	}, nil
}

func newTestService(t *testing.T, db DB) (*Service, *fakeSource) {
	t.Helper()
	src := &fakeSource{}
	s, err := NewService("127.0.0.1:0", db, src, logger.NewLogger())
	if err != nil {
		t.Fatal(err)
	}
	return s, src
}

func post(t *testing.T, s *Service, path string, body map[string]any) (int, map[string]any) {
	t.Helper()
	data, _ := json.Marshal(body)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/v1/agentdata/"+path, bytes.NewReader(data)))
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func auth(s *Service, extra map[string]any) map[string]any {
	body := map[string]any{"group_id": 7, "digital_twin_id": 70, "token": s.DigitalTwinToken(7, 70)}
	for k, v := range extra {
		body[k] = v
	}
	return body
}

func TestTokens(t *testing.T) {
	s, _ := newTestService(t, nil)
	if code, _ := post(t, s, "sensors", map[string]any{"group_id": 7, "digital_twin_id": 70, "token": "x"}); code != http.StatusForbidden {
		t.Fatalf("bad token: %d", code)
	}
	// A valid token of another group's digital twin does not open this one.
	if code, _ := post(t, s, "sensors", map[string]any{"group_id": 8, "digital_twin_id": 70, "token": s.DigitalTwinToken(8, 70)}); code != http.StatusNotFound {
		t.Fatalf("digital twin of another group: %d", code)
	}
	other, _ := newTestService(t, nil)
	if s.DigitalTwinToken(7, 70) == other.DigitalTwinToken(7, 70) {
		t.Fatal("tokens must change with each process")
	}
}

func TestSensorsListAndCache(t *testing.T) {
	s, src := newTestService(t, nil)
	code, out := post(t, s, "sensors", auth(s, nil))
	if code != http.StatusOK {
		t.Fatalf("sensors: %d %v", code, out)
	}
	sensors := out["sensors"].([]any)
	if dta := out["digital_twin_asset"].(map[string]any); dta["uid"] != "a1" || dta["of_digital_twin"] != true {
		t.Fatalf("digital twin's asset: %v", dta)
	}
	if len(sensors) != 3 { // the sensor of group 9 is left out
		t.Fatalf("sensors: %v", sensors)
	}
	first := sensors[0].(map[string]any)
	if first["uid"] != "s1" || first["of_digital_twin"] != true || first["asset_description"] != "Portal frame" {
		t.Fatalf("the digital twin's asset's sensor goes first: %v", first)
	}
	if n := len(first["fields"].([]any)); n != 4 { // load + 3 accelerations
		t.Fatalf("fields: %d", n)
	}
	post(t, s, "sensors", auth(s, nil))
	if src.sensorCalls != 1 {
		t.Fatalf("admin_api asked %d times within the TTL", src.sensorCalls)
	}
	s.now = func() time.Time { return time.Now().Add(2 * sensorsTTL) }
	post(t, s, "sensors", auth(s, nil))
	if src.sensorCalls != 2 {
		t.Fatalf("not refreshed after the TTL: %d", src.sensorCalls)
	}
}

func TestAssetsAreUnambiguous(t *testing.T) {
	s, _ := newTestService(t, nil)
	c := &call{Request: Request{GroupID: 7, DigitalTwinID: 70}, groupUid: "Group_test_7", dtAssetID: 1}
	assets := s.groupAssets(c)
	if len(assets) != 3 || assets[0].Uid != "a1" || !assets[0].OfDigitalTwin {
		t.Fatalf("assets: %+v", assets)
	}
	if a, err := resolveAsset(assets, "current"); err != nil || a.Uid != "a1" {
		t.Fatalf("current: %+v %v", a, err)
	}
	if a, err := resolveAsset(assets, "a3"); err != nil || a.Uid != "a3" {
		t.Fatalf("by uid: %+v %v", a, err)
	}
	if _, err := resolveAsset(assets, "pump"); err == nil || !strings.Contains(err.Error(), "a2 (Pump), a3 (Pump)") {
		t.Fatalf("a repeated description must ask for the uid: %v", err)
	}
	if a, err := resolveAsset(assets, "portal FRAME"); err != nil || a.Uid != "a1" {
		t.Fatalf("unique description: %+v %v", a, err)
	}

	ctx := context.Background()
	// "load" is on a1 (the digital twin's) and a3: without asset, the digital twin's.
	if sn, err := s.callSensor(ctx, c); err != nil || sn.Uid != "s1" {
		t.Fatalf("no sensor named: the digital twin's only one: %v %v", sn.Uid, err)
	}
	c.Sensor = "load"
	if sn, err := s.callSensor(ctx, c); err != nil || sn.Uid != "s1" {
		t.Fatalf("load, the digital twin's: %v %v", sn.Uid, err)
	}
	c.Asset = "a3"
	if sn, err := s.callSensor(ctx, c); err != nil || sn.Uid != "s3" {
		t.Fatalf("load of a3: %v %v", sn.Uid, err)
	}
	c.Sensor, c.Asset = "", "a2"
	if sn, err := s.callSensor(ctx, c); err != nil || sn.Uid != "s2" {
		t.Fatalf("the only sensor of a2: %v %v", sn.Uid, err)
	}
	c.Asset = "pump"
	if _, err := s.callSensor(ctx, c); err == nil || !strings.Contains(err.Error(), "use the uid") {
		t.Fatalf("ambiguous asset: %v", err)
	}
}

func TestResolveSensorAndField(t *testing.T) {
	src := &fakeSource{}
	raw, _ := src.SensorsInGroup(context.Background(), 7)
	assets := map[int]*common.Asset{1: {Id: 1, Description: "Portal frame"}}
	var sensors []SensorInfo
	for _, r := range raw[:2] {
		sensors = append(sensors, newSensorInfo(r, assets, 1))
	}

	if s, err := resolveSensor(sensors, ""); err != nil || s.Uid != "s1" {
		t.Fatalf("default sensor: %v %v", s.Uid, err)
	}
	if s, err := resolveSensor(sensors, "PUMP TEMPERATURE"); err != nil || s.Uid != "s2" {
		t.Fatalf("by description: %v %v", s.Uid, err)
	}
	if _, err := resolveSensor(sensors, "nope"); err == nil {
		t.Fatal("unknown sensor accepted")
	}

	load, _ := resolveSensor(sensors, "s1")
	if f, err := resolveField(load, "ay"); err != nil || f.Key != "accelerations" || f.Index != 1 || f.Units != "m/s^2" {
		t.Fatalf("by label: %+v %v", f, err)
	}
	if f, err := resolveField(load, "accelerations[2]"); err != nil || f.Label != "Az" {
		t.Fatalf("by name: %+v %v", f, err)
	}
	if _, err := resolveField(load, ""); err == nil || !strings.Contains(err.Error(), "accelerations[0] (Ax)") {
		t.Fatalf("several fields need a name: %v", err)
	}
	pump, _ := resolveSensor(sensors, "s2")
	if f, err := resolveField(pump, ""); err != nil || f.Key != "temperature" {
		t.Fatalf("only field: %+v %v", f, err)
	}
	// Measurements not described: any field name.
	bare := SensorInfo{Ref: "x"}
	if f, err := resolveField(bare, "vib[3]"); err != nil || f.Key != "vib" || f.Index != 3 {
		t.Fatalf("undescribed item: %+v %v", f, err)
	}
	if _, err := resolveField(bare, "a'b"); err == nil {
		t.Fatal("invalid field name accepted")
	}
}

func TestIntervalsAndRanges(t *testing.T) {
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	from, to, err := timeRange("", "", now)
	if err != nil || to != now || from != now.Add(-24*time.Hour) {
		t.Fatalf("default range: %v %v %v", from, to, err)
	}
	if _, _, err := timeRange("now", "now-1h", now); err == nil {
		t.Fatal("from after to accepted")
	}
	if _, _, err := timeRange("yesterday-ish", "", now); err == nil {
		t.Fatal("invalid time accepted")
	}

	d, adj, err := bucketInterval("auto", now.Add(-24*time.Hour), now)
	if err != nil || d != 15*time.Minute || adj {
		t.Fatalf("auto for a day: %v %v %v", d, adj, err)
	}
	d, adj, err = bucketInterval("1m", now.Add(-30*24*time.Hour), now)
	if err != nil || !adj || now.Sub(now.Add(-30*24*time.Hour))/d > MaxBuckets {
		t.Fatalf("1m over a month is enlarged: %v %v %v", d, adj, err)
	}
	if _, _, err := bucketInterval("5 parsecs", now.Add(-time.Hour), now); err == nil {
		t.Fatal("invalid interval accepted")
	}
	if HumanInterval(15*time.Minute) != "15m" || HumanInterval(48*time.Hour) != "2d" || HumanInterval(7*24*time.Hour) != "1w" {
		t.Fatal("HumanInterval")
	}
	if _, err := groupView("x; DROP TABLE y"); err == nil {
		t.Fatal("invalid group uid accepted")
	}
}

// TestQueries runs the SQL on a real PostgreSQL when AGENTDATA_TEST_DSN is
// set (e.g. postgres://postgres@localhost:5432/postgres). Without
// TimescaleDB, time_bucket is created with date_bin.
func TestQueries(t *testing.T) {
	dsn := os.Getenv("AGENTDATA_TEST_DSN")
	if dsn == "" {
		t.Skip("AGENTDATA_TEST_DSN not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	setup := []string{
		`DROP SCHEMA IF EXISTS iot_datasource CASCADE`,
		`DROP SCHEMA IF EXISTS iot_data CASCADE`,
		`CREATE SCHEMA iot_data`,
		`CREATE SCHEMA iot_datasource`,
		`CREATE TABLE iot_data.thingData (timestamp TIMESTAMPTZ NOT NULL, group_uid varchar(42) NOT NULL,
			topic_uid varchar(42) NOT NULL, topic varchar(1024) NOT NULL, payload jsonb NOT NULL, deleted SMALLINT NOT NULL)`,
		`CREATE TABLE iot_data.assetState (group_uid varchar(42) NOT NULL, asset_uid varchar(42) NOT NULL,
			state jsonb NOT NULL, last_updated TIMESTAMPTZ, PRIMARY KEY (group_uid, asset_uid))`,
		// as admin_api creates it (unquoted: the name is folded to lower case)
		`CREATE OR REPLACE VIEW iot_datasource.Table_Group_test_7 AS SELECT timestamp, topic, payload FROM iot_data.thingData WHERE group_uid = 'Group_test_7'`,
	}
	for _, q := range setup {
		if _, err := pool.Exec(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	if _, err := pool.Exec(ctx, `SELECT time_bucket('1 hour'::interval, now())`); err != nil {
		if _, err := pool.Exec(ctx, `CREATE FUNCTION time_bucket(i interval, t timestamptz) RETURNS timestamptz
			LANGUAGE sql IMMUTABLE AS $$ SELECT date_bin(i, t, TIMESTAMPTZ '2000-01-03 00:00:00+00') $$`); err != nil {
			t.Fatal(err)
		}
	}

	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	insert := func(group, topic string, at time.Time, payload string) {
		if _, err := pool.Exec(ctx, `INSERT INTO iot_data.thingData VALUES ($1, $2, $3, $4, $5::jsonb, 0)`,
			at, group, strings.TrimPrefix(topic, "Topic_"), topic, payload); err != nil {
			t.Fatal(err)
		}
	}
	// Load cell: 10 values over the last 10 hours, 1..10 N; the last message has no number.
	for i := 1; i <= 10; i++ {
		insert("Group_test_7", "Topic_t1", now.Add(-time.Duration(11-i)*time.Hour),
			fmt.Sprintf(`{"load": %d, "accelerations": [0.1, %d.5, -1]}`, i, i))
	}
	insert("Group_test_7", "Topic_t1", now.Add(-30*time.Minute), `{"load": "n/a"}`)
	// The same topic in another group, and another topic: never counted.
	insert("Group_test_8", "Topic_t1", now.Add(-2*time.Hour), `{"load": 1000}`)
	insert("Group_test_7", "Topic_t2", now.Add(-2*time.Hour), `{"temperature": 40}`)
	if _, err := pool.Exec(ctx, `INSERT INTO iot_data.assetState VALUES ('Group_test_7', 'a2', '{"status":"Alarm","temp":80}', $1),
		('Group_test_8', 'a1', '{"status":"OK"}', $1)`, now); err != nil {
		t.Fatal(err)
	}

	s, _ := newTestService(t, pool)
	s.now = func() time.Time { return now }

	code, out := post(t, s, "statistics", auth(s, map[string]any{"sensor": "load", "field": "Load", "from": "now-24h"}))
	if code != http.StatusOK {
		t.Fatalf("statistics: %d %v", code, out)
	}
	st := out["statistics"].(map[string]any)
	if st["count"].(float64) != 10 || st["avg"].(float64) != 5.5 ||
		st["min"].(map[string]any)["value"].(float64) != 1 || st["max"].(map[string]any)["value"].(float64) != 10 {
		t.Fatalf("statistics: %v", st)
	}
	if st["last"].(map[string]any)["time"] != now.Add(-time.Hour).Format(time.RFC3339) {
		t.Fatalf("last: %v", st["last"])
	}

	code, out = post(t, s, "history", auth(s, map[string]any{"sensor": "s1", "field": "Ay", "interval": "5h", "from": "now-10h"}))
	if code != http.StatusOK {
		t.Fatalf("history: %d %v", code, out)
	}
	buckets := out["buckets"].([]any)
	var total float64
	for _, b := range buckets {
		total += b.(map[string]any)["count"].(float64)
	}
	if total != 10 || out["interval"] != "5h" {
		t.Fatalf("history buckets: %v", out)
	}

	code, out = post(t, s, "history", auth(s, map[string]any{"field": "load", "interval": "raw", "limit": 3}))
	if code != http.StatusOK {
		t.Fatalf("raw: %d %v", code, out)
	}
	points := out["points"].([]any)
	if len(points) != 3 || out["truncated"] != true ||
		points[0].(map[string]any)["value"].(float64) != 8 || points[2].(map[string]any)["value"].(float64) != 10 {
		t.Fatalf("raw: %v", out)
	}

	code, out = post(t, s, "latest", auth(s, map[string]any{"sensor": "load", "limit": 2}))
	msgs, _ := out["messages"].([]any)
	if code != http.StatusOK || len(msgs) != 2 || msgs[0].(map[string]any)["payload"].(map[string]any)["load"] != "n/a" {
		t.Fatalf("latest: %d %v", code, out)
	}

	code, out = post(t, s, "asset_states", auth(s, nil))
	assets, _ := out["assets"].([]any)
	if code != http.StatusOK || len(assets) != 3 {
		t.Fatalf("asset states: %d %v", code, out)
	}
	own, pump := assets[0].(map[string]any), assets[1].(map[string]any)
	if own["uid"] != "a1" || own["status"] != "Unknown" || pump["status"] != "Alarm" || pump["state"].(map[string]any)["temp"].(float64) != 80 {
		t.Fatalf("asset states (group 8's 'a1' is not this one): %v", assets)
	}
	code, out = post(t, s, "asset_states", auth(s, map[string]any{"asset": "current"}))
	if code != http.StatusOK || len(out["assets"].([]any)) != 1 {
		t.Fatalf("current asset: %d %v", code, out)
	}
}
