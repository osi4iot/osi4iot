package nodes

import (
	"context"
	"fmt"
	"time"

	"pipelines/common"
	"pipelines/iotdb"
	"pipelines/logger"
)

// MachineStateNode derives the operating state of a machine and its times
// per day or shift (machineStateLogic.go). Output 0: the state changes;
// output 1: the summaries (at the end of each period, and every N minutes
// if set). With updateAssetState, each state change is also written in the
// asset state's "machines" (state, since, previous state).
type MachineStateNode struct {
	BaseNode
	cfg         *machineConfig
	state       *signalState
	updateAsset bool
}

func CreateMachineStateNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*MachineStateNode, error) {
	loc, err := nodeLocation(node.Settings, fm, p)
	if err != nil {
		fm.Log().Errorf("MachineStateNode %s: %v", node.NodeUid, err)
		return nil, fmt.Errorf("machine state node: %w", err)
	}
	cfg, err := parseMachineConfig(node.Settings, loc)
	if err != nil {
		fm.Log().Errorf("MachineStateNode %s: %v", node.NodeUid, err)
		return nil, fmt.Errorf("machine state node: %w", err)
	}
	n := &MachineStateNode{
		BaseNode:    newSignalBase(node, fm, p, "MachineState"),
		cfg:         cfg,
		updateAsset: settingBool(node.Settings, "updateAssetState", false),
	}
	n.state = newSignalState(&n.BaseNode)
	return n, nil
}

func (n *MachineStateNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if !n.startSignalNode(ctx, log, n.processMessage) {
		return
	}
	n.runLeaderClock(2*time.Second, func(now time.Time) { n.tick(now, log) })
}

func (n *MachineStateNode) processMessage(msg common.Message, log *logger.Logger) error {
	if n.state.handleReset(msg, log) {
		if n.updateAsset {
			_, partition := resetRequest(msg.GetPayload())
			if err := n.removeProjection(iotdb.AssetStateMachines, partition == "", partition); err != nil {
				n.HandleError(fmt.Errorf("updating the machines of the asset state: %w", err))
			}
		}
		return nil
	}
	topic, payload := msg.GetTopic(), msg.GetPayload()
	key := partitionKey(topic, payload, n.cfg.KeyPath)
	var out machineOutcome
	err := modifyState(n.Ctx, n.state, n.state.key(key), func(current *machineState) (*machineState, error) {
		out = n.cfg.observe(current, key, topic, payload, time.Now())
		return out.Next, nil
	})
	if err != nil {
		return fmt.Errorf("machine state: %w", err)
	}
	n.emit(msg, topic, out, log)
	return nil
}

func (n *MachineStateNode) tick(now time.Time, log *logger.Logger) {
	keys, err := n.state.keys(n.Ctx)
	if err != nil {
		log.Warnf("MachineStateNode %s: listing its machines: %v", n.NodeUid, err)
		return
	}
	for _, kvKey := range keys {
		key := n.state.partition(kvKey)
		var out machineOutcome
		err := modifyState(n.Ctx, n.state, kvKey, func(current *machineState) (*machineState, error) {
			out = n.cfg.tick(current, key, now)
			if out.Next == nil {
				return current, nil
			}
			return out.Next, nil
		})
		if err != nil {
			log.Warnf("MachineStateNode %s: %v", n.NodeUid, err)
			continue
		}
		topic := key
		if out.Next != nil && out.Next.Topic != "" {
			topic = out.Next.Topic
		}
		n.emit(nil, topic, out, log)
	}
}

func (n *MachineStateNode) emit(from common.Message, topic string, out machineOutcome, log *logger.Logger) {
	for _, s := range out.Summaries {
		n.sendToOutput(emitMessage(from, topic, s), 1, log)
	}
	for _, c := range out.Changes {
		n.sendToOutput(emitMessage(from, topic, c), 0, log)
	}
	if n.updateAsset && len(out.Changes) > 0 {
		last := out.Changes[len(out.Changes)-1]
		key, _ := last["key"].(string)
		if err := n.projectEntry(iotdb.AssetStateMachines, key, machineAssetEntry(n.Name, key, last)); err != nil {
			n.HandleError(fmt.Errorf("updating the machines of the asset state: %w", err))
		}
	}
}

// AssetStateSection: the section of the asset state the node writes.
func (n *MachineStateNode) AssetStateSection() string {
	if n.updateAsset {
		return iotdb.AssetStateMachines
	}
	return ""
}

// machineAssetEntry is what the asset state shows of a machine: its last
// change of state.
func machineAssetEntry(name, key string, change map[string]any) map[string]any {
	who := name
	if key != "" {
		who += " (" + key + ")"
	}
	entry := map[string]any{"name": who, "key": key}
	for _, field := range []string{"state", "since", "previousState", "message"} {
		if v, ok := change[field]; ok {
			entry[field] = v
		}
	}
	return entry
}
