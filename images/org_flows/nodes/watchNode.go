package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"org_flows/common"
	"org_flows/logger"
	"org_flows/utils"
)

type WatchNode struct {
	BaseNode
	Subject string
}

func CreateWatchNode(nodeUid string, flow common.Flow, subject string) *WatchNode {
	ctx, cancel := context.WithCancel(context.Background())
	return &WatchNode{
		BaseNode: BaseNode{
			Uid:    nodeUid,
			Type:   "WatchNode",
			Flow:   flow,
			Cancel: cancel,
			Ctx:    ctx,
		},
		Subject: subject,
	}
}

func (n *WatchNode) Start(log *logger.Logger) {
	go func() {
		log.Infof("Starting WatchNode with UID: %s", n.Uid)
		fullKey := fmt.Sprintf("org_%s.flow_%s.%s", n.Flow.OrgHash, n.Flow.FlowUID, n.Subject)
		w, err := n.Flow.KeyValueStore.Watch(n.Ctx, fullKey)
		if err != nil {
			log.Errorf("Failed to watch key %s: %v", fullKey, err)
			n.handleError(fmt.Errorf("failed to watch key: %w", err))
			return
		}

		for {
			select {
			case <-n.Ctx.Done():
				log.Infof("Stopping WatchNode with UID: %s", n.Uid)
				w.Stop()
				return
			case kve := <-w.Updates():
				if kve != nil {
					if kveData := kve.Value(); kveData != nil {
						var watchMessage map[string]any
						if err := json.Unmarshal(kveData, &watchMessage); err != nil {
							log.Errorf("Failed to unmarshal watch message for node %s: %v", n.Uid, err)
							return
						}
	
						for _, childNode := range n.Flow.Children[n.Uid] {
							message := common.Message{
								Timestamp: utils.Timestamp{}.Now(),
								Subject:   n.Subject,
								Payload:   watchMessage,
							}
							if err := json.Unmarshal(kveData, &message); err != nil {
								log.Infof("Failed to unmarshal message for node %s: %v", n.Uid, err)
								n.handleError(fmt.Errorf("failed to unmarshal message: %w", err))
								continue
							}
							n.Flow.Channels[childNode] <- message
						}
					}
				}
			}
		}

	}()
}
