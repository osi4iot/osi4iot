package utils

import (
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/message"
	"strings"
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

	processedBytes, err := json.Marshal(preprocessJSONStrings(raw))
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
		dst := make(map[string]interface{}, len(src))
		for k, v := range src {
			dst[k] = v
		}
		return dst
	}

	var dst map[string]interface{}
	if err := json.Unmarshal(data, &dst); err != nil {
		dst := make(map[string]interface{}, len(src))
		for k, v := range src {
			dst[k] = v
		}
		return dst
	}
	return dst
}

// func GetMessageFromRaw(rawMsg any) (common.Message, error) {
// 	jsonData, err := MarshalData(rawMsg)
// 	if err != nil {
// 		return nil, fmt.Errorf("failed to marshal raw message: %v", err)
// 	}

// 	var msg message.Message
// 	if err := UnmarshalData(jsonData, &msg); err != nil {
// 		return nil, fmt.Errorf("failed to unmarshal message: %v", err)
// 	}
// 	return &msg, nil
// }

func GetMessageFromRaw(rawMsg any) (common.Message, error) {
    serializableFields := []string{"payload", "state", "topic", "__goMsg"}
    
    rawMap, ok := rawMsg.(map[string]any)
    if !ok {
        return nil, fmt.Errorf("rawMsg is not a map: %T", rawMsg)
    }

    filtered := make(map[string]any)
    for _, key := range serializableFields {
        if val, exists := rawMap[key]; exists {
            filtered[key] = val
        }
    }

    jsonData, err := MarshalData(filtered)
    if err != nil {
        return nil, fmt.Errorf("failed to marshal raw message: %v", err)
    }

    var msg message.Message
    if err := UnmarshalData(jsonData, &msg); err != nil {
        return nil, fmt.Errorf("failed to unmarshal message: %v", err)
    }

    return &msg, nil
}

func GetTopicTypeFromMessage(rawMsg any) string {
	message, err := GetMessageFromRaw(rawMsg)
	if err != nil || message.GetTopic() == "" {
		return ""
	}
	return strings.Split(message.GetTopic(), ".")[0]
}