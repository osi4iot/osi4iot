package utils

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"pipelines/common"

	"strings"
	"sync"

	"github.com/apache/arrow/go/v14/arrow"
	"github.com/apache/arrow/go/v14/arrow/array"
	"github.com/apache/arrow/go/v14/arrow/memory"
	"github.com/apache/arrow/go/v14/parquet"
	"github.com/apache/arrow/go/v14/parquet/compress"
	"github.com/apache/arrow/go/v14/parquet/pqarrow"
)

type ModalValue struct {
	ItemSize int       `json:"itemSize"`
	Array    []float64 `json:"array"`
}

type ResultField struct {
	NumberOfModes      int                   `json:"numberOfModes"`
	DefaultModalValues []int                 `json:"defaultModalValues"`
	ResultLocation     string                `json:"resultLocation"`
	ModalValues        map[string]ModalValue `json:"modalValues"`
}

type ElemConnectivities struct {
	ItemSize int   `json:"itemSize"`
	Array    []int `json:"array"`
}

type MeshResult struct {
	Name               string                 `json:"name"`
	ElemConnectivities ElemConnectivities     `json:"elemConnectivities"`
	ResultFields       map[string]ResultField `json:"resultFields"`
}

type MetadataResultField struct {
	Location    string `json:"location"`
	Description string `json:"description"`
	ResultName  string `json:"resultName"`
	Units       string `json:"units"`
}

type Metadata struct {
	Version           int                   `json:"version"`
	FileName          string                `json:"fileName"`
	LastModified      string                `json:"date"`
	ResultFields      []MetadataResultField `json:"resultFields"`
	DeformationFields []string              `json:"deformationFields"`
}

type SimulationData struct {
	Metadata    Metadata     `json:"metadata"`
	MeshResults []MeshResult `json:"meshResults"`
}

type ExtremeWithLocation struct {
	Value    float64
	NodeIdx  *int
	ElemIdx  *int
	GaussIdx *int
}

type ExtremesResult struct {
	Min ExtremeWithLocation
	Max ExtremeWithLocation
}

type MeshData struct {
	ElemIdx int `json:"elem_idx"`
	Node1   int `json:"node_1"`
	Node2   int `json:"node_2"`
	Node3   int `json:"node_3"`
}

type GaussPointData struct {
	ElemIdx       int                `json:"elem_idx"`
	GaussPointIdx int                `json:"gauss_point_idx"`
	Results       map[string]float64 `json:"results"`
}

type NodeData struct {
	NodeIdx int                `json:"node_idx"`
	Results map[string]float64 `json:"results"`
}

type FemResultsProcessor struct {
	parquetDir           string
	jsonFileName         string
	jsonFileLastModified string
	cache                map[string]bool // Archivo JSON → procesado
	mutex                sync.RWMutex
}

func NewFemResultsProcessor(femResultsDir string, jsonFileName string, jsonFileLastModified string) *FemResultsProcessor {
	CreateDirectoryIfNotExists(femResultsDir)
	return &FemResultsProcessor{
		parquetDir:           femResultsDir,
		jsonFileName:         jsonFileName,
		jsonFileLastModified: jsonFileLastModified,
		cache:                make(map[string]bool),
	}
}

func IsFemResultsFileProcessed(femResultsDir string, femResultsInfo *common.S3FolderFileInfo) (bool, error) {
	meshFilePath := filepath.Join(femResultsDir, "mesh_0.parquet")
	femResOnNodesPath := filepath.Join(femResultsDir, "femres_OnNodes_mesh_0.parquet")
	femResOnGPPath := filepath.Join(femResultsDir, "femres_OnGaussPoints_mesh_0.parquet")
	metadataPath := filepath.Join(femResultsDir, "metadata.json")

	if !FileExists(metadataPath) || !FileExists(meshFilePath) {
		return false, nil
	}

	femResultsFileName := strings.Split(femResultsInfo.FileName, "/")[4]
	jsonData, err := os.ReadFile(metadataPath)
	if err != nil {
		return false, err
	}
	var metadata Metadata
	if err := json.Unmarshal(jsonData, &metadata); err != nil {
		return false, fmt.Errorf("failed to unmarshal metadata: %v", err)
	}

	if metadata.FileName != femResultsFileName || metadata.LastModified != femResultsInfo.LastModified {
		return false, nil
	}

	existsResultsOnNodes := false
	existsResultsOnGaussPoints := false
	for _, result := range metadata.ResultFields {
		switch result.Location {
		case "nodes":
			existsResultsOnNodes = true
		case "gauss_points":
			existsResultsOnGaussPoints = true
		}
	}

	if existsResultsOnNodes && !FileExists(femResOnNodesPath) {
		return false, nil
	}

	if existsResultsOnGaussPoints && !FileExists(femResOnGPPath) {
		return false, nil
	}

	return true, nil
}

func (fr *FemResultsProcessor) FindMetadataResultNameIndex(resultName string, resultFields []MetadataResultField) int {
	for idx, field := range resultFields {
		if field.ResultName == resultName {
			return idx
		}
	}
	return -1
}

func (fr *FemResultsProcessor) ProcessJSONFile(jsonPath string) error {
	// Verificar si ya está procesado
	fr.mutex.RLock()
	if processed, exists := fr.cache[jsonPath]; exists && processed {
		fr.mutex.RUnlock()
		return nil
	}
	fr.mutex.RUnlock()

	// Leer y parsear JSON
	jsonData, err := os.ReadFile(jsonPath)
	if err != nil {
		return err
	}

	var data SimulationData
	if err := json.Unmarshal(jsonData, &data); err != nil {
		return err
	}

	// Procesar cada mesh
	for meshIdx, mesh := range data.MeshResults {
		// 1. Crear archivo Parquet para la malla (conectividades)
		if err := fr.createMeshParquet(meshIdx, mesh); err != nil {
			return fmt.Errorf("error creating mesh parquet for mesh %d: %v", meshIdx, err)
		}

		// 2. Separar resultados por ubicación
		onGaussResults := make(map[string]ResultField)
		onNodesResults := make(map[string]ResultField)

		for fieldName, field := range mesh.ResultFields {
			idx := fr.FindMetadataResultNameIndex(fieldName, data.Metadata.ResultFields)
			switch field.ResultLocation {
			case "OnGaussPoints":
				onGaussResults[fieldName] = field
				if idx != -1 {
					data.Metadata.ResultFields[idx].Location = "gauss_points"
				}
			case "OnNodes":
				onNodesResults[fieldName] = field
				if idx != -1 {
					data.Metadata.ResultFields[idx].Location = "nodes"
				}
			}
		}

		// 3. Crear archivo Parquet para resultados en puntos de Gauss
		if len(onGaussResults) > 0 {
			if err := fr.createGaussPointsParquet(meshIdx, onGaussResults, mesh.ElemConnectivities); err != nil {
				return fmt.Errorf("error creating gauss points parquet for mesh %d: %v", meshIdx, err)
			}
		}

		// 4. Crear archivo Parquet para resultados en nodos
		if len(onNodesResults) > 0 {
			if err := fr.createNodesParquet(meshIdx, onNodesResults); err != nil {
				return fmt.Errorf("error creating nodes parquet for mesh %d: %v", meshIdx, err)
			}
		}
	}

	data.Metadata.FileName = fr.jsonFileName
	data.Metadata.LastModified = fr.jsonFileLastModified
	metadataFile := filepath.Join(fr.parquetDir, "metadata.json")
	metadataBytes, err := json.MarshalIndent(data.Metadata, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %v", err)
	}
	if err := os.WriteFile(metadataFile, metadataBytes, 0644); err != nil {
		return fmt.Errorf("failed to write metadata file: %v", err)
	}

	// Marcar como procesado
	fr.mutex.Lock()
	fr.cache[jsonPath] = true
	fr.mutex.Unlock()

	return nil
}

// Crear archivo Parquet para conectividades de la malla
func (fr *FemResultsProcessor) createMeshParquet(meshIdx int, mesh MeshResult) error {
	parquetPath := filepath.Join(fr.parquetDir, fmt.Sprintf("mesh_%d.parquet", meshIdx))

	// Verificar si el archivo ya existe
	if _, err := os.Stat(parquetPath); err == nil {
		return nil
	}

	// Procesar conectividades
	itemSize := mesh.ElemConnectivities.ItemSize
	if itemSize != 3 {
		return fmt.Errorf("only triangular elements (itemSize=3) are supported, got %d", itemSize)
	}

	connectivities := mesh.ElemConnectivities.Array
	numElements := len(connectivities) / itemSize

	// Crear schema
	schema := arrow.NewSchema([]arrow.Field{
		{Name: "Elem", Type: arrow.PrimitiveTypes.Int32},
		{Name: "Node_1", Type: arrow.PrimitiveTypes.Int32},
		{Name: "Node_2", Type: arrow.PrimitiveTypes.Int32},
		{Name: "Node_3", Type: arrow.PrimitiveTypes.Int32},
	}, nil)

	// Crear archivo
	file, err := os.Create(parquetPath)
	if err != nil {
		return err
	}
	defer file.Close()

	props := parquet.NewWriterProperties(
		parquet.WithCompression(compress.Codecs.Snappy),
		parquet.WithDataPageSize(64*1024),
	)

	writer, err := pqarrow.NewFileWriter(schema, file, props, pqarrow.DefaultWriterProps())
	if err != nil {
		return err
	}
	defer writer.Close()

	// Preparar datos
	pool := memory.NewGoAllocator()

	elemIdxBuilder := array.NewInt32Builder(pool)
	node1Builder := array.NewInt32Builder(pool)
	node2Builder := array.NewInt32Builder(pool)
	node3Builder := array.NewInt32Builder(pool)

	for elemIdx := 0; elemIdx < numElements; elemIdx++ {
		baseIdx := elemIdx * itemSize
		elemIdxBuilder.Append(int32(elemIdx + 1))
		node1Builder.Append(int32(connectivities[baseIdx]))
		node2Builder.Append(int32(connectivities[baseIdx+1]))
		node3Builder.Append(int32(connectivities[baseIdx+2]))
	}

	// Construir arrays
	elemIdxArray := elemIdxBuilder.NewArray()
	node1Array := node1Builder.NewArray()
	node2Array := node2Builder.NewArray()
	node3Array := node3Builder.NewArray()

	defer elemIdxArray.Release()
	defer node1Array.Release()
	defer node2Array.Release()
	defer node3Array.Release()

	elemIdxBuilder.Release()
	node1Builder.Release()
	node2Builder.Release()
	node3Builder.Release()

	// Crear record
	record := array.NewRecord(schema, []arrow.Array{elemIdxArray, node1Array, node2Array, node3Array}, int64(numElements))
	defer record.Release()

	return writer.Write(record)
}

// Crear archivo Parquet para resultados en puntos de Gauss
func (fr *FemResultsProcessor) createGaussPointsParquet(meshIdx int, gaussResults map[string]ResultField, connectivity ElemConnectivities) error {
	parquetPath := filepath.Join(fr.parquetDir, fmt.Sprintf("femres_OnGaussPoints_mesh_%d.parquet", meshIdx))

	// Verificar si el archivo ya existe
	if _, err := os.Stat(parquetPath); err == nil {
		return nil
	}

	// Calcular número de elementos
	numElements := len(connectivity.Array) / connectivity.ItemSize
	gaussPointsPerElement := 3 // Según tu descripción

	// Crear schema dinámico
	fields := []arrow.Field{
		{Name: "Elem", Type: arrow.PrimitiveTypes.Int32},
		{Name: "Gauss_Point", Type: arrow.PrimitiveTypes.Int32},
	}

	// Añadir campos para cada resultado
	resultKeys := make([]string, 0)
	modalKeyToBuilder := make(map[string]int)
	builderIndex := 0
	for _, field := range gaussResults {
		for modalKey := range field.ModalValues {
			columnName := fmt.Sprintf("%s", modalKey)
			fields = append(fields, arrow.Field{Name: columnName, Type: arrow.PrimitiveTypes.Float64})
			resultKeys = append(resultKeys, columnName)
			modalKeyToBuilder[columnName] = builderIndex
			builderIndex++
		}
	}

	schema := arrow.NewSchema(fields, nil)

	// Crear archivo
	file, err := os.Create(parquetPath)
	if err != nil {
		return err
	}
	defer file.Close()

	props := parquet.NewWriterProperties(
		parquet.WithCompression(compress.Codecs.Snappy),
		parquet.WithDataPageSize(64*1024),
	)

	writer, err := pqarrow.NewFileWriter(schema, file, props, pqarrow.DefaultWriterProps())
	if err != nil {
		return err
	}
	defer writer.Close()

	// Preparar builders
	pool := memory.NewGoAllocator()
	elemIdxBuilder := array.NewInt32Builder(pool)
	gaussIdxBuilder := array.NewInt32Builder(pool)

	resultBuilders := make([]*array.Float64Builder, len(resultKeys))
	for i := range resultBuilders {
		resultBuilders[i] = array.NewFloat64Builder(pool)
	}

	// Procesar datos
	totalRows := numElements * gaussPointsPerElement

	for elemIdx := 0; elemIdx < numElements; elemIdx++ {
		for gpIdx := 0; gpIdx < gaussPointsPerElement; gpIdx++ {
			elemIdxBuilder.Append(int32(elemIdx + 1))
			gaussIdxBuilder.Append(int32(gpIdx + 1))

			// Calcular índice en el array de resultados
			arrayIdx := elemIdx*gaussPointsPerElement + gpIdx

			// Llenar resultados
			for _, field := range gaussResults {
				for modalKey, modal := range field.ModalValues {
					columnName := fmt.Sprintf("%s", modalKey)
					builderIdx := modalKeyToBuilder[columnName]

					if arrayIdx < len(modal.Array) {
						resultBuilders[builderIdx].Append(modal.Array[arrayIdx])
					} else {
						resultBuilders[builderIdx].AppendNull()
					}
				}
			}
		}
	}

	// Construir arrays
	arrays := make([]arrow.Array, len(fields))
	arrays[0] = elemIdxBuilder.NewArray()
	arrays[1] = gaussIdxBuilder.NewArray()

	for i, builder := range resultBuilders {
		arrays[i+2] = builder.NewArray()
	}

	// Limpiar builders
	elemIdxBuilder.Release()
	gaussIdxBuilder.Release()
	for _, builder := range resultBuilders {
		builder.Release()
	}

	// Defer release de arrays
	for _, arr := range arrays {
		defer arr.Release()
	}

	// Crear record
	record := array.NewRecord(schema, arrays, int64(totalRows))
	defer record.Release()

	return writer.Write(record)
}

// Crear archivo Parquet para resultados en nodos
func (fr *FemResultsProcessor) createNodesParquet(meshIdx int, nodesResults map[string]ResultField) error {
	parquetPath := filepath.Join(fr.parquetDir, fmt.Sprintf("femres_OnNodes_mesh_%d.parquet", meshIdx))

	// Verificar si el archivo ya existe
	if _, err := os.Stat(parquetPath); err == nil {
		return nil
	}

	// Determinar número de nodos desde el primer resultado
	var numNodes int
	for _, field := range nodesResults {
		for _, modal := range field.ModalValues {
			numNodes = len(modal.Array)
			break
		}
		break
	}

	// Crear schema dinámico
	fields := []arrow.Field{
		{Name: "Node", Type: arrow.PrimitiveTypes.Int32},
	}

	resultKeys := make([]string, 0)
	modalKeyToBuilder := make(map[string]int)
	builderIndex := 0
	for _, field := range nodesResults {
		for modalKey := range field.ModalValues {
			columnName := fmt.Sprintf("%s", modalKey)
			fields = append(fields, arrow.Field{Name: columnName, Type: arrow.PrimitiveTypes.Float64})
			resultKeys = append(resultKeys, columnName)
			modalKeyToBuilder[columnName] = builderIndex
			builderIndex++
		}
	}

	schema := arrow.NewSchema(fields, nil)

	// Crear archivo
	file, err := os.Create(parquetPath)
	if err != nil {
		return err
	}
	defer file.Close()

	props := parquet.NewWriterProperties(
		parquet.WithCompression(compress.Codecs.Snappy),
		parquet.WithDataPageSize(64*1024),
	)

	writer, err := pqarrow.NewFileWriter(schema, file, props, pqarrow.DefaultWriterProps())
	if err != nil {
		return err
	}
	defer writer.Close()

	// Preparar builders
	pool := memory.NewGoAllocator()
	nodeIdxBuilder := array.NewInt32Builder(pool)

	resultBuilders := make([]*array.Float64Builder, len(resultKeys))
	for i := range resultBuilders {
		resultBuilders[i] = array.NewFloat64Builder(pool)
	}

	// Procesar datos nodo por nodo
	for nodeIdx := 0; nodeIdx < numNodes; nodeIdx++ {
		nodeIdxBuilder.Append(int32(nodeIdx + 1))

		// Llenar resultados para este nodo
		for _, field := range nodesResults {
			for modalKey, modal := range field.ModalValues {
				columnName := fmt.Sprintf("%s", modalKey)
				builderIdx := modalKeyToBuilder[columnName]

				if nodeIdx < len(modal.Array) {
					resultBuilders[builderIdx].Append(modal.Array[nodeIdx])
				} else {
					resultBuilders[builderIdx].AppendNull()
				}
			}
		}
	}

	// Construir arrays
	arrays := make([]arrow.Array, len(fields))
	arrays[0] = nodeIdxBuilder.NewArray()

	for i, builder := range resultBuilders {
		arrays[i+1] = builder.NewArray()
	}

	// Limpiar builders
	nodeIdxBuilder.Release()
	for _, builder := range resultBuilders {
		builder.Release()
	}

	// Defer release de arrays
	for _, arr := range arrays {
		defer arr.Release()
	}

	// Crear record
	record := array.NewRecord(schema, arrays, int64(numNodes))
	defer record.Release()

	return writer.Write(record)
}
