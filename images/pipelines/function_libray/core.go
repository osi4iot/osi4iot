package function_libray

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"strings"

	"time"
)

type CoreJSProvider struct{}

func (p *CoreJSProvider) GetJSFunctions(node common.Node, fm common.Manager, log *logger.Logger) []common.JSFunction {
	return []common.JSFunction{
		{
			Name: "Logger",
			Func: func() *NodeLogger {
				return newLogger(node)
			},
		},
		{
			Name: "Time",
			Func: func() *NodeTime {
				return Time(node)
			},
		},	
		{
			Name: "getCurrentTime",
			Func: func() string {
				return p.getCurrentTime()
			},
		},
		{
			Name: "sleep",
			Func: func(duration int) {
				p.sleep(duration, log)
			},
		},
		{
			Name: "getTopic",
			Func: func(topicRef string) string {
				return p.getTopic(fm, node, topicRef)
			},
		},
		{
			Name: "getTopicType",
			Func: func(msg common.Message) string {
				return p.getTopicType(msg)
			},
		},
		{
			Name: "setValueInStore",
			Func: func(key string, data any) {
				p.setValueInStore(key, data, node, fm, log)
			},
		},
		{
			Name: "getNumberValueFromStore",
			Func: func(key string) float64 {
				return p.getNumberValueFromStore(key, node, fm, log)
			},
		},
		{
			Name: "getStringValueFromStore",
			Func: func(key string) string {
				return p.getStringValueFromStore(key, node, fm, log)
			},
		},
		{
			Name: "getBooleanValueFromStore",
			Func: func(key string) bool {
				return p.getBooleanValueFromStore(key, node, fm, log)
			},
		},
		{
			Name: "getArrayValueFromStore",
			Func: func(key string) []interface{} {
				return p.getArrayValueFromStore(key, node, fm, log)
			},
		},
		{
			Name: "getObjectValueFromStore",
			Func: func(key string) map[string]interface{} {
				return p.getObjectValueFromStore(key, node, fm, log)
			},
		},
		{
			Name: "deleteEntryFromStore",
			Func: func(key string) {
				p.deleteEntryFromStore(key, node, fm, log)
			},
		},
		{
			Name: "deleteAllEntriesFromStore",
			Func: func(key string) {
				p.deleteAllEntriesFromStore(key, node, fm, log)
			},
		},
		{
			Name: "existsKeyInStore",
			Func: func(key string) bool {
				return p.existsKeyInStore(key, node, fm, log)
			},
		},
		{
			Name: "listKeysInStore",
			Func: func() []string {
				return p.listKeysInStore(node, fm, log)
			},
		},
	}
}

type NodeLogger struct {
	node common.Node
}

func newLogger(node common.Node) *NodeLogger {
	return &NodeLogger{
		node: node,
	}
}

func (l *NodeLogger) Msg(rawMsg any) {
	var message common.Message
	jsonData, err := utils.MarshalData(rawMsg)
	if err != nil {
		return
	}
	err = utils.UnmarshalData(jsonData, &message)
	if err != nil {
		return
	}

	l.node.HandleDebug(message, 0)
}

func (l *NodeLogger) Infof(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	l.node.HandleInfo(msg)
}

func (l *NodeLogger) Errorf(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	msgErr := fmt.Errorf("%s\n", msg)
	l.node.HandleError(msgErr)
}

type NodeTime struct{
	node common.Node
}

func Time(node common.Node) *NodeTime {
	return &NodeTime{
		node: node,
	}
}

func (t *NodeTime) Now() time.Time {
	return time.Now()
}

func (t *NodeTime) Unix(sec int64, nsec int64) time.Time {
	return time.Unix(sec, nsec)
}

func (t *NodeTime) LoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.node.HandleError(fmt.Errorf("failed to load location %s: %v", name, err))
		return nil
	}
	return loc
}

func (t *NodeTime) SetNanoseconds(ns int64) time.Duration {
	return time.Duration(ns) * time.Nanosecond
}

func (t *NodeTime) SetMilliseconds(ms int64) time.Duration {
	return time.Duration(ms) * time.Millisecond
}

func (t *NodeTime) SetSeconds(seconds int64) time.Duration {
	return time.Duration(seconds) * time.Second
}

func (t *NodeTime) SetMinutes(minutes int64) time.Duration {
	return time.Duration(minutes) * time.Minute
}

func (t *NodeTime) SetHours(hours int64) time.Duration {
	return time.Duration(hours) * time.Hour
}

func (t *NodeTime) Duration(d time.Duration) time.Duration {
	return d
}

func (t *NodeTime) Month(month string) time.Month {
	switch month {
	case "January":
		return time.January
	case "February":
		return time.February
	case "March":
		return time.March
	case "April":
		return time.April
	case "May":
		return time.May
	case "June":
		return time.June
	case "July":
		return time.July
	case "August":
		return time.August
	case "September":
		return time.September
	case "October":
		return time.October
	case "November":
		return time.November
	case "December":
		return time.December
	}

	return time.January
}

func (t *NodeTime) Weekday(weekday string) time.Weekday {
	switch weekday {
	case "Sunday":
		return time.Sunday
	case "Monday":
		return time.Monday
	case "Tuesday":
		return time.Tuesday
	case "Wednesday":
		return time.Wednesday
	case "Thursday":
		return time.Thursday
	case "Friday":
		return time.Friday
	case "Saturday":
		return time.Saturday
	}

	return time.Sunday
}

func (t *NodeTime) Date(year int, month time.Month, day int, hour int, min int, sec int, nsec int) time.Time {
	return time.Date(year, month, day, hour, min, sec, nsec, time.UTC)
}

func (t *NodeTime) Parse(layout, value string) *time.Time {
	myTime, err := time.Parse(layout, value)
	if err != nil {
		t.node.HandleError(fmt.Errorf("failed to parse time: %v", err))
		return nil
	}
	return &myTime
}

func (t *NodeTime) Since(t1 time.Time) time.Duration {
	return time.Since(t1)
}

func (t *NodeTime) Until(t1 time.Time) time.Duration {
	return time.Until(t1)
}

func (t *NodeTime) SetFormat(format string) string {
	switch format {
	case "Layout":
		return time.Layout
	case "ANSIC":
		return time.ANSIC
	case "UnixDate":
		return time.UnixDate
	case "RubyDate":
		return time.RubyDate
	case "RFC822":
		return time.RFC822
	case "RFC822Z":
		return time.RFC822Z
	case "RFC850":
		return time.RFC850
	case "RFC1123":
		return time.RFC1123
	case "RFC1123Z":
		return time.RFC1123Z
	case "RFC3339":
		return time.RFC3339
	case "RFC3339Nano":
		return time.RFC3339Nano
	case "Kitchen":
		return time.Kitchen
	case "Stamp":
		return time.Stamp
	case "StampMilli":
		return time.StampMilli
	case "StampMicro":
		return time.StampMicro
	case "StampNano":
		return time.StampNano
	default:
		t.node.HandleError(fmt.Errorf("unknown time format: %s", format))
		return ""
	}
}

func (p *CoreJSProvider) getFullKvStoreKey(key string, n common.Node) string {
	return fmt.Sprintf("org_%s.dt_%s.kvstore.%s", n.GetOrgHash(), n.GetDigitalTwinUID(), key)
}

func (p *CoreJSProvider) getCurrentTime() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func (p *CoreJSProvider) sleep(duration int, log *logger.Logger) {
	if duration < 0 {
		log.Errorf("Invalid sleep duration: %d", duration)
		return
	}
	time.Sleep(time.Duration(duration) * time.Millisecond)
}

func (p *CoreJSProvider) getTopic(fm common.Manager, node common.Node, topicRef string) string {
	topic := fm.GetTopicByTopicRef(node.GetAssetId(), node.GetDigitalTwinId(), topicRef)
	if topic == nil {
		return ""
	}
	return utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
}

func (p *CoreJSProvider) getTopicType(msg common.Message) string {
	return strings.Split(msg.Topic, ".")[0]
}

func (p *CoreJSProvider) setValueInStore(key string, data interface{}, n common.Node, fm common.Manager, log *logger.Logger) {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return
	}
	fullKey := p.getFullKvStoreKey(key, n)
	err := kvStore.SetValue(context.Background(), fullKey, data)
	if err != nil {
		log.Errorf("Error setting value in store for key %s: %v", fullKey, err)
	}
}

func (p *CoreJSProvider) getNumberValueFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) float64 {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return 0.0
	}
	fullKey := p.getFullKvStoreKey(key, n)
	value, err := kvStore.GetNumberValue(context.Background(), fullKey)
	if err != nil {
		return 0.0
	}
	return value
}

func (p *CoreJSProvider) getStringValueFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) string {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return ""
	}
	fullKey := p.getFullKvStoreKey(key, n)
	value, err := kvStore.GetStringValue(context.Background(), fullKey)
	if err != nil {
		return ""
	}
	return value
}

func (p *CoreJSProvider) getBooleanValueFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) bool {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return false
	}
	fullKey := p.getFullKvStoreKey(key, n)
	value, err := kvStore.GetBoolValue(context.Background(), fullKey)
	if err != nil {
		return false
	}
	return value
}

func (p *CoreJSProvider) getArrayValueFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) []interface{} {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return nil
	}
	fullKey := p.getFullKvStoreKey(key, n)
	value, err := kvStore.GetArrayValue(context.Background(), fullKey)
	if err != nil {
		return nil
	}
	return value
}

func (p *CoreJSProvider) getObjectValueFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) map[string]interface{} {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return nil
	}
	fullKey := p.getFullKvStoreKey(key, n)
	value, err := kvStore.GetObjectValue(context.Background(), fullKey)
	if err != nil {
		return nil
	}
	return value
}

func (p *CoreJSProvider) deleteEntryFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return
	}
	fullKey := p.getFullKvStoreKey(key, n)
	err := kvStore.DeleteEntry(context.Background(), fullKey)
	if err != nil {
		log.Errorf("Error deleting entry from store for key %s: %v", fullKey, err)
	}
}

func (p *CoreJSProvider) deleteAllEntriesFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return
	}
	fullKey := p.getFullKvStoreKey(key, n)
	err := kvStore.DeleteAllEntries(context.Background())
	if err != nil {
		log.Errorf("Error deleting all entries from store for key %s: %v", fullKey, err)
	}
}

func (p *CoreJSProvider) existsKeyInStore(key string, n common.Node, fm common.Manager, log *logger.Logger) bool {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return false
	}
	fullKey := p.getFullKvStoreKey(key, n)
	exists, err := kvStore.KeyExists(context.Background(), fullKey)
	if err != nil {
		log.Errorf("Error checking existence of key %s: %v", fullKey, err)
		return false
	}
	return exists
}

func (p *CoreJSProvider) listKeysInStore(n common.Node, fm common.Manager, log *logger.Logger) []string {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return nil
	}
	keys, err := kvStore.ListKeys(context.Background())
	if err != nil {
		log.Errorf("Error listing keys in store: %v", err)
		return nil
	}
	shortKeys := make([]string, len(keys))
	for i, key := range keys {
		shortKeys[i] = strings.Split(key, ".")[3] // Assuming the key format is org_orgHash.dt_digitalTwinUID.kvstore.key
	}
	return shortKeys
}
