package agentdata

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"image/color"
	"strings"
	"sync"
	"time"
	_ "time/tzdata" // the charts' time zones, whatever the container has

	"gonum.org/v1/plot"
	"gonum.org/v1/plot/font"
	"gonum.org/v1/plot/plotter"
	"gonum.org/v1/plot/vg"
	"gonum.org/v1/plot/vg/draw"
	"gonum.org/v1/plot/vg/vgimg"

	"pipelines/common"
)

// What every chart of the sensor_history tools shares: the look (a dark
// theme like the chat's, 1200 x 600 pixels), the legend or color bar in a
// margin, the PNG, and the store where a chart waits to be sent with its
// answer. The tools give the agent the chart's id and a summary of the
// values, never the data nor the image; the AiAgent node then takes the
// images of the charts made for an answer (TakeChart) and sends them with
// it.

const (
	// chartTTL is how long a chart waits to be sent with its answer.
	chartTTL = 10 * time.Minute
	// maxStoredCharts bounds the charts waiting (the oldest go first).
	maxStoredCharts = 200

	chartWidth  = 8 * vg.Inch
	chartHeight = 4 * vg.Inch
	chartDPI    = 150 // 1200 x 600 pixels
)

var (
	chartBackground = color.NRGBA{R: 0x2b, G: 0x2b, B: 0x2b, A: 0xff}
	chartText       = color.NRGBA{R: 0xe6, G: 0xe6, B: 0xe6, A: 0xff}
	chartAxis       = color.NRGBA{R: 0x9a, G: 0x9a, B: 0x9a, A: 0xff}
	chartGrid       = color.NRGBA{R: 0xff, G: 0xff, B: 0xff, A: 0x22}
	chartWarning    = color.NRGBA{R: 0xf7, G: 0xb7, B: 0x31, A: 0xff}
	chartAlarm      = color.NRGBA{R: 0xff, G: 0x4d, B: 0x4d, A: 0xff}
	chartPalette    = []color.NRGBA{
		{R: 0x4c, G: 0x9b, B: 0xff, A: 0xff}, // blue
		{R: 0xff, G: 0x9f, B: 0x43, A: 0xff}, // orange
		{R: 0x2e, G: 0xd4, B: 0x7a, A: 0xff}, // green
		{R: 0xff, G: 0x6b, B: 0x9a, A: 0xff}, // pink
		{R: 0xb4, G: 0x8c, B: 0xff, A: 0xff}, // purple
		{R: 0xf7, G: 0xd1, B: 0x54, A: 0xff}, // yellow
	}
)

func paletteColor(i int) color.NRGBA { return chartPalette[i%len(chartPalette)] }

func withAlpha(c color.NRGBA, a uint8) color.NRGBA {
	c.A = a
	return c
}

// restyle gives a text the charts' font and color, keeping its alignment.
func restyle(ts *draw.TextStyle, size vg.Length) {
	ts.Color = chartText
	ts.Font = font.Font{Typeface: "Liberation", Variant: "Sans", Size: size}
}

func styleAxis(a *plot.Axis) {
	a.Color = chartAxis
	restyle(&a.Label.TextStyle, 11)
	a.Tick.Color = chartAxis
	restyle(&a.Tick.Label, 10)
	a.Padding = 4
}

// newPlot is a plot with the charts' look, its title and a grid.
func newPlot(title string) *plot.Plot {
	p := plot.New()
	p.BackgroundColor = chartBackground
	p.Title.Text = title
	restyle(&p.Title.TextStyle, 14)
	p.Title.Padding = 8
	styleAxis(&p.X)
	styleAxis(&p.Y)
	grid := plotter.NewGrid()
	grid.Vertical.Color = chartGrid
	grid.Horizontal.Color = chartGrid
	p.Add(grid)
	return p
}

// sidePanel is drawn in a margin on the right of the plot: a legend or a
// color bar.
type sidePanel struct {
	width vg.Length
	draw  func(c draw.Canvas)
}

// legendPanel puts a legend in the right margin, not over the data.
type legendEntry struct {
	label string
	thumb plot.Thumbnailer
}

func legendPanel(p *plot.Plot, entries []legendEntry) *sidePanel {
	if len(entries) == 0 {
		return nil
	}
	l := plot.NewLegend()
	restyle(&l.TextStyle, 10)
	l.Top, l.Left, l.Padding = true, true, 3
	width := vg.Length(0)
	for _, e := range entries {
		if e.thumb == nil {
			l.Add(e.label) // a line of text only
		} else {
			l.Add(e.label, e.thumb)
		}
		width = max(width, l.TextStyle.Rectangle(e.label).Max.X)
	}
	width += l.ThumbnailWidth + l.TextStyle.Rectangle(" ").Max.X + 12
	top := titleHeight(p) + 8
	return &sidePanel{width: width, draw: func(c draw.Canvas) {
		l.Draw(draw.Crop(c, 8, 0, 0, -top))
	}}
}

func titleHeight(p *plot.Plot) vg.Length {
	if p.Title.Text == "" {
		return 0
	}
	return p.Title.TextStyle.Rectangle(p.Title.Text).Size().Y + p.Title.Padding
}

// renderPNG draws the plot, and the side panel in the right margin, as a
// PNG of 1200 x 600 pixels.
func renderPNG(p *plot.Plot, side *sidePanel) ([]byte, error) {
	c := vgimg.NewWith(vgimg.UseWH(chartWidth, chartHeight), vgimg.UseDPI(chartDPI))
	dc := draw.New(c)
	dc.SetColor(chartBackground)
	dc.Fill(dc.Rectangle.Path())
	area := draw.Crop(dc, 0, -vg.Points(10), vg.Points(4), 0)
	if side != nil {
		area = draw.Crop(dc, 0, -side.width, vg.Points(4), 0)
		side.draw(draw.Crop(dc, dc.Max.X-side.width, 0, vg.Points(4), 0))
	}
	p.Draw(area)
	var buf bytes.Buffer
	if _, err := (vgimg.PngCanvas{Canvas: c}).WriteTo(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// prettyUnits writes the powers of the units as superscripts: m/s^2 → m/s².
var unitPowers = strings.NewReplacer("^-1", "⁻¹", "^-2", "⁻²", "^2", "²", "^3", "³", "^4", "⁴")

func prettyUnits(u string) string { return unitPowers.Replace(u) }

// fieldLabel is a field as a chart names it: its label, with its units
// when withUnits.
func fieldLabel(f Field, withUnits bool) string {
	l := f.Label
	if l == "" {
		l = f.Name
	}
	if withUnits && f.Units != "" {
		l += " (" + prettyUnits(f.Units) + ")"
	}
	return l
}

// commonUnits is the units of all the fields, "" when they differ.
func commonUnits(fields []Field) string {
	if len(fields) == 0 {
		return ""
	}
	u := fields[0].Units
	for _, f := range fields[1:] {
		if f.Units != u {
			return ""
		}
	}
	return u
}

func chartTitle(title, def string) string {
	title = strings.TrimSpace(title)
	if title == "" {
		title = def
	}
	if r := []rune(title); len(r) > 120 {
		title = string(r[:120])
	}
	return title
}

func utcOffset(t time.Time) string {
	_, off := t.Zone()
	if off == 0 {
		return ""
	}
	sign := "+"
	if off < 0 {
		sign, off = "-", -off
	}
	return fmt.Sprintf("%s%02d:%02d", sign, off/3600, off%3600/60)
}

// zoneLabel names the chart's time zone: its IANA name, or UTC±hh:mm for
// the container's own.
func zoneLabel(loc *time.Location, at time.Time) string {
	if loc == time.UTC {
		return "UTC"
	}
	if loc.String() == "Local" {
		return "UTC" + utcOffset(at.In(loc))
	}
	return loc.String()
}

// chartLocation is the call's time zone: pipelines passes the user's (or
// the group's); UTC when there is none.
func chartLocation(name string) (*time.Location, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return time.UTC, nil
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return nil, fmt.Errorf("unknown time zone %q: use an IANA name such as Europe/Madrid or UTC", name)
	}
	return loc, nil
}

// ---- The charts waiting for their answer ----

type storedChart struct {
	digitalTwinID int
	chart         common.ChatChart
	created       time.Time
}

type chartStore struct {
	mu    sync.Mutex
	items map[string]*storedChart
}

func newChartID() (string, error) {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "chart_" + hex.EncodeToString(b), nil
}

func (cs *chartStore) put(now time.Time, digitalTwinID int, chart common.ChatChart) (string, error) {
	id, err := newChartID()
	if err != nil {
		return "", err
	}
	chart.ID = id
	cs.mu.Lock()
	defer cs.mu.Unlock()
	if cs.items == nil {
		cs.items = map[string]*storedChart{}
	}
	var oldestID string
	var oldest time.Time
	for k, c := range cs.items {
		if now.Sub(c.created) > chartTTL {
			delete(cs.items, k)
			continue
		}
		if oldestID == "" || c.created.Before(oldest) {
			oldestID, oldest = k, c.created
		}
	}
	if len(cs.items) >= maxStoredCharts && oldestID != "" {
		delete(cs.items, oldestID)
	}
	cs.items[id] = &storedChart{digitalTwinID: digitalTwinID, chart: chart, created: now}
	return id, nil
}

// peek returns a chart of the digital twin, keeping it.
func (cs *chartStore) peek(now time.Time, digitalTwinID int, id string) (common.ChatChart, bool) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	c, ok := cs.items[id]
	if !ok || c.digitalTwinID != digitalTwinID || now.Sub(c.created) > chartTTL {
		return common.ChatChart{}, false
	}
	return c.chart, true
}

// take returns a chart of the digital twin and forgets it.
func (cs *chartStore) take(now time.Time, digitalTwinID int, id string) (common.ChatChart, bool) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	c, ok := cs.items[id]
	if !ok || c.digitalTwinID != digitalTwinID {
		return common.ChatChart{}, false
	}
	delete(cs.items, id)
	if now.Sub(c.created) > chartTTL {
		return common.ChatChart{}, false
	}
	return c.chart, true
}

// PeekChart gives a chart made for the digital twin without forgetting it:
// the node keeps it with the conversation before sending it (TakeChart).
func (s *Service) PeekChart(digitalTwinID int, id string) (common.ChatChart, bool) {
	return s.charts.peek(s.now(), digitalTwinID, id)
}

// TakeChart gives the AiAgent node a chart made for its digital twin (by
// the id the tool returned), once.
func (s *Service) TakeChart(digitalTwinID int, id string) (common.ChatChart, bool) {
	return s.charts.take(s.now(), digitalTwinID, id)
}

// chartNote is what every chart tool tells the agent about the image.
const chartNote = "The chart is drawn and will be shown with your answer, below its text. Comment on " +
	"what it shows; do not link it, describe how to open it or repeat its values in a table."

// saveChart keeps the PNG for the call's digital twin and adds to out what
// every chart answer has: its id, title and the note for the agent.
func (s *Service) saveChart(c *call, title string, png []byte, out map[string]any) error {
	id, err := s.charts.put(s.now(), c.DigitalTwinID, common.ChatChart{Title: title, MimeType: "image/png", Data: png})
	if err != nil {
		return err
	}
	out["chart_id"] = id
	out["title"] = title
	out["note"] = chartNote
	return nil
}
