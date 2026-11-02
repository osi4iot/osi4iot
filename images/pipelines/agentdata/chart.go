package agentdata

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"gonum.org/v1/plot"
	"gonum.org/v1/plot/plotter"
	"gonum.org/v1/plot/vg"
	"gonum.org/v1/plot/vg/draw"
)

// The time chart (sensor-chart): the evolution of one or several fields of
// a sensor, the average per interval as a line and the minimum-maximum as
// a band, with optional thresholds (and how often they were crossed) and
// the extremes marked.

const (
	// MaxChartSeries bounds the fields of one chart.
	MaxChartSeries = 6
	// MaxThresholds bounds the thresholds of a chart.
	MaxThresholds = 4
	// chartTargetBuckets is what "auto" aims for: about one point every
	// 3 pixels of the plot.
	chartTargetBuckets = 300
	// maxRawChartValues: a range with at most these values of each field
	// is drawn value by value (no intervals, no band).
	maxRawChartValues = 600
)

// Threshold is a limit drawn on a time chart (a warning or alarm level).
type Threshold struct {
	Value float64 `json:"value"`
	Label string  `json:"label,omitempty"`
}

// chartIntervals are the "auto" intervals of a chart: finer than the
// sensor-history ones, for short ranges of fast sensors.
var chartIntervals = []time.Duration{
	time.Millisecond, 2 * time.Millisecond, 5 * time.Millisecond, 10 * time.Millisecond, 20 * time.Millisecond,
	50 * time.Millisecond, 100 * time.Millisecond, 200 * time.Millisecond, 500 * time.Millisecond,
	time.Second, 2 * time.Second, 5 * time.Second, 10 * time.Second, 15 * time.Second, 30 * time.Second,
	time.Minute, 2 * time.Minute, 5 * time.Minute, 10 * time.Minute, 15 * time.Minute, 30 * time.Minute,
	time.Hour, 2 * time.Hour, 3 * time.Hour, 6 * time.Hour, 12 * time.Hour,
	24 * time.Hour, 7 * 24 * time.Hour, 30 * 24 * time.Hour,
}

func chartInterval(spec string, from, to time.Time) (time.Duration, bool, error) {
	spec = strings.ToLower(strings.TrimSpace(spec))
	if spec != "" && spec != "auto" {
		return bucketInterval(spec, from, to)
	}
	span := to.Sub(from)
	for _, d := range chartIntervals {
		if span/d <= chartTargetBuckets {
			return d, false, nil
		}
	}
	return chartIntervals[len(chartIntervals)-1], false, nil
}

// ChartSeries is a field of a chart, as the tool summarizes it.
type ChartSeries struct {
	Field       Field        `json:"field"`
	Count       int64        `json:"count"` // values in the range
	Min         *float64     `json:"min,omitempty"`
	Max         *float64     `json:"max,omitempty"`
	Avg         *float64     `json:"avg,omitempty"`
	RMS         *float64     `json:"rms,omitempty"`
	MinAt       *time.Time   `json:"min_at,omitempty"`
	MaxAt       *time.Time   `json:"max_at,omitempty"`
	Exceedances []Exceedance `json:"exceedances,omitempty"`

	buckets []Bucket
}

func newChartSeries(f Field, buckets []Bucket) ChartSeries {
	s := ChartSeries{Field: f, buckets: buckets}
	var sum, sumSq float64
	for i, b := range buckets {
		if i == 0 || b.Min < *s.Min {
			v := b.Min
			s.Min = &v
		}
		if i == 0 || b.Max > *s.Max {
			v := b.Max
			s.Max = &v
		}
		s.Count += b.Count
		sum += b.Avg * float64(b.Count)
		sumSq += b.RMS * b.RMS * float64(b.Count)
	}
	if s.Count > 0 {
		avg := sum / float64(s.Count)
		rms := math.Sqrt(sumSq / float64(s.Count))
		s.Avg, s.RMS = &avg, &rms
	}
	return s
}

// chartFields resolves the fields of a chart (or of a history of several
// fields): those named, else the one in "field", else all the sensor's
// (up to MaxChartSeries).
func chartFields(sn SensorInfo, c *call) ([]Field, error) {
	specs := make([]string, 0, len(c.Fields)+1)
	for _, f := range c.Fields {
		if strings.TrimSpace(f) != "" {
			specs = append(specs, f)
		}
	}
	if len(specs) == 0 && strings.TrimSpace(c.Field) != "" {
		specs = append(specs, c.Field)
	}
	if len(specs) == 0 {
		if len(sn.Fields) == 0 {
			return nil, fmt.Errorf("say which fields of %s: %s", sn.name(), fieldNames(sn.Fields))
		}
		if len(sn.Fields) > MaxChartSeries {
			return nil, fmt.Errorf("%s has %d fields; choose at most %d: %s", sn.name(), len(sn.Fields), MaxChartSeries, fieldNames(sn.Fields))
		}
		return sn.Fields, nil
	}
	if len(specs) > MaxChartSeries {
		return nil, fmt.Errorf("at most %d fields at once", MaxChartSeries)
	}
	out := make([]Field, 0, len(specs))
	seen := map[string]bool{}
	for _, spec := range specs {
		f, err := resolveField(sn, spec)
		if err != nil {
			return nil, err
		}
		if !seen[f.Name] {
			seen[f.Name] = true
			out = append(out, f)
		}
	}
	return out, nil
}

// chartBase is what every chart call resolves first: range, time zone,
// sensor.
type chartBase struct {
	from, to time.Time
	loc      *time.Location
	sensor   SensorInfo
}

func (s *Service) chartCall(w http.ResponseWriter, r *http.Request) (*call, *chartBase, bool) {
	c, ok := s.readCall(w, r)
	if !ok {
		return nil, nil, false
	}
	loc, err := chartLocation(c.Timezone)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return nil, nil, false
	}
	from, to, err := timeRange(c.From, c.To, s.now(), loc)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return nil, nil, false
	}
	sn, err := s.callSensor(r.Context(), c)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return nil, nil, false
	}
	return c, &chartBase{from: from, to: to, loc: loc, sensor: sn}, true
}

func (b *chartBase) noValues(w http.ResponseWriter) {
	writeError(w, http.StatusNotFound, fmt.Sprintf("%s has no values between %s and %s: there is nothing to draw",
		b.sensor.name(), b.from.In(b.loc).Format(time.RFC3339), b.to.In(b.loc).Format(time.RFC3339)))
}

func (b *chartBase) answer(title string) map[string]any {
	return map[string]any{
		"sensor":   b.sensor,
		"from":     b.from.In(b.loc).Format(time.RFC3339),
		"to":       b.to.In(b.loc).Format(time.RFC3339),
		"timezone": zoneLabel(b.loc, b.from),
		"title":    title,
	}
}

func (b *chartBase) defaultTitle() string {
	if b.sensor.Description != "" {
		return b.sensor.Description
	}
	return b.sensor.Ref
}

func checkThresholds(ts []Threshold) error {
	if len(ts) > MaxThresholds {
		return fmt.Errorf("at most %d thresholds", MaxThresholds)
	}
	for _, t := range ts {
		if math.IsNaN(t.Value) || math.IsInf(t.Value, 0) {
			return fmt.Errorf("invalid threshold %v", t.Value)
		}
	}
	return nil
}

func (s *Service) handleChart(w http.ResponseWriter, r *http.Request) {
	c, base, ok := s.chartCall(w, r)
	if !ok {
		return
	}
	fields, err := chartFields(base.sensor, c)
	if err == nil {
		err = checkThresholds(c.Thresholds)
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	line := strings.ToLower(strings.TrimSpace(c.Statistic))
	switch line {
	case "", "avg", "mean", "average":
		line = "avg"
	case "rms":
	default:
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid statistic %q for a time chart: avg (default) or rms", c.Statistic))
		return
	}
	markExtremes := len(fields) == 1
	if c.MarkExtremes != nil {
		markExtremes = *c.MarkExtremes
	}
	ctx := r.Context()

	// How to draw: few values (auto interval), each one as it is; else the
	// average (or RMS) per interval with the minimum-maximum band. An
	// interval of about 300 points over a range of more than 600 values is
	// always longer than the time between the values.
	raw := false
	interval, adjusted := time.Duration(0), false
	if spec := strings.ToLower(strings.TrimSpace(c.Interval)); spec == "" || spec == "auto" || spec == "raw" {
		most := int64(0)
		for _, f := range fields {
			n, err := seriesCount(ctx, s.db, c.groupUid, base.sensor, f, base.from, base.to)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			most = max(most, n)
		}
		raw = most <= maxRawChartValues
		if spec == "raw" && !raw {
			writeError(w, http.StatusBadRequest, fmt.Sprintf(
				"the range has %d values: at most %d are drawn one by one; use a shorter range or interval auto", most, maxRawChartValues))
			return
		}
	}
	if !raw {
		var err error
		if interval, adjusted, err = chartInterval(c.Interval, base.from, base.to); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	series := make([]ChartSeries, 0, len(fields))
	var values int64
	for _, f := range fields {
		var buckets []Bucket
		if raw {
			points, _, err := rawHistory(ctx, s.db, c.groupUid, base.sensor, f, base.from, base.to, maxRawChartValues)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			buckets = make([]Bucket, len(points))
			for i, p := range points {
				buckets[i] = Bucket{Time: p.Time, Avg: p.Value, Min: p.Value, Max: p.Value, RMS: math.Abs(p.Value), Count: 1}
			}
		} else {
			var err error
			buckets, err = aggregatedHistory(ctx, s.db, c.groupUid, base.sensor, f, base.from, base.to, interval)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			if len(buckets) > MaxBuckets {
				buckets = buckets[:MaxBuckets]
			}
		}
		cs := newChartSeries(f, buckets)
		if cs.Count > 0 {
			if err := s.seriesDetails(ctx, c, base, &cs, c.Thresholds, markExtremes); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
		values += cs.Count
		series = append(series, cs)
	}
	if values == 0 {
		base.noValues(w)
		return
	}

	title := chartTitle(c.Title, base.defaultTitle())
	png, err := renderTimeChart(timeChart{
		title: title, series: series, from: base.from, to: base.to, loc: base.loc, raw: raw, line: line,
		interval: interval, thresholds: c.Thresholds, markExtremes: markExtremes,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "the chart could not be drawn: "+err.Error())
		return
	}
	out := base.answer(title)
	if raw {
		out["drawn"] = "each value as it was measured (few values: no intervals, no band)"
	} else {
		out["interval"] = HumanInterval(interval)
		out["interval_adjusted"] = adjusted
		what := "average"
		if line == "rms" {
			what = "RMS (root mean square)"
		}
		out["drawn"] = fmt.Sprintf("the %s of each interval of %s as a line; the band spans the minimum and maximum of each interval", what, HumanInterval(interval))
	}
	out["series"] = series
	if len(c.Thresholds) > 0 {
		out["thresholds"] = c.Thresholds
	}
	if err := s.saveChart(c, title, png, out); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// seriesDetails adds the exact extremes (with their times) and the
// crossings of the thresholds to a series.
func (s *Service) seriesDetails(ctx context.Context, c *call, base *chartBase, cs *ChartSeries, ts []Threshold, extremes bool) error {
	if extremes {
		st, err := statistics(ctx, s.db, c.groupUid, base.sensor, cs.Field, base.from, base.to)
		if err != nil {
			return err
		}
		if st.Min != nil {
			cs.Min, cs.MinAt = &st.Min.Value, &st.Min.Time
		}
		if st.Max != nil {
			cs.Max, cs.MaxAt = &st.Max.Value, &st.Max.Time
		}
	}
	if len(ts) > 0 {
		ex, err := exceedances(ctx, s.db, c.groupUid, base.sensor, cs.Field, base.from, base.to, ts)
		if err != nil {
			return err
		}
		cs.Exceedances = ex
	}
	return nil
}

// ---- Drawing ----

type timeChart struct {
	title        string
	series       []ChartSeries
	from, to     time.Time
	loc          *time.Location
	raw          bool   // each value as measured: buckets of one value
	line         string // avg or rms
	interval     time.Duration
	thresholds   []Threshold
	markExtremes bool
}

// segments splits the buckets where data are missing (a gap of more than
// two intervals), so the line is not drawn across it.
func segments(buckets []Bucket, interval time.Duration) [][]Bucket {
	var out [][]Bucket
	start := 0
	for i := 1; i < len(buckets); i++ {
		if buckets[i].Time.Sub(buckets[i-1].Time) > 2*interval {
			out = append(out, buckets[start:i])
			start = i
		}
	}
	if len(buckets) > 0 {
		out = append(out, buckets[start:])
	}
	return out
}

// bucketX is a bucket's position: the middle of its interval.
func bucketX(b Bucket, interval time.Duration) float64 {
	return unixSeconds(b.Time.Add(interval / 2))
}

func unixSeconds(t time.Time) float64 { return float64(t.UnixNano()) / 1e9 }

func renderTimeChart(spec timeChart) ([]byte, error) {
	p := newPlot(spec.title)
	p.X.Min, p.X.Max = unixSeconds(spec.from), unixSeconds(spec.to)
	p.X.Tick.Marker = timeTicker{loc: spec.loc}
	p.X.Label.Text = zoneLabel(spec.loc, spec.from)

	fields := make([]Field, len(spec.series))
	for i, s := range spec.series {
		fields[i] = s.Field
	}
	units := commonUnits(fields)
	p.Y.Label.Text = prettyUnits(units)

	var legend []legendEntry
	yMin, yMax := math.Inf(1), math.Inf(-1)
	for i, s := range spec.series {
		col := paletteColor(i)
		var first *plotter.Line
		gap := spec.interval
		if spec.raw {
			gap = typicalStep(s.buckets) // a gap: more than twice the usual time between values
		}
		x := func(b Bucket) float64 {
			if spec.raw {
				return unixSeconds(b.Time)
			}
			return bucketX(b, spec.interval)
		}
		for _, seg := range segments(s.buckets, gap) {
			mean := make(plotter.XYs, len(seg))
			polygon := make(plotter.XYs, 0, 2*len(seg))
			band := false
			for k, b := range seg {
				y := b.Avg
				if spec.line == "rms" && !spec.raw {
					y = b.RMS
				}
				xb := x(b)
				mean[k] = plotter.XY{X: xb, Y: y}
				polygon = append(polygon, plotter.XY{X: xb, Y: b.Max})
				band = band || b.Max > b.Min
				yMin, yMax = math.Min(yMin, b.Min), math.Max(yMax, b.Max)
			}
			for k := len(seg) - 1; k >= 0; k-- {
				polygon = append(polygon, plotter.XY{X: x(seg[k]), Y: seg[k].Min})
			}
			if band && len(seg) > 1 {
				poly, err := plotter.NewPolygon(polygon)
				if err != nil {
					return nil, err
				}
				poly.Color = withAlpha(col, 0x40)
				poly.LineStyle.Width = 0
				p.Add(poly)
			}
			if len(seg) == 1 {
				sc, err := plotter.NewScatter(mean)
				if err != nil {
					return nil, err
				}
				sc.Color, sc.Radius = col, vg.Points(2)
				p.Add(sc)
			}
			line, err := plotter.NewLine(mean)
			if err != nil {
				return nil, err
			}
			line.Color, line.Width = col, vg.Points(1.4)
			p.Add(line)
			if first == nil {
				first = line
			}
		}
		if first != nil && len(spec.series) > 1 {
			legend = append(legend, legendEntry{fieldLabel(s.Field, units == ""), first})
		}
	}

	for i, t := range spec.thresholds {
		col := chartWarning
		if i > 0 {
			col = chartAlarm
		}
		line, err := plotter.NewLine(plotter.XYs{{X: p.X.Min, Y: t.Value}, {X: p.X.Max, Y: t.Value}})
		if err != nil {
			return nil, err
		}
		line.Color, line.Width = col, vg.Points(1.2)
		line.Dashes = []vg.Length{vg.Points(6), vg.Points(4)}
		p.Add(line)
		label := t.Label
		if label == "" {
			label = fmt.Sprintf("%g", t.Value)
		}
		legend = append(legend, legendEntry{label, line})
		yMin, yMax = math.Min(yMin, t.Value), math.Max(yMax, t.Value)
	}

	if spec.markExtremes {
		if err := markExtremes(p, spec.series, units); err != nil {
			return nil, err
		}
	}

	if !math.IsInf(yMin, 0) {
		pad := (yMax - yMin) * 0.08
		if pad == 0 {
			pad = math.Max(math.Abs(yMax)*0.1, 1)
		}
		p.Y.Min, p.Y.Max = yMin-pad, yMax+pad
	}
	return renderPNG(p, legendPanel(p, legend))
}

// markExtremes puts a dot and its value on the maximum and the minimum of
// each series.
func markExtremes(p *plot.Plot, series []ChartSeries, units string) error {
	for i, s := range series {
		col := paletteColor(i)
		for _, e := range []struct {
			v  *float64
			at *time.Time
			up bool
		}{{s.Max, s.MaxAt, true}, {s.Min, s.MinAt, false}} {
			if e.v == nil || e.at == nil {
				continue
			}
			pt := plotter.XYs{{X: unixSeconds(*e.at), Y: *e.v}}
			sc, err := plotter.NewScatter(pt)
			if err != nil {
				return err
			}
			sc.Color, sc.Radius = col, vg.Points(3.5)
			p.Add(sc)
			text := fmt.Sprintf("%.4g", *e.v)
			if u := prettyUnits(units); u != "" {
				text += " " + u
			}
			labels, err := plotter.NewLabels(plotter.XYLabels{XYs: pt, Labels: []string{text}})
			if err != nil {
				return err
			}
			for k := range labels.TextStyle {
				restyle(&labels.TextStyle[k], 9)
				labels.TextStyle[k].XAlign = draw.XCenter
				if e.up {
					labels.TextStyle[k].YAlign = draw.YBottom
				} else {
					labels.TextStyle[k].YAlign = draw.YTop
				}
			}
			if e.up {
				labels.Offset = vg.Point{Y: vg.Points(5)}
			} else {
				labels.Offset = vg.Point{Y: -vg.Points(5)}
			}
			p.Add(labels)
		}
	}
	return nil
}

// ---- Time axis ----

var tickSteps = []time.Duration{
	time.Second, 2 * time.Second, 5 * time.Second, 10 * time.Second, 15 * time.Second, 30 * time.Second,
	time.Minute, 2 * time.Minute, 5 * time.Minute, 10 * time.Minute, 15 * time.Minute, 30 * time.Minute,
	time.Hour, 2 * time.Hour, 3 * time.Hour, 6 * time.Hour, 12 * time.Hour,
	24 * time.Hour, 2 * 24 * time.Hour, 7 * 24 * time.Hour, 14 * 24 * time.Hour, 30 * 24 * time.Hour,
}

// timeTicker puts the ticks of the time axis on round times of the
// chart's time zone (every 5 s, 10 min, 6 h, 1 day...), about 6 to 8.
type timeTicker struct{ loc *time.Location }

const maxTimeTicks = 8

func (tt timeTicker) Ticks(min, max float64) []plot.Tick {
	start := time.Unix(0, int64(min*1e9)).In(tt.loc)
	end := time.Unix(0, int64(max*1e9)).In(tt.loc)
	span := end.Sub(start)
	step := tickSteps[len(tickSteps)-1]
	for _, s := range tickSteps {
		if span/s <= maxTimeTicks {
			step = s
			break
		}
	}

	var layout string
	switch {
	case step < time.Minute:
		layout = "15:04:05"
	case step < 24*time.Hour && start.YearDay() == end.YearDay() && start.Year() == end.Year():
		layout = "15:04"
	case step < 24*time.Hour:
		layout = "02/01 15:04"
	default:
		layout = "02/01/2006"
	}

	// First tick: the first round time of the zone at or after start.
	var t time.Time
	if step >= 24*time.Hour {
		t = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, tt.loc)
		if t.Before(start) {
			t = t.AddDate(0, 0, 1)
		}
	} else {
		_, off := start.Zone()
		wall := start.Add(time.Duration(off) * time.Second)
		aligned := wall.Truncate(step)
		if aligned.Before(wall) {
			aligned = aligned.Add(step)
		}
		t = aligned.Add(-time.Duration(off) * time.Second)
	}

	var ticks []plot.Tick
	for i := 0; !t.After(end) && i < 4*maxTimeTicks; i++ {
		ticks = append(ticks, plot.Tick{Value: unixSeconds(t), Label: t.In(tt.loc).Format(layout)})
		if step >= 24*time.Hour {
			t = t.AddDate(0, 0, int(step/(24*time.Hour)))
		} else {
			t = t.Add(step)
		}
	}
	return ticks
}

// typicalStep is the median time between consecutive values.
func typicalStep(buckets []Bucket) time.Duration {
	if len(buckets) < 2 {
		return time.Hour
	}
	steps := make([]time.Duration, 0, len(buckets)-1)
	for i := 1; i < len(buckets); i++ {
		if d := buckets[i].Time.Sub(buckets[i-1].Time); d > 0 {
			steps = append(steps, d)
		}
	}
	if len(steps) == 0 {
		return time.Hour
	}
	sort.Slice(steps, func(i, j int) bool { return steps[i] < steps[j] })
	return steps[len(steps)/2]
}
