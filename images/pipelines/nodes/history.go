package nodes

import (
	"time"

	"pipelines/common"
	"pipelines/iotdb"
)

// historyContext is where the node's events happen, for the history of
// alarms and approvals (iot_data.alarm, iot_data.approval).
func (n *BaseNode) historyContext() iotdb.HistoryContext {
	if n.Pipeline == nil {
		return iotdb.HistoryContext{NodeUid: n.NodeUid, NodeName: n.Name}
	}
	hc := iotdb.HistoryContext{
		OrgId:          n.GetOrgId(),
		GroupId:        n.GetGroupId(),
		AssetId:        n.GetAssetId(),
		DigitalTwinId:  n.GetDigitalTwinId(),
		DigitalTwinUid: n.GetDigitalTwinUid(),
		NodeUid:        n.NodeUid,
		NodeName:       n.Name,
	}
	hc.DigitalTwinDescription = n.Pipeline.GetDigitalTwinDescription()
	if n.Fm == nil {
		return hc
	}
	if g := n.Fm.GetGroup(hc.GroupId); g != nil {
		hc.GroupUid = g.GroupUID
	}
	if a := n.Fm.GetOrLoadAsset(n.GetNodeContext(), hc.GroupId, hc.AssetId); a != nil {
		hc.AssetUid, hc.AssetDescription = a.AssetUid, a.Description
	}
	return hc
}

// messageCopy is the topic and payload of a message (nothing for nil).
func messageCopy(msg common.Message) (string, map[string]any) {
	if msg == nil {
		return "", nil
	}
	return msg.GetTopic(), msg.GetPayload()
}

// recordApproval writes an event of a request in the history of approvals.
func (n *ApprovalNode) recordApproval(req *approvalRequest, event, by, via, comment string, at time.Time) {
	if !iotdb.HistoryEnabled() {
		return
	}
	iotdb.RecordApproval(approvalHistoryRecord(n.historyContext(), n.cfg.Channel, req, event, by, via, comment, at))
}
