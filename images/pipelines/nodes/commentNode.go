package nodes

import (
	"pipelines/common"
	"pipelines/logger"
)

type CommentNode struct {
	BaseNode
	Comment string `json:"comment"`
}

func CreateCommentNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*CommentNode, error) {
	return &CommentNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "Comment",
			LogSubject: "",
			Fm:         fm,
			Pipeline:   p,
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		Comment: "",
	}, nil
}

func (n *CommentNode) Start(log *logger.Logger, needReinitialization bool) {
	// Comment nodes don't have any processing logic, so we just set their status to running
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("CommentNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting CommentNode with UID: %s", n.NodeUid)
}

func (n *CommentNode) Stop(log *logger.Logger) {
	if n.GetStatus() != common.NodeStatusRunning {
		log.Infof("CommentNode %s is not running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusStopped)
	log.Infof("Stopped CommentNode with UID: %s", n.NodeUid)
}
