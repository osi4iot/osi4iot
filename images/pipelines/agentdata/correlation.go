package agentdata

import (
	"fmt"
	"math"
	"net/http"
	"strings"

	"gonum.org/v1/plot/plotter"
	"gonum.org/v1/plot/vg"
	"gonum.org/v1/plot/vg/draw"
)

// The relation between two variables (sensor-correlation): a scatter plot
// of one field against another with the least-squares line, its equation,
// R² and Pearson's r.
//   - Two fields of the same sensor: the pairs of each message (the last
//     maxScatterPoints of the range).
//   - Fields of two sensors: their averages per interval, paired by
//     interval (their messages do not share times).

const maxScatterPoints = 5000

// Regression is the least-squares line y = slope·x + intercept.
type Regression struct {
	Points    int     `json:"points"`
	Slope     float64 `json:"slope"`
	Intercept float64 `json:"intercept"`
	R         float64 `json:"r"`  // Pearson's correlation coefficient
	R2        float64 `json:"r2"` // coefficient of determination
}

func regression(xy plotter.XYs) (Regression, bool) {
	n := float64(len(xy))
	if len(xy) < 3 {
		return Regression{Points: len(xy)}, false
	}
	var mx, my float64
	for _, p := range xy {
		mx += p.X
		my += p.Y
	}
	mx /= n
	my /= n
	var sxx, syy, sxy float64
	for _, p := range xy {
		dx, dy := p.X-mx, p.Y-my
		sxx += dx * dx
		syy += dy * dy
		sxy += dx * dy
	}
	if sxx == 0 || syy == 0 {
		return Regression{Points: len(xy)}, false
	}
	r := sxy / math.Sqrt(sxx*syy)
	slope := sxy / sxx
	return Regression{Points: len(xy), Slope: slope, Intercept: my - slope*mx, R: r, R2: r * r}, true
}

func (s *Service) handleCorrelation(w http.ResponseWriter, r *http.Request) {
	c, base, ok := s.chartCall(w, r)
	if !ok {
		return
	}
	xField, err := resolveField(base.sensor, c.Field)
	if err != nil {
		writeError(w, http.StatusBadRequest, "x: "+err.Error())
		return
	}

	// The second variable: another field of the same sensor, or of another.
	ySensor := base.sensor
	same := strings.TrimSpace(c.YSensor) == "" && strings.TrimSpace(c.YAsset) == ""
	if !same {
		yc := *c
		yc.Sensor, yc.Asset = c.YSensor, c.YAsset
		if ySensor, err = s.callSensor(r.Context(), &yc); err != nil {
			writeError(w, http.StatusBadRequest, "y: "+err.Error())
			return
		}
		same = ySensor.Uid == base.sensor.Uid
	}
	yField, err := resolveField(ySensor, c.YField)
	if err != nil {
		writeError(w, http.StatusBadRequest, "y: "+err.Error())
		return
	}
	if same && yField.Name == xField.Name {
		writeError(w, http.StatusBadRequest, "x and y are the same field")
		return
	}

	var pts plotter.XYs
	pairing := "message"
	var interval string
	if same {
		rows, _, err := rawRows(r.Context(), s.db, c.groupUid, base.sensor, []Field{xField, yField}, base.from, base.to, maxScatterPoints)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, row := range rows {
			if row.Values[0] != nil && row.Values[1] != nil {
				pts = append(pts, plotter.XY{X: *row.Values[0], Y: *row.Values[1]})
			}
		}
	} else {
		d, _, err := chartInterval(c.Interval, base.from, base.to)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		xs, err := aggregatedHistoryN(r.Context(), s.db, c.groupUid, base.sensor, xField, base.from, base.to, d, maxScatterPoints)
		if err == nil {
			var ys []Bucket
			ys, err = aggregatedHistoryN(r.Context(), s.db, c.groupUid, ySensor, yField, base.from, base.to, d, maxScatterPoints)
			byTime := map[int64]float64{}
			for _, b := range ys {
				byTime[b.Time.Unix()] = b.Avg
			}
			for _, b := range xs {
				if y, ok := byTime[b.Time.Unix()]; ok {
					pts = append(pts, plotter.XY{X: b.Avg, Y: y})
				}
			}
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		pairing, interval = "interval average", HumanInterval(d)
	}
	if len(pts) == 0 {
		writeError(w, http.StatusNotFound, "no pairs of values in the range: there is nothing to draw")
		return
	}

	reg, fitted := regression(pts)
	xName := fieldLabel(xField, false)
	yName := fieldLabel(yField, false)
	if !same {
		xName = base.sensor.Description + " " + xName
		yName = ySensor.Description + " " + yName
	}
	title := chartTitle(c.Title, strings.TrimSpace(yName)+" vs "+strings.TrimSpace(xName))
	png, err := renderScatter(title, pts, xField, yField, reg, fitted)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "the chart could not be drawn: "+err.Error())
		return
	}
	out := base.answer(title)
	out["x"] = map[string]any{"sensor": base.sensor, "field": xField}
	out["y"] = map[string]any{"sensor": ySensor, "field": yField}
	out["pairing"] = pairing
	if interval != "" {
		out["interval"] = interval
	}
	out["points"] = len(pts)
	if fitted {
		out["regression"] = reg
	} else {
		out["regression"] = "not computed: too few points, or one variable is constant"
	}
	if err := s.saveChart(c, title, png, out); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func renderScatter(title string, pts plotter.XYs, xf, yf Field, reg Regression, fitted bool) ([]byte, error) {
	p := newPlot(title)
	p.X.Label.Text = fieldLabel(xf, true)
	p.Y.Label.Text = fieldLabel(yf, true)
	sc, err := plotter.NewScatter(pts)
	if err != nil {
		return nil, err
	}
	radius := vg.Points(2.2)
	alpha := uint8(0xb0)
	if len(pts) > 1000 {
		radius, alpha = vg.Points(1.6), 0x70
	}
	sc.GlyphStyle = draw.GlyphStyle{Color: withAlpha(paletteColor(0), alpha), Radius: radius, Shape: draw.CircleGlyph{}}
	p.Add(sc)

	xmin, xmax, ymin, ymax := plotter.XYRange(pts)
	var legend []legendEntry
	if fitted {
		line, err := plotter.NewLine(plotter.XYs{{X: xmin, Y: reg.Slope*xmin + reg.Intercept}, {X: xmax, Y: reg.Slope*xmax + reg.Intercept}})
		if err != nil {
			return nil, err
		}
		line.Color, line.Width = paletteColor(1), vg.Points(1.6)
		p.Add(line)
		legend = append(legend,
			legendEntry{fmt.Sprintf("y = %.4g·x %+.4g", reg.Slope, reg.Intercept), line},
			legendEntry{fmt.Sprintf("R² = %.3f", reg.R2), nil})
	}
	padX, padY := (xmax-xmin)*0.05, (ymax-ymin)*0.05
	if padX == 0 {
		padX = 1
	}
	if padY == 0 {
		padY = 1
	}
	p.X.Min, p.X.Max = xmin-padX, xmax+padX
	p.Y.Min, p.Y.Max = ymin-padY, ymax+padY
	return renderPNG(p, legendPanel(p, legend))
}