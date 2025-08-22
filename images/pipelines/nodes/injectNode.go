package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nats-io/nats.go"
)

type InjectNode struct {
	BaseNode
	TopicIn              string
	Repeat               string  // none, interval
	Every                float64 // interval time in seconds
	InjectionType        string
	Json                 map[string]interface{}
	MsgChan              chan common.Message
	isCurrentlyLeader    bool
	leadershipMutex      sync.RWMutex
	periodicTaskCancel   context.CancelFunc
	periodicListenCancel context.CancelFunc
}

func CreateInjectNode(node common.NodeData, fm common.Manager) (*InjectNode, error) {
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

	topic := fm.GetTopicByTopicRef(node.AssetId, node.DigitalTwinId, injectRef)
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

	if repeat != "none" && repeat != "interval" {
		fm.Log().Errorf("InjectNode %s: 'repeat' setting must be 'none' or 'interval'", node.NodeUid)
		return nil, fmt.Errorf("invalid repeat setting: %s", repeat)
	}

	var every float64
	if repeat == "interval" {
		every, ok = node.Settings["every"].(float64)
		if !ok || every == 0 {
			fm.Log().Errorf("InjectNode %s: 'every' setting is required for repeat 'interval'", node.NodeUid)
			return nil, fmt.Errorf("every setting is required for repeat 'interval'")
		}
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

	org := fm.GetOrg(node.OrgId)
	digitalTwin := fm.GetDigitalTwin(node.DigitalTwinId)

	logTopic := fm.GetTopicByTopicRef(node.AssetId, node.DigitalTwinId, "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	msgChan := make(chan common.Message, 100)

	ctx, cancel := context.WithCancel(context.Background())
	return &InjectNode{
		BaseNode: BaseNode{
			Id:             node.Id,
			NodeUid:        node.NodeUid,
			OrgId:          node.OrgId,
			OrgHash:        org.OrgHash,
			DigitalTwinUID: digitalTwin.DigitalTwinUID,
			GroupId:        node.GroupId,
			AssetId:        node.AssetId,
			DigitalTwinId:  node.DigitalTwinId,
			Name:           node.Name,
			Xpos:           node.Xpos,
			Ypos:           node.Ypos,
			NumOutputs:     node.NumOutputs,
			Settings:       node.Settings,
			Debug:          node.Debug,
			Type:           "Inject",
			LogSubject:     logSubject,
			Fm:             fm,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		TopicIn:           topicIn,
		Repeat:            repeat,
		Every:             every,
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
	n.isCurrentlyLeader = n.shouldRunPeriodicTasks()
	n.leadershipMutex.Unlock()

	n.wg.Add(1)
	go n.handleNatsSubscription(log, n.TopicIn, n.processNatsMessage)

	if n.Repeat == "interval" {
		n.wg.Add(1)
		go n.monitorLeadershipChanges(log)
	}

	// Initialize periodic tasks if this node is the leader
	if n.isCurrentlyLeader && n.Repeat == "interval" {
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
	defer n.SetStatus(common.NodeStatusStopped)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			var payload map[string]interface{}
			if n.Json != nil {
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
		case <-periodicCtx.Done():
			n.Fm.Log().Infof("InjectNode %s context cancelled, stopping periodic task", n.NodeUid)
			return
		}
	}
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
			currentLeaderStatus := n.shouldRunPeriodicTasks()

			n.leadershipMutex.Lock()
			wasLeader := n.isCurrentlyLeader
			n.isCurrentlyLeader = currentLeaderStatus
			n.leadershipMutex.Unlock()

			if wasLeader != currentLeaderStatus {
				if currentLeaderStatus {
					log.Infof("InjectNode %s: Replica became leader, starting periodic tasks", n.NodeUid)
					if n.Repeat == "interval" {
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

func (n *InjectNode) shouldRunPeriodicTasks() bool {
	replicaIndex := n.Fm.GetReplicaIndex()
	numReplicas := n.Fm.GetNumReplicas()
	isRaftLeader := n.Fm.IsRaftLeader()

	return (replicaIndex == 1 && numReplicas == 1) || isRaftLeader
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
	go n.runPeriodicTask(periodicCtx, time.Duration(1000*n.Every)*time.Millisecond)
	go n.listenToPeriodicMessages(listenCtx, log, n.processMessage)
}

func (n *InjectNode) stopPeriodicTasks() {
	n.leadershipMutex.Lock()
	defer n.leadershipMutex.Unlock()

	if n.periodicTaskCancel != nil {
		n.periodicTaskCancel()
		n.periodicTaskCancel = nil
	}

	if n.periodicListenCancel != nil {
		n.periodicListenCancel()
		n.periodicListenCancel = nil
	}
}
