package main

import (
	"context"
	"time"
)

type Topic struct {
	ID                int64     `json:"id"`
	GroupID           int64     `json:"group_id"`
	TopicType         string    `json:"topic_type"`
	Description       string    `json:"description"`
	TopicUID          string    `json:"topic_uid"`
	PayloadJSONSchema string    `json:"payload_json_schema"`
	MQTTAccessControl string    `json:"mqtt_access_control"`
	RequireS3Storage  bool      `json:"require_s3_storage"`
	S3Folder          string    `json:"s3_folder"`
	LastS3Storage     time.Time `json:"last_s3_storage"`
	ParquetSchema     string    `json:"parquet_schema"`
	Created           time.Time `json:"created"`
	Updated           time.Time `json:"updated"`
}

func (m *AuthModel) GetDenyTopicsByGroupId(groupIdArray []int64) ([]*Topic, error) {
	var topics []*Topic
	queryString := `SELECT grafanadb.topic.id, grafanadb.topic.group_id, 
	grafanadb.topic.topic_type, grafanadb.topic.description, grafanadb.topic.topic_uid, 
	grafanadb.topic.payload_json_schema, grafanadb.topic.mqtt_access_control, 
	grafanadb.topic.require_s3_storage, grafanadb.topic.s3_folder, 
	grafanadb.topic.last_s3_storage, grafanadb.topic.parquet_schema, 
	grafanadb.topic.created, grafanadb.topic.updated 
	FROM grafanadb.topic WHERE (grafanadb.topic.group_id = ANY($1::bigint[])) AND 
	(grafanadb.topic.mqtt_access_control = 'None' OR grafanadb.topic.mqtt_access_control = 'Pub' OR grafanadb.topic.mqtt_access_control = 'Sub')`
	rows, err := m.db.Query(context.Background(), queryString, groupIdArray)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var topic Topic
		if err := rows.Scan(&topic.ID, &topic.GroupID, &topic.TopicType,
			&topic.Description,
			&topic.TopicUID,
			&topic.PayloadJSONSchema,
			&topic.MQTTAccessControl,
			&topic.RequireS3Storage,
			&topic.S3Folder,
			&topic.LastS3Storage,
			&topic.ParquetSchema,
			&topic.Created,
			&topic.Updated); err != nil {
			return nil, err
		}
		topics = append(topics, &topic)
	}
	return topics, nil
}
