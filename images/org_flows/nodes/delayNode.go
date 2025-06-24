package nodes

import (
	"context"
	"org_flows/common"
	"org_flows/logger"
	"time"
)

type DelayNode struct {
	BaseNode
	Duration int // Delay in milliseconds
}

func CreateDelayNode(nodeUid string, flow common.Flow, duration int) *DelayNode {
	ctx, cancel := context.WithCancel(context.Background())
	return &DelayNode{
		BaseNode: BaseNode{
			Uid:    nodeUid,
			Type:   "DelayNode",
			Flow:   flow,
			Cancel: cancel,
			Ctx:    ctx,
		},
		Duration: duration,
	}
}

func (n *DelayNode) Start(log *logger.Logger) {
	log.Infof("Starting DelayNode with UID: %s", n.Uid)
	go func() {
		for {
			select {
			case <-n.Ctx.Done():
				log.Infof("Stopping DelayNode with UID: %s", n.Uid)
				return
			case msg, ok := <-n.Flow.Channels[n.Uid]:
				if !ok {
					log.Infof("Channel closed for DelayNode with UID: %s", n.Uid)
					return
				}
				
				select {
				case <-n.Ctx.Done():
					log.Infof("Stopping DelayNode with UID: %s during delay", n.Uid)
					return
				case <-time.After(time.Duration(n.Duration) * time.Millisecond):
				}
				

				for _, childNodeUid := range n.Flow.Children[n.Uid] {
					select {
					case <-n.Ctx.Done():
						log.Infof("Stopping DelayNode with UID: %s during message forwarding", n.Uid)
						return
					case n.Flow.Channels[childNodeUid] <- msg:
					}
				}
			}
		}
	}()
}

