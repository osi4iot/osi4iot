package iotdb

import (
	"context"
	"errors"
	"fmt"
	"pipelines/common"
	"pipelines/utils"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SQLTemplate struct {
	Query     string
	TopicMap map[string]*common.Topic
	Variables map[string]interface{}
}

const DefaultQueryTimeout = 10 * time.Second

// Parser seguro de templates SQL
func ParseAndExecuteSQL(dbPool *pgxpool.Pool, sqlTemplate SQLTemplate) (pgx.Rows, error) {
	ctx, cancel := utils.ContextWithTimeout(DefaultQueryTimeout)
	defer cancel()

	// Reemplazar variables tipo Grafana
	query := sqlTemplate.Query
	var args []interface{}
	argIndex := 1

	// Replace custom variables $variable with placeholders
	for varName, value := range sqlTemplate.Variables {
		if strings.Contains(query, varName) {
			placeholder := fmt.Sprintf("$%d", argIndex)
			query = strings.ReplaceAll(query, "$"+varName, placeholder)
			args = append(args, value)
			argIndex++
		}
	}

	// Parse time functions like $__timeFun('now-1h')
	parsedQuery, err := ParseQueryWithTimeFunc(query)
	if err != nil {
		return nil, fmt.Errorf("error parsing time functions: %w", err)
	}

	// Parse topic functions like $__topicFun('topicRef')
	parsedQuery, err = ParseQueryWithTopicFunc(parsedQuery, sqlTemplate.TopicMap)
	if err != nil {
		return nil, fmt.Errorf("error parsing topic functions: %w", err)
	}

	rows, err := dbPool.Query(ctx, parsedQuery, args...)
	if err != nil {
		// Check if the error is a context deadline exceeded error
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, fmt.Errorf("query timeout exceeded (5s): %w", err)
		}
		return nil, err
	}

	return rows, nil
}

// Basic validation to ensure only SELECT queries are allowed and no dangerous commands are present
func ValidateQuery(query string) error {
	// Only allow SELECT queries
	query = strings.TrimSpace(strings.ToLower(query))
	query = strings.Join(strings.Fields(query), " ")
	if !strings.HasPrefix(query, "select") {
		return fmt.Errorf("only SELECT queries are allowed")
	}

	// Forbid dangerous commands like DROP, DELETE, UPDATE, INSERT, TRUNCATE, ALTER, CREATE
	dangerous := []string{"drop", "delete", "update", "insert", "truncate", "alter", "create"}
	for _, cmd := range dangerous {
		if strings.Contains(query, cmd) {
			return fmt.Errorf("dangerous command detected: %s", cmd)
		}
	}

	// Ensure query contain table
	if !strings.Contains(query, "from iot_table") {
		return fmt.Errorf("query must contain FROM iot_table")
	}

	return nil
}

func ParseQueryWithTimeFunc(query string) (string, error) {
	re := regexp.MustCompile(`\$__timeFun\('(now(?:[/-](?:\d+[smhdwMy]|[dwMy]))*)'\)`)
	matches := re.FindAllStringSubmatch(query, -1)

	if len(matches) == 0 {
		return query, nil
	}

	newQuery := query

	for _, match := range matches {
		timeStr := match[1]
		timeParser := NewGrafanaTimeParser(time.UTC)
		parsedTime, err := timeParser.Parse(timeStr)
		if err != nil {
			return "", fmt.Errorf("invalid time format in $__timeFun: %s", timeStr)
		}
		newQuery = strings.ReplaceAll(newQuery, match[0], fmt.Sprintf("'%s'", parsedTime.Format(time.RFC3339)))
	}

	return newQuery, nil
}

func ParseQueryWithTopicFunc(query string, topicMap map[string]*common.Topic) (string, error) {
	re := regexp.MustCompile(`\$__topicFun\('([^']*)'\)`)
	matches := re.FindAllStringSubmatch(query, -1)

	if len(matches) == 0 {
		return query, nil
	}

	newQuery := query

	for _, match := range matches {
		placeholder := match[0]
		topicKey := match[1]

		topic, ok := topicMap[topicKey]
		if !ok {
			return "", fmt.Errorf("no topic found for placeholder: %s", placeholder)
		}

		newQuery = strings.ReplaceAll(newQuery, placeholder, fmt.Sprintf("'Topic_%s'", topic.TopicUid))
	}

	return newQuery, nil

}