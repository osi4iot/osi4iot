package nodes

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"slices"
	"sync"
	"time"
)

type BatchNode struct {
	BaseNode
	Mode                    string // "Group by number of messages" or "Group by time interval"
	BatchSize               int    // used if Mode is "Group by number of messages"
	BatchInterval           int    // used if Mode is "Group by time interval" in seconds
	isCurrentlyLeader       bool
	leadershipMutex         sync.RWMutex
	timeIntervalCheckCancel context.CancelFunc
}

type BatchData struct {
	InitialTime time.Time                `json:"initial_time"`
	Messages    []map[string]interface{} `json:"messages"`
}

func CreateBatchNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*BatchNode, error) {
	batchModeOptions := []string{"Group by number of messages", "Group by time interval"}
	var batchSize, batchInterval int
	batchMode, ok := node.Settings["batchMode"].(string)
	if !ok || !slices.Contains(batchModeOptions, batchMode) {
		fm.Log().Errorf("BatchNode %s: 'batchMode' setting is required", node.NodeUid)
		return nil, fmt.Errorf("batchMode setting is required")
	}

	switch batchMode {
	case "Group by number of messages":
		batchSizeFloat, ok := node.Settings["batchSize"].(float64)
		batchSize = int(batchSizeFloat)
		if !ok || batchSize <= 0 {
			fm.Log().Errorf("BatchNode %s: 'batchSize' setting must be a positive number", node.NodeUid)
			return nil, fmt.Errorf("batchSize setting must be a positive number")
		}
	case "Group by time interval":
		batchIntervalFloat, ok := node.Settings["batchInterval"].(float64)
		batchInterval = int(batchIntervalFloat)
		if !ok || batchInterval <= 0 {
			fm.Log().Errorf("BatchNode %s: 'batchInterval' setting must be a positive number", node.NodeUid)
			return nil, fmt.Errorf("batchInterval setting must be a positive number")
		}
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	return &BatchNode{
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
		Mode:          batchMode,
		BatchSize:     batchSize,
		BatchInterval: batchInterval,
	}, nil
}

func (n *BatchNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("BatchNode %s is already running", n.NodeUid)
		return
	}

	log.Infof("Starting BatchNode with UID: %s", n.NodeUid)
	
	n.SetStatus(common.NodeStatusRunning)

	err := n.InitializeBatchData(log)
	if err != nil {
		errMsg := fmt.Sprintf("BatchNode %s: Failed to initialize batch data: %v", n.NodeUid, err)
		log.Errorf(errMsg)
		n.HandleError(fmt.Errorf("%s", errMsg))
		n.SetStatus(common.NodeStatusError)
		return
	}
	

	if n.Mode == "Group by time interval" {
		n.wg.Add(1)
		go n.monitorLeadershipChanges(log)
	}

	n.handleInputWires(log, n.processMessage)
}

func (n *BatchNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		log.Infof("Node %s is already stopped", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusStopped)

	if n.Cancel != nil {
		n.Cancel()
	}

	n.wg.Wait() //Wait for all goroutines to finish

	if n.Mode == "Group by time interval" {
		n.stopTimeIntervalCheck()
		n.setIsCurrentlyLeader(false)
	}

	n.ResetNodeContext()

	log.Infof("Node %s stopped successfully", n.NodeUid)
}

func (n *BatchNode) processMessage(msg common.Message, log *logger.Logger) error {
	batchData, err := n.AddMessageToBatchData(msg.Payload, log)
	if err != nil {
		log.Errorf("BatchNode %s: Failed to add message to batch data: %v", n.NodeUid, err)
		return err
	}

	if n.Mode == "Group by number of messages" {
		if len(batchData.Messages) >= n.BatchSize {
			message := common.Message{
				Payload: map[string]interface{}{
					"batch": batchData.Messages,
				},
			}
			// Reset batch data
			n.InitializeBatchData(log)
			n.sendToOutputs(message, log)
		}
	}

	return nil
}

func (n *BatchNode) getBatchNodeKvStoreKey() string {
	return fmt.Sprintf("org_%s.dt_%s.kvstore.batch_%s", n.GetOrgHash(), n.GetDigitalTwinUid(), n.NodeUid)
}

func (n *BatchNode) InitializeBatchData(log *logger.Logger) error {
	kvStore, err := n.GetKvStore(n.GetDigitalTwinId())
	if err != nil {
		return err
	}

	kvKey := n.getBatchNodeKvStoreKey()
	batchData := &BatchData{
		InitialTime: time.Time{},
		Messages:    []map[string]interface{}{},
	}
	err = kvStore.SetValue(context.Background(), kvKey, batchData)
	if err != nil {
		log.Errorf("Failed to initialize batch data for node %s: %v", n.NodeUid, err)
		return err
	}
	return nil
}

func (n *BatchNode) GetBatchData(log *logger.Logger) (*BatchData, error) {
	kvStore, err:= n.GetKvStore(n.GetDigitalTwinId())
	if err != nil {
		return nil, err
	}

	kvKey := n.getBatchNodeKvStoreKey()
	batchDataEntry, err := kvStore.GetObjectValue(context.Background(), kvKey)
	if err != nil {
		if err.Error() == fmt.Sprintf("key %s not found", kvKey) {
			return &BatchData{
				InitialTime: time.Time{},
				Messages:    []map[string]interface{}{},
			}, nil
		}
		log.Errorf("Failed to get batch data for node %s: %v", n.NodeUid, err)
		return nil, err
	}

	initialTimeString, ok := batchDataEntry["initial_time"].(string)
	if !ok {
		log.Errorf("Failed to get initial_time for batch data of node %s", n.NodeUid)
		return nil, fmt.Errorf("failed to get initial_time for batch data of node %s", n.NodeUid)
	}
	initialTime, err := time.Parse(time.RFC3339, initialTimeString)
	if err != nil {
		log.Errorf("Failed to parse initial_time for batch data of node %s: %v", n.NodeUid, err)
		return nil, fmt.Errorf("failed to parse initial_time for batch data of node %s: %v", n.NodeUid, err)
	}

	messagesValue, ok := batchDataEntry["messages"].([]interface{})
	if !ok {
		log.Errorf("Failed to get messages for batch data of node %s", n.NodeUid)
		return nil, fmt.Errorf("failed to get messages for batch data of node %s", n.NodeUid)
	}

	messages := make([]map[string]interface{}, 0, len(messagesValue))
	for _, msg := range messagesValue {
		msgMap, ok := msg.(map[string]interface{})
		if !ok {
			log.Errorf("Invalid message format in batch data of node %s", n.NodeUid)
			return nil, fmt.Errorf("invalid message format in batch data of node %s", n.NodeUid)
		}
		messages = append(messages, msgMap)
	}

	return &BatchData{
		InitialTime: initialTime,
		Messages:    messages,
	}, nil
}

func (n *BatchNode) AddMessageToBatchData(message map[string]interface{}, log *logger.Logger) (*BatchData, error) {
	kvStore, err:= n.GetKvStore(n.GetDigitalTwinId())
	if err != nil {
		return nil, err
	}
	kvKey := n.getBatchNodeKvStoreKey()

	batchData, err := n.GetBatchData(log)
	if err != nil {
		return nil, err
	}

	if batchData.InitialTime.IsZero() {
		batchData.InitialTime = time.Now()
	}

	batchData.Messages = append(batchData.Messages, message)

	if batchData.InitialTime.IsZero() {
		batchData.InitialTime = time.Now()
	}

	err = kvStore.SetValue(context.Background(), kvKey, batchData)
	if err != nil {
		log.Errorf("Failed to save batch data for node %s: %v", n.NodeUid, err)
		return nil, err
	}

	return batchData, nil
}

func (n *BatchNode) setIsCurrentlyLeader(isLeader bool) {
	n.leadershipMutex.Lock()
	defer n.leadershipMutex.Unlock()
	n.isCurrentlyLeader = isLeader
}

func (n *BatchNode) monitorLeadershipChanges(log *logger.Logger) {
	defer n.wg.Done()
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			currentLeaderStatus := n.ShouldRunPeriodicTasks()

			n.leadershipMutex.Lock()
			wasLeader := n.isCurrentlyLeader
			n.isCurrentlyLeader = currentLeaderStatus
			n.leadershipMutex.Unlock()

			if wasLeader != currentLeaderStatus {
				if currentLeaderStatus {
					log.Infof("BatchNode %s: Replica became leader, starting periodic tasks", n.NodeUid)
					n.startTimeIntervalCheck()
				} else {
					log.Infof("BatchNode %s: Replica lost leadership, stopping periodic tasks", n.NodeUid)
					n.stopTimeIntervalCheck()
				}
			}
		case <-n.Ctx.Done():
			log.Infof("BatchNode %s: Leadership monitoring stopped", n.NodeUid)
			return
		}
	}
}

func (n *BatchNode) startTimeIntervalCheck() {
	n.leadershipMutex.Lock()
	defer n.leadershipMutex.Unlock()

	// If periodic tasks are already running, do nothing
	if n.timeIntervalCheckCancel != nil {
		return
	}

	timeIntervalCheckCtx, timeIntervalCheckCancel := context.WithCancel(n.Ctx)
	n.timeIntervalCheckCancel = timeIntervalCheckCancel

	n.wg.Add(1)
	checkInterval := time.Duration(1000*n.BatchInterval/10) * time.Millisecond // Check 10 times within the batch interval
	go n.runTimeIntervalCheck(timeIntervalCheckCtx, checkInterval)
}

func (n *BatchNode) stopTimeIntervalCheck() {
	n.leadershipMutex.Lock()
	defer n.leadershipMutex.Unlock()

	if n.timeIntervalCheckCancel != nil {
		n.timeIntervalCheckCancel()
		n.timeIntervalCheckCancel = nil
	}
}

func (n *BatchNode) runTimeIntervalCheck(ctx context.Context, interval time.Duration) {
	defer n.wg.Done()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			batchData, err := n.GetBatchData(n.Fm.Log())
			if err != nil {
				n.Fm.Log().Errorf("BatchNode %s: Failed to get batch data: %v", n.NodeUid, err)
				continue
			}

			if len(batchData.Messages) > 0 && !batchData.InitialTime.IsZero() {
				elapsed := time.Since(batchData.InitialTime)
				if elapsed >= time.Duration(n.BatchInterval)*time.Second {
					message := common.Message{
						Payload: map[string]interface{}{
							"batch": batchData.Messages,
						},
					}
					// Reset batch data
					n.InitializeBatchData(n.Fm.Log())
					n.sendToOutputs(message, n.Fm.Log())
				}
			}
		case <-ctx.Done():
			n.Fm.Log().Infof("BatchNode %s: Time interval check stopped", n.NodeUid)
			return
		}
	}
}
