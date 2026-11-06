package nodes

import (
	"context"
	"fmt"
	"time"

	"pipelines/common"
	"pipelines/iotdb"
)

// What the Alarm and Machine state nodes write into the asset state (the IoT
// DB's iot_data.assetState, read by the AssetState node, Telegram and the AI
// agents): only when something visible changes, never with each message, and
// with atomic merges (iotdb.MergeAssetState), so that nodes and replicas
// writing at once do not lose each other's changes. The nodes keep their
// working state in the digital twin's KV.

// assetOfPipeline is the group and asset uids of the node's digital twin.
func (n *BaseNode) assetOfPipeline() (groupUid, assetUid string, err error) {
	group := n.Fm.GetGroup(n.Pipeline.GetGroupId())
	if group == nil {
		return "", "", fmt.Errorf("the digital twin's group (%d) was not found", n.Pipeline.GetGroupId())
	}
	asset := n.Fm.GetOrLoadAsset(n.GetNodeContext(), n.Pipeline.GetGroupId(), n.Pipeline.GetAssetId())
	if asset == nil {
		return "", "", fmt.Errorf("the digital twin's asset (%d) was not found", n.Pipeline.GetAssetId())
	}
	return group.GroupUID, asset.AssetUid, nil
}

// setAssetStatus writes the status of the digital twin's asset (status and
// state_description), merged into its stored state.
func (n *BaseNode) setAssetStatus(status, description string) (bool, error) {
	return true, n.mergeAssetState(map[string]any{"status": status, "state_description": description}, "", nil)
}

// mergeAssetState merges fields and entries of a section into the asset state.
func (n *BaseNode) mergeAssetState(fields map[string]any, section string, entries map[string]any) error {
	groupUid, assetUid, err := n.assetOfPipeline()
	if err != nil {
		return err
	}
	pool := n.Fm.GetDbPool()
	if pool == nil {
		return fmt.Errorf("the IoT DB is not available")
	}
	return iotdb.MergeAssetState(n.Ctx, pool, groupUid, assetUid, fields, section, entries)
}

// projectionKey is the entry of a node's partition key in a section.
func (n *BaseNode) projectionKey(key string) string {
	return n.NodeUid + "|" + key
}

// projectEntry writes (entry nil: removes) the entry of a partition key of
// the node in a section of the asset state, with who wrote it and when.
func (n *BaseNode) projectEntry(section, key string, entry map[string]any) error {
	var value any
	if entry != nil {
		e := make(map[string]any, len(entry)+3)
		for k, v := range entry {
			e[k] = v
		}
		e["node"] = n.Name
		e["digitalTwinUid"] = n.GetDigitalTwinUid()
		e["updatedAt"] = isoTime(time.Now())
		value = e
	}
	return n.mergeAssetState(nil, section, map[string]any{n.projectionKey(key): value})
}

// removeProjection removes the node's entries of a section: all its
// partition keys (all) or only key's.
func (n *BaseNode) removeProjection(section string, all bool, key string) error {
	groupUid, assetUid, err := n.assetOfPipeline()
	if err != nil {
		return err
	}
	pool := n.Fm.GetDbPool()
	if pool == nil {
		return fmt.Errorf("the IoT DB is not available")
	}
	var onlyKey *string
	if !all {
		onlyKey = &key
	}
	_, err = iotdb.RemoveAssetStateEntries(n.Ctx, pool, groupUid, assetUid, section, n.GetDigitalTwinUid(), nil, n.NodeUid, onlyKey)
	return err
}

// assetProjector is a node that writes a section of the asset state: the
// pipeline removes, when it starts, the entries of its digital twin's nodes
// that no longer do (deleted or changed).
type assetProjector interface {
	AssetStateSection() string
}

// projectedSectionOf is the section a node writes ("" none).
func projectedSectionOf(node any) string {
	if p, ok := node.(assetProjector); ok {
		return p.AssetStateSection()
	}
	return ""
}

// PruneAssetStateProjections removes from the asset state the entries that
// the digital twin's nodes no longer write (a node deleted, or no longer
// updating the asset), when its pipeline starts.
func PruneAssetStateProjections(ctx context.Context, fm common.Manager, p common.Pipeline, nodes []common.Node) {
	pool := fm.GetDbPool()
	group := fm.GetGroup(p.GetGroupId())
	asset := fm.GetOrLoadAsset(ctx, p.GetGroupId(), p.GetAssetId())
	if pool == nil || group == nil || asset == nil {
		return
	}
	alive := map[string][]string{}
	for _, node := range nodes {
		if section := projectedSectionOf(node); section != "" {
			alive[section] = append(alive[section], node.GetUid())
		}
	}
	for _, section := range iotdb.ProjectedSections() {
		removed, err := iotdb.RemoveAssetStateEntries(ctx, pool, group.GroupUID, asset.AssetUid, section, p.GetDigitalTwinUid(), alive[section], "", nil)
		if err != nil {
			fm.Log().Warnf("Digital twin %s: cleaning the %s of the asset state: %v", p.GetDigitalTwinUid(), section, err)
		} else if removed > 0 {
			fm.Log().Infof("Digital twin %s: %d entries of %s removed from the asset state (their nodes no longer write them)", p.GetDigitalTwinUid(), removed, section)
		}
	}
}
