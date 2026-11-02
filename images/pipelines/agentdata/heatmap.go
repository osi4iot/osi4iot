package agentdata

import (
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"gonum.org/v1/plot"
	"gonum.org/v1/plot/palette/moreland"
	"gonum.org/v1/plot/plotter"
	"gonum.org/v1/plot/vg"
	"gonum.org/v1/plot/vg/draw"
)

// The heat map (sensor-heatmap): the average of a field per hour of the
// day (columns, in the chart's time zone) and day of the week or date
// (rows). It shows daily and weekly patterns over long ranges.

const maxHeatmapDays = 62

var weekdayNames = []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}

// heatGrid is a rows x 24 grid of averages (NaN: no values).
type heatGrid struct {
	rows   int
	values []float64
	labels []string
}

func (g *heatGrid) Dims() (c, r int)   { return 24, g.rows }
func (g *heatGrid) Z(c, r int) float64 { return g.values[r*24+c] }
func (g *heatGrid) X(c int) float64    { return float64(c) }
func (g *heatGrid) Y(r int) float64    { return float64(r) }

// HeatCell is a cell of the heat map, as the tool reports the extremes.
type HeatCell struct {
	Row   string  `json:"row"` // day of the week or date
	Hour  int     `json:"hour"`
	Value float64 `json:"value"`
}

func (s *Service) handleHeatmap(w http.ResponseWriter, r *http.Request) {
	c, base, ok := s.chartCall(w, r)
	if !ok {
		return
	}
	fields, err := chartFields(base.sensor, c)
	if err == nil && len(fields) != 1 {
		err = fmt.Errorf("a heat map is of one field: choose one of %s", fieldNames(base.sensor.Fields))
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	f := fields[0]
	layout := strings.ToLower(strings.TrimSpace(c.Layout))
	if layout == "" {
		layout = "weekday"
	}
	if layout != "weekday" && layout != "day" {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid layout %q: weekday or day", c.Layout))
		return
	}
	days := int(math.Ceil(base.to.Sub(base.from).Hours() / 24))
	if layout == "day" && days > maxHeatmapDays {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("layout day draws at most %d days: use a shorter range or layout weekday", maxHeatmapDays))
		return
	}
	if days > 366 {
		writeError(w, http.StatusBadRequest, "a heat map covers at most a year")
		return
	}
	buckets, err := aggregatedHistoryN(r.Context(), s.db, c.groupUid, base.sensor, f, base.from, base.to, time.Hour, 24*367)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(buckets) == 0 {
		base.noValues(w)
		return
	}

	// Gather the hourly averages by cell, in the chart's zone.
	grid := &heatGrid{}
	var rowOf func(t time.Time) int
	if layout == "weekday" {
		grid.rows, grid.labels = 7, weekdayNames
		rowOf = func(t time.Time) int { return (int(t.Weekday()) + 6) % 7 }
	} else {
		first := base.from.In(base.loc)
		day0 := time.Date(first.Year(), first.Month(), first.Day(), 0, 0, 0, 0, base.loc)
		for d := day0; d.Before(base.to); d = d.AddDate(0, 0, 1) {
			grid.labels = append(grid.labels, d.Format("02/01"))
		}
		grid.rows = len(grid.labels)
		rowOf = func(t time.Time) int {
			d := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, base.loc)
			return int(math.Round(d.Sub(day0).Hours() / 24))
		}
	}
	sum := make([]float64, grid.rows*24)
	count := make([]int64, grid.rows*24)
	for _, b := range buckets {
		t := b.Time.In(base.loc)
		row := rowOf(t)
		if row < 0 || row >= grid.rows {
			continue
		}
		k := row*24 + t.Hour()
		sum[k] += b.Avg * float64(b.Count)
		count[k] += b.Count
	}
	grid.values = make([]float64, len(sum))
	var hottest, coldest *HeatCell
	for k := range sum {
		if count[k] == 0 {
			grid.values[k] = math.NaN()
			continue
		}
		v := sum[k] / float64(count[k])
		grid.values[k] = v
		cell := HeatCell{Row: grid.labels[k/24], Hour: k % 24, Value: v}
		if hottest == nil || v > hottest.Value {
			hottest = &cell
		}
		if coldest == nil || v < coldest.Value {
			c2 := cell
			coldest = &c2
		}
	}

	title := chartTitle(c.Title, base.defaultTitle()+" – "+fieldLabel(f, false))
	png, err := renderHeatmap(title, grid, f, coldest.Value, hottest.Value, base)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "the heat map could not be drawn: "+err.Error())
		return
	}
	out := base.answer(title)
	out["field"] = f
	out["layout"] = layout
	out["highest"] = hottest
	out["lowest"] = coldest
	out["note_cells"] = "Each cell is the average of the values of that hour of the day (time zone above) on that row."
	if err := s.saveChart(c, title, png, out); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

type rowTicks []string

func (rt rowTicks) Ticks(_, _ float64) []plot.Tick {
	step := 1
	for len(rt)/step > 16 {
		step++
	}
	var ticks []plot.Tick
	for i := 0; i < len(rt); i += step {
		ticks = append(ticks, plot.Tick{Value: float64(i), Label: rt[i]})
	}
	return ticks
}

type hourTicks struct{}

func (hourTicks) Ticks(_, _ float64) []plot.Tick {
	var ticks []plot.Tick
	for h := 0; h < 24; h++ {
		label := ""
		if h%3 == 0 {
			label = fmt.Sprintf("%02dh", h)
		}
		ticks = append(ticks, plot.Tick{Value: float64(h), Label: label})
	}
	return ticks
}

func renderHeatmap(title string, grid *heatGrid, f Field, lo, hi float64, base *chartBase) ([]byte, error) {
	if hi <= lo {
		lo, hi = lo-0.5, hi+0.5
	}
	cmap := moreland.ExtendedBlackBody()
	cmap.SetMin(lo)
	cmap.SetMax(hi)
	p := newPlot(title)
	hm := plotter.NewHeatMap(grid, cmap.Palette(256))
	hm.Min, hm.Max = lo, hi
	hm.NaN = chartBackground
	p.Add(hm)
	p.X.Tick.Marker = hourTicks{}
	p.Y.Tick.Marker = rowTicks(grid.labels)
	p.X.Label.Text = zoneLabel(base.loc, base.from)
	p.X.Min, p.X.Max = -0.5, 23.5
	p.Y.Min, p.Y.Max = float64(grid.rows)-0.5, -0.5 // first row on top
	if grid.rows > 1 {
		p.Y.Min, p.Y.Max = -0.5, float64(grid.rows)-0.5
		p.Y.Scale = invertedScale{}
	}

	// The color bar in the right margin, with the field's units.
	bar := plot.New()
	bar.BackgroundColor = chartBackground
	styleAxis(&bar.Y)
	bar.HideX()
	bar.Y.Label.Text = prettyUnits(f.Units)
	bar.Add(&plotter.ColorBar{ColorMap: cmap, Vertical: true, Colors: 256})
	side := &sidePanel{width: vg.Points(70), draw: func(c draw.Canvas) {
		top := titleHeight(p) + vg.Points(6)
		bar.Draw(draw.Crop(c, vg.Points(10), -vg.Points(6), vg.Points(36), -top))
	}}
	return renderPNG(p, side)
}

// invertedScale puts the first row at the top.
type invertedScale struct{}

func (invertedScale) Normalize(min, max, x float64) float64 {
	return 1 - (x-min)/(max-min)
}