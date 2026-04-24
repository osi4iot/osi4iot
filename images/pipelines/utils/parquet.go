package utils

import (
	"encoding/json"
	"fmt"
	"pipelines/common"
	"strings"
	"time"

	"github.com/xitongsys/parquet-go-source/local"
	"github.com/xitongsys/parquet-go/writer"
)

func ToParquetType(t string) string {
	switch t {
	case "UTF8":
		return "type=BYTE_ARRAY, convertedtype=UTF8"
	case "INT32":
		return "type=INT32"
	case "INT64":
		return "type=INT64"
	case "DOUBLE":
		return "type=DOUBLE"
	case "BOOLEAN":
		return "type=BOOLEAN"
	case "TIMESTAMP_MILLIS":
		return "type=INT64, convertedtype=TIMESTAMP_MILLIS"
	case "TIMESTAMP_MICROS":
		return "type=INT64, convertedtype=TIMESTAMP_MICROS"
	default:
		return "type=BYTE_ARRAY, convertedtype=UTF8"
	}
}

func BuildParquetSchema(def common.SchemaDef) (string, error) {
	ps := common.ParquetSchema{
		Tag:    "name=root, repetitiontype=REQUIRED",
		Fields: make([]common.ParquetField, 0, len(def.Fields)),
	}

	for _, f := range def.Fields {
		repetition := "repetitiontype=OPTIONAL"
		if f.Required {
			repetition = "repetitiontype=REQUIRED"
		}

		tag := fmt.Sprintf("name=%s, %s, %s", f.Name, ToParquetType(f.Type), repetition)
		ps.Fields = append(ps.Fields, common.ParquetField{Tag: tag})
	}

	out, err := json.Marshal(ps)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func WriteParquet(schemaJSON string, rows []map[string]any, outputPath string) error {
	fw, err := local.NewLocalFileWriter(outputPath)
	if err != nil {
		return fmt.Errorf("failed to create file writer for %q: %w", outputPath, err)
	}
	defer fw.Close()

	pw, err := writer.NewJSONWriter(schemaJSON, fw, 4)
	if err != nil {
		return fmt.Errorf("failed to create parquet writer: %w", err)
	}

	schemaFields, err := extractSchemaFields(schemaJSON)
	if err != nil {
		return fmt.Errorf("failed to parse schema: %w", err)
	}

	for i, row := range rows {
		if err := validateRow(row, schemaFields, i); err != nil {
			return err
		}

		normalizedRow, err := normalizeTimestamps(row, schemaFields)
		if err != nil {
			return fmt.Errorf("failed to normalize timestamps in row %d: %w", i, err)
		}

		rowBytes, err := json.Marshal(normalizedRow)
		if err != nil {
			return fmt.Errorf("failed to marshal row %d: %w", i, err)
		}
		if err := pw.Write(string(rowBytes)); err != nil {
			return fmt.Errorf("failed to write row %d (keys: %v): %w", i, rowKeys(row), err)
		}
	}

	if err := pw.WriteStop(); err != nil {
		return fmt.Errorf("failed to finalize parquet file: %w", err)
	}
	return nil
}

func normalizeTimestamps(row map[string]any, fields []fieldInfo) (map[string]any, error) {
	normalized := make(map[string]any, len(row))
	for k, v := range row {
		normalized[k] = v
	}

	for _, f := range fields {
		if f.ConvertedType != "TIMESTAMP_MILLIS" && f.ConvertedType != "TIMESTAMP_MICROS" {
			continue
		}
		val, exists := normalized[f.Name]
		if !exists {
			continue
		}

		var tsMillis int64
		switch v := val.(type) {
		case time.Time:
			// time.Time de Go (expuesto por Goja como objeto)
			if f.ConvertedType == "TIMESTAMP_MICROS" {
				normalized[f.Name] = v.UnixMicro()
			} else {
				normalized[f.Name] = v.UnixMilli()
			}
			continue
		case string:
			// String RFC3339 o RFC3339Nano
			t, err := time.Parse(time.RFC3339Nano, v)
			if err != nil {
				t, err = time.Parse(time.RFC3339, v)
				if err != nil {
					return nil, fmt.Errorf("field '%s': cannot parse '%s' as timestamp", f.Name, v)
				}
			}
			if f.ConvertedType == "TIMESTAMP_MICROS" {
				normalized[f.Name] = t.UnixMicro()
			} else {
				normalized[f.Name] = t.UnixMilli()
			}
			continue
		case int64:
			tsMillis = v
		case int32:
			tsMillis = int64(v)
		case float64:
			// JSON numbers deserializados por Goja llegan como float64
			tsMillis = int64(v)
		case int:
			tsMillis = int64(v)
		default:
			return nil, fmt.Errorf("field '%s': unsupported timestamp type %T", f.Name, val)
		}

		if f.ConvertedType == "TIMESTAMP_MICROS" {
			normalized[f.Name] = tsMillis * 1000
		} else {
			normalized[f.Name] = tsMillis
		}
	}
	return normalized, nil
}

func extractSchemaFields(schemaJSON string) ([]fieldInfo, error) {
	var schema struct {
		Fields []struct {
			Tag string `json:"Tag"`
		} `json:"Fields"`
	}
	if err := json.Unmarshal([]byte(schemaJSON), &schema); err != nil {
		return nil, fmt.Errorf("error parsing schema: %w", err)
	}

	fields := make([]fieldInfo, 0, len(schema.Fields))
	for _, f := range schema.Fields {
		fields = append(fields, parseTag(f.Tag))
	}
	return fields, nil
}

func parseTag(tag string) fieldInfo {
	info := fieldInfo{}
	parts := strings.Split(tag, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		key, val := strings.TrimSpace(kv[0]), strings.TrimSpace(kv[1])
		switch strings.ToLower(key) {
		case "name":
			info.Name = val
		case "type":
			info.Type = val
		case "convertedtype":
			info.ConvertedType = val
		case "repetitiontype":
			info.Optional = strings.ToUpper(val) == "OPTIONAL"
		}
	}
	return info
}

type fieldInfo struct {
	Name          string
	Type          string
	ConvertedType string
	Optional      bool
}

func validateRow(row map[string]any, fields []fieldInfo, rowIndex int) error {
	var missing []string
	for _, f := range fields {
		if f.Optional {
			continue
		}
		if _, exists := row[f.Name]; !exists {
			missing = append(missing, f.Name)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("row %d is missing required fields: %v", rowIndex, missing)
	}
	return nil
}

func rowKeys(row map[string]any) []string {
	keys := make([]string, 0, len(row))
	for k := range row {
		keys = append(keys, k)
	}
	return keys
}

func GetParquetSchemaFromMap(schemaMap map[string]any) (string, error) {
	schemaBytes, err := json.Marshal(schemaMap)
	if err != nil {
		return "", fmt.Errorf("failed to marshal ParquetSchema: %w", err)
	}

	var def common.SchemaDef
	if err := json.Unmarshal(schemaBytes, &def); err != nil {
		return "", fmt.Errorf("failed to unmarshal ParquetSchema: %w", err)
	}

	parquetSchema, err := BuildParquetSchema(def)
	if err != nil {
		return "", fmt.Errorf("failed to build ParquetSchema: %w", err)
	}
	return parquetSchema, nil
}

func ParseTimestamp(timeStr string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339Nano, timeStr)
	if err != nil {
		fmt.Println("Error:", err)
		return time.Time{}, err
	}
	return t, nil
}