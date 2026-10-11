// internal/handler/handler.go
package handler

import (
	"dev2pdb/internal/models"
	"fmt"
	"time"

	"github.com/buger/jsonparser"
)

type RowExtractor func(topicParts []string, payload []byte) ([]models.ThingData, error)

func ThingDataRow(time time.Time, parts []string, payload []byte) (models.ThingData, error) {
    if len(parts) < 3 {
        return models.ThingData{}, fmt.Errorf("invalid topic format")
    } else if len(parts[1]) < 7 || len(parts[2]) < 7 {
        return models.ThingData{}, fmt.Errorf("invalid topic format")
    }
    if parts[1][:6] != "Group_" || parts[2][:6] != "Topic_" {
        return models.ThingData{}, fmt.Errorf("invalid topic format")
    }
    row := models.ThingData{
        GroupUID:  parts[1][6:],
        TopicUID:  parts[2][6:],
        Topic:     parts[2],
        Payload:   payload,
        Timestamp: time,
        Deleted:   0,
    }
    return row, nil
}

func BaseExtractor(parts []string, payload []byte) ([]models.ThingData, error) {
    row, err := ThingDataRow(time.Now(), parts, payload)
    if err != nil {
        return nil, err
    }
    return []models.ThingData{row}, nil
}

func TimestampExtractor(parts []string, payload []byte) ([]models.ThingData, error) {
    ts, err := jsonparser.GetString(payload, "timestamp")
    if err != nil {
        row, err := ThingDataRow(time.Now(), parts, payload)
        if err != nil {
            return nil, err
        }
        return []models.ThingData{row}, nil
    }
    t, err := time.Parse(time.RFC3339, ts)
    if err != nil {
        return nil, err
    }
    stripped := jsonparser.Delete(payload, "timestamp")
    row := models.ThingData{
        GroupUID:  parts[1][6:],
        TopicUID:  parts[2][6:],
        Topic:     parts[2],
        Payload:   stripped,
        Timestamp: t,
        Deleted:   0,
    }
    return []models.ThingData{row}, nil
}

func ArrayExtractor(parts []string, payload []byte) ([]models.ThingData, error) {
    var items []models.ThingData
    _, err := jsonparser.ArrayEach(payload, func(elem []byte, _ jsonparser.ValueType, _ int, _ error) {
        rows, err := TimestampExtractor(parts, elem)
        if err == nil {
            items = append(items, rows...)
        }
    })
    return items, err
}