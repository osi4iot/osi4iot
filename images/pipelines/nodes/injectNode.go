package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nats-io/nats.go"
)

type InjectNode struct {
	BaseNode
	TopicIn              string
	Repeat               string  // none, interval, interval_between_times, interval_at_specific_time
	Every                float64 // interval time in seconds
	StartTime            string  // HH:MM format for interval_between_times
	EndTime              string  // HH:MM format for interval_between_times
	SpecificTime         string  // HH:MM format for interval_at_specific_time
	DaysOfWeek           []int   // days of the week for specific times (0=Sunday, 6=Saturday)
	Timezone             string  // timezone for time-based intervals
	InjectionType        string
	Json                 map[string]interface{}
	MsgChan              chan common.Message
	isCurrentlyLeader    bool
	leadershipMutex      sync.RWMutex
	periodicTaskCancel   context.CancelFunc
	periodicListenCancel context.CancelFunc
}

func CreateInjectNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*InjectNode, error) {
	injectRef, ok := node.Settings["injectRef"].(string)
	if !ok || injectRef == "" {
		fm.Log().Errorf("InjectNode %s: 'injectRef' setting is required", node.NodeUid)
		return nil, fmt.Errorf("injectRef setting is required")
	}

	if !strings.HasPrefix(injectRef, "inject_") {
		fm.Log().Errorf("InjectNode %s: 'injectRef' must start with 'inject_'", node.NodeUid)
		return nil, fmt.Errorf("invalid injectRef: %s", injectRef)
	}

	injectRefNum, err := strconv.Atoi(injectRef[len("inject_"):])
	if err != nil || injectRefNum > 5 || injectRefNum < 1 {
		fm.Log().Errorf("InjectNode %s: invalid injectRef: %s. It must be between inject_1 and inject_5", node.NodeUid, injectRef)
		return nil, fmt.Errorf("invalid injectRef: %s. It must be between inject_1 and inject_5", injectRef)
	}

	topic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), injectRef)
	if topic == nil {
		fm.Log().Errorf("InjectNode %s: topic %s not found", node.NodeUid, injectRef)
		return nil, fmt.Errorf("topic %s not found", injectRef)
	}
	topicIn := utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)

	repeat, ok := node.Settings["repeat"].(string)
	if !ok || repeat == "" {
		fm.Log().Errorf("InjectNode %s: 'repeat' setting is required", node.NodeUid)
		return nil, fmt.Errorf("repeat setting is required")
	}

	validRepeats := []string{"none", "interval", "interval_between_times", "interval_at_specific_time"}
	if !slices.Contains(validRepeats, repeat) {
		fm.Log().Errorf("InjectNode %s: 'repeat' setting must be one of: %v", node.NodeUid, validRepeats)
		return nil, fmt.Errorf("invalid repeat setting: %s", repeat)
	}

	var every float64
	var startTime, endTime string
	var specificTime string
	var daysOfWeek []int
	timezone := "Europe/Madrid"
	if tz, ok := node.Settings["timezone"].(string); ok && tz != "" {
		timezone = tz
	}

	// Validate settings based on repeat type
	switch repeat {
	case "interval", "interval_between_times":
		every, ok = node.Settings["every"].(float64)
		if !ok || every == 0 {
			fm.Log().Errorf("InjectNode %s: 'every' setting is required for repeat '%s'", node.NodeUid, repeat)
			return nil, fmt.Errorf("every setting is required for repeat '%s'", repeat)
		}

		if repeat == "interval_between_times" {
			startTime, ok = node.Settings["startTime"].(string)
			if !ok || startTime == "" {
				fm.Log().Errorf("InjectNode %s: 'startTime' setting is required for repeat 'interval_between_times'", node.NodeUid)
				return nil, fmt.Errorf("startTime setting is required for repeat 'interval_between_times'")
			}
			if err := validateTimeFormat(startTime); err != nil {
				fm.Log().Errorf("InjectNode %s: invalid startTime format: %s", node.NodeUid, err)
				return nil, fmt.Errorf("invalid startTime format: %w", err)
			}

			endTime, ok = node.Settings["endTime"].(string)
			if !ok || endTime == "" {
				fm.Log().Errorf("InjectNode %s: 'endTime' setting is required for repeat 'interval_between_times'", node.NodeUid)
				return nil, fmt.Errorf("endTime setting is required for repeat 'interval_between_times'")
			}
			if err := validateTimeFormat(endTime); err != nil {
				fm.Log().Errorf("InjectNode %s: invalid endTime format: %s", node.NodeUid, err)
				return nil, fmt.Errorf("invalid endTime format: %w", err)
			}

			if !isTimeAfter(endTime, startTime) {
				fm.Log().Errorf("InjectNode %s: endTime must be after startTime", node.NodeUid)
				return nil, fmt.Errorf("endTime must be after startTime")
			}

			daysOfWeek, err = readDaysOfWeek(node)
			if err != nil {
				fm.Log().Errorf("InjectNode %s: %s", node.NodeUid, err)
				return nil, err
			}
		}

	case "interval_at_specific_time":
		specificTime, ok = node.Settings["specificTime"].(string)
		if !ok || specificTime == "" {
			fm.Log().Errorf("InjectNode %s: 'specificTime' setting is required for repeat 'interval_at_specific_time'", node.NodeUid)
			return nil, fmt.Errorf("specificTime setting is required for repeat 'interval_at_specific_time'")
		}

		timeStr := specificTime
		if err := validateTimeFormat(timeStr); err != nil {
			fm.Log().Errorf("InjectNode %s: invalid specificTime format %s: %s", node.NodeUid, timeStr, err)
			return nil, fmt.Errorf("invalid specificTime format %s: %w", timeStr, err)
		}
		specificTime = timeStr
	}

	var injectionType string
	injectionType, ok = node.Settings["injectionType"].(string)
	if !ok || injectionType == "" {
		fm.Log().Errorf("InjectNode %s: 'injectionType' setting is required", node.NodeUid)
		return nil, fmt.Errorf("injectionType setting is required")
	}

	if injectionType != "Timestamp" && injectionType != "JSON" {
		fm.Log().Errorf("InjectNode %s: 'injectionType' must be 'Timestamp' or 'JSON'", node.NodeUid)
		return nil, fmt.Errorf("invalid injectionType: %s. It must be 'Timestamp' or 'JSON'", injectionType)
	}

	jsonMessage := map[string]interface{}{}
	if injectionType == "JSON" {
		if err := json.Unmarshal([]byte(node.Settings["json"].(string)), &jsonMessage); err != nil {
			fm.Log().Errorf("InjectNode %s: failed to unmarshal json: %w", node.NodeUid, err)
			return nil, fmt.Errorf("failed to unmarshal jsonSchema: %w", err)
		}
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	msgChan := make(chan common.Message, 100)

	ctx, cancel := context.WithCancel(context.Background())
	return &InjectNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "Inject",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     cancel,
			Ctx:        ctx,
			status:     common.NodeStatusCreated,
		},
		TopicIn:           topicIn,
		Repeat:            repeat,
		Every:             every,
		StartTime:         startTime,
		EndTime:           endTime,
		SpecificTime:      specificTime,
		DaysOfWeek:        daysOfWeek,
		Timezone:          timezone,
		InjectionType:     injectionType,
		Json:              jsonMessage,
		MsgChan:           msgChan,
		isCurrentlyLeader: false,
	}, nil
}

func (n *InjectNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("InjectNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting InjectNode with UID: %s", n.NodeUid)

	// Initialize leadership status based on the current replica index and number of replicas
	n.leadershipMutex.Lock()
	n.isCurrentlyLeader = n.IsLeader()
	n.leadershipMutex.Unlock()

	n.wg.Add(1)
	go n.handleNatsSubscription(log, n.TopicIn, n.processNatsMessage)

	if n.Repeat != "none" {
		n.wg.Add(1)
		go n.monitorLeadershipChanges(log)
	}

	// Initialize periodic tasks if this node is the leader
	if n.isCurrentlyLeader && n.Repeat != "none" {
		n.startPeriodicTasks(log)
	}
}

func (n *InjectNode) processNatsMessage(msg *nats.Msg, log *logger.Logger) error {
	var rawMessage map[string]interface{}
	if err := json.Unmarshal(msg.Data, &rawMessage); err != nil {
		return fmt.Errorf("failed to unmarshal message for node %s: %w", n.NodeUid, err)
	}

	message := common.Message{
		Payload: rawMessage,
		Topic:   msg.Subject,
	}

	topic := message.Topic
	if topic != "" && topic != n.TopicIn {
		return n.Fm.NatsPublish(topic, msg.Data)
	}

	n.sendToOutputs(message, log)
	return nil
}

func (n *InjectNode) processMessage(msg common.Message, log *logger.Logger) error {
	message := common.Message{
		Payload: msg.Payload,
		Topic:   msg.Topic,
	}

	n.sendToOutputs(message, log)
	return nil
}

func (n *InjectNode) runPeriodicTask(periodicCtx context.Context, interval time.Duration) {
	defer n.wg.Done()

	switch n.Repeat {
	case "interval":
		n.runSimpleInterval(periodicCtx, interval)
	case "interval_between_times":
		n.runIntervalBetweenTimes(periodicCtx, interval)
	case "interval_at_specific_time":
		n.runAtSpecificTime(periodicCtx)
	}
}

func (n *InjectNode) runSimpleInterval(periodicCtx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			n.sendMessage()
		case <-periodicCtx.Done():
			n.Fm.Log().Infof("InjectNode %s context cancelled, stopping simple interval", n.NodeUid)
			return
		}
	}
}

func (n *InjectNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		log.Infof("Node %s is already stopped", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusStopped)

	if n.Cancel != nil {
		n.Cancel()
	}

	n.stopPeriodicTasks()
	n.wg.Wait() //Wait for all goroutines to finish

	n.ResetNodeContext()

	log.Infof("Node %s stopped successfully", n.NodeUid)
}

func (n *InjectNode) isValidDay(now time.Time) bool {
	if len(n.DaysOfWeek) == 0 {
		return true // Si no se especifican días, todos son válidos
	}

	currentWeekday := int(now.Weekday()) // 0=Sunday, 1=Monday, ..., 6=Saturday
	for _, day := range n.DaysOfWeek {
		if day == currentWeekday {
			return true
		}
	}
	return false
}

func (n *InjectNode) runIntervalBetweenTimes(periodicCtx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	loc, err := time.LoadLocation(n.Timezone)
	if err != nil {
		n.Fm.Log().Errorf("InjectNode %s: invalid timezone %s, using UTC", n.NodeUid, n.Timezone)
		loc = time.UTC
	}

	for {
		select {
		case <-ticker.C:
			now := time.Now().In(loc)
			if n.isWithinTimeRange(now) && n.isValidDay(now) {
				n.sendMessage()
			}
		case <-periodicCtx.Done():
			n.Fm.Log().Infof("InjectNode %s context cancelled, stopping interval between times", n.NodeUid)
			return
		}
	}
}

// Función mejorada para interval_at_specific_time con soporte para DaysOfWeek
func (n *InjectNode) runAtSpecificTime(periodicCtx context.Context) {
	loc, err := time.LoadLocation(n.Timezone)
	if err != nil {
		n.Fm.Log().Errorf("InjectNode %s: invalid timezone %s, using UTC", n.NodeUid, n.Timezone)
		loc = time.UTC
	}

	for {
		nextTime := n.getNextSpecificTime(loc)
		if nextTime.IsZero() {
			n.Fm.Log().Errorf("InjectNode %s: no valid next time found", n.NodeUid)
			return
		}

		duration := time.Until(nextTime)
		timer := time.NewTimer(duration)

		select {
		case <-timer.C:
			now := time.Now().In(loc)
			if n.isValidDay(now) {
				n.sendMessage()
			}
		case <-periodicCtx.Done():
			timer.Stop()
			n.Fm.Log().Infof("InjectNode %s context cancelled, stopping specific times", n.NodeUid)
			return
		}

		timer.Stop()
	}
}

func (n *InjectNode) getNextSpecificTime(loc *time.Location) time.Time {
	now := time.Now().In(loc)
	today := now.Truncate(24 * time.Hour)

	// Función para verificar tiempos en una fecha específica
	getNextTimeForDate := func(date time.Time, startFromTime time.Time) (time.Time, bool) {
		if !n.isValidDay(date) {
			return time.Time{}, false
		}

		targetTime := n.parseTimeForDate(date, n.SpecificTime, loc)
		if targetTime.After(startFromTime) {
			return targetTime, true
		}

		return time.Time{}, false
	}

	// Primero, buscar en el día actual
	if nextTime, found := getNextTimeForDate(today, now); found {
		return nextTime
	}

	// Buscar en los próximos días
	for dayOffset := 1; dayOffset < 8; dayOffset++ {
		checkDate := today.AddDate(0, 0, dayOffset)
		if nextTime, found := getNextTimeForDate(checkDate, checkDate.Add(-1*time.Second)); found {
			return nextTime
		}
	}

	return time.Time{}
}

func (n *InjectNode) sendMessage() {
	var payload map[string]interface{}
	if len(n.Json) > 0 {
		payload = n.Json
	} else {
		payload = map[string]interface{}{
			"timestamp": time.Now().UnixMilli(),
		}
	}
	message := common.Message{
		Payload: payload,
		Topic:   "interval/" + n.NodeUid,
	}
	n.MsgChan <- message
}

func (n *InjectNode) isWithinTimeRange(now time.Time) bool {
	currentTime := now.Format("15:04")
	return isTimeAfterOrEqual(currentTime, n.StartTime) && isTimeAfterOrEqual(n.EndTime, currentTime)
}

func (n *InjectNode) parseTimeForDate(date time.Time, timeStr string, loc *time.Location) time.Time {
	parts := strings.Split(timeStr, ":")
	if len(parts) != 2 {
		return time.Time{}
	}

	hour, err := strconv.Atoi(parts[0])
	if err != nil {
		return time.Time{}
	}

	minute, err := strconv.Atoi(parts[1])
	if err != nil {
		return time.Time{}
	}

	return time.Date(date.Year(), date.Month(), date.Day(), hour, minute, 0, 0, loc)
}

func (n *InjectNode) listenToPeriodicMessages(listenCtx context.Context, log *logger.Logger, processor func(common.Message, *logger.Logger) error) {
	defer n.wg.Done()

	for {
		select {
		case msg := <-n.MsgChan:
			if n.GetStatus() != common.NodeStatusRunning {
				log.Infof("InjectNode %s not running, discarding message", n.NodeUid)
				continue
			}
			processor(msg, log)
		case <-listenCtx.Done():
			log.Infof("InjectNode %s message listening stopped", n.NodeUid)
			return
		}
	}
}

func (n *InjectNode) monitorLeadershipChanges(log *logger.Logger) {
	defer n.wg.Done()
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			currentLeaderStatus := n.IsLeader()

			n.leadershipMutex.Lock()
			wasLeader := n.isCurrentlyLeader
			n.isCurrentlyLeader = currentLeaderStatus
			n.leadershipMutex.Unlock()

			if wasLeader != currentLeaderStatus {
				if currentLeaderStatus {
					log.Infof("InjectNode %s: Replica became leader, starting periodic tasks", n.NodeUid)
					if n.Repeat != "none" {
						n.startPeriodicTasks(log)
					}
				} else {
					log.Infof("InjectNode %s: Replica lost leadership, stopping periodic tasks", n.NodeUid)
					n.stopPeriodicTasks()
				}
			}
		case <-n.Ctx.Done():
			log.Infof("InjectNode %s: Leadership monitoring stopped", n.NodeUid)
			return
		}
	}
}

func (n *InjectNode) startPeriodicTasks(log *logger.Logger) {
	n.leadershipMutex.Lock()
	defer n.leadershipMutex.Unlock()

	// If periodic tasks are already running, do nothing
	if n.periodicTaskCancel != nil {
		return
	}

	periodicCtx, periodicCancel := context.WithCancel(n.Ctx)
	n.periodicTaskCancel = periodicCancel

	listenCtx, listenCancel := context.WithCancel(n.Ctx)
	n.periodicListenCancel = listenCancel

	n.wg.Add(2)
	interval := time.Duration(n.Every * float64(time.Second))
	go n.runPeriodicTask(periodicCtx, interval)
	go n.listenToPeriodicMessages(listenCtx, log, n.processMessage)
}

func (n *InjectNode) stopPeriodicTasks() {
	n.leadershipMutex.Lock()
	defer n.leadershipMutex.Unlock()

	if n.periodicTaskCancel != nil {
		n.periodicTaskCancel()
		n.periodicTaskCancel = nil
	}

Drain:
	for {
		select {
		case msg := <-n.MsgChan:
			n.Fm.Log().Warnf("Discarding pending message during stop: %+v", msg)
		default:
			break Drain
		}
	}

	if n.periodicListenCancel != nil {
		n.periodicListenCancel()
		n.periodicListenCancel = nil
	}
}

func validateTimeFormat(timeStr string) error {
	parts := strings.Split(timeStr, ":")
	if len(parts) != 2 {
		return fmt.Errorf("time must be in HH:MM format")
	}

	hour, err := strconv.Atoi(parts[0])
	if err != nil || hour < 0 || hour > 23 {
		return fmt.Errorf("invalid hour: must be between 00-23")
	}

	minute, err := strconv.Atoi(parts[1])
	if err != nil || minute < 0 || minute > 59 {
		return fmt.Errorf("invalid minute: must be between 00-59")
	}

	return nil
}

func isTimeAfter(timeA, timeB string) bool {
	partsA := strings.Split(timeA, ":")
	partsB := strings.Split(timeB, ":")

	hourA, _ := strconv.Atoi(partsA[0])
	minuteA, _ := strconv.Atoi(partsA[1])
	hourB, _ := strconv.Atoi(partsB[0])
	minuteB, _ := strconv.Atoi(partsB[1])

	if hourA > hourB {
		return true
	}
	if hourA == hourB && minuteA > minuteB {
		return true
	}
	return false
}

func isTimeAfterOrEqual(timeA, timeB string) bool {
	return timeA == timeB || isTimeAfter(timeA, timeB)
}

var dayNames = []string{"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"}

func readDaysOfWeek(node common.NodeData) ([]int, error) {
	daysOfWeek := []int{}
	daysOfWeekArray, ok := node.Settings["daysOfWeek"].([]string)
	if !ok {
		return []int{0, 1, 2, 3, 4, 5, 6}, nil // default to all days if not specified
	}

	for _, day := range daysOfWeekArray {
		weekday := -1
		for i, name := range dayNames {
			if day == name {
				weekday = i
				break
			}
		}
		if weekday == -1 {
			return nil, fmt.Errorf("invalid day of week: %s", day)
		}
		daysOfWeek = append(daysOfWeek, weekday)
	}

	return daysOfWeek, nil
}
