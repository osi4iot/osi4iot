package nodes

import (
	"fmt"
	"reflect"

	"pipelines/iotdb"
)

// setAssetStatus writes the status of the digital twin's asset, merged into
// its stored state (the other fields are kept). Says whether it changed.
// Kept apart from the Alarm node so that its logic is tested without a
// database.
func (n *BaseNode) setAssetStatus(status, description string) (bool, error) {
	group := n.Fm.GetGroup(n.Pipeline.GetGroupId())
	asset := n.Fm.GetAssetById(n.Pipeline.GetAssetId())
	if group == nil || asset == nil {
		return false, fmt.Errorf("the digital twin's asset was not found")
	}
	current, err := n.GetAssetState(asset.AssetUid, group.GroupUID)
	if err != nil {
		return false, err
	}
	next := map[string]any{}
	for k, v := range current {
		next[k] = v
	}
	next["status"] = status
	next["state_description"] = description
	if reflect.DeepEqual(current["status"], next["status"]) && reflect.DeepEqual(current["state_description"], next["state_description"]) {
		return false, nil
	}
	pool := n.Fm.GetDbPool()
	if pool == nil {
		return false, fmt.Errorf("the IoT DB is not available")
	}
	return true, iotdb.UpsertAssetState(n.Ctx, pool, iotdb.AssetState{GroupUid: group.GroupUID, AssetUid: asset.AssetUid, State: next})
}
