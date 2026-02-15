package utils

import (
	"encoding/json"
	"fmt"
	"pipelines/common"
)

func MarshalData(data interface{}) ([]byte, error) {
	return json.Marshal(data)
}

func UnmarshalData(data []byte, v interface{}) error {
	if err := json.Unmarshal(data, v); err == nil {
		return nil
	}

	var raw interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("failed to unmarshal raw data: %v", err)
	}

	processedData := preprocessJSONStrings(raw)
	processedBytes, err := json.Marshal(processedData)
	if err != nil {
		return fmt.Errorf("failed to marshal processed data: %v", err)
	}

	if err := json.Unmarshal(processedBytes, v); err != nil {
		return fmt.Errorf("failed to unmarshal processed data: %v", err)
	}

	return nil
}

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
		result := make(map[string]interface{}, len(v))
		for key, value := range v {
			if jsonStringFields[key] {
				if str, ok := value.(string); ok && str != "" {
					var parsed interface{}
					if err := json.Unmarshal([]byte(str), &parsed); err == nil {
						result[key] = parsed
					} else {
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

func RemoveFieldFromInterface(data interface{}, fieldToRemove string) interface{} {
	mapData, ok := data.(map[string]interface{})
	if !ok {
		return data
	}
	
	if _, exists := mapData[fieldToRemove]; !exists {
		return data
	}
	
	result := make(map[string]interface{}, len(mapData)-1)
	for k, v := range mapData {
		if k != fieldToRemove {
			result[k] = v
		}
	}
	
	return result
}

func DeepCopyPayload(src map[string]interface{}) map[string]interface{} {
	if src == nil {
		return nil
	}

	data, err := json.Marshal(src)
	if err != nil {
		// Fallback to shallow copy
		dst := make(map[string]interface{})
		for k, v := range src {
			dst[k] = v
		}
		return dst
	}

	var dst map[string]interface{}
	if err := json.Unmarshal(data, &dst); err != nil {
		// Fallback to shallow copy
		dst := make(map[string]interface{})
		for k, v := range src {
			dst[k] = v
		}
		return dst
	}

	return dst
}

func GetMessageFromRaw(rawMsg any) (common.Message, error) {
	var message common.Message
	jsonData, err := MarshalData(rawMsg)
	if err != nil {
		return common.Message{}, fmt.Errorf("failed to marshal raw message: %v", err)
	}
	err = UnmarshalData(jsonData, &message)
	if err != nil {
		return common.Message{}, fmt.Errorf("failed to unmarshal message: %v", err)
	}

	return message, nil
}