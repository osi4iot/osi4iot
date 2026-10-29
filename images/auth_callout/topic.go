package main

import (
	"context"
)

// Only the columns needed for the permissions: the other topic columns
// (payload_json_schema, the dropped S3 ones...) may change without touching
// this service.
type Topic struct {
	ID                int64  `json:"id"`
	GroupID           int64  `json:"group_id"`
	TopicType         string `json:"topic_type"`
	TopicUID          string `json:"topic_uid"`
	MQTTAccessControl string `json:"mqtt_access_control"`
}

func (m *AuthModel) GetDenyTopicsByGroupId(groupIdArray []int64) ([]*Topic, error) {
	var topics []*Topic
	queryString := `SELECT grafanadb.topic.id, grafanadb.topic.group_id,
	grafanadb.topic.topic_type, grafanadb.topic.topic_uid, grafanadb.topic.mqtt_access_control
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
			&topic.TopicUID,
			&topic.MQTTAccessControl); err != nil {
			return nil, err
		}
		topics = append(topics, &topic)
	}
	return topics, nil
}
