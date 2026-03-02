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

	pg_query "github.com/pganalyze/pg_query_go/v5"
)

var ErrOnlySelect = fmt.Errorf("only SELECT queries are allowed")
var customVarRegex = regexp.MustCompile(`\$([a-zA-Z][a-zA-Z0-9_]*)`)

var allowedFunNames = []string{"topicFun", "timeFun"}
var customFuncRegex = buildCustomFuncRegex(allowedFunNames)

func buildCustomFuncRegex(names []string) *regexp.Regexp {
    pattern := `\$__(` + strings.Join(names, "|") + `)`
    return regexp.MustCompile(pattern)
}

const IotTablePlaceholder = "iot_table"

type SQLTemplate struct {
	Query     string
	TopicMap  map[string]*common.Topic
	Variables map[string]interface{}
}

const DefaultQueryTimeout = 10 * time.Second

// Parser seguro de templates SQL
func ParseAndExecuteSQL(dbPool *pgxpool.Pool, sqlTemplate SQLTemplate) (pgx.Rows, error) {
	ctx, cancel := utils.ContextWithTimeout(DefaultQueryTimeout)
	defer cancel()

	query := sqlTemplate.Query
	var args []interface{}

	// Replace custom variables $variable with placeholders
	query, args, err := replaceVariables(sqlTemplate.Query, sqlTemplate.Variables)
	if err != nil {
		return nil, fmt.Errorf("error replacing variables: %w", err)
	}

	// Parse time functions like $__timeFun('now-1h')
	query, err = ParseQueryWithTimeFunc(query)
	if err != nil {
		return nil, fmt.Errorf("error parsing time functions: %w", err)
	}

	// Parse topic functions like $__topicFun('topicRef')
	query, err = ParseQueryWithTopicFunc(query, sqlTemplate.TopicMap)
	if err != nil {
		return nil, fmt.Errorf("error parsing topic functions: %w", err)
	}

	rows, err := dbPool.Query(ctx, query, args...)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, fmt.Errorf("query timeout exceeded: %w", err)
		}
		return nil, err
	}

	return rows, nil
}

func ValidateAndResolveQuery(query string, tableName string) (string, error) {
	// 1. Validar contra el placeholder
	if err := ValidateQuery(query, IotTablePlaceholder); err != nil {
		return "", err
	}

	// 2. Reemplazar el placeholder por la tabla real
	resolved := strings.ReplaceAll(query, IotTablePlaceholder, tableName)
	return resolved, nil
}

func ValidateQuery(query string, allowedTable string) error {
	sanitized := sanitizeCustomFunctionsAndVariables(query)
	result, err := pg_query.Parse(sanitized)
	if err != nil {
		return fmt.Errorf("invalid SQL: %w", err)
	}

	if len(result.Stmts) == 0 {
		return ErrOnlySelect
	}

	// Reject multiple statements (e.g. "SELECT 1; DROP TABLE...")
	if len(result.Stmts) > 1 {
		return fmt.Errorf("only a single statement is allowed")
	}

	stmt := result.Stmts[0].Stmt
	selectStmt := stmt.GetSelectStmt()
	if selectStmt == nil {
		return ErrOnlySelect
	}

	return validateTables(result, allowedTable)
}

func validateTables(result *pg_query.ParseResult, allowedTable string) error {
	for _, table := range extractTableNames(result) {
		if table != allowedTable {
			return fmt.Errorf("table '%s' is not allowed", table)
		}
	}
	return nil
}

func extractTableNames(result *pg_query.ParseResult) []string {
	var tables []string
	for _, stmt := range result.Stmts {
		walkNode(stmt.Stmt, &tables)
	}
	return tables
}

func walkNode(node *pg_query.Node, tables *[]string) {
	if node == nil {
		return
	}

	switch n := node.Node.(type) {
	case *pg_query.Node_RangeVar:
		if n.RangeVar.Relname != "" {
			*tables = append(*tables, n.RangeVar.Relname)
		}

	case *pg_query.Node_SelectStmt:
		s := n.SelectStmt
		for _, f := range s.FromClause {
			walkNode(f, tables)
		}
		walkNode(s.WhereClause, tables)
		walkNode(s.HavingClause, tables)
		if s.WithClause != nil {
			for _, cte := range s.WithClause.Ctes {
				walkNode(cte, tables)
			}
		}

	case *pg_query.Node_BoolExpr:
		for _, arg := range n.BoolExpr.Args {
			walkNode(arg, tables)
		}

	case *pg_query.Node_SubLink:
		walkNode(n.SubLink.Subselect, tables)

	case *pg_query.Node_JoinExpr:
		walkNode(n.JoinExpr.Larg, tables)
		walkNode(n.JoinExpr.Rarg, tables)

	case *pg_query.Node_RangeSubselect:
		walkNode(n.RangeSubselect.Subquery, tables)

	case *pg_query.Node_CommonTableExpr:
		walkNode(n.CommonTableExpr.Ctequery, tables)
	}
}

func sanitizeCustomFunctionsAndVariables(query string) string {
	query = customFuncRegex.ReplaceAllString(query, "custom_func")
	query = customVarRegex.ReplaceAllString(query, "custom_var")
	return query
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

func replaceVariables(query string, variables map[string]any) (string, []any, error) {
    var args []any
    argIndex := 1
    replaced := make(map[string]string) // "$varName" -> "$N"
    var replaceErr error

    result := customVarRegex.ReplaceAllStringFunc(query, func(match string) string {
        if replaceErr != nil {
            return match
        }

        // Ignorar funciones custom $__timeFun, $__topicFun
        if strings.HasPrefix(match, "$__") {
            return match
        }

        // Si ya fue reemplazada, reusar el mismo placeholder
        if placeholder, ok := replaced[match]; ok {
            return placeholder
        }

        varName := match[1:] // quitar el "$"
        value, ok := variables[varName]
        if !ok {
            replaceErr = fmt.Errorf("variable '%s' not found in variables map", varName)
            return match
        }

        placeholder := fmt.Sprintf("$%d", argIndex)
        replaced[match] = placeholder
        args = append(args, value)
        argIndex++
        return placeholder
    })

    if replaceErr != nil {
        return "", nil, replaceErr
    }

    return result, args, nil
}
