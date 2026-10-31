// asset_state is the MCP server that gives a digital twin's AI agents the
// states of the assets of its group, as the AssetState nodes keep them in
// the IoT DB (patroni_metrics, iot_data.assetState): status, description
// of the state, its other fields and when it was last updated. An asset
// whose state was never set has the status "Unknown".
//
// Usage: OSI4IOT_AGENTDATA_TOKEN=… asset_state
//
//	--data_url http://127.0.0.1:7072/v1/agentdata --group_id 1 --digital_twin_id 5
//
// pipelines starts it (nodes/aiAgentNode.go) with a token valid for this
// digital twin only; it reads through pipelines' agent data endpoint
// (package agentdata), bounded to the digital twin's group. Read only.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"pipelines/agentdata/client"
)

type assetState struct {
	Uid              string         `json:"uid"`
	Description      string         `json:"description"`
	Type             string         `json:"type"`
	OfDigitalTwin    bool           `json:"of_digital_twin"`
	Status           string         `json:"status"`
	StateDescription string         `json:"state_description"`
	State            map[string]any `json:"state"`
	LastUpdated      *time.Time     `json:"last_updated"`
}

type tools struct {
	c *client.Client
}

func main() {
	t := &tools{c: client.FromFlags()}

	s := server.NewMCPServer(
		"asset_state",
		"1.0.0",
		server.WithToolCapabilities(true),
		server.WithInstructions("States of the assets of the digital twin's group (status, description, other "+
			"fields, last update), as the pipelines' AssetState nodes keep them."),
	)

	s.AddTool(mcp.NewTool("list-asset-states",
		mcp.WithDescription("List the assets of the digital twin's group with their state: status (e.g. OK, "+
			"Warning, Alarm, Unknown when never set), description of the state and last update. It says which "+
			"asset is the digital twin's own (it comes first); every asset is shown with its uid, which "+
			"identifies it without doubt. Use it for an overview, or to find assets in a given status."),
		mcp.WithString("status", mcp.Description("Only the assets with this status (any case); empty: all")),
	), t.list)

	s.AddTool(mcp.NewTool("get-asset-state",
		mcp.WithDescription("The full state of one asset: status, description and every other field the "+
			"pipelines stored, with the time of the last update."),
		mcp.WithString("asset", mcp.Description(
			"The asset: empty or 'current' for the digital twin's own; another asset's uid (unique), or its "+
				"description when no other asset has it, as list-asset-states shows them")),
	), t.get)

	if err := server.ServeStdio(s); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func (a assetState) title() string {
	t := a.Uid
	if a.Description != "" {
		t += " — " + a.Description
	}
	if a.Type != "" {
		t += " (" + a.Type + ")"
	}
	return t
}

func updated(t *time.Time) string {
	if t == nil {
		return "never set"
	}
	return client.Time(*t)
}

func (t *tools) states(ctx context.Context, asset string) ([]assetState, error) {
	var out struct {
		Assets []assetState `json:"assets"`
	}
	if err := t.c.Call(ctx, "asset_states", map[string]any{"asset": asset}, &out); err != nil {
		return nil, err
	}
	return out.Assets, nil
}

func (a assetState) whose() string {
	if a.OfDigitalTwin {
		return "this digital twin's asset"
	}
	return "another asset of the group"
}

func (t *tools) list(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	status := client.String(req.GetArguments(), "status")
	assets, err := t.states(ctx, "")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	for _, a := range assets {
		if a.OfDigitalTwin {
			fmt.Fprintf(&b, "This digital twin's asset: %s. Other assets are named by their uid.\n", a.title())
		}
	}
	n := 0
	for _, a := range assets {
		if status != "" && !strings.EqualFold(a.Status, status) {
			continue
		}
		n++
		fmt.Fprintf(&b, "- %s: %s", a.title(), a.Status)
		if a.StateDescription != "" {
			fmt.Fprintf(&b, ", %s", a.StateDescription)
		}
		if a.LastUpdated != nil {
			fmt.Fprintf(&b, " (updated %s)", updated(a.LastUpdated))
		} else {
			b.WriteString(" (never set)")
		}
		fmt.Fprintf(&b, " [%s]\n", a.whose())
	}
	if n == 0 {
		if status != "" {
			return mcp.NewToolResultText(fmt.Sprintf("No asset of the group has the status %q.", status)), nil
		}
		return mcp.NewToolResultText("The group has no assets."), nil
	}
	b.WriteString("Times are UTC.\n")
	return mcp.NewToolResultText(b.String()), nil
}

func (t *tools) get(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	asset := client.String(req.GetArguments(), "asset")
	if asset == "" {
		asset = "current"
	}
	assets, err := t.states(ctx, asset)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	for i, a := range assets {
		if i > 0 {
			b.WriteString("\n")
		}
		fmt.Fprintf(&b, "%s [%s]\nStatus: %s\nDescription: %s\nLast update: %s\n", a.title(), a.whose(), a.Status, a.StateDescription, updated(a.LastUpdated))
		keys := make([]string, 0, len(a.State))
		for k := range a.State {
			if k != "status" && k != "state_description" {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		if len(keys) > 0 {
			b.WriteString("Other fields:\n")
			for _, k := range keys {
				v, _ := json.Marshal(a.State[k])
				fmt.Fprintf(&b, "  %s: %s\n", k, v)
			}
		}
	}
	return mcp.NewToolResultText(b.String()), nil
}
