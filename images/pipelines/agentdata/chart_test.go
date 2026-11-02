package agentdata

import (
	"bytes"
	"context"
	"fmt"
	"image/png"
	"math"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"gonum.org/v1/plot/plotter"

	"pipelines/common"
)

func TestChartInterval(t *testing.T) {
	now := time.Date(2026, 10, 31, 9, 0, 0, 0, time.UTC)
	for _, c := range []struct {
		span time.Duration
		want time.Duration
	}{
		{30 * time.Second, 100 * time.Millisecond},
		{5 * time.Minute, time.Second},
		{30 * time.Minute, 10 * time.Second},
		{24 * time.Hour, 5 * time.Minute},
		{30 * 24 * time.Hour, 3 * time.Hour},
	} {
		got, _, err := chartInterval("auto", now.Add(-c.span), now)
		if err != nil || got != c.want {
			t.Errorf("%s: %s %v, want %s", c.span, got, err, c.want)
		}
	}
	if d, adjusted, err := chartInterval("1s", now.Add(-24*time.Hour), now); err != nil || !adjusted || d < time.Minute {
		t.Errorf("an explicit interval is enlarged like sensor-history's: %s %v %v", d, adjusted, err)
	}
}

func TestSegmentsSplitAtGaps(t *testing.T) {
	t0 := time.Date(2026, 10, 31, 9, 0, 0, 0, time.UTC)
	var bs []Bucket
	for _, s := range []int{0, 1, 2, 10, 11} {
		bs = append(bs, Bucket{Time: t0.Add(time.Duration(s) * time.Second)})
	}
	segs := segments(bs, time.Second)
	if len(segs) != 2 || len(segs[0]) != 3 || len(segs[1]) != 2 {
		t.Fatalf("segments: %v", segs)
	}
}

func TestTimeTicks(t *testing.T) {
	madrid, _ := time.LoadLocation("Europe/Madrid")
	from := time.Date(2026, 10, 31, 8, 4, 17, 0, time.UTC)
	ticks := timeTicker{loc: madrid}.Ticks(float64(from.Unix()), float64(from.Add(30*time.Second).Unix()))
	if len(ticks) < 3 || len(ticks) > 4*maxTimeTicks {
		t.Fatalf("ticks: %v", ticks)
	}
	if ticks[0].Label != "09:04:20" { // local time, on a round 5 s
		t.Fatalf("first tick %q", ticks[0].Label)
	}
	// A day in hours, on round hours of the zone.
	day := timeTicker{loc: madrid}.Ticks(float64(from.Unix()), float64(from.Add(24*time.Hour).Unix()))
	if !strings.HasSuffix(day[0].Label, ":00") {
		t.Fatalf("day ticks: %v", day)
	}
}

func TestChartStore(t *testing.T) {
	var cs chartStore
	now := time.Now()
	id, err := cs.put(now, 70, common.ChatChart{Title: "x", Data: []byte{1}})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := cs.take(now, 71, id); ok {
		t.Fatal("another digital twin took the chart")
	}
	if c, ok := cs.take(now, 70, id); !ok || c.Title != "x" {
		t.Fatal("chart not taken")
	}
	if _, ok := cs.take(now, 70, id); ok {
		t.Fatal("a chart is given once")
	}
	old, _ := cs.put(now, 70, common.ChatChart{})
	if _, ok := cs.take(now.Add(chartTTL+time.Second), 70, old); ok {
		t.Fatal("expired chart given")
	}
	for i := 0; i < maxStoredCharts+10; i++ {
		_, _ = cs.put(now, 70, common.ChatChart{})
	}
	if len(cs.items) > maxStoredCharts {
		t.Fatalf("%d charts kept", len(cs.items))
	}
}

type plotterXY [2]float64

type plotterXYs []plotterXY

func (p plotterXYs) xys() plotter.XYs {
	out := make(plotter.XYs, len(p))
	for i, v := range p {
		out[i] = plotter.XY{X: v[0], Y: v[1]}
	}
	return out
}

func sineBuckets(t0 time.Time, n int, step time.Duration, amp float64, gapAt int) []Bucket {
	var bs []Bucket
	for i := 0; i < n; i++ {
		if gapAt > 0 && i >= gapAt && i < gapAt+20 {
			continue
		}
		v := amp * math.Sin(2*math.Pi*float64(i)/40)
		bs = append(bs, Bucket{Time: t0.Add(time.Duration(i) * step), Avg: v, Min: v - 0.2, Max: v + 0.2, Count: 2})
	}
	return bs
}

func TestRenderTimeChart(t *testing.T) {
	madrid, _ := time.LoadLocation("Europe/Madrid")
	from := time.Date(2026, 10, 31, 8, 0, 0, 0, time.UTC)
	to := from.Add(5 * time.Minute)
	unit := "m/s^2"
	series := []ChartSeries{
		newChartSeries(Field{Name: "accelerations[0]", Label: "Ax", Units: unit}, sineBuckets(from, 300, time.Second, 0.05, 0)),
		newChartSeries(Field{Name: "accelerations[2]", Label: "Az", Units: unit}, sineBuckets(from, 300, time.Second, 4.5, 120)),
	}
	if s := series[1]; s.Count != 2*280 || s.Max == nil || *s.Max < 4.6 {
		t.Fatalf("summary: %+v", s)
	}
	data, err := renderTimeChart(timeChart{title: "Aceleraciones – últimos 5 minutos", series: series, from: from, to: to,
		loc: madrid, interval: time.Second, thresholds: []Threshold{{Value: 4, Label: "Aviso 4 m/s²"}, {Value: -4.4}}})
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if b := img.Bounds(); b.Dx() != 1200 || b.Dy() != 600 {
		t.Fatalf("size %v", b)
	}
	if len(data) > 300<<10 {
		t.Fatalf("PNG of %d KB", len(data)>>10)
	}
	saveChartFile("render_time", data)
}

func TestRegression(t *testing.T) {
	reg, ok := regression(plotterXYs{{0, 1}, {1, 3}, {2, 5}, {3, 7}}.xys())
	if !ok || math.Abs(reg.Slope-2) > 1e-12 || math.Abs(reg.Intercept-1) > 1e-12 || math.Abs(reg.R2-1) > 1e-12 {
		t.Fatalf("regression: %+v", reg)
	}
	if _, ok := regression(plotterXYs{{0, 1}, {1, 1}, {2, 1}}.xys()); ok {
		t.Fatal("a constant variable has no regression")
	}
}

func saveChartFile(name string, data []byte) {
	if dir := os.Getenv("AGENTDATA_CHART_DIR"); dir != "" {
		_ = os.WriteFile(dir+"/"+name+".png", data, 0o644)
	}
}

// chartDB fills the IoT DB (AGENTDATA_TEST_DSN, as TestQueries) for the
// chart tests:
//   - s1 (asset a1, the digital twin's): 5 minutes at 2 Hz; Az the sum of
//     sines of 0.05 Hz (amplitude 4.5) and 0.3 Hz (1); Ay = 0.5·Az; Ax
//     constant; load = 100 + sample number.
//   - s2 (pump temperature): every 10 minutes for 14 days, a daily cycle
//     peaking at 15:00 UTC, 2 °C more on weekends.
//   - s3 (another pump's load): every 10 s in the last 5 minutes.
func chartDB(t *testing.T) (*Service, time.Time) {
	dsn := os.Getenv("AGENTDATA_TEST_DSN")
	if dsn == "" {
		t.Skip("AGENTDATA_TEST_DSN not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	for _, q := range []string{
		`DROP SCHEMA IF EXISTS iot_datasource CASCADE`,
		`DROP SCHEMA IF EXISTS iot_data CASCADE`,
		`CREATE SCHEMA iot_data`,
		`CREATE SCHEMA iot_datasource`,
		`CREATE TABLE iot_data.thingData (timestamp TIMESTAMPTZ NOT NULL, group_uid varchar(42) NOT NULL,
			topic_uid varchar(42) NOT NULL, topic varchar(1024) NOT NULL, payload jsonb NOT NULL, deleted SMALLINT NOT NULL)`,
		`CREATE OR REPLACE VIEW iot_datasource.Table_Group_test_7 AS SELECT timestamp, topic, payload FROM iot_data.thingData WHERE group_uid = 'Group_test_7'`,
	} {
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
	now := time.Date(2026, 10, 31, 8, 10, 0, 0, time.UTC)
	insert := func(ts time.Time, topic, payload string) {
		if _, err := pool.Exec(ctx, `INSERT INTO iot_data.thingData VALUES ($1, 'Group_test_7', $2, $3, $4, 0)`, ts, topic, "Topic_"+topic, payload); err != nil {
			t.Fatal(err)
		}
	}
	start := now.Add(-5 * time.Minute)
	for i := 0; i < 600; i++ {
		ts := start.Add(time.Duration(i) * 500 * time.Millisecond)
		sec := float64(i) / 2
		az := 4.5*math.Sin(2*math.Pi*0.05*sec) + math.Sin(2*math.Pi*0.3*sec)
		insert(ts, "t1", fmt.Sprintf(`{"accelerations": [0.01, %f, %f], "load": %d}`, 0.5*az, az, 100+i))
	}
	for ts := now.Add(-14 * 24 * time.Hour); ts.Before(now); ts = ts.Add(10 * time.Minute) {
		h := float64(ts.Hour()) + float64(ts.Minute())/60
		temp := 20 + 5*math.Cos(2*math.Pi*(h-15)/24)
		if wd := ts.Weekday(); wd == time.Saturday || wd == time.Sunday {
			temp += 2
		}
		insert(ts, "t2", fmt.Sprintf(`{"temperature": %f}`, temp))
	}
	for i := 0; i < 30; i++ {
		insert(start.Add(time.Duration(i)*10*time.Second), "t3", fmt.Sprintf(`{"load": %d}`, 50+i))
	}
	s, _ := newTestService(t, pool)
	s.now = func() time.Time { return now }
	return s, now
}

func takePNG(t *testing.T, s *Service, out map[string]any, name string) {
	t.Helper()
	id, _ := out["chart_id"].(string)
	chart, ok := s.TakeChart(70, id)
	if !ok || chart.MimeType != "image/png" || len(chart.Data) == 0 {
		t.Fatalf("%s: chart %q not available", name, id)
	}
	if _, err := png.Decode(bytes.NewReader(chart.Data)); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	saveChartFile(name, chart.Data)
}

func TestChartEndpoints(t *testing.T) {
	s, _ := chartDB(t)
	call := func(path string, args map[string]any) map[string]any {
		t.Helper()
		code, out := post(t, s, path, auth(s, args))
		if code != http.StatusOK {
			t.Fatalf("%s %v: %d %v", path, args, code, out)
		}
		return out
	}

	t.Run("time chart with thresholds", func(t *testing.T) {
		out := call("chart", map[string]any{"sensor": "s1", "fields": []string{"Az"}, "from": "now-5m",
			"title": "Az", "timezone": "Europe/Madrid", "thresholds": []map[string]any{{"value": 4, "label": "Aviso"}, {"value": 6, "label": "Alarma"}}})
		sr := out["series"].([]any)[0].(map[string]any)
		ex := sr["exceedances"].([]any)
		above := ex[0].(map[string]any)["above"].(float64)
		if above < 20 || ex[1].(map[string]any)["above"].(float64) != 0 || sr["max_at"] == nil {
			t.Fatalf("series: %v", sr)
		}
		takePNG(t, s, out, "time_thresholds")
		// a chart of another digital twin is not given
		if _, ok := s.TakeChart(71, out["chart_id"].(string)); ok {
			t.Fatal("chart given twice or to another digital twin")
		}
	})

	t.Run("few values are drawn one by one", func(t *testing.T) {
		out := call("chart", map[string]any{"sensor": "s1", "fields": []string{"Ax", "Ay", "Az"}, "from": "now-30s", "timezone": "Europe/Madrid"})
		if d := fmt.Sprint(out["drawn"]); !strings.Contains(d, "each value") || out["interval"] != nil {
			t.Fatalf("drawn: %v", out)
		}
		takePNG(t, s, out, "time_raw")
	})

	t.Run("RMS per interval, sub-second intervals", func(t *testing.T) {
		out := call("chart", map[string]any{"sensor": "s1", "field": "Az", "from": "now-5m", "interval": "10s", "statistic": "rms"})
		sr := out["series"].([]any)[0].(map[string]any)
		if rms := sr["rms"].(float64); math.Abs(rms-math.Sqrt(4.5*4.5/2+0.5)) > 0.1 {
			t.Fatalf("RMS %v", rms)
		}
		if !strings.Contains(fmt.Sprint(out["drawn"]), "RMS") {
			t.Fatalf("drawn: %v", out["drawn"])
		}
		takePNG(t, s, out, "time_rms")
		out = call("chart", map[string]any{"sensor": "s1", "field": "Az", "from": "now-1m", "interval": "500ms"})
		if out["interval"] != "500ms" {
			t.Fatalf("interval %v", out["interval"])
		}
		takePNG(t, s, out, "time_500ms")
		if code, _ := post(t, s, "chart", auth(s, map[string]any{"sensor": "s1", "field": "Az", "statistic": "max"})); code != http.StatusBadRequest {
			t.Fatalf("statistic max on a time chart: %d", code)
		}
	})

	t.Run("several fields", func(t *testing.T) {
		out := call("chart", map[string]any{"sensor": "s1", "fields": []string{"Ax", "Ay", "Az"}, "from": "now-5m", "timezone": "Europe/Madrid"})
		takePNG(t, s, out, "time_fields")
	})

	t.Run("spectrum", func(t *testing.T) {
		out := call("spectrum", map[string]any{"sensor": "s1", "fields": []string{"Az"}, "from": "now-5m"})
		if fs := out["sampling_rate_hz"].(float64); math.Abs(fs-2) > 1e-9 {
			t.Fatalf("fs %v", fs)
		}
		res := out["resolution_hz"].(float64)
		peaks := out["fields"].([]any)[0].(map[string]any)["peaks"].([]any)
		found := map[float64]bool{}
		for _, p := range peaks {
			f := p.(map[string]any)["freq_hz"].(float64)
			for _, want := range []float64{0.05, 0.3} {
				if math.Abs(f-want) <= res {
					found[want] = true
				}
			}
		}
		if !found[0.05] || !found[0.3] {
			t.Fatalf("peaks %v (resolution %v)", peaks, res)
		}
		takePNG(t, s, out, "spectrum")
		if code, out := post(t, s, "spectrum", auth(s, map[string]any{"sensor": "s1", "field": "Az", "from": "now-5m", "freq_min": 2})); code != http.StatusBadRequest ||
			!strings.Contains(out["error"].(string), "values per second") {
			t.Fatalf("band above Nyquist: %d %v", code, out)
		}
	})

	t.Run("histogram", func(t *testing.T) {
		out := call("distribution", map[string]any{"sensor": "s2", "from": "now-14d", "title": "Temperatura"})
		st := out["statistics"].(map[string]any)
		if st["count"].(float64) < 2000 || st["median"].(float64) < 19 || st["median"].(float64) > 22.5 {
			t.Fatalf("statistics %v", st)
		}
		takePNG(t, s, out, "histogram")
	})

	t.Run("boxplot", func(t *testing.T) {
		out := call("distribution", map[string]any{"sensor": "s2", "kind": "boxplot", "period": "1d", "from": "now-14d", "timezone": "Europe/Madrid"})
		if n := len(out["boxes"].([]any)); n < 14 || n > 15 {
			t.Fatalf("boxes: %d", n)
		}
		takePNG(t, s, out, "boxplot")
	})

	t.Run("correlation same sensor", func(t *testing.T) {
		out := call("correlation", map[string]any{"sensor": "s1", "field": "Az", "y_field": "Ay", "from": "now-5m"})
		reg := out["regression"].(map[string]any)
		if math.Abs(reg["slope"].(float64)-0.5) > 1e-3 || reg["r2"].(float64) < 0.999 {
			t.Fatalf("regression %v", reg)
		}
		takePNG(t, s, out, "correlation")
	})

	t.Run("correlation two sensors", func(t *testing.T) {
		out := call("correlation", map[string]any{"sensor": "s1", "field": "load", "y_sensor": "s3", "y_field": "load", "from": "now-5m", "interval": "10s"})
		if out["pairing"] != "interval average" || out["points"].(float64) < 25 {
			t.Fatalf("pairs: %v", out)
		}
		takePNG(t, s, out, "correlation_sensors")
	})

	t.Run("comparison per day", func(t *testing.T) {
		out := call("comparison", map[string]any{"sensor": "s2", "statistic": "max", "period": "1d", "from": "now-7d", "timezone": "Europe/Madrid"})
		bars := out["bars"].([]any)
		if len(bars) < 7 || len(bars) > 8 {
			t.Fatalf("bars: %v", bars)
		}
		takePNG(t, s, out, "comparison_days")
	})

	t.Run("comparison of sensors", func(t *testing.T) {
		out := call("comparison", map[string]any{"kind": "sensors", "field": "load", "statistic": "avg", "from": "now-5m"})
		bars := out["bars"].([]any)
		if len(bars) != 2 { // s1 and s3 have a field load; s2 has not
			t.Fatalf("bars: %v", bars)
		}
		if bars[0].(map[string]any)["value"].(float64) < bars[1].(map[string]any)["value"].(float64) {
			t.Fatal("bars not sorted")
		}
		takePNG(t, s, out, "comparison_sensors")
	})

	t.Run("heat map", func(t *testing.T) {
		out := call("heatmap", map[string]any{"sensor": "s2", "from": "now-14d", "timezone": "UTC"})
		hi := out["highest"].(map[string]any)
		if h := hi["hour"].(float64); h < 14 || h > 16 || (hi["row"] != "Sat" && hi["row"] != "Sun") {
			t.Fatalf("highest: %v", hi)
		}
		takePNG(t, s, out, "heatmap")
		out = call("heatmap", map[string]any{"sensor": "s2", "from": "now-14d", "layout": "day", "timezone": "Europe/Madrid"})
		takePNG(t, s, out, "heatmap_days")
	})

	t.Run("history of fields", func(t *testing.T) {
		out := call("history", map[string]any{"sensor": "s1", "fields": []string{"Ax", "Ay", "Az"}, "from": "now-30s", "interval": "raw"})
		rows := out["rows"].([]any)
		if len(rows) != 60 {
			t.Fatalf("raw rows: %d", len(rows))
		}
		out = call("history", map[string]any{"sensor": "s1", "fields": []string{"Az", "load"}, "from": "now-5m", "interval": "1m"})
		b0 := out["bucket_rows"].([]any)[0].(map[string]any)
		if counts := b0["count"].([]any); counts[0].(float64) != 120 || counts[1].(float64) != 120 {
			t.Fatalf("counts: %v", counts)
		}
	})

	t.Run("errors the agent can act on", func(t *testing.T) {
		for _, c := range []struct {
			path string
			args map[string]any
			code int
			want string
		}{
			{"chart", map[string]any{"sensor": "s1", "field": "load", "from": "now-2h", "to": "now-1h"}, http.StatusNotFound, "nothing to draw"},
			{"chart", map[string]any{"sensor": "s1", "field": "load", "timezone": "Mars/Base"}, http.StatusBadRequest, "time zone"},
			{"distribution", map[string]any{"sensor": "s1", "fields": []string{"Ax", "Az"}}, http.StatusBadRequest, "one field"},
			{"comparison", map[string]any{"kind": "sensors", "field": "pressure"}, http.StatusBadRequest, "no sensor"},
			{"heatmap", map[string]any{"sensor": "s2", "layout": "day", "from": "now-90d"}, http.StatusBadRequest, "at most"},
		} {
			code, out := post(t, s, c.path, auth(s, c.args))
			if code != c.code || !strings.Contains(fmt.Sprint(out["error"]), c.want) {
				t.Errorf("%s %v: %d %v", c.path, c.args, code, out)
			}
		}
	})
}

func TestRangesInTheUsersZone(t *testing.T) {
	now := time.Date(2026, 10, 31, 8, 10, 0, 0, time.UTC)
	madrid, _ := time.LoadLocation("Europe/Madrid")
	from, _, err := timeRange("now/d", "", now, madrid)
	if err != nil || !from.Equal(time.Date(2026, 10, 30, 23, 0, 0, 0, time.UTC)) {
		t.Fatalf("now/d in Madrid: %v %v", from, err)
	}
	from, _, err = timeRange("2026-10-31T08:00:00", "", now, madrid)
	if err != nil || !from.Equal(time.Date(2026, 10, 31, 7, 0, 0, 0, time.UTC)) {
		t.Fatalf("a time without offset is the user's: %v %v", from, err)
	}
	if HumanInterval(500*time.Millisecond) != "500ms" || HumanInterval(90*time.Second) != "90s" {
		t.Fatal("human intervals")
	}
	if d, _, err := bucketInterval("100ms", now.Add(-10*time.Second), now); err != nil || d != 100*time.Millisecond {
		t.Fatalf("100ms: %v %v", d, err)
	}
}
