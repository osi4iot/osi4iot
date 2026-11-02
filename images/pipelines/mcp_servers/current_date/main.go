package main

import (
	"context"
	"fmt"
	"log"
	"time"
	_ "time/tzdata" // the users' time zones, whatever the container has

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func main() {
	// Create MCP server with basic capabilities
	mcpServer := server.NewMCPServer(
		"current_date",
		"1.0.0",
	)

	// Create and add the current date tool
	currentDateTool := mcp.NewTool(
		"current-date",
		mcp.WithDescription(
			"Get the current date and time (RFC 3339) in the user's time zone, with the day of the week",
		),
		mcp.WithString("timezone", mcp.Description(
			"IANA time zone (Europe/Madrid, UTC). Default: the user's (given by the platform)")),
	)

	mcpServer.AddTool(currentDateTool, handleCurrentDate)

	// Run server
	if err := server.ServeStdio(mcpServer); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// handleCurrentDate handles the current-date tool calls
func handleCurrentDate(
	ctx context.Context,
	request mcp.CallToolRequest,
) (*mcp.CallToolResult, error) {
	loc := time.UTC
	if name, _ := request.GetArguments()["timezone"].(string); name != "" {
		if l, err := time.LoadLocation(name); err == nil {
			loc = l
		}
	}
	now := time.Now().In(loc)
	return mcp.NewToolResultText(fmt.Sprintf("%s (%s, time zone %s)", now.Format(time.RFC3339), now.Weekday(), loc)), nil
}
