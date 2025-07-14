package utils

import (
	"encoding/json"
	"fmt"
)


func MarshalData(data interface{}) ([]byte, error) {
	bytesData, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	return bytesData, nil
}

func UnmarshalData(data []byte, v interface{}) error {
	// Primero intentar unmarshaling normal
	err := json.Unmarshal(data, v)
	if err == nil {
		return nil
	}

	// Si falla, intentar con pre-procesamiento para campos que pueden ser strings JSON
	var raw interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("failed to unmarshal raw data: %v", err)
	}

	// Convertir strings JSON a objetos donde sea necesario
	processedData := preprocessJSONStrings(raw)
	processedBytes, err := json.Marshal(processedData)
	if err != nil {
		return fmt.Errorf("failed to marshal processed data: %v", err)
	}

	err = json.Unmarshal(processedBytes, v)
	if err != nil {
		return fmt.Errorf("failed to unmarshal processed data: %v", err)
	}

	return nil
}

// List of fields that may contain JSON strings
var jsonStringFields = map[string]bool{
	"payloadJsonSchema":           true,
	"parquetSchema":               true,
	"digitalTwinSimulationFormat": true,
	"settings":                    true,
	"context":                     true,
	"state":                       true,
}

func preprocessJSONStrings(data interface{}) interface{} {
	switch v := data.(type) {
	case map[string]interface{}:
		result := make(map[string]interface{})
		for key, value := range v {
			if jsonStringFields[key] {
				if str, ok := value.(string); ok && str != "" {
					// Try to parse the string as JSON
					var parsed interface{}
					if err := json.Unmarshal([]byte(str), &parsed); err == nil {
						result[key] = parsed
					} else {
						// If it cannot be parsed, keep it as a string
						result[key] = value
					}
				} else {
					result[key] = preprocessJSONStrings(value)
				}
			} else {
				result[key] = preprocessJSONStrings(value)
			}
		}
		return result
	case []interface{}:
		result := make([]interface{}, len(v))
		for i, item := range v {
			result[i] = preprocessJSONStrings(item)
		}
		return result
	default:
		return v
	}
}
