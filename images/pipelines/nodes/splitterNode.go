package nodes

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"sync/atomic"
)

type SplitterNode struct {
	BaseNode
	Weights []int
	total   int
	counter atomic.Uint64
}

func CreateSplitterNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*SplitterNode, error) {
	// Leer weights desde settings
	rawWeights, ok := node.Settings["weights"].([]interface{})
	if !ok || len(rawWeights) == 0 {
		return nil, fmt.Errorf("weights setting is required and must be a non-empty array")
	}

	weights := make([]int, len(rawWeights))
	total := 0
	for i, w := range rawWeights {
		wFloat, ok := w.(float64) // JSON numbers son float64 en Go
		if !ok || wFloat <= 0 {
			return nil, fmt.Errorf("weight at index %d must be a positive number", i)
		}
		weights[i] = int(wFloat)
		total += weights[i]
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	return &SplitterNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "Splitter",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		Weights: weights,
		total:   total,
	}, nil
}

func (n *SplitterNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("SplitterNode %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodectx
	n.Cancel = nodeCancel

	n.counter.Store(0)
	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting SplitterNode %s with weights %v (total: %d)", n.NodeUid, n.Weights, n.total)

	n.handleInputWires(log, n.processMessage)
}

func (n *SplitterNode) processMessage(msg common.Message, log *logger.Logger) error {
	// Weighted round-robin: determina el output para este mensaje
	idx := int(n.counter.Add(1)-1) % n.total

	outputIndex := 0
	cumulative := 0
	for i, w := range n.Weights {
		cumulative += w
		if idx < cumulative {
			outputIndex = i
			break
		}
	}

	nodeOutputWires := n.GetNodeOutputWires()
	if outputIndex >= len(nodeOutputWires) {
		return fmt.Errorf("output index %d out of range (have %d outputs)", outputIndex, len(nodeOutputWires))
	}

	// Valida que el número de outputs coincide con los weights definidos
	if len(nodeOutputWires) != len(n.Weights) {
		return fmt.Errorf("weights count (%d) does not match output count (%d)", len(n.Weights), len(nodeOutputWires))
	}

	wireArray := nodeOutputWires[outputIndex]
	for _, wire := range wireArray {
		select {
		case wire.Channel <- msg:
			if n.Debug == "on" {
				n.HandleDebug(msg, outputIndex)
			}
		case <-n.Ctx.Done():
			log.Infof("Context cancelled while sending message from SplitterNode %s", n.NodeUid)
			return nil
		default:
			log.Warnf("Output channel full for SplitterNode %s output %d, dropping message", n.NodeUid, outputIndex)
		}
	}

	return nil
}
