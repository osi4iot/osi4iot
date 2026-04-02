package duckdb

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"pipelines/common"
	timeparser "pipelines/timeparser"
	"regexp"
	"strings"
	"time"

	pg_query "github.com/pganalyze/pg_query_go/v5"
)

var ErrOnlySelect = fmt.Errorf("only SELECT queries are allowed")
var customVarRegex = regexp.MustCompile(`\$([a-zA-Z][a-zA-Z0-9_]*)`)

var allowedFunNames = []string{"timeFun"}
var customFuncRegex = buildCustomFuncRegex(allowedFunNames)

// s3_storage('folderName') -> sanitized as s3_storage for pg_query
var s3StorageFuncRegex = regexp.MustCompile(`s3_storage\(\s*'([^']+)'\s*\)`)

func buildCustomFuncRegex(names []string) *regexp.Regexp {
	pattern := `\$__(` + strings.Join(names, "|") + `)\('[^']*'\)`
	return regexp.MustCompile(pattern)
}

const S3StoragePlaceholder = "s3_storage"
const DefaultQueryTimeout = 10 * time.Second

// ─── Types ────────────────────────────────────────────────────────────────────

type S3StorageConfig struct {
	BucketName       string
	BucketPath       string
	OrgId            int
	GroupId          int
	AssetId          int
	AvailableFolders map[string][]common.ParquetSchemaHistory
}

type SQLTemplate struct {
	Query     string
	S3Config  S3StorageConfig
	Variables map[string]any
}

func ParseAndExecuteSQL(ctx context.Context, dbPool *sql.DB, sqlTemplate SQLTemplate) (*sql.Rows, context.CancelFunc, error) {
	ctx, cancel := context.WithTimeout(ctx, DefaultQueryTimeout)

	// Single source of truth for all sensitive data in this execution.
	sc := SensitiveConfig{
		S3BucketName:   sqlTemplate.S3Config.BucketName,
		S3BucketPath:   sqlTemplate.S3Config.BucketPath,
		QueryVariables: sqlTemplate.Variables,
	}

	query := sqlTemplate.Query

	// 1. Validate the query (before any transformation).
	if err := ValidateQuery(query); err != nil {
		cancel()
		return nil, nil, sc.Redact(fmt.Errorf("invalid query: %w", err))
	}

	// 2. Parse $__timeFun -> real timestamps.
	resolvedQuery, err := ParseQueryWithTimeFunc(query)
	if err != nil {
		cancel()
		return nil, nil, sc.Redact(fmt.Errorf("error parsing time functions: %w", err))
	}

	// 3. Extract the query time range to filter schema versions.
	dateFrom, dateTo := extractDateRange(resolvedQuery)

	// 4. Resolve s3_storage('folder') -> read_parquet('s3://...').
	resolvedQuery, err = resolveS3Storage(resolvedQuery, sqlTemplate.S3Config, dateFrom, dateTo)
	if err != nil {
		cancel()
		return nil, nil, sc.Redact(fmt.Errorf("error resolving s3_storage: %w", err))
	}

	// 5. Replace variables $varName -> $1, $2, ...
	resolvedQuery, args, err := replaceVariables(resolvedQuery, sqlTemplate.Variables)
	if err != nil {
		cancel()
		return nil, nil, sc.Redact(fmt.Errorf("error replacing variables: %w", err))
	}

	// 6. Execute the query.
	// DuckDB may return the full S3 path in the error message, so always redact.
	rows, err := dbPool.QueryContext(ctx, resolvedQuery, args...)
	if err != nil {
		cancel()
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, nil, sc.Redact(fmt.Errorf("query timeout exceeded: %w", sc.Redact(err)))
		}
		return nil, nil, sc.Redact(err)
	}

	return rows, cancel, nil
}

func ValidateQuery(query string) error {
	sanitized := sanitizeForPgQuery(query)
	result, err := pg_query.Parse(sanitized)
	if err != nil {
		return fmt.Errorf("invalid SQL: %w", err)
	}
	if len(result.Stmts) == 0 {
		return ErrOnlySelect
	}
	if len(result.Stmts) > 1 {
		return fmt.Errorf("only a single statement is allowed")
	}
	if result.Stmts[0].Stmt.GetSelectStmt() == nil {
		return ErrOnlySelect
	}
	return validateTables(result)
}

// sanitizeForPgQuery replaces everything pg_query does not understand
// so it can parse SQL structure without errors.
func sanitizeForPgQuery(query string) string {
	query = s3StorageFuncRegex.ReplaceAllString(query, S3StoragePlaceholder)
	query = customFuncRegex.ReplaceAllString(query, "'2006-01-02T15:04:05Z'")
	query = customVarRegex.ReplaceAllString(query, "'placeholder'")
	return query
}

func validateTables(result *pg_query.ParseResult) error {
	tables := extractTableNames(result)
	if len(tables) == 0 {
		return fmt.Errorf("query must reference at least one s3_storage(...) source")
	}
	for _, table := range tables {
		if table != S3StoragePlaceholder {
			return fmt.Errorf("table '%s' is not allowed, only s3_storage(...) is permitted", table)
		}
	}
	return nil
}

func resolveS3Storage(query string, cfg S3StorageConfig, dateFrom, dateTo time.Time) (string, error) {
	var resolveErr error

	result := s3StorageFuncRegex.ReplaceAllStringFunc(query, func(match string) string {
		if resolveErr != nil {
			return match
		}
		sub := s3StorageFuncRegex.FindStringSubmatch(match)
		if len(sub) < 2 {
			resolveErr = fmt.Errorf("could not extract folder from: %s", match)
			return match
		}
		readParquet, err := buildReadParquet(cfg, sub[1], dateFrom, dateTo)
		if err != nil {
			resolveErr = err
			return match
		}
		return readParquet
	})

	if resolveErr != nil {
		return "", resolveErr
	}
	return result, nil
}

func buildReadParquet(cfg S3StorageConfig, folderName string, dateFrom, dateTo time.Time) (string, error) {
	history, ok := cfg.AvailableFolders[folderName]
	if !ok || len(history) == 0 {
		return "", fmt.Errorf("folder '%s' not found in AvailableFolders", folderName)
	}

	versions := versionsInRange(history, dateFrom, dateTo)
	if len(versions) == 0 {
		return "", fmt.Errorf("no schema versions found for folder '%s' in the given date range", folderName)
	}

	glob := fmt.Sprintf(
		"s3://%s/%s/folder=%s/version=*/year=*/month=*/day=*/*.parquet",
		cfg.BucketName,
		cfg.BucketPath,
		folderName,
	)

	quoted := make([]string, len(versions))
	for i, v := range versions {
		quoted[i] = fmt.Sprintf("'%d'", v)
	}
	versionFilter := fmt.Sprintf("version IN (%s)", strings.Join(quoted, ", "))

	return fmt.Sprintf(
		"(SELECT * FROM read_parquet('%s', hive_partitioning=true, union_by_name=true) WHERE %s)",
		glob,
		versionFilter,
	), nil
}

func versionsInRange(history []common.ParquetSchemaHistory, from, to time.Time) []int {
	var versions []int
	for _, h := range history {
		if from.IsZero() && to.IsZero() {
			versions = append(versions, h.Version)
			continue
		}
		if !h.ValidTo.IsZero() && !from.IsZero() && h.ValidTo.Before(from) {
			continue
		}
		if !to.IsZero() && h.ValidFrom.After(to) {
			continue
		}
		versions = append(versions, h.Version)
	}
	return versions
}

func extractDateRange(query string) (from, to time.Time) {
	re := regexp.MustCompile(`'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^']*)'`)
	matches := re.FindAllStringSubmatch(query, -1)

	var times []time.Time
	for _, m := range matches {
		t, err := time.Parse(time.RFC3339, m[1])
		if err == nil {
			times = append(times, t)
		}
	}

	if len(times) >= 2 {
		return times[0], times[1]
	}
	if len(times) == 1 {
		return times[0], time.Time{}
	}
	return time.Time{}, time.Time{}
}

func ParseQueryWithTimeFunc(query string) (string, error) {
	re := regexp.MustCompile(`\$__timeFun\('(now(?:[/-](?:\d+[smhdwMy]|[dwMy]))*)'\)`)
	matches := re.FindAllStringSubmatch(query, -1)

	if len(matches) == 0 {
		return query, nil
	}

	newQuery := query
	for _, match := range matches {
		tp := timeparser.NewGrafanaTimeParser(time.UTC)
		parsedTime, err := tp.Parse(match[1])
		if err != nil {
			return "", fmt.Errorf("invalid time format in $__timeFun: %s", match[1])
		}
		newQuery = strings.ReplaceAll(newQuery, match[0], fmt.Sprintf("'%s'", parsedTime.Format(time.RFC3339)))
	}

	return newQuery, nil
}

func replaceVariables(query string, variables map[string]any) (string, []any, error) {
	var args []any
	argIndex := 1
	replaced := make(map[string]string)
	var replaceErr error

	result := customVarRegex.ReplaceAllStringFunc(query, func(match string) string {
		if replaceErr != nil {
			return match
		}
		if strings.HasPrefix(match, "$__") {
			return match
		}
		if placeholder, ok := replaced[match]; ok {
			return placeholder
		}
		varName := match[1:]
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

	case *pg_query.Node_RangeFunction:
		// Función en posición FROM: s3_storage(...), s3_storagex(...), etc.
		for _, f := range n.RangeFunction.Functions {
			walkNode(f, tables)
		}

	case *pg_query.Node_FuncCall:
		// Nombre de la función (puede ser calificado: schema.func).
		// Tomamos solo el último componente como nombre de "tabla".
		if len(n.FuncCall.Funcname) > 0 {
			last := n.FuncCall.Funcname[len(n.FuncCall.Funcname)-1]
			if strNode, ok := last.Node.(*pg_query.Node_String_); ok {
				*tables = append(*tables, strNode.String_.Sval)
			}
		}
		for _, arg := range n.FuncCall.Args {
			walkNode(arg, tables)
		}

	case *pg_query.Node_SelectStmt:
		s := n.SelectStmt
		if s.Larg != nil {
			walkNode(&pg_query.Node{Node: &pg_query.Node_SelectStmt{SelectStmt: s.Larg}}, tables)
		}
		if s.Rarg != nil {
			walkNode(&pg_query.Node{Node: &pg_query.Node_SelectStmt{SelectStmt: s.Rarg}}, tables)
		}
		for _, f := range s.FromClause {
			walkNode(f, tables)
		}
		walkNode(s.WhereClause, tables)
		walkNode(s.HavingClause, tables)
		for _, g := range s.GroupClause {
			walkNode(g, tables)
		}
		for _, t := range s.TargetList {
			walkNode(t, tables)
		}
		if s.WithClause != nil {
			for _, cte := range s.WithClause.Ctes {
				walkNode(cte, tables)
			}
		}

	case *pg_query.Node_ResTarget:
		walkNode(n.ResTarget.Val, tables)

	case *pg_query.Node_BoolExpr:
		for _, arg := range n.BoolExpr.Args {
			walkNode(arg, tables)
		}

	case *pg_query.Node_AExpr:
		walkNode(n.AExpr.Lexpr, tables)
		walkNode(n.AExpr.Rexpr, tables)

	case *pg_query.Node_SubLink:
		walkNode(n.SubLink.Subselect, tables)

	case *pg_query.Node_JoinExpr:
		walkNode(n.JoinExpr.Larg, tables)
		walkNode(n.JoinExpr.Rarg, tables)
		walkNode(n.JoinExpr.Quals, tables)

	case *pg_query.Node_RangeSubselect:
		walkNode(n.RangeSubselect.Subquery, tables)

	case *pg_query.Node_CommonTableExpr:
		walkNode(n.CommonTableExpr.Ctequery, tables)

	case *pg_query.Node_CaseExpr:
		for _, arg := range n.CaseExpr.Args {
			walkNode(arg, tables)
		}
		walkNode(n.CaseExpr.Defresult, tables)

	case *pg_query.Node_CaseWhen:
		walkNode(n.CaseWhen.Expr, tables)
		walkNode(n.CaseWhen.Result, tables)

	case *pg_query.Node_CoalesceExpr:
		for _, arg := range n.CoalesceExpr.Args {
			walkNode(arg, tables)
		}
	}
}

func RowsToMaps(rows *sql.Rows) ([]map[string]any, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("error getting columns: %w", err)
	}

	var results []map[string]any
	for rows.Next() {
		values := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, fmt.Errorf("error scanning row: %w", err)
		}
		row := make(map[string]any, len(cols))
		for i, col := range cols {
			row[col] = values[i]
		}
		results = append(results, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rows: %w", err)
	}
	return results, nil
}