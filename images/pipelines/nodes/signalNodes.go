package nodes

// What the signal nodes (Switch, Deadband, Window, Join) share: their base,
// sending to one output, their state in the digital twin's KV (updated
// atomically: several pipelines replicas process the same node's messages)
// and the clock that only the leader replica runs.

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"pipelines/common"
	"pipelines/logger"
	"pipelines/message"
	"pipelines/utils"
)

func newSignalBase(node common.NodeData, fm common.Manager, p common.Pipeline, nodeType string) BaseNode {
	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := ""
	if logTopic != nil {
		logSubject = utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)
	}
	return BaseNode{
		NodeUid:    node.NodeUid,
		Name:       node.Name,
		Xpos:       node.Xpos,
		Ypos:       node.Ypos,
		NumOutputs: node.NumOutputs,
		Settings:   node.Settings,
		Debug:      node.Debug,
		Type:       nodeType,
		LogSubject: logSubject,
		Fm:         fm,
		Pipeline:   p,
		status:     common.NodeStatusCreated,
	}
}

// startSignalNode is the common start: context, running, input wires.
func (n *BaseNode) startSignalNode(ctx context.Context, log *logger.Logger, processor func(common.Message, *logger.Logger) error) bool {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("%s node %s is already running", n.Type, n.NodeUid)
		return false
	}
	n.Ctx, n.Cancel = context.WithCancel(ctx)
	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting %s node with UID: %s", n.Type, n.NodeUid)
	n.handleInputWires(log, processor)
	return true
}

// sendToOutput sends a message to one output (a copy to each wire after
// the first).
func (n *BaseNode) sendToOutput(msg common.Message, outputIndex int, log *logger.Logger) {
	outputs := n.GetNodeOutputWires()
	if outputIndex < 0 || outputIndex >= len(outputs) {
		return
	}
	for idx, wire := range outputs[outputIndex] {
		out := msg
		if idx > 0 {
			out = msg.Clone()
		}
		select {
		case wire.Channel <- out:
			if n.Debug == "on" && idx == 0 {
				n.HandleDebug(out, outputIndex)
			}
		case <-n.Ctx.Done():
			return
		default:
			log.Warnf("Output channel full for node %s output %d, dropping message", n.NodeUid, outputIndex)
		}
	}
}

// emitMessage is a message a node creates from the one that made it emit
// (nil from the clock): it keeps its topic, state, reply address and
// sender, so that it can end a flow of an AI Tool.
func emitMessage(from common.Message, topic string, payload map[string]any) common.Message {
	if from == nil {
		return message.NewMessage(topic, payload, map[string]any{}, "", nil)
	}
	out := message.NewMessage(from.GetTopic(), payload, from.GetState(), "", nil)
	out.SetReplyContext(from.GetReplyContext())
	common.InheritSender(from, out)
	return out
}

// ---- state in the KV ----

type signalState struct {
	node   *BaseNode
	prefix string
}

func newSignalState(n *BaseNode) *signalState {
	return &signalState{
		node:   n,
		prefix: fmt.Sprintf("org_%s.dt_%s.kvstore.%s_%s", n.GetOrgHash(), n.GetDigitalTwinUid(), strings.ToLower(n.Type), n.NodeUid),
	}
}

// key is the KV key of a partition key's state.
func (s *signalState) key(partition string) string {
	return s.prefix + "." + kvKeySegment(partition)
}

// partition is the partition key of a KV key.
func (s *signalState) partition(kvKey string) string {
	segment := strings.TrimPrefix(kvKey, s.prefix+".")
	if segment == "_" {
		return ""
	}
	raw, err := base64.RawURLEncoding.DecodeString(segment)
	if err != nil {
		return segment
	}
	return string(raw)
}

// modify updates a state atomically: fn gets the current state (nil if
// none) and returns the next one (nil deletes it). fn may run more than
// once, when another replica wrote first.
func modifyState[T any](ctx context.Context, s *signalState, kvKey string, fn func(current *T) (*T, error)) error {
	kv, err := s.node.GetDigitalTwinKvStore(s.node.GetDigitalTwinId())
	if err != nil {
		return err
	}
	_, err = kv.Modify(ctx, kvKey, func(raw []byte) ([]byte, bool, error) {
		var current *T
		if raw != nil {
			current = new(T)
			if err := json.Unmarshal(raw, current); err != nil {
				// an unreadable state (another version): start again
				current = nil
			}
		}
		next, err := fn(current)
		if err != nil {
			return nil, false, err
		}
		if next == nil {
			return nil, raw != nil, nil
		}
		b, err := json.Marshal(next)
		if err != nil {
			return nil, false, err
		}
		return b, true, nil
	})
	return err
}

// keys lists the KV keys of the node's states.
func (s *signalState) keys(ctx context.Context) ([]string, error) {
	kv, err := s.node.GetDigitalTwinKvStore(s.node.GetDigitalTwinId())
	if err != nil {
		return nil, err
	}
	return kv.ListKeys(ctx, s.prefix+".")
}

// reset deletes the state of one partition key, or all of them.
func (s *signalState) reset(ctx context.Context, all bool, partition string) error {
	kv, err := s.node.GetDigitalTwinKvStore(s.node.GetDigitalTwinId())
	if err != nil {
		return err
	}
	if !all {
		return ignoreNotFound(kv.DeleteEntry(ctx, s.key(partition)))
	}
	keys, err := kv.ListKeys(ctx, s.prefix+".")
	if err != nil {
		return err
	}
	for _, key := range keys {
		if err := ignoreNotFound(kv.DeleteEntry(ctx, key)); err != nil {
			return err
		}
	}
	return nil
}

func ignoreNotFound(err error) error {
	if err != nil && strings.Contains(strings.ToLower(err.Error()), "not found") {
		return nil
	}
	return err
}

// handleReset applies "payload.reset" (true: everything; text: that
// partition key). Says whether the message was a reset (and is consumed).
func (s *signalState) handleReset(msg common.Message, log *logger.Logger) bool {
	reset, partition := resetRequest(msg.GetPayload())
	if !reset {
		return false
	}
	if err := s.reset(s.node.Ctx, partition == "", partition); err != nil {
		s.node.HandleError(fmt.Errorf("reset failed: %w", err))
		return true
	}
	if partition == "" {
		s.node.HandleInfo("State reset")
	} else {
		s.node.HandleInfo(fmt.Sprintf("State of %q reset", partition))
	}
	log.Infof("%s node %s: state reset", s.node.Type, s.node.NodeUid)
	return true
}

// runLeaderClock calls tick every period while the node runs, only in the
// replica that is the pipeline's leader (so that a clock event is emitted
// once).
func (n *BaseNode) runLeaderClock(period time.Duration, tick func(now time.Time)) {
	n.wg.Add(1)
	go func() {
		defer n.wg.Done()
		ticker := time.NewTicker(period)
		defer ticker.Stop()
		for {
			select {
			case <-n.Ctx.Done():
				return
			case now := <-ticker.C:
				if n.IsRunning() && n.IsLeader() {
					tick(now)
				}
			}
		}
	}()
}

// onceWarner sends a warning to the pipeline logs once per text, not on
// every message.
type onceWarner struct {
	mu   sync.Mutex
	seen map[string]bool
}

func (w *onceWarner) warn(n *BaseNode, text string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.seen == nil {
		w.seen = map[string]bool{}
	}
	if w.seen[text] || len(w.seen) > 100 {
		return
	}
	w.seen[text] = true
	n.HandleWarn(text)
}

// nodeLocation is the time zone of a node's periods: its "timezone"
// setting, or the group's, or UTC.
func nodeLocation(settings map[string]any, fm common.Manager, p common.Pipeline) (*time.Location, error) {
	zone := settingString(settings, "timezone", "")
	if zone == "" {
		if group := fm.GetGroup(p.GetGroupId()); group != nil {
			zone = group.Timezone
		}
	}
	if zone == "" {
		return time.UTC, nil
	}
	loc, err := time.LoadLocation(zone)
	if err != nil {
		return nil, fmt.Errorf("unknown time zone %q", zone)
	}
	return loc, nil
}
