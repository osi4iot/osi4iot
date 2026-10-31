// sensor_history is the MCP server that gives a digital twin's AI agents
// the historical data of the sensors of its group, stored in the IoT DB
// (patroni_metrics): which sensors there are and what they measure,
// statistics over a time range, the history (aggregated by intervals, or
// the raw values) and the last messages.
//
// Usage: OSI4IOT_AGENTDATA_TOKEN=… sensor_history
//
//	--data_url http://127.0.0.1:7072/v1/agentdata --group_id 1 --digital_twin_id 5
//
// pipelines starts it (nodes/aiAgentNode.go) with a token valid for this
// digital twin only. It reads through pipelines' agent data endpoint
// (package agentdata), which bounds every query to the digital twin's
// group: it gets no database credentials.
package main

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"pipelines/agentdata/client"
)

type field struct {
	Name  string `json:"name"`
	Label string `json:"label"`
	Units string `json:"units"`
}

type sensor struct {
	Uid              string  `json:"uid"`
	Ref              string  `json:"ref"`
	Description      string  `json:"description"`
	Type             string  `json:"type"`
	AssetUid         string  `json:"asset_uid"`
	AssetDescription string  `json:"asset_description"`
	OfDigitalTwin    bool    `json:"of_digital_twin"`
	Fields           []field `json:"fields"`
}

type asset struct {
	Uid         string `json:"uid"`
	Description string `json:"description"`
	Type        string `json:"type"`
}

func (a asset) title() string {
	t := a.Uid
	if a.Description != "" {
		t += " — " + a.Description
	}
	if a.Type != "" {
		t += " (" + a.Type + ")"
	}
	return t
}

type point struct {
	Time  time.Time `json:"time"`
	Value float64   `json:"value"`
}

type tools struct {
	c *client.Client
}

const timesNote = "Times are UTC."

func main() {
	t := &tools{c: client.FromFlags()}

	s := server.NewMCPServer(
		"sensor_history",
		"1.0.0",
		server.WithToolCapabilities(true),
		server.WithInstructions("Historical data of the sensors of the digital twin's group, from the IoT database. "+
			"Call list-sensors first to know the sensors and their fields."),
	)

	sensorArg := mcp.WithString("sensor", mcp.Description(
		"The sensor: its uid (unique), ref or description, as list-sensors shows them. A ref or description "+
			"may repeat on several assets: then give 'asset' too, or the uid. May be left out when the asset "+
			"has only one sensor"))
	assetArg := mcp.WithString("asset", mcp.Description(
		"The asset of the sensor: 'current' for the digital twin's own asset, or another asset's uid "+
			"(unique; its description only when no other asset has it), as list-sensors shows them. "+
			"Default: any asset of the group, the digital twin's first"))
	fieldArg := mcp.WithString("field", mcp.Description(
		"The measured field: its name (temperature, accelerations[1]) or label (Ay), as list-sensors shows them. "+
			"May be left out when the sensor measures only one"))
	fromArg := mcp.WithString("from", mcp.Description(
		"Start of the range: relative (now-24h, now-7d, now/d = today 00:00 UTC) or absolute (2026-10-30T08:00:00Z). Default now-24h"))
	toArg := mcp.WithString("to", mcp.Description("End of the range, same formats. Default now"))

	s.AddTool(mcp.NewTool("list-sensors",
		mcp.WithDescription("List the sensors of the digital twin's group: ref, uid, description, type, asset, and "+
			"the fields each one measures with their label and units. It says which asset is the digital "+
			"twin's own; its sensors come first, then those of the other assets of the group, each with its "+
			"asset's uid. Call it before the other tools."),
	), t.listSensors)

	s.AddTool(mcp.NewTool("sensor-statistics",
		mcp.WithDescription("Statistics of a sensor's field over a time range: number of values, minimum and "+
			"maximum (with when they happened), average, first and last value. Use it for questions like "+
			"'what was the maximum temperature yesterday' or 'the average load this week'."),
		sensorArg, assetArg, fieldArg, fromArg, toArg,
	), t.statistics)

	s.AddTool(mcp.NewTool("sensor-history",
		mcp.WithDescription("The evolution of a sensor's field over a time range, aggregated by intervals "+
			"(average, minimum, maximum and count per interval) or as raw values. Use it to describe trends, "+
			"find when something happened or compare periods. Prefer sensor-statistics for a single number."),
		sensorArg, assetArg, fieldArg, fromArg, toArg,
		mcp.WithString("interval", mcp.Description(
			"Aggregation interval: auto (default, about 120 intervals), or e.g. 1m, 15m, 1h, 1d, 1w; "+
				"'raw' for the values as they were measured (the last ones of the range)")),
		mcp.WithNumber("limit", mcp.Description("With interval=raw, how many values (default 200, at most 1000)")),
	), t.history)

	s.AddTool(mcp.NewTool("latest-values",
		mcp.WithDescription("The last messages of a sensor, with all their fields: its current or most recent values."),
		sensorArg, assetArg,
		mcp.WithNumber("count", mcp.Description("How many messages (default 1, at most 50)")),
	), t.latest)

	if err := server.ServeStdio(s); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func (s sensor) title() string {
	t := s.Ref
	if s.Description != "" {
		t += " — " + s.Description
	}
	return t
}

func (f field) title() string {
	t := f.Name
	if f.Label != "" && f.Label != f.Name {
		t += " (" + f.Label + ")"
	}
	return t
}

func (f field) unit() string {
	if f.Units == "" {
		return ""
	}
	return " " + f.Units
}

func (t *tools) listSensors(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	var out struct {
		DigitalTwinAsset *asset   `json:"digital_twin_asset"`
		Sensors          []sensor `json:"sensors"`
	}
	if err := t.c.Call(ctx, "sensors", nil, &out); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	if out.DigitalTwinAsset != nil {
		fmt.Fprintf(&b, "This digital twin's asset: %s. Other assets of the group are named by their uid.\n", out.DigitalTwinAsset.title())
	} else {
		b.WriteString("This digital twin has no asset in the group.\n")
	}
	if len(out.Sensors) == 0 {
		b.WriteString("The group has no sensors.\n")
		return mcp.NewToolResultText(b.String()), nil
	}
	for _, s := range out.Sensors {
		fmt.Fprintf(&b, "- %s [uid %s]", s.title(), s.Uid)
		if s.Type != "" {
			fmt.Fprintf(&b, ", type %s", s.Type)
		}
		if s.OfDigitalTwin {
			fmt.Fprintf(&b, ", asset %s [this digital twin's]", s.AssetUid)
		} else {
			fmt.Fprintf(&b, ", asset %s", s.AssetUid)
			if s.AssetDescription != "" {
				fmt.Fprintf(&b, " (%s)", s.AssetDescription)
			}
			b.WriteString(" [another asset of the group]")
		}
		b.WriteString("\n  fields: ")
		if len(s.Fields) == 0 {
			b.WriteString("not described (name the field of its messages)")
		}
		for i, f := range s.Fields {
			if i > 0 {
				b.WriteString("; ")
			}
			b.WriteString(f.title())
			if f.Units != "" {
				b.WriteString(", " + f.Units)
			}
		}
		b.WriteString("\n")
	}
	return mcp.NewToolResultText(b.String()), nil
}

func rangeArgs(args map[string]any) map[string]any {
	return map[string]any{
		"sensor": client.String(args, "sensor"),
		"asset":  client.String(args, "asset"),
		"field":  client.String(args, "field"),
		"from":   client.String(args, "from"),
		"to":     client.String(args, "to"),
	}
}

func (s sensor) assetNote() string {
	if s.OfDigitalTwin {
		return "asset " + s.AssetUid + " (this digital twin's)"
	}
	return "asset " + s.AssetUid + " (another asset of the group)"
}

func header(b *strings.Builder, s sensor, f field, from, to time.Time) {
	fmt.Fprintf(b, "%s [uid %s], field %s, %s\nRange: %s to %s. %s\n", s.title(), s.Uid, f.title(), s.assetNote(), client.Time(from), client.Time(to), timesNote)
}

func (t *tools) statistics(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	var out struct {
		Sensor     sensor    `json:"sensor"`
		Field      field     `json:"field"`
		From       time.Time `json:"from"`
		To         time.Time `json:"to"`
		Statistics struct {
			Count int64    `json:"count"`
			Avg   *float64 `json:"avg"`
			Min   *point   `json:"min"`
			Max   *point   `json:"max"`
			First *point   `json:"first"`
			Last  *point   `json:"last"`
		} `json:"statistics"`
	}
	if err := t.c.Call(ctx, "statistics", rangeArgs(req.GetArguments()), &out); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	header(&b, out.Sensor, out.Field, out.From, out.To)
	st := out.Statistics
	if st.Count == 0 {
		b.WriteString("No values in this range.\n")
		return mcp.NewToolResultText(b.String()), nil
	}
	u := out.Field.unit()
	fmt.Fprintf(&b, "Values: %d\n", st.Count)
	if st.Min != nil {
		fmt.Fprintf(&b, "Minimum: %s%s at %s\n", client.Num(st.Min.Value), u, client.Time(st.Min.Time))
	}
	if st.Max != nil {
		fmt.Fprintf(&b, "Maximum: %s%s at %s\n", client.Num(st.Max.Value), u, client.Time(st.Max.Time))
	}
	if st.Avg != nil {
		fmt.Fprintf(&b, "Average: %s%s\n", client.Num(*st.Avg), u)
	}
	if st.First != nil {
		fmt.Fprintf(&b, "First: %s%s at %s\n", client.Num(st.First.Value), u, client.Time(st.First.Time))
	}
	if st.Last != nil {
		fmt.Fprintf(&b, "Last: %s%s at %s\n", client.Num(st.Last.Value), u, client.Time(st.Last.Time))
	}
	return mcp.NewToolResultText(b.String()), nil
}

func (t *tools) history(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	call := rangeArgs(args)
	call["interval"] = client.String(args, "interval")
	call["limit"] = client.Int(args, "limit")

	var out struct {
		Sensor           sensor    `json:"sensor"`
		Field            field     `json:"field"`
		From             time.Time `json:"from"`
		To               time.Time `json:"to"`
		Interval         string    `json:"interval"`
		IntervalAdjusted bool      `json:"interval_adjusted"`
		Truncated        bool      `json:"truncated"`
		Points           []point   `json:"points"`
		Buckets          []struct {
			Time  time.Time `json:"time"`
			Avg   float64   `json:"avg"`
			Min   float64   `json:"min"`
			Max   float64   `json:"max"`
			Count int64     `json:"count"`
		} `json:"buckets"`
	}
	if err := t.c.Call(ctx, "history", call, &out); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	header(&b, out.Sensor, out.Field, out.From, out.To)
	units := ""
	if out.Field.Units != "" {
		units = " (" + out.Field.Units + ")"
	}

	if out.Interval == "raw" {
		if len(out.Points) == 0 {
			b.WriteString("No values in this range.\n")
			return mcp.NewToolResultText(b.String()), nil
		}
		if out.Truncated {
			fmt.Fprintf(&b, "Only the last %d values of the range (raise 'limit', or use an interval).\n", len(out.Points))
		}
		fmt.Fprintf(&b, "time | value%s\n", units)
		for _, p := range out.Points {
			fmt.Fprintf(&b, "%s | %s\n", client.Time(p.Time), client.Num(p.Value))
		}
		return mcp.NewToolResultText(b.String()), nil
	}

	if len(out.Buckets) == 0 {
		b.WriteString("No values in this range.\n")
		return mcp.NewToolResultText(b.String()), nil
	}
	fmt.Fprintf(&b, "Interval: %s", out.Interval)
	if out.IntervalAdjusted {
		b.WriteString(" (enlarged: the range had too many intervals)")
	}
	b.WriteString(". Intervals without values are not listed.\n")
	if out.Truncated {
		fmt.Fprintf(&b, "Only the first %d intervals: use a larger interval or a shorter range.\n", len(out.Buckets))
	}
	fmt.Fprintf(&b, "interval start | avg | min | max%s | count\n", units)
	for _, k := range out.Buckets {
		fmt.Fprintf(&b, "%s | %s | %s | %s | %d\n", client.Time(k.Time), client.Num(k.Avg), client.Num(k.Min), client.Num(k.Max), k.Count)
	}
	return mcp.NewToolResultText(b.String()), nil
}

func (t *tools) latest(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	var out struct {
		Sensor   sensor `json:"sensor"`
		Messages []struct {
			Time    time.Time      `json:"time"`
			Payload map[string]any `json:"payload"`
		} `json:"messages"`
	}
	call := map[string]any{"sensor": client.String(args, "sensor"), "asset": client.String(args, "asset"), "limit": client.Int(args, "count")}
	if err := t.c.Call(ctx, "latest", call, &out); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%s [uid %s], %s. %s\n", out.Sensor.title(), out.Sensor.Uid, out.Sensor.assetNote(), timesNote)
	if len(out.Messages) == 0 {
		b.WriteString("It has no messages.\n")
		return mcp.NewToolResultText(b.String()), nil
	}
	described := map[string]field{}
	for _, f := range out.Sensor.Fields {
		described[f.Name] = f
	}
	for _, m := range out.Messages {
		fmt.Fprintf(&b, "%s:", client.Time(m.Time))
		keys := make([]string, 0, len(m.Payload))
		for k := range m.Payload {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			b.WriteString(" ")
			b.WriteString(formatValue(k, m.Payload[k], described))
			b.WriteString(";")
		}
		b.WriteString("\n")
	}
	return mcp.NewToolResultText(b.String()), nil
}

// formatValue writes a field of a message with the label and units of
// the sensor's measurements (each item, for an array).
func formatValue(key string, v any, described map[string]field) string {
	one := func(name string, v any) string {
		f, ok := described[name]
		val, unit := fmt.Sprint(v), ""
		if n, isNum := v.(float64); isNum {
			val, unit = client.Num(n), f.unit() // units only for numbers
		}
		if !ok {
			return fmt.Sprintf("%s = %s", name, val)
		}
		return fmt.Sprintf("%s = %s%s", f.title(), val, unit)
	}
	if items, ok := v.([]any); ok {
		parts := make([]string, 0, len(items))
		for i, it := range items {
			parts = append(parts, one(fmt.Sprintf("%s[%d]", key, i), it))
		}
		return strings.Join(parts, ", ")
	}
	return one(key, v)
}
