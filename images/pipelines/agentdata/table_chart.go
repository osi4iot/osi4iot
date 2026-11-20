package agentdata

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"gonum.org/v1/plot"
	"gonum.org/v1/plot/plotter"
	"gonum.org/v1/plot/vg"
	"gonum.org/v1/plot/vg/draw"
)

// The charts of the tables attached to the chat (the chat_data MCP server): it queries the table with DuckDB and
// sends the result here, to be drawn as the other charts and shown with the answer.
//   - line, scatter: x numbers or dates (milliseconds), one to six y series (empty values: gaps)
//   - bar: categories, one to six series of bars side by side

const (
	maxTableChartBody   = 4 << 20
	maxTableChartPoints = 5000
	maxTableChartSeries = 6
	maxTableChartBars   = 60
)

type tableChartSeries struct {
	Name string     `json:"name"`
	Y    []*float64 `json:"y"`
}

type tableChartRequest struct {
	Request
	Kind       string             `json:"kind"`
	XLabel     string             `json:"x_label"`
	YLabel     string             `json:"y_label"`
	X          []float64          `json:"x"`
	XTime      bool               `json:"x_time"`
	Categories []string           `json:"categories"`
	Series     []tableChartSeries `json:"series"`
}

func (tc *tableChartRequest) check() error {
	if len(tc.Series) == 0 || len(tc.Series) > maxTableChartSeries {
		return fmt.Errorf("one to %d series", maxTableChartSeries)
	}
	n := len(tc.X)
	switch tc.Kind {
	case "line", "scatter":
		if n == 0 || n > maxTableChartPoints {
			return fmt.Errorf("one to %d points", maxTableChartPoints)
		}
		for _, x := range tc.X {
			if math.IsNaN(x) || math.IsInf(x, 0) {
				return errors.New("x is not a number")
			}
		}
	case "bar":
		n = len(tc.Categories)
		if n == 0 || n > maxTableChartBars {
			return fmt.Errorf("one to %d bars", maxTableChartBars)
		}
	default:
		return errors.New(`kind is "line", "scatter" or "bar"`)
	}
	for _, s := range tc.Series {
		if len(s.Y) != n {
			return fmt.Errorf("the series %q has %d values, not %d", s.Name, len(s.Y), n)
		}
		for _, y := range s.Y {
			if y != nil && (math.IsNaN(*y) || math.IsInf(*y, 0)) {
				return fmt.Errorf("the series %q has a value that is not a number", s.Name)
			}
		}
	}
	return nil
}

func (s *Service) handleTableChart(w http.ResponseWriter, r *http.Request) {
	var tc tableChartRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxTableChartBody)).Decode(&tc); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	c, ok := s.checkCall(w, tc.Request)
	if !ok {
		return
	}
	tc.Kind = strings.ToLower(strings.TrimSpace(tc.Kind))
	if err := tc.check(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	def := tc.YLabel
	if def == "" {
		def = tc.Series[0].Name
	}
	if tc.XLabel != "" && tc.Kind != "bar" {
		def += " vs " + tc.XLabel
	}
	title := chartTitle(tc.Title, def)
	png, err := renderTableChart(title, &tc)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "the chart could not be drawn: "+err.Error())
		return
	}
	out := map[string]any{}
	if err := s.saveChart(c, title, png, out); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func renderTableChart(title string, tc *tableChartRequest) ([]byte, error) {
	p := newPlot(title)
	p.X.Label.Text = prettyUnits(tc.XLabel)
	p.Y.Label.Text = prettyUnits(tc.YLabel)
	if tc.Kind == "bar" {
		return renderTableBars(p, tc)
	}
	xs := tc.X
	if tc.XTime { // milliseconds, as the table's dates are written (no time zone)
		xs = make([]float64, len(tc.X))
		for i, x := range tc.X {
			xs[i] = x / 1000
		}
		p.X.Tick.Marker = timeTicker{loc: time.UTC}
	}
	var legend []legendEntry
	yMin, yMax := math.Inf(1), math.Inf(-1)
	for i, s := range tc.Series {
		col := paletteColor(i)
		var thumb plot.Thumbnailer
		// the points with a value; a line breaks where a value is missing
		var seg plotter.XYs
		var segs []plotter.XYs
		for k, y := range s.Y {
			if y == nil {
				if len(seg) > 0 {
					segs = append(segs, seg)
					seg = nil
				}
				continue
			}
			seg = append(seg, plotter.XY{X: xs[k], Y: *y})
			yMin, yMax = math.Min(yMin, *y), math.Max(yMax, *y)
		}
		if len(seg) > 0 {
			segs = append(segs, seg)
		}
		for _, pts := range segs {
			if tc.Kind == "scatter" || len(pts) == 1 {
				sc, err := plotter.NewScatter(pts)
				if err != nil {
					return nil, err
				}
				radius, alpha := vg.Points(2.4), uint8(0xc0)
				if len(tc.X) > 1000 {
					radius, alpha = vg.Points(1.6), 0x80
				}
				sc.GlyphStyle = draw.GlyphStyle{Color: withAlpha(col, alpha), Radius: radius, Shape: draw.CircleGlyph{}}
				p.Add(sc)
				if tc.Kind == "scatter" {
					thumb = sc
				}
				continue
			}
			line, err := plotter.NewLine(pts)
			if err != nil {
				return nil, err
			}
			line.Color, line.Width = col, vg.Points(1.5)
			p.Add(line)
			thumb = line
		}
		if thumb != nil && len(tc.Series) > 1 {
			legend = append(legend, legendEntry{s.Name, thumb})
		}
	}
	if math.IsInf(yMin, 1) {
		return nil, errors.New("there are no values to draw")
	}
	xMin, xMax := math.Inf(1), math.Inf(-1)
	for _, x := range xs {
		xMin, xMax = math.Min(xMin, x), math.Max(xMax, x)
	}
	padX, padY := (xMax-xMin)*0.02, (yMax-yMin)*0.06
	if padX == 0 {
		padX = 1
	}
	if padY == 0 {
		padY = math.Max(1, math.Abs(yMax)*0.1)
	}
	p.X.Min, p.X.Max = xMin-padX, xMax+padX
	p.Y.Min, p.Y.Max = yMin-padY, yMax+padY
	return renderPNG(p, legendPanel(p, legend))
}

func renderTableBars(p *plot.Plot, tc *tableChartRequest) ([]byte, error) {
	n, k := len(tc.Categories), len(tc.Series)
	labels := make([]string, n)
	for i, c := range tc.Categories {
		labels[i] = c
		if r := []rune(c); len(r) > 28 {
			labels[i] = string(r[:27]) + "…"
		}
	}
	group := math.Max(4, math.Min(48, 640/float64(n)))
	width := vg.Points(group / float64(k))
	lo, hi := 0.0, 0.0
	var legend []legendEntry
	for i, s := range tc.Series {
		values := make(plotter.Values, n)
		for j, y := range s.Y {
			if y != nil {
				values[j] = *y
				lo, hi = math.Min(lo, *y), math.Max(hi, *y)
			}
		}
		bars, err := plotter.NewBarChart(values, width)
		if err != nil {
			return nil, err
		}
		bars.Color = withAlpha(paletteColor(i), 0xd0)
		bars.LineStyle.Width = 0
		bars.Offset = vg.Points((float64(i) - float64(k-1)/2) * group / float64(k))
		p.Add(bars)
		if k > 1 {
			legend = append(legend, legendEntry{s.Name, bars})
		}
	}
	p.NominalX(labels...)
	p.X.Min, p.X.Max = -0.7, float64(n)-0.3
	if n > 8 {
		p.X.Tick.Label.Rotation = math.Pi / 4
		p.X.Tick.Label.XAlign = draw.XRight
		p.X.Tick.Label.YAlign = draw.YCenter
	}
	pad := (hi - lo) * 0.08
	if pad == 0 {
		pad = 1
	}
	p.Y.Min, p.Y.Max = math.Min(0, lo-pad*boolFloat(lo < 0)), hi+pad*boolFloat(hi > 0)
	if p.Y.Max == 0 && lo == 0 {
		p.Y.Max = 1
	}
	return renderPNG(p, legendPanel(p, legend))
}
