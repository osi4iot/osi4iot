// Package client is the side of the agents' sensor_history and asset_state
// MCP servers: it calls pipelines' agent data endpoint (package agentdata)
// with the digital twin's token, and holds what both servers share
// (their command line, number and time formats). Standard library only.
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// Client calls the endpoint for one digital twin.
type Client struct {
	URL           string
	Token         string
	GroupID       int
	DigitalTwinID int
	HTTP          *http.Client
}

// TokenEnv is the variable with the digital twin's token. pipelines passes
// it in the environment, not as an argument: the arguments of a process
// can be read by any process of the container (/proc/<pid>/cmdline) and
// the agents' SDK logs them in debug mode.
const TokenEnv = "OSI4IOT_AGENTDATA_TOKEN"

// FromFlags reads --data_url, --group_id and --digital_twin_id, as
// pipelines starts the servers (nodes/aiAgentNode.go), and the token from
// OSI4IOT_AGENTDATA_TOKEN (--data_token, for trying a server by hand).
func FromFlags() *Client {
	c := &Client{HTTP: &http.Client{Timeout: 60 * time.Second}}
	flag.StringVar(&c.URL, "data_url", "", "pipelines' agent data endpoint (…/v1/agentdata)")
	flag.StringVar(&c.Token, "data_token", "", "Token for the digital twin's data (default: $"+TokenEnv+")")
	flag.IntVar(&c.GroupID, "group_id", 0, "Group of the digital twin")
	flag.IntVar(&c.DigitalTwinID, "digital_twin_id", 0, "Digital twin")
	flag.Parse()
	if c.Token == "" {
		c.Token = os.Getenv(TokenEnv)
	}
	if c.URL == "" || c.Token == "" || c.GroupID <= 0 || c.DigitalTwinID <= 0 {
		log.Fatal("--data_url, --group_id, --digital_twin_id and the token ($" + TokenEnv + ") are required")
	}
	c.URL = strings.TrimSuffix(c.URL, "/")
	return c
}

// Call posts args to the endpoint's path (sensors, statistics, history,
// latest, asset_states) and decodes the answer into out. The endpoint's
// error message comes back as the error.
func (c *Client) Call(ctx context.Context, path string, args map[string]any, out any) error {
	body := map[string]any{
		"group_id":        c.GroupID,
		"digital_twin_id": c.DigitalTwinID,
		"token":           c.Token,
	}
	for k, v := range args {
		body[k] = v
	}
	data, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL+"/"+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("the platform's data service is not reachable: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		var e struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(raw, &e) == nil && e.Error != "" {
			return fmt.Errorf("%s", e.Error)
		}
		return fmt.Errorf("the platform's data service answered HTTP %d", resp.StatusCode)
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("invalid answer from the platform's data service: %w", err)
	}
	return nil
}

// Num writes a value with up to 6 significant digits.
func Num(v float64) string {
	return strconv.FormatFloat(v, 'g', 6, 64)
}

// Time writes a time as the tools show it (UTC, seconds).
func Time(t time.Time) string {
	if t.IsZero() {
		return "-"
	}
	return t.UTC().Format("2006-01-02 15:04:05Z")
}

// String reads a string argument of a tool call.
func String(args map[string]any, key string) string {
	v, _ := args[key].(string)
	return strings.TrimSpace(v)
}

// Int reads a number argument of a tool call (0 when absent).
func Int(args map[string]any, key string) int {
	switch v := args[key].(type) {
	case float64:
		return int(v)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(v))
		return n
	}
	return 0
}
