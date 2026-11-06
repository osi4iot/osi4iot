package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"time"

	"pipelines/common"
	"pipelines/iotdb"
	"pipelines/logger"
	"pipelines/utils"

	"github.com/nats-io/nats.go"
)

// AlarmNode raises, escalates and clears an alarm with two levels
// (alarmLogic.go). Commands on its input: payload.ack (true or a key),
// payload.shelveMinutes (0: unshelve; payload.key: only that key) and
// payload.reset. The same acknowledgement and shelving come from the
// viewer's buttons, as NATS requests on the users' copies of the digital
// twin's approval topic with an "Alarm-Node" header (processViewerMessage).
//
// Output 0: the alarm's events (only on transitions; none while shelved).
// Output 1 (optional, statusOutput): {state: {status, state_description}}
// when the node's status changes (the worst of its keys), for an AssetState
// node. With updateAssetStatus, the node also writes the asset's status
// itself: the worst of the active alarms of all the Alarm nodes of the
// digital twin that do so, kept in a registry in the KV; and each of its
// alarms that is not normal in the asset state's "alarms" (when its level,
// state, acknowledgement or shelving changes, not with each value).
type AlarmNode struct {
	BaseNode
	cfg          *alarmConfig
	state        *signalState
	statusOutput bool
	updateAsset  bool
	warn         onceWarner
	subject      string // the digital twin's approval topic: the viewer's buttons ("" none)
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
	// the viewer's buttons: without the topic (a digital twin saved before
	// it existed) the alarms are still acknowledged and shelved by messages
	if topic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), approvalTopicRef); topic != nil {
		n.subject = utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
	} else {
		fm.Log().Warnf("AlarmNode %s: the digital twin has no %q topic: no buttons in the viewer (saving the pipeline creates it)", node.NodeUid, approvalTopicRef)
	}
	return n, nil
}

func (n *AlarmNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if !n.startSignalNode(ctx, log, n.processMessage) {
		return
	}
	if n.updateAsset {
		n.pruneAssetRegistry(log)
	}
	if n.subject != "" {
		// the copies of the approval topic of all the users: the subject says who presses
		n.wg.Add(1)
		go n.handleNatsSubscription(log, utils.AllUsersChatSubject(n.subject), n.processViewerMessage)
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
	// rearm (latched alarms): true resets all of them, a text one key
	if rearm, ok := payload["rearm"]; ok {
		target, all := "", false
		switch v := rearm.(type) {
		case bool:
			all = v
		case string:
			target = v
		}
		if all || target != "" {
			return n.command(msg, all, target, log, func(s *alarmState, key string) alarmStepResult {
				return n.cfg.rearm(s, key, user, now)
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

// AssetStateSection: the section of the asset state the node writes.
func (n *AlarmNode) AssetStateSection() string {
	if n.updateAsset {
		return iotdb.AssetStateAlarms
	}
	return ""
}

// assetEntry is what the asset state shows of an alarm (nil when normal):
// the viewer's summary, with the value of its last change.
func (n *AlarmNode) assetEntry(s *alarmState, key string, now time.Time) map[string]any {
	if s == nil {
		return nil
	}
	return n.cfg.viewerSummary(s, key, now)
}

// sameAssetEntry: two entries that differ only in the value (it changes with
// each message while the alarm is active: it is not written for that).
func sameAssetEntry(a, b map[string]any) bool {
	if (a == nil) != (b == nil) {
		return false
	}
	strip := func(m map[string]any) map[string]any {
		out := make(map[string]any, len(m))
		for k, v := range m {
			if k != "value" {
				out[k] = v
			}
		}
		return out
	}
	return reflect.DeepEqual(strip(a), strip(b))
}

// projectAlarm writes the alarm's entry in the asset state when it changed.
func (n *AlarmNode) projectAlarm(key string, before, after *alarmState, now time.Time) {
	if !n.updateAsset {
		return
	}
	old, next := n.assetEntry(before, key, now), n.assetEntry(after, key, now)
	if sameAssetEntry(old, next) {
		return
	}
	if err := n.projectEntry(iotdb.AssetStateAlarms, key, next); err != nil {
		n.HandleError(fmt.Errorf("updating the alarms of the asset state: %w", err))
	}
}

// publish sends the events (not while shelved, except the shelving ones)
// and updates the status summaries when the alarm's weight changed.
func (n *AlarmNode) publish(from common.Message, key string, before *alarmState, result alarmStepResult, now time.Time, log *logger.Logger) {
	after := result.Next
	n.projectAlarm(key, before, after, now)
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
		if err := n.removeProjection(iotdb.AssetStateAlarms, all, key); err != nil {
			n.HandleError(fmt.Errorf("updating the alarms of the asset state: %w", err))
		}
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

// ---- the viewer's buttons ----

// processViewerMessage takes a press of the viewer's alarm buttons: the user
// is in the subject (its own copy of the approval topic), and only the
// presses addressed to this node count. The answer goes to the request's
// reply.
func (n *AlarmNode) processViewerMessage(msg *nats.Msg, log *logger.Logger) error {
	if msg.Header == nil || msg.Header.Get(alarmNodeHeader) != n.NodeUid {
		return nil
	}
	reply := func(answer map[string]any) {
		if msg.Reply == "" {
			return
		}
		b, _ := json.Marshal(answer)
		if err := msg.Respond(b); err != nil {
			log.Warnf("AlarmNode %s: answering the viewer: %v", n.NodeUid, err)
		}
	}
	user, ok := utils.UserOfChatSubject(msg.Subject, n.subject)
	if !ok {
		return nil
	}
	req, all, key, d, err := parseAlarmViewerRequest(msg.Data)
	if err != nil {
		reply(map[string]any{"ok": false, "error": err.Error()})
		return nil
	}
	now := time.Now()
	switch req.Action {
	case "list":
		alarms, err := n.viewerAlarms(now)
		if err != nil {
			reply(map[string]any{"ok": false, "error": err.Error()})
			return err
		}
		reply(map[string]any{"ok": true, "alarms": alarms})
		return nil
	case "ack":
		err = n.command(nil, all, key, log, func(s *alarmState, k string) alarmStepResult {
			return n.cfg.acknowledge(s, k, user, now)
		})
	case "shelve":
		err = n.command(nil, all, key, log, func(s *alarmState, k string) alarmStepResult {
			return n.cfg.shelve(s, k, d, user, now)
		})
	case "reset":
		if !n.cfg.Latched {
			reply(map[string]any{"ok": false, "error": "this alarm is not latched: it goes back to normal by itself"})
			return nil
		}
		reset := 0
		err = n.command(nil, all, key, log, func(s *alarmState, k string) alarmStepResult {
			r := n.cfg.rearm(s, k, user, now)
			reset += len(r.Events)
			return r
		})
		if err == nil && reset == 0 {
			reply(map[string]any{"ok": false, "error": "nothing to reset: the value is still beyond the level"})
			return nil
		}
	}
	if err != nil {
		reply(map[string]any{"ok": false, "error": err.Error()})
		return err
	}
	n.HandleInfo(fmt.Sprintf("Alarm %s by %s from the viewer", map[string]string{"ack": "acknowledged", "shelve": "shelving changed", "reset": "reset"}[req.Action], user))
	reply(map[string]any{"ok": true})
	return nil
}

// viewerAlarms lists the alarms that are not normal, for the viewer.
func (n *AlarmNode) viewerAlarms(now time.Time) ([]map[string]any, error) {
	keys, err := n.state.keys(n.Ctx)
	if err != nil {
		return nil, fmt.Errorf("listing the alarms: %w", err)
	}
	kv, err := n.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if err != nil {
		return nil, err
	}
	list := make([]map[string]any, 0, len(keys))
	for _, kvKey := range keys {
		raw, err := kv.GetRawValue(n.Ctx, kvKey)
		if err != nil {
			if ignoreNotFound(err) == nil {
				continue // removed meanwhile
			}
			return nil, fmt.Errorf("reading an alarm: %w", err)
		}
		var s alarmState
		if err := json.Unmarshal(raw, &s); err != nil {
			continue // unreadable (another version): the next message rewrites it
		}
		if summary := n.cfg.viewerSummary(&s, n.state.partition(kvKey), now); summary != nil {
			list = append(list, summary)
		}
	}
	sortViewerAlarms(list)
	return list, nil
}
