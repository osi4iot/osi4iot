package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"

	_ "github.com/duckdb/duckdb-go/v2"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

type ResultField struct {
	ResultName string `json:"resultName"`
	Units      string `json:"units"`
}

type ResultsList struct {
	onNodesResults []ResultField
	onGPResults    []ResultField
}

func (r *ResultsList) GetResultNames() []string {
	var names []string

	for _, field := range r.onNodesResults {
		names = append(names, field.ResultName)
	}

	for _, field := range r.onGPResults {
		names = append(names, field.ResultName)
	}

	return names
}

func (rf ResultField) FormatValue(value float64) string {
	var valueStr string
	if value == 0 {
		valueStr = fmt.Sprintf("0.0%s", rf.Units)
	} else {
		valueStr = fmt.Sprintf("%.5g%s", value, rf.Units)
	}
	return valueStr
}

func (r *ResultsList) ExistsResult(name string, location string) bool {
	if location == "nodes" || location == "all" {
		for _, field := range r.onNodesResults {
			if field.ResultName == name {
				return true
			}
		}
	}

	if location == "gauss_points" || location == "all" {
		for _, field := range r.onGPResults {
			if field.ResultName == name {
				return true
			}
		}

	}
	return false
}

type Metadata struct {
	Version           int           `json:"version"`
	ResultFields      []ResultField `json:"resultFields"`
	DeformationFields []string      `json:"deformationFields"`
}

type FemResults struct {
	db                *sql.DB
	meshFilePath      string
	femResOnNodesPath string
	femResOnGPPath    string
	numNodes          int
	numElements       int
	resultsList       *ResultsList
}

var (
	femResultsInstance *FemResults
	femResultsOnce     sync.Once
)

// GetFemResultsInstance retorna la instancia única de los resultados FEM
func GetFemResultsInstance() *FemResults {
	femResultsOnce.Do(func() {
		var resultsPath string
		flag.StringVar(&resultsPath, "results_path", "./data", "Path to the FEM results directory")
		flag.Parse()

		meshFilePath := filepath.Join(resultsPath, "mesh_0.parquet")
		femResOnNodesPath := filepath.Join(resultsPath, "femres_OnNodes_mesh_0.parquet")
		femResOnGPPath := filepath.Join(resultsPath, "femres_OnGaussPoints_mesh_0.parquet")
		metadataPath := filepath.Join(resultsPath, "metadata.json")

		jsonData, err := os.ReadFile(metadataPath)
		if err != nil {
			log.Fatal("Error reading metadata JSON:", err)
		}

		var metadata Metadata
		if err := json.Unmarshal(jsonData, &metadata); err != nil {
			log.Fatal("Error parsing metadata JSON:", err)
		}

		db, err := sql.Open("duckdb", "")
		if err != nil {
			log.Fatal("Error connecting to DuckDB:", err)
		}

		// Verificar que la conexión esté disponible
		if err := db.Ping(); err != nil {
			log.Fatal("Error verifying connection to DuckDB:", err)
		}

		numElements, err := getNumElements(db, meshFilePath)
		if err != nil {
			log.Fatal("Error fetching number of elements:", err)
		}

		numNodes, err := getNumNodes(db, meshFilePath)
		if err != nil {
			log.Fatal("Error fetching number of nodes:", err)
		}

		resultsList, err := getResultsList(db, femResOnGPPath, femResOnNodesPath, metadata.ResultFields)
		if err != nil {
			log.Fatal("Error fetching results list:", err)
		}

		femResultsInstance = &FemResults{
			db:                db,
			numElements:       numElements,
			numNodes:          numNodes,
			resultsList:       resultsList,
			meshFilePath:      meshFilePath,
			femResOnNodesPath: femResOnNodesPath,
			femResOnGPPath:    femResOnGPPath,
		}
	})
	return femResultsInstance
}

// GetDB retorna la conexión de base de datos
func (f *FemResults) GetDB() *sql.DB {
	return f.db
}

// Close cierra la conexión de la base de datos
func (f *FemResults) Close() error {
	if f.db != nil {
		return f.db.Close()
	}
	return nil
}

func (f *FemResults) GetNumElements() int {
	return f.numElements
}

func (f *FemResults) GetNumNodes() int {
	return f.numNodes
}

func (f *FemResults) findResultField(location string, targetName string) (*ResultField, bool) {
	var fields []ResultField
	switch location {
	case "nodes":
		fields = f.resultsList.onNodesResults
	case "gauss_points":
		fields = f.resultsList.onGPResults
	}
	for i, field := range fields {
		if field.ResultName == targetName {
			return &fields[i], true
		}
	}
	return nil, false
}

func (f *FemResults) FormatValue(resultName string, value float64) (string, error) {
	var resultField *ResultField
	resultField, exists1 := f.findResultField("nodes", resultName)
	if exists1 {
		return resultField.FormatValue(value), nil
	}

	resultField, exists2 := f.findResultField("gauss_points", resultName)
	if exists2 {
		return resultField.FormatValue(value), nil
	}

	return "", fmt.Errorf("result field not found")
}

func main() {
	// Obtener la instancia única de los resultados FEM
	femResultsSingleton := GetFemResultsInstance()
	defer femResultsSingleton.Close()

	// Create MCP server with basic capabilities
	mcpServer := server.NewMCPServer(
		"fem-results",
		"1.0.0",
		server.WithToolCapabilities(true),
		server.WithInstructions("Get information about Finite Element Method results."),
	)

	// Create and add the results list tool
	resultsListTool := mcp.NewTool(
		"results-list",
		mcp.WithDescription(
			"Get the list of available results",
		),
	)
	mcpServer.AddTool(resultsListTool, handleResultsList)

	// Create and add the num-elements tool
	numElementsTool := mcp.NewTool(
		"num-elements",
		mcp.WithDescription(
			"Get the number of elements in the mesh",
		),
	)
	mcpServer.AddTool(numElementsTool, handleNumElements)

	// Create and add the num-nodes tool
	numNodesTool := mcp.NewTool(
		"num-nodes",
		mcp.WithDescription(
			"Get the number of nodes of the mesh",
		),
	)
	mcpServer.AddTool(numNodesTool, handleNumNodes)

	// Create and add the max-value tool
	maxValueTool := mcp.NewTool(
		"max-value",
		mcp.WithDescription(
			"Get the maximum value of the indicated result",
		),
		mcp.WithString("result_name",
			mcp.Description("Name of the result"),
			mcp.Required(),
		),
		mcp.WithArray(
			"params",
			mcp.WithNumberItems(),
			mcp.Min(1),
			mcp.Required(),
		),
	)
	mcpServer.AddTool(maxValueTool, handleMaxValue)

	// Create and add the min-value tool
	minValueTool := mcp.NewTool(
		"min-value",
		mcp.WithDescription(
			"Get the minimum value of the indicated result",
		),
		mcp.WithString("result_name",
			mcp.Description("Name of the result"),
			mcp.Required(),
		),
		mcp.WithArray(
			"params",
			mcp.WithNumberItems(),
			mcp.Min(1),
			mcp.Required(),
		),
	)
	mcpServer.AddTool(minValueTool, handleMinValue)


		// Create and add the critical-value tool
	criticalValueTool := mcp.NewTool(
		"critical-value",
		mcp.WithDescription(
			"Get the critical value of the indicated result",
		),
		mcp.WithArray(
			"result_names",
			mcp.WithStringItems(),
			mcp.Min(1),
			mcp.Required(),
		),
		mcp.WithArray(
			"params",
			mcp.WithNumberItems(),
			mcp.Min(1),
			mcp.Required(),
		),
	)
	mcpServer.AddTool(criticalValueTool, handleCriticalValue)

	// Create and add the nodal-value tool
	nodalValueTool := mcp.NewTool(
		"nodal-value",
		mcp.WithDescription(
			"Get the value of the indicated result at the node level",
		),
		mcp.WithString("result_name",
			mcp.Description("Name of the result"),
			mcp.Required(),
		),
		mcp.WithNumber("node_id",
			mcp.Description("ID of the node"),
			mcp.Required(),
		),
		mcp.WithArray(
			"params",
			mcp.WithNumberItems(),
			mcp.Min(1),
			mcp.Required(),
		),
	)
	mcpServer.AddTool(nodalValueTool, handleNodalValue)

	// Create and add the elem-value tool
	elemValueTool := mcp.NewTool(
		"elem-value",
		mcp.WithDescription(
			"Get the value of the indicated result at the element level",
		),
		mcp.WithString("result_name",
			mcp.Description("Name of the result"),
			mcp.Required(),
		),
		mcp.WithNumber("element_id",
			mcp.Description("ID of the element"),
			mcp.Required(),
		),
		mcp.WithArray(
			"params",
			mcp.WithNumberItems(),
			mcp.Min(1),
			mcp.Required(),
		),
	)
	mcpServer.AddTool(elemValueTool, handleElemValue)

	// Run server
	if err := server.ServeStdio(mcpServer); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// handleResultsList handles the results-list tool calls
func handleResultsList(
	ctx context.Context,
	request mcp.CallToolRequest,
) (*mcp.CallToolResult, error) {
	femResults := GetFemResultsInstance()
	resultsList := femResults.resultsList.GetResultNames()
	return mcp.NewToolResultText(strings.Join(resultsList, "\n")), nil
}

func handleNumElements(
	ctx context.Context,
	request mcp.CallToolRequest,
) (*mcp.CallToolResult, error) {
	femResults := GetFemResultsInstance()
	numElements := femResults.numElements
	return mcp.NewToolResultText(fmt.Sprintf("%d", numElements)), nil
}

func handleNumNodes(
	ctx context.Context,
	request mcp.CallToolRequest,
) (*mcp.CallToolResult, error) {
	femResults := GetFemResultsInstance()
	numNodes := femResults.numNodes
	return mcp.NewToolResultText(fmt.Sprintf("%d", numNodes)), nil
}

func handleMaxValue(
	ctx context.Context,
	request mcp.CallToolRequest,
) (*mcp.CallToolResult, error) {
	arguments := request.GetArguments()
	resultName, ok := arguments["result_name"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid or missing 'result_name' argument")
	}

	params, err := getParams(arguments)
	if err != nil {
		return nil, fmt.Errorf("error fetching params: %v", err)
	}

	femResults := GetFemResultsInstance()
	db := femResults.GetDB()
	resultsList := femResults.resultsList

	if !resultsList.ExistsResult(resultName, "all") {
		return nil, fmt.Errorf("result '%s' not found", resultName)
	}

	var maxValue float64
	var maxNode int32
	var maxElem int32
	var maxGP int32

	if resultsList.ExistsResult(resultName, "nodes") {
		expression, err := getExpression(db, femResults.femResOnNodesPath, params, resultName)
		if err != nil {
			return nil, fmt.Errorf("error fetching expression for nodes: %v", err)
		}
		query := fmt.Sprintf(`
			SELECT 
				%s AS max_val,
				Node AS max_node
			FROM '%s'
			ORDER BY %s DESC NULLS LAST
			LIMIT 1;
        `, expression, femResults.femResOnNodesPath, expression)

		err = db.QueryRow(query).Scan(&maxValue, &maxNode)
		if err != nil {
			return nil, fmt.Errorf("error executing query for nodes: %v", err)
		}

		maxValueWithUnits, err := femResults.FormatValue(resultName, maxValue)
		if err != nil {
			return nil, fmt.Errorf("error formatting max value: %v", err)
		}
		return mcp.NewToolResultText(fmt.Sprintf("Max value %s in Node %d", maxValueWithUnits, maxNode)), nil
	}

	if resultsList.ExistsResult(resultName, "gauss_points") {
		expression, err := getExpression(db, femResults.femResOnGPPath, params, resultName)
		if err != nil {
			return nil, fmt.Errorf("error fetching expression for gauss points: %v", err)
		}

		query := fmt.Sprintf(`
			SELECT 
				%s AS max_val,
				Elem AS max_elem,
				Gauss_Point AS max_gp
			FROM '%s'
			ORDER BY %s DESC NULLS LAST
			LIMIT 1;
        `, expression, femResults.femResOnGPPath, expression)

		err = db.QueryRow(query).Scan(&maxValue, &maxElem, &maxGP)
		if err != nil {
			return nil, fmt.Errorf("error executing query for gauss points: %v", err)
		}

		maxValueWithUnits, err := femResults.FormatValue(resultName, maxValue)
		if err != nil {
			return nil, fmt.Errorf("error formatting max value: %v", err)
		}
		message := fmt.Sprintf("Max value %s at element %d, gauss point %d", maxValueWithUnits, maxElem, maxGP)
		return mcp.NewToolResultText(message), nil
	}

	return nil, fmt.Errorf("result '%s' not found", resultName)
}

func handleMinValue(
	ctx context.Context,
	request mcp.CallToolRequest,
) (*mcp.CallToolResult, error) {
	arguments := request.GetArguments()
	resultName, ok := arguments["result_name"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid or missing 'result_name' argument")
	}

	params, err := getParams(arguments)
	if err != nil {
		return nil, fmt.Errorf("error fetching params: %v", err)
	}

	femResults := GetFemResultsInstance()
	db := femResults.GetDB()
	resultsList := femResults.resultsList

	if !resultsList.ExistsResult(resultName, "all") {
		return nil, fmt.Errorf("result '%s' not found", resultName)
	}

	var minValue float64
	var minNode int32
	var minElem int32
	var minGP int32

	if resultsList.ExistsResult(resultName, "nodes") {
		expression, err := getExpression(db, femResults.femResOnNodesPath, params, resultName)
		if err != nil {
			return nil, fmt.Errorf("error fetching expression for nodes: %v", err)
		}

		query := fmt.Sprintf(`
			SELECT 
				%s AS min_val,
				Node AS min_node
			FROM '%s'
			ORDER BY %s ASC NULLS FIRST
			LIMIT 1;
        `, expression, femResults.femResOnNodesPath, expression)

		err = db.QueryRow(query).Scan(&minValue, &minNode)
		if err != nil {
			return nil, fmt.Errorf("error executing query for nodes: %v", err)
		}

		minValueWithUnits, err := femResults.FormatValue(resultName, minValue)
		if err != nil {
			return nil, fmt.Errorf("error formatting min value: %v", err)
		}
		return mcp.NewToolResultText(fmt.Sprintf("Min value %s in Node %d", minValueWithUnits, minNode)), nil
	}

	if resultsList.ExistsResult(resultName, "gauss_points") {
		expression, err := getExpression(db, femResults.femResOnGPPath, params, resultName)
		if err != nil {
			return nil, fmt.Errorf("error fetching expression for gauss points: %v", err)
		}

		// Opción 1: Query simple que encuentra el mínimo y luego obtiene elem/GP
		query := fmt.Sprintf(`
			SELECT 
				%s AS min_val,
				Elem AS min_elem,
				Gauss_Point AS min_gp
			FROM '%s'
			ORDER BY %s ASC NULLS FIRST
			LIMIT 1;
        `, expression, femResults.femResOnGPPath, expression)


		err = db.QueryRow(query).Scan(&minValue, &minElem, &minGP)
		if err != nil {
			return nil, fmt.Errorf("error executing query for gauss points: %v", err)
		}

		minValueWithUnits, err := femResults.FormatValue(resultName, minValue)
		if err != nil {
			return nil, fmt.Errorf("error formatting min value: %v", err)
		}
		message := fmt.Sprintf("Min value %s at element %d, gauss point %d", minValueWithUnits, minElem, minGP)
		return mcp.NewToolResultText(message), nil
	}

	return nil, fmt.Errorf("result '%s' not found", resultName)
}

func handleCriticalValue(
	ctx context.Context,
	request mcp.CallToolRequest,
) (*mcp.CallToolResult, error) {
	arguments := request.GetArguments()

	resultNames, err := getResultNames(arguments)
	if err != nil {
		return nil, fmt.Errorf("error fetching result names: %v", err)
	}

	params, err := getParams(arguments)
	if err != nil {
		return nil, fmt.Errorf("error fetching params: %v", err)
	}

	femResults := GetFemResultsInstance()
	db := femResults.GetDB()
	resultsList := femResults.resultsList

	location := ""
	for ires, resultName := range resultNames {
		resultLocation := ""
		if resultsList.ExistsResult(resultName, "nodes") {
			resultLocation = "nodes"
		}
		if resultsList.ExistsResult(resultName, "gauss_points") {
			resultLocation = "gauss_points"
		}
		if ires == 0 && resultLocation != "" {
			location = resultLocation
		} else if resultLocation != location {
			return nil, fmt.Errorf("invalid result names: %v", err)
		}
	}
	if location == "" {
		return nil, fmt.Errorf("invalid result names: %v", err)
	}

	var criticalValue float64
	var criticalNode int32
	var criticalElem int32
	var criticalGP int32

	if location == "nodes" {
		expression, err := getCriticalValueExpression(db, femResults.femResOnNodesPath, params, resultNames)
		if err != nil {
			return nil, fmt.Errorf("error fetching expression for nodes: %v", err)
		}
		query := fmt.Sprintf(`
			SELECT 
				GREATEST(%s) AS max_val,
				Node AS max_node
			FROM '%s'
			ORDER BY GREATEST(%s) DESC NULLS LAST
			LIMIT 1;
        `, expression, femResults.femResOnNodesPath, expression)

		err = db.QueryRow(query).Scan(&criticalValue, &criticalNode)
		if err != nil {
			return nil, fmt.Errorf("error executing query for nodes: %v", err)
		}

		criticalValueWithUnits, err := femResults.FormatValue(resultNames[0], criticalValue)
		if err != nil {
			return nil, fmt.Errorf("error formatting critical value: %v", err)
		}
		return mcp.NewToolResultText(fmt.Sprintf("Critical value %s in Node %d", criticalValueWithUnits, criticalNode)), nil
	}

	if location == "gauss_points" {
		expression, err := getCriticalValueExpression(db, femResults.femResOnGPPath, params, resultNames)
		if err != nil {
			return nil, fmt.Errorf("error fetching expression for gauss points: %v", err)
		}

		query := fmt.Sprintf(`
			SELECT 
				GREATEST(%s) AS max_val,
				Elem AS max_elem,
				Gauss_Point AS max_gp
			FROM '%s'
			ORDER BY GREATEST(%s) DESC NULLS LAST
			LIMIT 1;
        `, expression, femResults.femResOnGPPath, expression)

		err = db.QueryRow(query).Scan(&criticalValue, &criticalElem, &criticalGP)
		if err != nil {
			return nil, fmt.Errorf("error executing query for gauss points: %v", err)
		}

		criticalValueWithUnits, err := femResults.FormatValue(resultNames[0], criticalValue)
		if err != nil {
			return nil, fmt.Errorf("error formatting critical value: %v", err)
		}
		message := fmt.Sprintf("Critical value %s at element %d, gauss point %d", criticalValueWithUnits, criticalElem, criticalGP)
		return mcp.NewToolResultText(message), nil
	}

	return nil, fmt.Errorf("invalid result names: %v", err)
}

func handleNodalValue(ctx context.Context,
	request mcp.CallToolRequest,
) (*mcp.CallToolResult, error) {
	femResults := GetFemResultsInstance()
	arguments := request.GetArguments()
	resultName, ok := arguments["result_name"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid or missing 'result_name' parameter")
	}

	nodeIDFloat, ok := arguments["node_id"].(float64)
	if !ok {
		return nil, fmt.Errorf("invalid or missing 'node_id' parameter")
	}
	nodeID := int(nodeIDFloat)
	if nodeID < 0 || nodeID > femResults.GetNumNodes() {
		return nil, fmt.Errorf("invalid 'node_id' parameter")
	}

	params, err := getParams(arguments)
	if err != nil {
		return nil, fmt.Errorf("error fetching params: %v", err)
	}

	db := femResults.GetDB()
	resultsList := femResults.resultsList
	if !resultsList.ExistsResult(resultName, "nodes") {
		return nil, fmt.Errorf("result '%s' not found in nodes", resultName)
	}

	expression, err := getExpression(db, femResults.femResOnNodesPath, params, resultName)
	if err != nil {
		return nil, fmt.Errorf("error fetching expression for nodes: %v", err)
	}

	var nodalValue float64

	query := fmt.Sprintf(`
        SELECT %s as node_value
        FROM '%s'
        WHERE Node = ?;
    `, expression, femResults.femResOnNodesPath)

	err = db.QueryRow(query, nodeID).Scan(&nodalValue)
	if err != nil {
		return nil, fmt.Errorf("error executing query for nodes: %v", err)
	}

	nodalValueWithUnits, err := femResults.FormatValue(resultName, nodalValue)
	if err != nil {
		return nil, fmt.Errorf("error formatting nodal value: %v", err)
	}

	return mcp.NewToolResultText(fmt.Sprintf("Node value for '%s': %s", resultName, nodalValueWithUnits)), nil
}

func handleElemValue(ctx context.Context,
	request mcp.CallToolRequest,
) (*mcp.CallToolResult, error) {
	femResults := GetFemResultsInstance()
	arguments := request.GetArguments()
	resultName, ok := arguments["result_name"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid or missing 'result_name' parameter")
	}

	elementIDFloat, ok := arguments["element_id"].(float64)
	if !ok {
		return nil, fmt.Errorf("invalid or missing 'element_id' parameter")
	}
	elementID := int(elementIDFloat)
	if elementID < 0 || elementID > femResults.GetNumElements() {
		return nil, fmt.Errorf("invalid 'element_id' parameter")
	}

	params, err := getParams(arguments)
	if err != nil {
		return nil, fmt.Errorf("error fetching params: %v", err)
	}

	db := femResults.GetDB()
	resultsList := femResults.resultsList
	if !resultsList.ExistsResult(resultName, "gauss_points") {
		return nil, fmt.Errorf("result '%s' not found in elements", resultName)
	}

	expression, err := getExpression(db, femResults.femResOnGPPath, params, resultName)
	if err != nil {
		return nil, fmt.Errorf("error fetching expression for elements: %v", err)
	}

	var avgValue float64
	var minValue float64
	var maxValue float64

	query := fmt.Sprintf(`
        SELECT 
            AVG(%s) as avg_result,
            MIN(%s) as min_result,
            MAX(%s) as max_result,
        FROM '%s'
        WHERE Elem = ?
        GROUP BY Elem;
    `, expression, expression, expression, femResults.femResOnGPPath)

	err = db.QueryRow(query, elementID).Scan(&avgValue, &minValue, &maxValue)
	if err != nil {
		return nil, fmt.Errorf("error executing query for elements: %v", err)
	}

	avgValueWithUnits, err := femResults.FormatValue(resultName, avgValue)
	if err != nil {
		return nil, fmt.Errorf("error formatting element value: %v", err)
	}

	minValueWithUnits, err := femResults.FormatValue(resultName, minValue)
	if err != nil {
		return nil, fmt.Errorf("error formatting element value: %v", err)
	}

	maxValueWithUnits, err := femResults.FormatValue(resultName, maxValue)
	if err != nil {
		return nil, fmt.Errorf("error formatting element value: %v", err)
	}

	return mcp.NewToolResultText(fmt.Sprintf("Element values for '%s': avg= %v, min= %v, max= %v", resultName,
		avgValueWithUnits,
		minValueWithUnits,
		maxValueWithUnits,
	)), nil
}

func getNumElements(db *sql.DB, meshFilePath string) (int, error) {
	query := fmt.Sprintf("SELECT COUNT(*) FROM '%s'", meshFilePath)
	var numElements int
	err := db.QueryRow(query).Scan(&numElements)
	if err != nil {
		return 0, fmt.Errorf("error fetching number of elements: %v", err)
	}
	return numElements, nil
}

func getNumNodes(db *sql.DB, meshFilePath string) (int, error) {
	nodeColumns, err := getColumnsNodes(db, meshFilePath)
	if err != nil {
		return 0, fmt.Errorf("error fetching node columns: %v", err)
	}

	if len(nodeColumns) == 0 {
		return 0, fmt.Errorf("no se encontraron columnas de nodos")
	}

	greatestExpr := fmt.Sprintf("GREATEST(%s)", joinStrings(nodeColumns, ", "))
	query := fmt.Sprintf(`
        SELECT MAX(%s) as max_nodo
        FROM '%s'
    `, greatestExpr, meshFilePath)

	var numNodes int
	err = db.QueryRow(query).Scan(&numNodes)
	if err != nil {
		return 0, fmt.Errorf("error fetching number of nodes: %v", err)
	}
	return numNodes, nil
}

func getExpression(db *sql.DB, filePath string, params []float64, resultName string) (string, error) {
	columnsInfo, err := getColumnsInfo(db, filePath)
	if err != nil {
		return "", fmt.Errorf("error fetching columns info: %v", err)
	}
	modalResults, err := getModalResults(columnsInfo, resultName)
	if err != nil {
		return "", fmt.Errorf("error fetching modal results: %v", err)
	}
	expression := ""
	length := math.Min(float64(len(modalResults)), float64(len(params)))
	for i := 0; i < int(length); i++ {
		expression += fmt.Sprintf("(%s * %f)", modalResults[i], params[i])
		if i < int(length)-1 {
			expression += " + "
		}
	}
	return expression, nil
}

func getCriticalValueExpression(db *sql.DB, filePath string, params []float64, resultNames []string) (string, error) {
	columnsInfo, err := getColumnsInfo(db, filePath)
	if err != nil {
		return "", fmt.Errorf("error fetching columns info: %v", err)
	}
	expression := ""
	for ires, resultName := range resultNames {
		modalResults, err := getModalResults(columnsInfo, resultName)
		if err != nil {
			return "", fmt.Errorf("error fetching modal results: %v", err)
		}
		resultNameExpression := ""
		length := math.Min(float64(len(modalResults)), float64(len(params)))
		for i := 0; i < int(length); i++ {
			resultNameExpression += fmt.Sprintf("(%s * %f)", modalResults[i], params[i])
			if i < int(length)-1 {
				resultNameExpression += " + "
			}
		}

		expression += fmt.Sprintf("ABS(%s)", resultNameExpression)
		if ires < len(resultNames)-1 {
			expression += ", "
		}
	}
	return expression, nil
}


func getColumnsInfo(db *sql.DB, filePath string) ([]string, error) {
	query := fmt.Sprintf("DESCRIBE SELECT * FROM '%s'", filePath)

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columnas []string
	for rows.Next() {
		var columnName, columnType, isNull string
		var key, defaultValue, extra any
		err := rows.Scan(&columnName, &columnType, &isNull, &key, &defaultValue, &extra)
		if err != nil {
			return nil, err
		}
		columnas = append(columnas, columnName)
	}

	return columnas, nil
}

func getModalResults(columns []string, resultName string) ([]string, error) {
	var modalResults []string
	for _, col := range columns {
		if strings.HasPrefix(col, resultName) {
			modalResults = append(modalResults, col)
		}
	}
	return modalResults, nil
}

func getColumnsNodes(db *sql.DB, meshFilePath string) ([]string, error) {
	query := fmt.Sprintf("DESCRIBE SELECT * FROM '%s'", meshFilePath)

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columnsInfo []string
	for rows.Next() {
		var columnName, columnType, isNull string
		var key, defaultValue, extra any
		err := rows.Scan(&columnName, &columnType, &isNull, &key, &defaultValue, &extra)
		if err != nil {
			return nil, err
		}
		columnsInfo = append(columnsInfo, columnName)
	}

	var nodeColumns []string
	for _, col := range columnsInfo {
		if strings.HasPrefix(col, "Node_") {
			nodeColumns = append(nodeColumns, col)
		}
	}

	return nodeColumns, nil
}

func getResultsList(db *sql.DB, gpResFilePath string, nodesResFilePath string, resultFields []ResultField) (*ResultsList, error) {
	resultsList := ResultsList{}
	nodeResultsColumns, err := getColumnsInfo(db, nodesResFilePath)
	if err != nil {
		return nil, err
	}
	if len(nodeResultsColumns) > 0 {
		seen := make(map[string]bool)
		for _, col := range nodeResultsColumns {
			if col != "Node" {
				resultName := strings.Split(col, "__")[0]
				if !seen[resultName] {
					resultField, exists := findResultField(resultFields, resultName)
					if exists {
						resultsList.onNodesResults = append(resultsList.onNodesResults, *resultField)
					}
					seen[resultName] = true
				}
			}
		}
	}

	gpResultsColumns, err := getColumnsInfo(db, gpResFilePath)
	if err != nil {
		return nil, err
	}
	if len(gpResultsColumns) > 0 {
		seen := make(map[string]bool)
		for _, col := range gpResultsColumns {
			if col != "Elem" && col != "Gauss_Point" {
				resultName := strings.Split(col, "__")[0]
				if !seen[resultName] {
					resultField, exists := findResultField(resultFields, resultName)
					if exists {
						resultsList.onGPResults = append(resultsList.onGPResults, *resultField)
					}
					seen[resultName] = true
				}
			}
		}
	}

	return &resultsList, nil
}

func joinStrings(strs []string, sep string) string {
	if len(strs) == 0 {
		return ""
	}
	if len(strs) == 1 {
		return strs[0]
	}

	result := strs[0]
	for i := 1; i < len(strs); i++ {
		result += sep + strs[i]
	}
	return result
}

func getParams(arguments map[string]any) ([]float64, error) {
	rawParams, ok := arguments["params"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid or missing 'params' argument")
	}
	var params []float64
	for _, param := range rawParams {
		if f, ok := param.(float64); ok {
			params = append(params, f)
		} else {
			return nil, fmt.Errorf("invalid param type: expected number")
		}
	}
	return params, nil
}

func getResultNames(arguments map[string]any) ([]string, error) {
	rawResultNames, ok := arguments["result_names"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid or missing 'result_names' argument")
	}
	var resultNames []string
	for _, param := range rawResultNames {
		if f, ok := param.(string); ok {
			resultNames = append(resultNames, f)
		} else {
			return nil, fmt.Errorf("invalid param type: expected string")
		}
	}
	return resultNames, nil
}

func findResultField(fields []ResultField, targetName string) (*ResultField, bool) {
	for i, field := range fields {
		if field.ResultName == targetName {
			return &fields[i], true
		}
	}
	return nil, false
}
