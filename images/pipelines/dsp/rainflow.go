package dsp

// Rainflow cycle counting (ASTM E1049-85, section 5.4.4, three-point
// method), in one go (Rainflow) or incrementally over a stream
// (RainflowCounter, whose state is kept between messages), and the
// Palmgren-Miner damage of the cycles with an S-N curve.

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

// Cycle is a counted cycle: its range and mean, and Count 1 (a full cycle)
// or 0.5 (a half cycle).
type Cycle struct {
	Range float64 `json:"range"`
	Mean  float64 `json:"mean"`
	Count float64 `json:"count"`
}

// RainflowCounter counts cycles as samples arrive. Gate is the hysteresis:
// reversals smaller than it are ignored (noise); 0 keeps every reversal.
// Its fields are its state (exported so that it can be stored as JSON).
type RainflowCounter struct {
	Gate     float64   `json:"gate"`
	Started  bool      `json:"started"`
	Dir      int       `json:"dir"`      // +1 rising, -1 falling, 0 not yet known
	Cand     float64   `json:"cand"`     // the current extreme, not confirmed as a reversal yet
	Residue  []float64 `json:"residue"`  // reversals not closed into cycles yet
	MaxStack int       `json:"maxStack"` // cap of the residue (0: 10000)
	Dropped  int       `json:"dropped"`  // reversals dropped because of the cap
}

// Push adds samples and returns the cycles they closed.
func (c *RainflowCounter) Push(samples ...float64) []Cycle {
	var out []Cycle
	for _, x := range samples {
		if math.IsNaN(x) || math.IsInf(x, 0) {
			continue
		}
		if !c.Started {
			c.Started, c.Dir, c.Cand = true, 0, x
			c.Residue = append(c.Residue[:0], x)
			continue
		}
		switch c.Dir {
		case 0:
			start := c.Residue[0]
			if d := x - start; math.Abs(d) > 0 && math.Abs(d) >= c.Gate {
				c.Dir, c.Cand = sign(d), x
			}
		case 1:
			if x >= c.Cand {
				c.Cand = x
			} else if c.Cand-x > 0 && c.Cand-x >= c.Gate {
				out = c.reversal(c.Cand, out)
				c.Dir, c.Cand = -1, x
			}
		case -1:
			if x <= c.Cand {
				c.Cand = x
			} else if x-c.Cand > 0 && x-c.Cand >= c.Gate {
				out = c.reversal(c.Cand, out)
				c.Dir, c.Cand = 1, x
			}
		}
	}
	return out
}

// reversal adds a confirmed reversal and extracts the cycles it closes
// (ASTM E1049 5.4.4: X the latest range, Y the previous one; while X >= Y,
// Y is a cycle, or a half cycle if it contains the starting point).
func (c *RainflowCounter) reversal(v float64, out []Cycle) []Cycle {
	c.Residue = append(c.Residue, v)
	for len(c.Residue) >= 3 {
		n := len(c.Residue)
		x := math.Abs(c.Residue[n-1] - c.Residue[n-2])
		y := math.Abs(c.Residue[n-2] - c.Residue[n-3])
		if x < y {
			break
		}
		a, b := c.Residue[n-3], c.Residue[n-2]
		if n == 3 {
			out = append(out, Cycle{Range: y, Mean: (a + b) / 2, Count: 0.5})
			c.Residue = c.Residue[1:]
		} else {
			out = append(out, Cycle{Range: y, Mean: (a + b) / 2, Count: 1})
			c.Residue = append(c.Residue[:n-3], c.Residue[n-1])
		}
	}
	limit := c.MaxStack
	if limit <= 0 {
		limit = 10000
	}
	if len(c.Residue) > limit {
		drop := len(c.Residue) - limit
		c.Residue = append([]float64(nil), c.Residue[drop:]...)
		c.Dropped += drop
	}
	return out
}

// ResidueCycles are the half cycles of what is still open (the residue and
// the current extreme), as ASTM counts them at the end of a record.
func (c *RainflowCounter) ResidueCycles() []Cycle {
	points := append([]float64(nil), c.Residue...)
	if c.Dir != 0 {
		points = append(points, c.Cand)
	}
	var out []Cycle
	for i := 1; i < len(points); i++ {
		r := math.Abs(points[i] - points[i-1])
		if r > 0 {
			out = append(out, Cycle{Range: r, Mean: (points[i] + points[i-1]) / 2, Count: 0.5})
		}
	}
	return out
}

func sign(v float64) int {
	if v > 0 {
		return 1
	}
	return -1
}

// Rainflow counts the cycles of a whole record, the residue included as
// half cycles (as ASTM E1049).
func Rainflow(x []float64, gate float64) []Cycle {
	c := &RainflowCounter{Gate: gate}
	cycles := c.Push(x...)
	// the last extreme closes the record
	if c.Dir != 0 {
		cycles = c.reversal(c.Cand, cycles)
		c.Dir = 0
	}
	return append(cycles, c.ResidueCycles()...)
}

// ---- S-N curves and Miner's rule ----

// SNLine is one segment of an S-N curve: log10 N = LogA - M log10 S.
type SNLine struct {
	M    float64 `json:"m"`
	LogA float64 `json:"logA"`
}

// SNCurve is an S-N curve made of one or more lines (stress ranges in
// MPa, or in the units of the counted signal). The cycles to failure of a
// range are the largest of the lines' (for a two-slope curve, the steep
// line above the knee and the flat one below it). A range below Cutoff
// does no damage. The effective range is the counted one times SCF and,
// for thicknesses above TRef, (T/TRef)^K. DFF multiplies the damage.
type SNCurve struct {
	Name   string   `json:"name,omitempty"`
	Lines  []SNLine `json:"lines"`
	Cutoff float64  `json:"cutoff,omitempty"`
	SCF    float64  `json:"scf,omitempty"`  // 0: 1
	T      float64  `json:"t,omitempty"`    // thickness (mm); 0: no correction
	TRef   float64  `json:"tRef,omitempty"` // reference thickness (mm); 0: 25
	K      float64  `json:"k,omitempty"`    // thickness exponent
	DFF    float64  `json:"dff,omitempty"`  // design fatigue factor; 0: 1
}

// Validate reports every problem of the curve.
func (s SNCurve) Validate() error {
	var problems []string
	if len(s.Lines) == 0 {
		problems = append(problems, "the S-N curve needs at least one line (m, log a)")
	}
	for i, l := range s.Lines {
		if !(l.M > 0) {
			problems = append(problems, fmt.Sprintf("line %d: m must be positive", i+1))
		}
		if math.IsNaN(l.LogA) || math.IsInf(l.LogA, 0) {
			problems = append(problems, fmt.Sprintf("line %d: invalid log a", i+1))
		}
	}
	if s.Cutoff < 0 || s.SCF < 0 || s.T < 0 || s.TRef < 0 || s.K < 0 || s.DFF < 0 {
		problems = append(problems, "cutoff, SCF, thickness, exponent and DFF cannot be negative")
	}
	if len(problems) > 0 {
		return errors.New(strings.Join(problems, "; "))
	}
	return nil
}

// EffectiveRange is the range the curve is entered with (SCF and
// thickness correction applied).
func (s SNCurve) EffectiveRange(r float64) float64 {
	if s.SCF > 0 {
		r *= s.SCF
	}
	tRef := s.TRef
	if tRef <= 0 {
		tRef = 25
	}
	if s.T > tRef && s.K > 0 {
		r *= math.Pow(s.T/tRef, s.K)
	}
	return r
}

// CyclesToFailure of a counted range (+Inf when it does no damage).
func (s SNCurve) CyclesToFailure(r float64) float64 {
	r = s.EffectiveRange(r)
	if r <= 0 || r < s.Cutoff {
		return math.Inf(1)
	}
	logS := math.Log10(r)
	best := math.Inf(-1)
	for _, l := range s.Lines {
		best = math.Max(best, l.LogA-l.M*logS)
	}
	return math.Pow(10, best)
}

// Damage is the Palmgren-Miner damage of the cycles: sum of count / N,
// times DFF.
func (s SNCurve) Damage(cycles []Cycle) float64 {
	d := 0.0
	for _, c := range cycles {
		if n := s.CyclesToFailure(c.Range); !math.IsInf(n, 1) {
			d += c.Count / n
		}
	}
	if s.DFF > 0 {
		d *= s.DFF
	}
	return d
}

// RangeHistogram counts the cycles by range, in bins of the given width
// (bin i holds [i*width, (i+1)*width)). Only the non-empty bins.
type HistogramBin struct {
	From  float64 `json:"from"`
	To    float64 `json:"to"`
	Count float64 `json:"count"`
}

func RangeHistogram(cycles []Cycle, width float64) []HistogramBin {
	if width <= 0 {
		return nil
	}
	counts := map[int]float64{}
	for _, c := range cycles {
		counts[int(math.Floor(c.Range/width))] += c.Count
	}
	keys := make([]int, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Ints(keys)
	out := make([]HistogramBin, 0, len(keys))
	for _, k := range keys {
		out = append(out, HistogramBin{From: float64(k) * width, To: float64(k+1) * width, Count: counts[k]})
	}
	return out
}

// ---- DNV-RP-C203 S-N curves ----

// dnvAir: Table 2-1 (in air): m1 and log a1 for N <= 1e7, log a2 with m2 = 5
// for N > 1e7, and the thickness exponent k.
var dnvAir = []struct {
	name             string
	m1, loga1, loga2 float64
	k                float64
}{
	{"B1", 4, 15.117, 17.146, 0},
	{"B2", 4, 14.885, 16.856, 0},
	{"C", 3, 12.592, 16.320, 0.05},
	{"C1", 3, 12.449, 16.081, 0.10},
	{"C2", 3, 12.301, 15.835, 0.15},
	{"D", 3, 12.164, 15.606, 0.20},
	{"E", 3, 12.010, 15.350, 0.20},
	{"F", 3, 11.855, 15.091, 0.25},
	{"F1", 3, 11.699, 14.832, 0.25},
	{"F3", 3, 11.546, 14.576, 0.25},
	{"G", 3, 11.398, 14.330, 0.25},
	{"W1", 3, 11.261, 14.101, 0.25},
	{"W2", 3, 11.107, 13.845, 0.25},
	{"W3", 3, 10.970, 13.617, 0.25},
}

// DNVCurveNames are the categories of the DNV-RP-C203 presets.
func DNVCurveNames() []string {
	names := make([]string, len(dnvAir))
	for i, c := range dnvAir {
		names[i] = c.name
	}
	return names
}

// DNVCurve is a DNV-RP-C203 S-N curve: environment "air" (Table 2-1, knee at
// 1e7 cycles) or "seawater_cp" (seawater with cathodic protection, Table
// 2-2: log a1 lower by 0.2 for m1 = 4 and by 0.4 for m1 = 3, the same
// m2 = 5 line, knee at 1e6 cycles). Two-slope curves: no cutoff.
func DNVCurve(category, environment string) (SNCurve, error) {
	for _, c := range dnvAir {
		if !strings.EqualFold(c.name, category) {
			continue
		}
		loga1 := c.loga1
		switch environment {
		case "air":
		case "seawater_cp":
			if c.m1 == 4 {
				loga1 -= 0.2
			} else {
				loga1 -= 0.4
			}
		default:
			return SNCurve{}, fmt.Errorf("unknown environment %q (air or seawater_cp)", environment)
		}
		return SNCurve{
			Name:  fmt.Sprintf("DNV-RP-C203 %s (%s)", c.name, environment),
			Lines: []SNLine{{M: c.m1, LogA: round3(loga1)}, {M: 5, LogA: c.loga2}},
			K:     c.k,
		}, nil
	}
	return SNCurve{}, fmt.Errorf("unknown DNV-RP-C203 category %q", category)
}

func round3(v float64) float64 { return math.Round(v*1000) / 1000 }
