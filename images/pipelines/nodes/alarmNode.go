package nodes

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"time"

	"pipelines/common"
	"pipelines/logger"
)

// AlarmNode raises, escalates and clears an alarm with two levels
// (alarmLogic.go). Commands on its input: payload.ack (true or a key),
// payload.shelveMinutes (0: unshelve; payload.key: only that key) and
// payload.reset.
//
// Output 0: the alarm's events (only on transitions; none while shelved).
// Output 1 (optional, statusOutput): {state: {status, state_description}}
// when the node's status changes (the worst of its keys), for an AssetState
// node. With updateAssetStatus, the node also writes the asset's status
// itself: the worst of the active alarms of all the Alarm nodes of the
// digital twin that do so, kept in a registry in the KV.
type AlarmNode struct {
	BaseNode
	cfg          *alarmConfig
	state        *signalState
	statusOutput bool
	updateAsset  bool
	warn         onceWarner
}

func CreateAlarmNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*AlarmNode, error) {
	cfg, err := parseAlarmConfig(node.Name, node.Settings)
	if err != nil {
		fm.Log().Errorf("AlarmNode %s: %v", node.NodeUid, err)
		return nil, fmt.Errorf("alarm node: %w", err)
	}
	n := &AlarmNode{
		BaseNode:     newSignalBase(node, fm, p, "Alarm"),
		cfg:          cfg,
		statusOutput: settingBool(node.Settings, "statusOutput", false),
		updateAsset:  settingBool(node.Settings, "updateAssetStatus", false),
	}
	n.state = newSignalState(&n.BaseNode)
	return n, nil
}

func (n *AlarmNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if !n.startSignalNode(ctx, log, n.processMessage) {
		return
	}
	if n.updateAsset {
		n.pruneAssetRegistry(log)
	}
	n.runLeaderClock(time.Second, func(now time.Time) { n.tick(now, log) })
}

// ---- KV keys of the summaries ----

// summaryKey: the node's active alarms by partition key (for output 1).
func (n *AlarmNode) summaryKey() string {
	return fmt.Sprintf("org_%s.dt_%s.kvstore.alarmsummary_%s", n.GetOrgHash(), n.GetDigitalTwinUid(), n.NodeUid)
}

// assetRegistryKey: the active alarms of all the Alarm nodes of the digital
// twin that update the asset status, by "<node uid>|<key>".
func (n *AlarmNode) assetRegistryKey() string {
	return fmt.Sprintf("org_%s.dt_%s.kvstore.assetalarms", n.GetOrgHash(), n.GetDigitalTwinUid())
}

type alarmRegistry struct {
	Entries map[string]alarmRegistryEntry `json:"entries"`
}

func (n *AlarmNode) processMessage(msg common.Message, log *logger.Logger) error {
	payload := msg.GetPayload()
	now := time.Now()
	if reset, key := resetRequest(payload); reset {
		return n.reset(key, key == "", log)
	}
	user := ""
	if s := msg.GetSender(); s != nil {
		user = s.User
	}
	if u, ok := payload["user"].(string); ok && user == "" {
		user = u
	}
	if ack, ok := payload["ack"]; ok {
		target, all := "", false
		switch v := ack.(type) {
		case bool:
			all = v
		case string:
			target = v
		}
		if all || target != "" {
			return n.command(msg, all, target, log, func(s *alarmState, key string) alarmStepResult {
				return n.cfg.acknowledge(s, key, user, now)
			})
		}
	}
	if minutes, ok := toNumber(payload["shelveMinutes"]); ok {
		target, _ := payload["key"].(string)
		d := time.Duration(minutes * float64(time.Minute))
		return n.command(msg, target == "", target, log, func(s *alarmState, key string) alarmStepResult {
			return n.cfg.shelve(s, key, d, user, now)
		})
	}

	topic := msg.GetTopic()
	value, exists := lookupPath(topic, payload, n.cfg.Property)
	if !exists {
		n.warn.warn(&n.BaseNode, "Message without "+n.cfg.Property)
		return nil
	}
	key := partitionKey(topic, payload, n.cfg.KeyPath)
	var result alarmStepResult
	var before *alarmState
	used := true
	err := modifyState(n.Ctx, n.state, n.state.key(key), func(current *alarmState) (*alarmState, error) {
		before = current
		result, used = n.cfg.evaluate(current, key, topic, value, now)
		return result.Next, nil
	})
	if err != nil {
		return fmt.Errorf("alarm state: %w", err)
	}
	if !used {
		n.warn.warn(&n.BaseNode, fmt.Sprintf("%s is not a number: %v", n.cfg.Property, value))
		return nil
	}
	n.publish(msg, key, before, result, now, log)
	return nil
}

// command applies an acknowledgement or a shelving to one key or to all.
func (n *AlarmNode) command(msg common.Message, all bool, target string, log *logger.Logger, fn func(*alarmState, string) alarmStepResult) error {
	kvKeys := []string{n.state.key(target)}
	if all {
		var err error
		if kvKeys, err = n.state.keys(n.Ctx); err != nil {
			return err
		}
	}
	now := time.Now()
	for _, kvKey := range kvKeys {
		key := n.state.partition(kvKey)
		var result alarmStepResult
		var before *alarmState
		err := modifyState(n.Ctx, n.state, kvKey, func(current *alarmState) (*alarmState, error) {
			before = current
			if current == nil {
				result = alarmStepResult{}
				return nil, nil
			}
			result = fn(current, key)
			return result.Next, nil
		})
		if err != nil {
			return fmt.Errorf("alarm state: %w", err)
		}
		n.publish(msg, key, before, result, now, log)
	}
	return nil
}

// tick: delays that run out and shelving that ends, from the clock.
func (n *AlarmNode) tick(now time.Time, log *logger.Logger) {
	keys, err := n.state.keys(n.Ctx)
	if err != nil {
		log.Warnf("AlarmNode %s: listing its alarms: %v", n.NodeUid, err)
		return
	}
	for _, kvKey := range keys {
		key := n.state.partition(kvKey)
		var result alarmStepResult
		var before *alarmState
		err := modifyState(n.Ctx, n.state, kvKey, func(current *alarmState) (*alarmState, error) {
			before = current
			if current == nil || (current.Pending == current.Level && current.ShelvedUntil == 0) {
				result = alarmStepResult{Next: current}
				return current, nil
			}
			result = n.cfg.tick(current, key, now)
			return result.Next, nil
		})
		if err != nil {
			log.Warnf("AlarmNode %s: %v", n.NodeUid, err)
			continue
		}
		n.publish(nil, key, before, result, now, log)
	}
}

// publish sends the events (not while shelved, except the shelving ones)
// and updates the status summaries when the alarm's weight changed.
func (n *AlarmNode) publish(from common.Message, key string, before *alarmState, result alarmStepResult, now time.Time, log *logger.Logger) {
	after := result.Next
	for _, e := range result.Events {
		kind, _ := e["event"].(string)
		if after.shelved(now) && kind != "shelved" {
			continue
		}
		topic := key
		if after != nil && after.Topic != "" {
			topic = after.Topic
		}
		n.sendToOutput(emitMessage(from, topic, e), 0, log)
	}
	oldLevel, newLevel := before.effectiveLevel(now), after.effectiveLevel(now)
	oldText, newText := "", ""
	if oldLevel > alarmNone {
		oldText = n.cfg.registryText(before, key)
	}
	if newLevel > alarmNone {
		newText = n.cfg.registryText(after, key)
	}
	if oldLevel == newLevel && oldText == newText {
		return
	}
	entry := alarmRegistryEntry{Level: newLevel, Text: newText}
	if n.statusOutput {
		n.updateSummary(n.summaryKey(), key, entry, func(status, description string) {
			state := map[string]any{"status": status, "state_description": description}
			n.sendToOutput(emitMessage(from, key, map[string]any{"state": state}), 1, log)
		}, log)
	}
	if n.updateAsset {
		n.updateSummary(n.assetRegistryKey(), n.NodeUid+"|"+key, entry, func(status, description string) {
			if _, err := n.setAssetStatus(status, description); err != nil {
				n.HandleError(fmt.Errorf("updating the asset status: %w", err))
			}
		}, log)
	}
}

// updateSummary sets (or removes) an entry of a summary and calls changed
// with the resulting status when it changed.
func (n *AlarmNode) updateSummary(kvKey, entryKey string, entry alarmRegistryEntry, changed func(status, description string), log *logger.Logger) {
	var oldStatus, oldDesc, newStatus, newDesc string
	err := modifyState(n.Ctx, n.state, kvKey, func(current *alarmRegistry) (*alarmRegistry, error) {
		next := &alarmRegistry{Entries: map[string]alarmRegistryEntry{}}
		if current != nil {
			for k, v := range current.Entries {
				next.Entries[k] = v
			}
		}
		oldStatus, oldDesc = assetStatusOf(next.Entries)
		if entry.Level == alarmNone {
			delete(next.Entries, entryKey)
		} else {
			next.Entries[entryKey] = entry
		}
		newStatus, newDesc = assetStatusOf(next.Entries)
		return next, nil
	})
	if err != nil {
		log.Warnf("AlarmNode %s: status summary: %v", n.NodeUid, err)
		return
	}
	if oldStatus != newStatus || oldDesc != newDesc {
		changed(newStatus, newDesc)
	}
}

// reset clears the alarms of one key or all, and their status entries.
func (n *AlarmNode) reset(key string, all bool, log *logger.Logger) error {
	if err := n.state.reset(n.Ctx, all, key); err != nil {
		return fmt.Errorf("reset failed: %w", err)
	}
	clear := func(kvKey, prefix string, changed func(string, string)) {
		var status, desc string
		modified := false
		err := modifyState(n.Ctx, n.state, kvKey, func(current *alarmRegistry) (*alarmRegistry, error) {
			modified = false
			if current == nil {
				return nil, nil
			}
			next := &alarmRegistry{Entries: map[string]alarmRegistryEntry{}}
			for k, v := range current.Entries {
				if all && strings.HasPrefix(k, prefix) || !all && k == prefix+key {
					continue
				}
				next.Entries[k] = v
			}
			modified = !reflect.DeepEqual(next.Entries, current.Entries)
			status, desc = assetStatusOf(next.Entries)
			return next, nil
		})
		if err == nil && modified {
			changed(status, desc)
		}
	}
	if n.statusOutput {
		clear(n.summaryKey(), "", func(status, desc string) {
			n.sendToOutput(emitMessage(nil, key, map[string]any{"state": map[string]any{"status": status, "state_description": desc}}), 1, log)
		})
	}
	if n.updateAsset {
		clear(n.assetRegistryKey(), n.NodeUid+"|", func(status, desc string) {
			if _, err := n.setAssetStatus(status, desc); err != nil {
				n.HandleError(fmt.Errorf("updating the asset status: %w", err))
			}
		})
	}
	n.HandleInfo("Alarm state reset")
	return nil
}

// pruneAssetRegistry removes from the digital twin's registry the alarms of
// nodes that are no longer Alarm nodes updating the asset status (deleted
// or changed), so that they do not keep the asset in alarm.
func (n *AlarmNode) pruneAssetRegistry(log *logger.Logger) {
	alive := map[string]bool{}
	for _, node := range n.Pipeline.GetNodes() {
		if a, ok := node.(*AlarmNode); ok && a.updateAsset {
			alive[a.NodeUid] = true
		}
	}
	var status, desc string
	pruned := false
	err := modifyState(n.Ctx, n.state, n.assetRegistryKey(), func(current *alarmRegistry) (*alarmRegistry, error) {
		pruned = false
		if current == nil {
			return nil, nil
		}
		next := &alarmRegistry{Entries: map[string]alarmRegistryEntry{}}
		for k, v := range current.Entries {
			uid := k
			if i := strings.Index(k, "|"); i >= 0 {
				uid = k[:i]
			}
			if alive[uid] {
				next.Entries[k] = v
			} else {
				pruned = true
			}
		}
		status, desc = assetStatusOf(next.Entries)
		return next, nil
	})
	if err != nil {
		log.Warnf("AlarmNode %s: pruning the asset's alarms: %v", n.NodeUid, err)
		return
	}
	if pruned {
		if _, err := n.setAssetStatus(status, desc); err != nil {
			n.HandleError(fmt.Errorf("updating the asset status: %w", err))
		}
	}
}
