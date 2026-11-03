package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
)

// DegradationNode follows a health indicator and estimates its remaining
// useful life (degradationLogic.go). Output 0: an estimate each time a
// bucket (hour or day) closes.
//
// At start, if set, the leader replica loads the indicator's history from
// the IoT database (the group's view of iot_data.thingData, in
// patroni_metrics): the stored messages of an asset topic, over the trend
// window but never beyond the data retention of thingData, already
// averaged by bucket in the database. It is loaded once per configuration
// (a marker in the KV); after a reset (e.g. the part was replaced) it is
// not loaded again, so that the old degradation does not come back.
type DegradationNode struct {
	BaseNode
	cfg   *degradationConfig
	state *signalState
	warn  onceWarner
}

func CreateDegradationNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*DegradationNode, error) {
	loc, err := nodeLocation(node.Settings, fm, p)
	if err == nil {
		var cfg *degradationConfig
		if cfg, err = parseDegradationConfig(node.Settings, loc); err == nil {
			if cfg.HistoryTopic != "" && fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), cfg.HistoryTopic) == nil {
				err = fmt.Errorf("history topic %q not found in the asset", cfg.HistoryTopic)
			} else {
				n := &DegradationNode{BaseNode: newSignalBase(node, fm, p, "Degradation"), cfg: cfg}
				n.state = newSignalState(&n.BaseNode)
				return n, nil
			}
		}
	}
	fm.Log().Errorf("DegradationNode %s: %v", node.NodeUid, err)
	return nil, fmt.Errorf("degradation node: %w", err)
}

func (n *DegradationNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if !n.startSignalNode(ctx, log, n.processMessage) {
		return
	}
	if n.cfg.HistoryTopic != "" {
		n.wg.Add(1)
		go func() {
			defer n.wg.Done()
			n.loadHistoryWhenLeader(log)
		}()
	}
}

func (n *DegradationNode) processMessage(msg common.Message, log *logger.Logger) error {
	if n.state.handleReset(msg, log) {
		return nil
	}
	topic, payload := msg.GetTopic(), msg.GetPayload()
	raw, ok := lookupPath(topic, payload, n.cfg.Field)
	value, isNumber := toNumber(raw)
	if !ok || !isNumber {
		n.warn.warn(&n.BaseNode, "Message without a number in "+n.cfg.Field)
		return nil
	}
	key := partitionKey(topic, payload, n.cfg.KeyPath)
	at := eventTime(topic, payload, n.cfg.TimePath, time.Now())
	var out degradationOutcome
	err := modifyState(n.Ctx, n.state, n.state.key(key), func(current *degradationState) (*degradationState, error) {
		out = n.cfg.observe(current, key, topic, value, at)
		return out.Next, nil
	})
	if err != nil {
		return fmt.Errorf("degradation state: %w", err)
	}
	for _, e := range out.Estimates {
		n.sendToOutput(emitMessage(msg, topic, e), 0, log)
	}
	return nil
}

// ---- history ----

type degradationHistoryMarker struct {
	Signature string `json:"signature"`
	LoadedAt  string `json:"loadedAt"`
	From      string `json:"from"`
	Buckets   int    `json:"buckets"`
}

func (n *DegradationNode) historyMarkerKey() string {
	return fmt.Sprintf("org_%s.dt_%s.kvstore.degradationhistory_%s", n.GetOrgHash(), n.GetDigitalTwinUid(), n.NodeUid)
}

// historySignature changes when what would be loaded changes.
func (n *DegradationNode) historySignature() string {
	c := n.cfg
	return strings.Join([]string{c.HistoryTopic, c.HistoryField, c.Bucket, c.KeyPath, c.Location.String()}, "|")
}

// loadHistoryWhenLeader waits until this replica leads (or the node stops)
// and loads the history once.
func (n *DegradationNode) loadHistoryWhenLeader(log *logger.Logger) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		if n.IsRunning() && n.IsLeader() {
			if err := n.loadHistory(log); err != nil {
				n.HandleError(fmt.Errorf("loading the history: %w", err))
			}
			return
		}
		select {
		case <-n.Ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (n *DegradationNode) loadHistory(log *logger.Logger) error {
	signature := n.historySignature()
	loaded := false
	err := modifyState(n.Ctx, n.state, n.historyMarkerKey(), func(current *degradationHistoryMarker) (*degradationHistoryMarker, error) {
		loaded = current != nil && current.Signature == signature
		return current, nil
	})
	if err != nil {
		return err
	}
	if loaded {
		log.Infof("DegradationNode %s: history already loaded", n.NodeUid)
		return nil
	}
	pool := n.Fm.GetDbReadPool()
	group := n.Fm.GetGroup(n.GetGroupId())
	topic := n.Fm.GetTopicByTopicRef(n.GetAssetId(), n.GetDigitalTwinId(), n.cfg.HistoryTopic)
	if pool == nil || group == nil || topic == nil {
		return fmt.Errorf("the IoT database, the group or the topic %q is not available", n.cfg.HistoryTopic)
	}
	ctx, cancel := context.WithTimeout(n.Ctx, 2*time.Minute)
	defer cancel()

	now := time.Now()
	window := time.Duration(n.cfg.WindowDays * 24 * float64(time.Hour))
	retention, hasRetention, err := thingDataRetention(ctx, pool)
	if err != nil {
		log.Warnf("DegradationNode %s: the retention of the IoT data could not be read: %v", n.NodeUid, err)
	}
	span := window
	if hasRetention && retention < span {
		span = retention
		n.HandleInfo(fmt.Sprintf("The IoT data are kept %.0f days: the history loaded covers that, not the %.0f days of the trend window", retention.Hours()/24, n.cfg.WindowDays))
	}
	from := n.cfg.bucketStart(now.Add(-span))

	// the key of each stored message, as the live messages give it
	liveSubject := utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
	query, args, err := degradationHistorySQL(n.cfg, group.GroupUID, "Topic_"+topic.TopicUid, liveSubject, from, now)
	if err != nil {
		return err
	}
	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("history query: %w", err)
	}
	byKey := map[string][]degradationBucket{}
	for rows.Next() {
		var bucket time.Time
		var key string
		var sum float64
		var count int64
		if err := rows.Scan(&bucket, &key, &sum, &count); err != nil {
			rows.Close()
			return fmt.Errorf("history row: %w", err)
		}
		// the database buckets are in the node's time zone too: their start is the live bucket's
		start := n.cfg.bucketStart(bucket).UnixMilli()
		byKey[key] = append(byKey[key], degradationBucket{T: start, Sum: sum, N: int(count)})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("history rows: %w", err)
	}

	total := 0
	for key, buckets := range byKey {
		err := modifyState(n.Ctx, n.state, n.state.key(key), func(current *degradationState) (*degradationState, error) {
			s := &degradationState{Topic: liveSubject}
			if current != nil {
				s = cloneDegradationState(current)
			}
			total += s.merge(buckets)
			return s, nil
		})
		if err != nil {
			return err
		}
	}
	marker := &degradationHistoryMarker{Signature: signature, LoadedAt: isoTime(now), From: isoTime(from), Buckets: total}
	if err := modifyState(n.Ctx, n.state, n.historyMarkerKey(), func(*degradationHistoryMarker) (*degradationHistoryMarker, error) {
		return marker, nil
	}); err != nil {
		return err
	}
	info, _ := json.Marshal(marker)
	log.Infof("DegradationNode %s: history loaded %s", n.NodeUid, info)
	n.HandleInfo(fmt.Sprintf("History loaded: %d buckets since %s", total, from.In(n.cfg.Location).Format("2006-01-02 15:04")))
	return nil
}
