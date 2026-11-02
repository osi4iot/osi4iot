package agentdata

import (
	"fmt"
	"image/color"
	"math"
	"net/http"
	"strings"
	"time"

	"gonum.org/v1/plot"
	"gonum.org/v1/plot/plotter"
	"gonum.org/v1/plot/vg"
	"gonum.org/v1/plot/vg/draw"
)

// The distribution of a field's values (sensor-distribution):
//   - histogram: how many values fall in each range of values, with the
//     median and the 5-95 % range marked;
//   - boxplot: a box per period (hour, day, week…): quartiles and median,
//     whiskers from the 5th to the 95th percentile, dots at the minimum and
//     maximum.
// The counts and quantiles are computed by the database: any number of
// values.

const (
	maxHistogramBins = 100
	maxBoxes         = 62
)

var boxPeriods = []time.Duration{
	time.Minute, 5 * time.Minute, 15 * time.Minute, time.Hour, 3 * time.Hour, 6 * time.Hour, 12 * time.Hour,
	24 * time.Hour, 7 * 24 * time.Hour, 30 * 24 * time.Hour,
}

func (s *Service) handleDistribution(w http.ResponseWriter, r *http.Request) {
	c, base, ok := s.chartCall(w, r)
	if !ok {
		return
	}
	fields, err := chartFields(base.sensor, c)
	if err == nil && len(fields) != 1 {
		err = fmt.Errorf("a distribution is of one field: choose one of %s", fieldNames(base.sensor.Fields))
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	f := fields[0]
	switch strings.ToLower(strings.TrimSpace(c.Kind)) {
	case "", "histogram":
		s.histogramChart(w, r, c, base, f)
	case "boxplot", "box":
		s.boxplotChart(w, r, c, base, f)
	default:
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid kind %q: histogram or boxplot", c.Kind))
	}
}

// histogramBins: the number asked, else the Freedman–Diaconis rule.
func histogramBins(asked int, q *Quantiles) int {
	if asked > 0 {
		return min(max(asked, 3), maxHistogramBins)
	}
	iqr := q.Q3 - q.Q1
	if iqr <= 0 || q.Max <= q.Min {
		return 20
	}
	h := 2 * iqr / math.Cbrt(float64(q.Count))
	return min(max(int(math.Ceil((q.Max-q.Min)/h)), 10), 60)
}

func (s *Service) histogramChart(w http.ResponseWriter, r *http.Request, c *call, base *chartBase, f Field) {
	q, err := quantiles(r.Context(), s.db, c.groupUid, base.sensor, f, base.from, base.to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if q.Count == 0 {
		base.noValues(w)
		return
	}
	bins := histogramBins(c.Bins, q)
	lo, hi := q.Min, q.Max
	if hi <= lo { // all the values are equal
		lo, hi = lo-0.5, hi+0.5
		bins = 1
	}
	counts, err := histogram(r.Context(), s.db, c.groupUid, base.sensor, f, base.from, base.to, lo, hi, bins)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	title := chartTitle(c.Title, base.defaultTitle()+" – "+fieldLabel(f, false))
	png, err := renderHistogram(title, f, q, lo, hi, counts)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "the histogram could not be drawn: "+err.Error())
		return
	}
	width := (hi - lo) / float64(bins)
	mode := 0
	for i, n := range counts {
		if n > counts[mode] {
			mode = i
		}
	}
	out := base.answer(title)
	out["kind"] = "histogram"
	out["field"] = f
	out["statistics"] = q
	out["bins"] = bins
	out["bin_width"] = width
	out["most_frequent_range"] = []float64{lo + float64(mode)*width, lo + float64(mode+1)*width}
	out["most_frequent_count"] = counts[mode]
	if err := s.saveChart(c, title, png, out); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func renderHistogram(title string, f Field, q *Quantiles, lo, hi float64, counts []int64) ([]byte, error) {
	p := newPlot(title)
	p.X.Label.Text = fieldLabel(f, true)
	p.Y.Label.Text = "count"
	width := (hi - lo) / float64(len(counts))
	h := &plotter.Histogram{Width: width, FillColor: withAlpha(paletteColor(0), 0xb0)}
	h.LineStyle.Color = chartBackground
	h.LineStyle.Width = vg.Points(0.6)
	top := 0.0
	for i, n := range counts {
		h.Bins = append(h.Bins, plotter.HistogramBin{Min: lo + float64(i)*width, Max: lo + float64(i+1)*width, Weight: float64(n)})
		top = math.Max(top, float64(n))
	}
	p.Add(h)
	p.Y.Min, p.Y.Max = 0, top*1.12

	var legend []legendEntry
	add := func(x float64, label string, col color.NRGBA, dashed bool) error {
		line, err := plotter.NewLine(plotter.XYs{{X: x, Y: 0}, {X: x, Y: p.Y.Max}})
		if err != nil {
			return err
		}
		line.Color, line.Width = col, vg.Points(1.3)
		if dashed {
			line.Dashes = []vg.Length{vg.Points(5), vg.Points(3)}
		}
		p.Add(line)
		legend = append(legend, legendEntry{label, line})
		return nil
	}
	if err := add(q.Median, fmt.Sprintf("median %.4g", q.Median), paletteColor(1), false); err != nil {
		return nil, err
	}
	if err := add(q.P05, fmt.Sprintf("5 %% %.4g", q.P05), chartAxis, true); err != nil {
		return nil, err
	}
	if err := add(q.P95, fmt.Sprintf("95 %% %.4g", q.P95), chartAxis, true); err != nil {
		return nil, err
	}
	pad := (hi - lo) * 0.03
	p.X.Min, p.X.Max = lo-pad, hi+pad
	return renderPNG(p, legendPanel(p, legend))
}

func boxPeriod(spec string, from, to time.Time) (time.Duration, error) {
	spec = strings.ToLower(strings.TrimSpace(spec))
	span := to.Sub(from)
	if spec == "" || spec == "auto" {
		for _, d := range boxPeriods {
			if span/d <= 24 {
				return d, nil
			}
		}
		return boxPeriods[len(boxPeriods)-1], nil
	}
	d, _, err := bucketInterval(spec, from, to)
	if err != nil {
		return 0, err
	}
	if span/d > maxBoxes {
		return 0, fmt.Errorf("period %s gives %d boxes in the range; at most %d: use a longer period or a shorter range", HumanInterval(d), span/d, maxBoxes)
	}
	return d, nil
}

func (s *Service) boxplotChart(w http.ResponseWriter, r *http.Request, c *call, base *chartBase, f Field) {
	period, err := boxPeriod(c.Period, base.from, base.to)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	boxes, err := quantilesByPeriod(r.Context(), s.db, c.groupUid, base.sensor, f, base.from, base.to, period, maxBoxes+1)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(boxes) == 0 {
		base.noValues(w)
		return
	}
	if len(boxes) > maxBoxes {
		boxes = boxes[:maxBoxes]
	}
	title := chartTitle(c.Title, base.defaultTitle()+" – "+fieldLabel(f, false))
	png, err := renderBoxes(title, f, boxes, period, base)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "the box plot could not be drawn: "+err.Error())
		return
	}
	out := base.answer(title)
	out["kind"] = "boxplot"
	out["field"] = f
	out["period"] = HumanInterval(period)
	out["boxes"] = boxes
	if err := s.saveChart(c, title, png, out); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// periodBoxes draws a box per period at its time.
type periodBoxes struct {
	boxes  []Quantiles
	period time.Duration
	color  color.NRGBA
}

func (b *periodBoxes) x(q Quantiles) float64 { return unixSeconds(q.Time.Add(b.period / 2)) }

func (b *periodBoxes) Plot(c draw.Canvas, plt *plot.Plot) {
	trX, trY := plt.Transforms(&c)
	halfW := (trX(b.period.Seconds()) - trX(0)) * 0.35
	halfW = max(min(halfW, vg.Points(14)), vg.Points(1.5))
	line := draw.LineStyle{Color: b.color, Width: vg.Points(1.1)}
	for _, q := range b.boxes {
		x := trX(b.x(q))
		y := func(v float64) vg.Length { return trY(v) }
		c.StrokeLine2(line, x, y(q.P05), x, y(q.Q1))
		c.StrokeLine2(line, x, y(q.Q3), x, y(q.P95))
		c.StrokeLine2(line, x-halfW/2, y(q.P05), x+halfW/2, y(q.P05))
		c.StrokeLine2(line, x-halfW/2, y(q.P95), x+halfW/2, y(q.P95))
		box := []vg.Point{{X: x - halfW, Y: y(q.Q1)}, {X: x + halfW, Y: y(q.Q1)}, {X: x + halfW, Y: y(q.Q3)}, {X: x - halfW, Y: y(q.Q3)}}
		c.FillPolygon(withAlpha(b.color, 0x55), c.ClipPolygonXY(box))
		c.StrokeLines(line, c.ClipLinesXY(append(box, box[0]))...)
		c.StrokeLine2(draw.LineStyle{Color: paletteColor(1), Width: vg.Points(1.8)}, x-halfW, y(q.Median), x+halfW, y(q.Median))
		for _, v := range []float64{q.Min, q.Max} {
			c.DrawGlyph(draw.GlyphStyle{Color: chartAxis, Radius: vg.Points(1.6), Shape: draw.CircleGlyph{}}, vg.Point{X: x, Y: y(v)})
		}
	}
}

func (b *periodBoxes) DataRange() (xmin, xmax, ymin, ymax float64) {
	xmin, ymin = math.Inf(1), math.Inf(1)
	xmax, ymax = math.Inf(-1), math.Inf(-1)
	for _, q := range b.boxes {
		xmin, xmax = math.Min(xmin, b.x(q)), math.Max(xmax, b.x(q))
		ymin, ymax = math.Min(ymin, q.Min), math.Max(ymax, q.Max)
	}
	return
}

func renderBoxes(title string, f Field, boxes []Quantiles, period time.Duration, base *chartBase) ([]byte, error) {
	p := newPlot(title)
	p.X.Tick.Marker = timeTicker{loc: base.loc}
	p.X.Label.Text = zoneLabel(base.loc, base.from)
	p.Y.Label.Text = fieldLabel(f, true)
	pb := &periodBoxes{boxes: boxes, period: period, color: paletteColor(0)}
	p.Add(pb)
	_, _, ymin, ymax := pb.DataRange()
	p.X.Min = math.Min(unixSeconds(boxes[0].Time), unixSeconds(base.from))
	p.X.Max = math.Max(unixSeconds(boxes[len(boxes)-1].Time.Add(period)), unixSeconds(base.to))
	pad := (ymax - ymin) * 0.06
	if pad == 0 {
		pad = 1
	}
	p.Y.Min, p.Y.Max = ymin-pad, ymax+pad
	return renderPNG(p, nil)
}
