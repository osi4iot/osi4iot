package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"pipelines/agentdata/client"
)

// The chart tools. pipelines draws each chart (package agentdata) and keeps
// it for the agent's answer, which shows it below its text; the tool tells
// the agent the chart's id and a summary of the values to comment on.

const chartsNote = "Several charts may go in one answer (at most 4)."

func registerChartTools(s *server.MCPServer, t *tools, sensorArg, assetArg, fieldArg, fromArg, toArg mcp.ToolOption) {
	titleArg := mcp.WithString("title", mcp.Description(
		"Title of the chart, in the user's language, with what and when (e.g. 'Aceleración Az – últimos 5 minutos'). "+
			"Default: the sensor's description"))
	tzArg := mcp.WithString("timezone", mcp.Description(
		"Time zone of the times: an IANA name (Europe/Madrid, America/Bogota, UTC). Default: the platform's; "+
			"give the user's when you know it"))
	fieldsArg := mcp.WithArray("fields", mcp.WithStringItems(), mcp.Description(
		"The fields to draw (names or labels, as list-sensors shows them). Default: the one in 'field', or all the sensor's"))

	s.AddTool(mcp.NewTool("sensor-chart",
		mcp.WithDescription("Draw the evolution of one or several fields of a sensor over a time range: the average per "+
			"interval as a line, the minimum-maximum range as a band. Can draw limits (thresholds) and count how many "+
			"values crossed each one, and marks the maximum and minimum. Use it to show how values evolved, a trend, "+
			"or whether a limit was crossed. Several fields of the same sensor (Ax, Ay, Az) go in one chart. "+chartsNote),
		sensorArg, assetArg, fieldsArg, fieldArg, fromArg, toArg,
		mcp.WithString("interval", mcp.Description("auto (default): each value as measured when the range has few "+
			"(up to 600), else about 300 intervals; raw: each value (few only); or an interval, e.g. 100ms, 10s, 1m, 1h, 1d")),
		mcp.WithString("statistic", mcp.Description("The line of each interval: avg (default) or rms (root mean square, "+
			"the level of a vibration or of an alternating signal)")),
		mcp.WithArray("thresholds", mcp.Items(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"value": map[string]any{"type": "number", "description": "The limit, in the field's units"},
				"label": map[string]any{"type": "string", "description": "Its name, in the user's language (Aviso, Alarma)"},
			},
			"required": []string{"value"},
		}), mcp.Description("Limits to draw as dashed lines, from the least to the most severe (at most 4); the answer "+
			"says how many values were above and below each one, and when the first and last were above")),
		mcp.WithBoolean("mark_extremes", mcp.Description("Mark the maximum and minimum with their values. Default: with a single field")),
		titleArg, tzArg,
	), t.chart)

	s.AddTool(mcp.NewTool("sensor-spectrum",
		mcp.WithDescription("Frequency spectrum (power spectral density, Welch's method) of one to three fields of a sensor "+
			"over a time range, with its peaks: natural frequencies of a structure, rotation of a machine, vibrations. "+
			"The answer gives the sampling rate, the resolution and, per field, the peaks (frequency, PSD, prominence, "+
			"-3 dB bandwidth and damping ratio estimate) and the RMS in the band. Frequencies above half the sampling "+
			"rate cannot be seen. Needs a continuous range of raw values: minutes for vibrations of a few Hz, longer "+
			"for slow phenomena. "+chartsNote),
		sensorArg, assetArg, fieldsArg, fieldArg, fromArg, toArg,
		mcp.WithNumber("freq_min", mcp.Description("Lowest frequency drawn and searched for peaks (Hz). Default 0")),
		mcp.WithNumber("freq_max", mcp.Description("Highest frequency (Hz). Default: half the sampling rate")),
		mcp.WithNumber("resolution", mcp.Description("Frequency resolution wanted (Hz): finer needs longer ranges. Default: about 8 windows of the data")),
		mcp.WithBoolean("log_scale", mcp.Description("Logarithmic PSD axis (default true)")),
		titleArg, tzArg,
	), t.spectrum)

	s.AddTool(mcp.NewTool("sensor-distribution",
		mcp.WithDescription("Distribution of the values of one field of a sensor over a time range. kind histogram (default): "+
			"how many values fall in each range of values, with the median and the 5 % and 95 % percentiles; use it for "+
			"'how are the values distributed', 'how often is it above X', 'what is the usual range'. kind boxplot: a box "+
			"per period (hour, day, week…) with quartiles, median, 5-95 % whiskers and the extremes as dots; use it to "+
			"compare the spread between periods. Quantiles and counts are computed over all the values. "+chartsNote),
		sensorArg, assetArg, fieldArg, fromArg, toArg,
		mcp.WithString("kind", mcp.Description("histogram (default) or boxplot")),
		mcp.WithNumber("bins", mcp.Description("Histogram: number of bars (default: chosen from the data)")),
		mcp.WithString("period", mcp.Description("Box plot: period of each box, e.g. 1h, 1d, 1w (default: about 24 boxes)")),
		titleArg, tzArg,
	), t.distribution)

	s.AddTool(mcp.NewTool("sensor-correlation",
		mcp.WithDescription("Scatter plot of one variable against another, with the least-squares line, its equation, R² and "+
			"Pearson's r. Two fields of the same sensor are paired message by message (e.g. load and strain); a field of "+
			"another sensor (y_sensor) is paired by the averages of each interval. Use it for 'does X depend on Y', "+
			"'relation between', 'correlation'. "+chartsNote),
		sensorArg, assetArg,
		mcp.WithString("field", mcp.Required(), mcp.Description("The x variable: a field of 'sensor'")),
		mcp.WithString("y_field", mcp.Required(), mcp.Description("The y variable: a field of y_sensor (default: of the same sensor)")),
		mcp.WithString("y_sensor", mcp.Description("The y variable's sensor, when it is another one (uid, ref or description)")),
		mcp.WithString("y_asset", mcp.Description("The y sensor's asset, like 'asset'")),
		fromArg, toArg,
		mcp.WithString("interval", mcp.Description("Two sensors: interval of the averages that are paired (default auto)")),
		titleArg, tzArg,
	), t.correlation)

	s.AddTool(mcp.NewTool("sensor-comparison",
		mcp.WithDescription("Bar chart to compare values. kind periods (default): a statistic of one field of a sensor per "+
			"period (maximum per day, average per hour, total per week), periods in the chart's time zone. kind sensors: "+
			"the statistic of the same field over the range in several sensors of the group (e.g. the temperature of "+
			"every pump), sorted from the highest; 'sensors' names them, or every sensor with that field is taken (of "+
			"'asset' if given). "+chartsNote),
		mcp.WithString("kind", mcp.Description("periods (default) or sensors")),
		sensorArg, assetArg, fieldArg, fromArg, toArg,
		mcp.WithString("statistic", mcp.Description("avg (default), max, min, sum or count")),
		mcp.WithString("period", mcp.Description("kind periods: the period of each bar, e.g. 1h, 1d, 1w (default: about 24 bars, at most 31)")),
		mcp.WithArray("sensors", mcp.WithStringItems(), mcp.Description("kind sensors: the sensors to compare (uids, refs or descriptions), at most 20")),
		titleArg, tzArg,
	), t.comparison)

	s.AddTool(mcp.NewTool("sensor-heatmap",
		mcp.WithDescription("Heat map of the average of one field of a sensor per hour of the day (columns) and day of the week "+
			"(layout weekday) or date (layout day), in the chart's time zone: daily and weekly patterns over weeks or "+
			"months (when it is hottest, the busiest hours). The answer gives the highest and lowest cells. "+chartsNote),
		sensorArg, assetArg, fieldArg, fromArg, toArg,
		mcp.WithString("layout", mcp.Description("weekday (default; up to a year) or day (a row per date, up to 62 days)")),
		titleArg, tzArg,
	), t.heatmap)
}

// chartCall reads the arguments every chart tool passes on.
func chartCall(req mcp.CallToolRequest, extra ...string) map[string]any {
	args := req.GetArguments()
	call := rangeArgs(args)
	call["title"] = client.String(args, "title")
	call["timezone"] = client.String(args, "timezone")
	if fields := req.GetStringSlice("fields", nil); len(fields) > 0 {
		call["fields"] = fields
	}
	for _, k := range extra {
		if v, ok := args[k]; ok && v != nil {
			call[k] = v
		}
	}
	return call
}

// chartHeader is the first lines of every chart tool's answer.
func chartHeader(b *strings.Builder, out map[string]any) {
	fmt.Fprintf(b, "Chart %q drawn. Chart id: %s\n", str(out["title"]), str(out["chart_id"]))
	if sn, ok := out["sensor"].(map[string]any); ok {
		fmt.Fprintf(b, "Sensor: %s [uid %s]%s\n", sensorName(sn), str(sn["uid"]), assetOf(sn))
	}
	if out["from"] != nil {
		fmt.Fprintf(b, "Range: %s to %s (time zone %s)\n", str(out["from"]), str(out["to"]), str(out["timezone"]))
	}
}

func chartFooter(b *strings.Builder, out map[string]any) *mcp.CallToolResult {
	if n := str(out["note"]); n != "" {
		b.WriteString(n);b.WriteString("\n")
	}
	return mcp.NewToolResultText(b.String())
}

func (t *tools) chart(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	call := chartCall(req, "thresholds", "mark_extremes", "statistic")
	call["interval"] = client.String(req.GetArguments(), "interval")
	z := client.ZoneOf(req.GetArguments())
	var out map[string]any
	if err := t.c.Call(ctx, "chart", call, &out); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	chartHeader(&b, out)
	fmt.Fprintf(&b, "Drawn: %s.\n", str(out["drawn"]))
	for _, sr := range list(out["series"]) {
		f := obj(sr["field"])
		u := units(f)
		fmt.Fprintf(&b, "- %s: %s values", fieldName(f), num(sr["count"]))
		if sr["min"] != nil {
			fmt.Fprintf(&b, ", minimum %s%s", num(sr["min"]), u)
			if sr["min_at"] != nil {
				fmt.Fprintf(&b, " at %s", when(sr["min_at"], z))
			}
		}
		if sr["max"] != nil {
			fmt.Fprintf(&b, ", maximum %s%s", num(sr["max"]), u)
			if sr["max_at"] != nil {
				fmt.Fprintf(&b, " at %s", when(sr["max_at"], z))
			}
		}
		if sr["avg"] != nil {
			fmt.Fprintf(&b, ", average %s%s", num(sr["avg"]), u)
		}
		if sr["rms"] != nil {
			fmt.Fprintf(&b, ", RMS %s%s", num(sr["rms"]), u)
		}
		b.WriteString("\n")
		for _, ex := range list(sr["exceedances"]) {
			fmt.Fprintf(&b, "  threshold %s%s: %s values above, %s below", num(ex["threshold"]), u, num(ex["above"]), num(ex["below"]))
			if ex["first_above"] != nil {
				fmt.Fprintf(&b, "; first above at %s, last at %s", when(ex["first_above"], z), when(ex["last_above"], z))
			}
			b.WriteString("\n")
		}
	}
	b.WriteString(z.Note())
	b.WriteString("\n")
	return chartFooter(&b, out), nil
}

func (t *tools) spectrum(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	call := chartCall(req, "freq_min", "freq_max", "resolution", "log_scale")
	var out map[string]any
	if err := t.c.Call(ctx, "spectrum", call, &out); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	chartHeader(&b, out)
	band := list64(out["band_hz"])
	fmt.Fprintf(&b, "Sampling rate %s Hz (Nyquist %s Hz); band %s–%s Hz", num(out["sampling_rate_hz"]), num(out["nyquist_hz"]), num(band[0]), num(band[1]))
	if out["band_clipped_to_nyquist"] == true {
		b.WriteString(" (cut at the Nyquist frequency)")
	}
	fmt.Fprintf(&b, "; resolution %s Hz; %s windows of %s s", num(out["resolution_hz"]), num(out["windows"]), num(out["window_s"]))
	if p, _ := out["pieces"].(float64); p > 1 {
		fmt.Fprintf(&b, " in %s pieces (the data have gaps)", num(p))
	}
	b.WriteString(".\n")
	if out["truncated"] == true {
		b.WriteString("Only the last values of the range were used (too many): use a shorter range.\n")
	}
	for _, sf := range list(out["fields"]) {
		f := obj(sf["field"])
		fmt.Fprintf(&b, "- %s: %s samples, RMS in the band %s%s\n", fieldName(f), num(sf["samples"]), num(sf["rms"]), units(f))
		peaks := list(sf["peaks"])
		if len(peaks) == 0 {
			b.WriteString("  no clear peaks\n")
		}
		for _, p := range peaks {
			fmt.Fprintf(&b, "  peak %s Hz: PSD %s, prominence %s dB", num(p["freq_hz"]), num(p["psd"]), num(p["prominence_db"]))
			if bw, _ := p["bandwidth_hz"].(float64); bw > 0 {
				fmt.Fprintf(&b, ", -3 dB bandwidth %s Hz, damping ratio ≈ %s", num(bw), num(p["zeta"]))
			}
			b.WriteString("\n")
		}
	}
	b.WriteString("The damping ratio from the bandwidth is only an estimate: the window widens narrow peaks (more so with a coarse resolution).\n")
	return chartFooter(&b, out), nil
}

func (t *tools) distribution(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	call := chartCall(req, "kind", "bins", "period")
	z := client.ZoneOf(req.GetArguments())
	var out map[string]any
	if err := t.c.Call(ctx, "distribution", call, &out); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	chartHeader(&b, out)
	f := obj(out["field"])
	u := units(f)
	fmt.Fprintf(&b, "Field %s.\n", fieldName(f))
	if out["kind"] == "boxplot" {
		fmt.Fprintf(&b, "A box per %s: start | count | min | 5 %% | Q1 | median | Q3 | 95 %% | max (%s)\n", str(out["period"]), strings.TrimSpace(u))
		for _, q := range list(out["boxes"]) {
			fmt.Fprintf(&b, "%s | %s | %s | %s | %s | %s | %s | %s | %s\n", when(q["time"], z), num(q["count"]), num(q["min"]), num(q["p05"]),
				num(q["q1"]), num(q["median"]), num(q["q3"]), num(q["p95"]), num(q["max"]))
		}
		return chartFooter(&b, out), nil
	}
	q := obj(out["statistics"])
	fmt.Fprintf(&b, "Values %s: minimum %s, 5 %% %s, Q1 %s, median %s, Q3 %s, 95 %% %s, maximum %s; average %s, standard deviation %s%s\n",
		num(q["count"]), num(q["min"]), num(q["p05"]), num(q["q1"]), num(q["median"]), num(q["q3"]), num(q["p95"]), num(q["max"]),
		num(q["avg"]), num(q["std_dev"]), u)
	r := list64(out["most_frequent_range"])
	fmt.Fprintf(&b, "%s bars of %s%s; the most frequent range is %s–%s%s (%s values).\n", num(out["bins"]), num(out["bin_width"]), u,
		num(r[0]), num(r[1]), u, num(out["most_frequent_count"]))
	return chartFooter(&b, out), nil
}

func (t *tools) correlation(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	call := chartCall(req, "y_field", "y_sensor", "y_asset")
	call["interval"] = client.String(args, "interval")
	var out map[string]any
	if err := t.c.Call(ctx, "correlation", call, &out); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	chartHeader(&b, out)
	x, y := obj(out["x"]), obj(out["y"])
	fmt.Fprintf(&b, "x: %s of %s; y: %s of %s.\n", fieldName(obj(x["field"])), sensorName(obj(x["sensor"])),
		fieldName(obj(y["field"])), sensorName(obj(y["sensor"])))
	fmt.Fprintf(&b, "%s points, paired by %s", num(out["points"]), str(out["pairing"]))
	if out["interval"] != nil {
		fmt.Fprintf(&b, " of %s", str(out["interval"]))
	}
	b.WriteString(".\n")
	if reg, ok := out["regression"].(map[string]any); ok {
		fmt.Fprintf(&b, "Least squares: y = %s·x + %s; r = %s, R² = %s.\n", num(reg["slope"]), num(reg["intercept"]), num(reg["r"]), num(reg["r2"]))
	} else {
		fmt.Fprintf(&b, "Regression %s.\n", str(out["regression"]))
	}
	return chartFooter(&b, out), nil
}

func (t *tools) comparison(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	call := chartCall(req, "kind", "statistic", "period")
	if sensors := req.GetStringSlice("sensors", nil); len(sensors) > 0 {
		call["sensors"] = sensors
	}
	var out map[string]any
	if err := t.c.Call(ctx, "comparison", call, &out); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	chartHeader(&b, out)
	if out["kind"] == "sensors" {
		fmt.Fprintf(&b, "Statistic %s of each sensor over the range, highest first:\n", str(out["statistic"]))
		for _, bar := range list(out["bars"]) {
			sn := obj(bar["sensor"])
			fmt.Fprintf(&b, "- %s [uid %s]%s: %s (%s values)\n", str(bar["label"]), str(sn["uid"]), assetOf(sn), num(bar["value"]), num(bar["count"]))
		}
		return chartFooter(&b, out), nil
	}
	f := obj(out["field"])
	fmt.Fprintf(&b, "%s of %s per %s (period start | value | values):\n", str(out["statistic"]), fieldName(f), str(out["period"]))
	for _, bar := range list(out["bars"]) {
		fmt.Fprintf(&b, "%s | %s%s | %s\n", str(bar["label"]), num(bar["value"]), units(f), num(bar["count"]))
	}
	return chartFooter(&b, out), nil
}

func (t *tools) heatmap(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	call := chartCall(req, "layout")
	var out map[string]any
	if err := t.c.Call(ctx, "heatmap", call, &out); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	chartHeader(&b, out)
	f := obj(out["field"])
	u := units(f)
	fmt.Fprintf(&b, "Average of %s per hour and %s.\n", fieldName(f), map[bool]string{true: "date", false: "day of the week"}[out["layout"] == "day"])
	for _, k := range []string{"highest", "lowest"} {
		c := obj(out[k])
		fmt.Fprintf(&b, "%s: %s at %02.0f:00, %s%s\n", k, str(c["row"]), c["hour"], num(c["value"]), u)
	}
	return chartFooter(&b, out), nil
}

// ---- Reading the endpoint's JSON ----

// when writes a time of the endpoint's JSON (RFC 3339) in the zone.
func when(v any, z client.Zone) string {
	t, err := time.Parse(time.RFC3339Nano, str(v))
	if err != nil {
		return str(v)
	}
	return z.Time(t)
}

func str(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}

func num(v any) string {
	if f, ok := v.(float64); ok {
		return client.Num(f)
	}
	return str(v)
}

func obj(v any) map[string]any {
	m, _ := v.(map[string]any)
	if m == nil {
		return map[string]any{}
	}
	return m
}

func list(v any) []map[string]any {
	items, _ := v.([]any)
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, obj(it))
	}
	return out
}

func list64(v any) []float64 {
	items, _ := v.([]any)
	out := []float64{0, 0}
	for i := 0; i < len(items) && i < 2; i++ {
		out[i], _ = items[i].(float64)
	}
	return out
}

func fieldName(f map[string]any) string {
	n, l := str(f["name"]), str(f["label"])
	if l != "" && l != n {
		return n + " (" + l + ")"
	}
	return n
}

func units(f map[string]any) string {
	if u := str(f["units"]); u != "" {
		return " " + u
	}
	return ""
}

func sensorName(sn map[string]any) string {
	d := str(sn["description"])
	if d == "" {
		d = str(sn["ref"])
	}
	return d
}

func assetOf(sn map[string]any) string {
	if sn["of_digital_twin"] == true {
		return ", asset " + str(sn["asset_uid"]) + " (this digital twin's)"
	}
	if a := str(sn["asset_uid"]); a != "" {
		return ", asset " + a + " (another asset of the group)"
	}
	return ""
}
