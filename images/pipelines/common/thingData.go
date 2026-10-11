package common

import "time"

type ThingData struct {
    GroupUID  string
    TopicUID  string
    Topic     string
    Payload   []byte
    Timestamp time.Time
    Deleted   int
}