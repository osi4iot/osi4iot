package main

import (
	"context"
	"log"

	"time"

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
			"Get the current date and time in RFC 3339 format",
		),
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
	return mcp.NewToolResultText(time.Now().Format(time.RFC3339)), nil
}