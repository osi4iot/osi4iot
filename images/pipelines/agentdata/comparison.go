package agentdata

import (
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"gonum.org/v1/plot/plotter"
	"gonum.org/v1/plot/vg"
	"gonum.org/v1/plot/vg/draw"
)

// Bars to compare (sensor-comparison):
//   - periods: a statistic of a field per period (maximum per day, average
//     per hour, total per week…);
//   - sensors: a statistic of the same field over the range in several
//     sensors of the group (the temperature of every pump).

const (
	maxBars = 31
	// maxComparedSensors bounds the sensors of a comparison.
	maxComparedSensors = 20
)

var barPeriods = []time.Duration{
	time.Minute, 5 * time.Minute, 15 * time.Minute, time.Hour, 3 * time.Hour, 6 * time.Hour, 12 * time.Hour,
	24 * time.Hour, 7 * 24 * time.Hour, 30 * 24 * time.Hour,
}

// Bar is a bar of a comparison.
type Bar struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
	Count int64   `json:"count"` // values it summarizes
	// Sensor is the bar's sensor (kind sensors).
	Sensor *SensorInfo `json:"sensor,omitempty"`
}

// statistic names one of avg, max, min, sum, count ("" when invalid).
func statistic(spec string) string {
	switch strings.ToLower(strings.TrimSpace(spec)) {
	case "", "avg", "mean", "average":
		return "avg"
	case "max", "maximum":
		return "max"
	case "min", "minimum":
		return "min"
	case "sum", "total":
		return "sum"
	case "count":
		return "count"
	}
	return ""
}

func statisticOf(stat string, avg, min, max float64, count int64) float64 {
	switch stat {
	case "max":
		return max
	case "min":
		return min
	case "sum":
		return avg * float64(count)
	case "count":
		return float64(count)
	}
	return avg
}

func (s *Service) handleComparison(w http.ResponseWriter, r *http.Request) {
	c, ok := s.readCall(w, r)
	if !ok {
		return
	}
	stat := statistic(c.Statistic)
	if stat == "" {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid statistic %q: avg, max, min, sum or count", c.Statistic))
		return
	}
	loc, err := chartLocation(c.Timezone)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	from, to, err := timeRange(c.From, c.To, s.now(), loc)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	switch strings.ToLower(strings.TrimSpace(c.Kind)) {
	case "", "periods", "period":
		sn, err := s.callSensor(r.Context(), c)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		s.comparePeriods(w, r, c, &chartBase{from: from, to: to, loc: loc, sensor: sn}, stat)
	case "sensors", "assets":
		s.compareSensors(w, r, c, from, to, loc, stat)
	default:
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid kind %q: periods or sensors", c.Kind))
	}
}

func barPeriod(spec string, from, to time.Time) (time.Duration, error) {
	spec = strings.ToLower(strings.TrimSpace(spec))
	span := to.Sub(from)
	if spec == "" || spec == "auto" {
		for _, d := range barPeriods {
			if span/d <= 24 {
				return d, nil
			}
		}
		return barPeriods[len(barPeriods)-1], nil
	}
	d, _, err := bucketInterval(spec, from, to)
	if err != nil {
		return 0, err
	}
	if span/d > maxBars {
		return 0, fmt.Errorf("period %s gives %d bars in the range; at most %d: use a longer period or a shorter range", HumanInterval(d), span/d, maxBars)
	}
	return d, nil
}

// periodLabel writes a period's start for its bar.
func periodLabel(t time.Time, period time.Duration, loc *time.Location) string {
	t = t.In(loc)
	switch {
	case period >= 24*time.Hour:
		return t.Format("02/01")
	case period >= time.Hour:
		return t.Format("02/01 15h")
	default:
		return t.Format("15:04")
	}
}

func (s *Service) comparePeriods(w http.ResponseWriter, r *http.Request, c *call, base *chartBase, stat string) {
	fields, err := chartFields(base.sensor, c)
	if err == nil && len(fields) != 1 {
		err = fmt.Errorf("compare one field per period: choose one of %s", fieldNames(base.sensor.Fields))
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	f := fields[0]
	period, err := barPeriod(c.Period, base.from, base.to)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Daily and longer periods start at midnight of the chart's zone, not
	// of UTC: the buckets are hours, gathered here.
	unit := period
	if period >= 24*time.Hour {
		unit = time.Hour
	}
	buckets, err := aggregatedHistoryN(r.Context(), s.db, c.groupUid, base.sensor, f, base.from, base.to, unit, 24*400)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(buckets) == 0 {
		base.noValues(w)
		return
	}
	type acc struct {
		start         time.Time
		sum, min, max float64
		count         int64
	}
	var groups []*acc
	index := map[int64]*acc{}
	for _, b := range buckets {
		start := b.Time
		if period >= 24*time.Hour {
			lt := b.Time.In(base.loc)
			day := time.Date(lt.Year(), lt.Month(), lt.Day(), 0, 0, 0, 0, base.loc)
			if period >= 7*24*time.Hour {
				days := int(period / (24 * time.Hour))
				offset := int(day.Sub(time.Date(1970, 1, 5, 0, 0, 0, 0, base.loc)).Hours()/24) % days // weeks start on Monday
				day = day.AddDate(0, 0, -offset)
			}
			start = day
		}
		a := index[start.Unix()]
		if a == nil {
			a = &acc{start: start, min: math.Inf(1), max: math.Inf(-1)}
			index[start.Unix()] = a
			groups = append(groups, a)
		}
		a.sum += b.Avg * float64(b.Count)
		a.count += b.Count
		a.min, a.max = math.Min(a.min, b.Min), math.Max(a.max, b.Max)
	}
	if len(groups) > maxBars {
		groups = groups[len(groups)-maxBars:]
	}
	bars := make([]Bar, len(groups))
	for i, g := range groups {
		bars[i] = Bar{Label: periodLabel(g.start, period, base.loc), Count: g.count,
			Value: statisticOf(stat, g.sum/float64(g.count), g.min, g.max, g.count)}
	}
	title := chartTitle(c.Title, fmt.Sprintf("%s – %s %s per %s", base.defaultTitle(), fieldLabel(f, false), stat, HumanInterval(period)))
	yLabel := fieldLabel(f, true)
	if stat == "count" {
		yLabel = "count"
	}
	png, err := renderBars(title, bars, yLabel, zoneLabel(base.loc, base.from))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "the chart could not be drawn: "+err.Error())
		return
	}
	out := base.answer(title)
	out["kind"] = "periods"
	out["field"] = f
	out["statistic"] = stat
	out["period"] = HumanInterval(period)
	out["bars"] = bars
	if err := s.saveChart(c, title, png, out); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// compareSensors: the sensors named (each one's field as "field" names
// it), or every sensor of the group (of the asset given) with that field.
func (s *Service) compareSensors(w http.ResponseWriter, r *http.Request, c *call, from, to time.Time, loc *time.Location, stat string) {
	ctx := r.Context()
	if strings.TrimSpace(c.Field) == "" {
		writeError(w, http.StatusBadRequest, "say which field to compare ('field': its name or label, e.g. temperature)")
		return
	}
	var sensors []SensorInfo
	if len(c.Sensors) > 0 {
		if len(c.Sensors) > maxComparedSensors {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("at most %d sensors", maxComparedSensors))
			return
		}
		for _, spec := range c.Sensors {
			one := *c
			one.Sensor = spec
			sn, err := s.callSensor(ctx, &one)
			if err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			sensors = append(sensors, sn)
		}
	} else {
		all, err := s.groupSensors(ctx, c)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		var assetUid string
		if strings.TrimSpace(c.Asset) != "" {
			a, err := resolveAsset(s.groupAssets(c), c.Asset, c.dtDescription)
			if err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			assetUid = a.Uid
		}
		for _, sn := range all {
			if assetUid != "" && sn.AssetUid != assetUid {
				continue
			}
			if _, err := resolveField(sn, c.Field); err == nil && len(sn.Fields) > 0 {
				sensors = append(sensors, sn)
			}
		}
		if len(sensors) == 0 {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("no sensor of the group has a field %q (list-sensors lists them)", c.Field))
			return
		}
		if len(sensors) > maxComparedSensors {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("%d sensors have the field %q: name at most %d in 'sensors'", len(sensors), c.Field, maxComparedSensors))
			return
		}
	}

	var bars []Bar
	var fields []Field
	for i := range sensors {
		sn := sensors[i]
		f, err := resolveField(sn, c.Field)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		st, err := statistics(ctx, s.db, c.groupUid, sn, f, from, to)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		fields = append(fields, f)
		label := sn.Description
		if label == "" {
			label = sn.Ref
		}
		if sn.AssetDescription != "" && !strings.Contains(strings.ToLower(label), strings.ToLower(sn.AssetDescription)) {
			label = sn.AssetDescription + " · " + label
		}
		bar := Bar{Label: label, Count: st.Count, Sensor: &sensors[i]}
		if st.Count > 0 {
			bar.Value = statisticOf(stat, *st.Avg, st.Min.Value, st.Max.Value, st.Count)
		}
		bars = append(bars, bar)
	}
	// Equal labels (two sensors with the same description) get the uid.
	seen := map[string]int{}
	for _, b := range bars {
		seen[b.Label]++
	}
	for i := range bars {
		if seen[bars[i].Label] > 1 {
			bars[i].Label += " (" + bars[i].Sensor.Uid + ")"
		}
	}
	values := int64(0)
	for _, b := range bars {
		values += b.Count
	}
	if values == 0 {
		writeError(w, http.StatusNotFound, "none of the sensors has values in the range: there is nothing to draw")
		return
	}
	sort.SliceStable(bars, func(i, j int) bool { return bars[i].Value > bars[j].Value })

	title := chartTitle(c.Title, fmt.Sprintf("%s %s", strings.TrimSpace(c.Field), stat))
	yLabel := fieldLabel(fields[0], commonUnits(fields) != "")
	if stat == "count" {
		yLabel = "count"
	}
	png, err := renderBars(title, bars, yLabel, "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "the chart could not be drawn: "+err.Error())
		return
	}
	out := map[string]any{
		"from":      from.In(loc).Format(time.RFC3339),
		"to":        to.In(loc).Format(time.RFC3339),
		"timezone":  zoneLabel(loc, from),
		"kind":      "sensors",
		"statistic": stat,
		"bars":      bars,
	}
	if err := s.saveChart(c, title, png, out); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func renderBars(title string, bars []Bar, yLabel, xLabel string) ([]byte, error) {
	p := newPlot(title)
	p.Y.Label.Text = yLabel
	p.X.Label.Text = xLabel
	values := make(plotter.Values, len(bars))
	labels := make([]string, len(bars))
	lo, hi := 0.0, 0.0
	for i, b := range bars {
		values[i] = b.Value
		labels[i] = b.Label
		if r := []rune(labels[i]); len(r) > 28 {
			labels[i] = string(r[:27]) + "…"
		}
		lo, hi = math.Min(lo, b.Value), math.Max(hi, b.Value)
	}
	width := vg.Points(math.Max(4, math.Min(40, 640/float64(len(bars)))))
	chart, err := plotter.NewBarChart(values, width)
	if err != nil {
		return nil, err
	}
	chart.Color = withAlpha(paletteColor(0), 0xd0)
	chart.LineStyle.Width = 0
	p.Add(chart)
	p.NominalX(labels...)
	p.X.Min, p.X.Max = -0.7, float64(len(bars))-0.3
	if len(bars) > 8 {
		p.X.Tick.Label.Rotation = math.Pi / 4
		p.X.Tick.Label.XAlign = draw.XRight
		p.X.Tick.Label.YAlign = draw.YCenter
	}

	// The value above (or below) each bar.
	pts := make(plotter.XYs, len(bars))
	texts := make([]string, len(bars))
	for i, b := range bars {
		pts[i] = plotter.XY{X: float64(i), Y: b.Value}
		texts[i] = fmt.Sprintf("%.4g", b.Value)
	}
	if len(bars) <= 16 {
		labels, err := plotter.NewLabels(plotter.XYLabels{XYs: pts, Labels: texts})
		if err != nil {
			return nil, err
		}
		for k := range labels.TextStyle {
			restyle(&labels.TextStyle[k], 9)
			labels.TextStyle[k].XAlign = draw.XCenter
			labels.TextStyle[k].YAlign = draw.YBottom
		}
		labels.Offset = vg.Point{Y: vg.Points(3)}
		p.Add(labels)
	}
	pad := (hi - lo) * 0.12
	if pad == 0 {
		pad = 1
	}
	p.Y.Min, p.Y.Max = math.Min(0, lo-pad*boolFloat(lo < 0)), hi+pad
	return renderPNG(p, nil)
}

func boolFloat(b bool) float64 {
	if b {
		return 1
	}
	return 0
}
