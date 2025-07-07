package flows_manager

import (
	"fmt"
	"pipelines/common"
	"pipelines/nodes"
	"strconv"
)

func (fm *FlowsManager) GetNode(nodeId int) *common.Node {
	if value, exists := fm.Nodes.Load(strconv.Itoa(nodeId)); exists {
		node, ok := value.(*common.Node)
		if !ok {
			fm.log.Errorf("Node with ID %d is not of type *common.Node", nodeId)
			return nil
		}
		return node
	}
	return nil
}

func (fm *FlowsManager) GetNodes() []*common.Node {
	var nodes []*common.Node
	fm.Nodes.Range(func(key, value interface{}) bool {
		nodes = append(nodes, value.(*common.Node))
		return true
	})
	return nodes
}

func (fm *FlowsManager) AddNode(node *common.NodeData) {
	nodeData := &common.NodeData{
		Id:            node.Id,
		NodeUid:       node.NodeUid,
		OrgId:         node.OrgId,
		GroupId:       node.GroupId,
		AssetId:       node.AssetId,
		DigitalTwinId: node.DigitalTwinId,
		Name:          node.Name,
		Type:          node.Type,
		NumOutputs:    node.NumOutputs,
		Xpos:          node.Xpos,
		Ypos:          node.Ypos,
		Settings:      node.Settings,
	}
	newNode := nodes.CreateNode(*nodeData, fm.log, fm)

	nodeIdStr := strconv.Itoa(node.Id)
	if _, ok := fm.Nodes.Load(nodeIdStr); !ok {
		fm.Nodes.Store(nodeIdStr, &newNode)
		fm.AddNodeToDigitalTwin(node.DigitalTwinId, nodeData)
	} else {
		fm.log.Error("Node with ID %d already exists", node.Id)
	}
}

func (fm *FlowsManager) AddNodes(nodes []*common.NodeData) {
	for _, node := range nodes {
		fm.AddNode(node)
	}
}

func (fm *FlowsManager) DeleteNode(nodeId int) error {
	nodeIdStr := strconv.Itoa(nodeId)
	if value, ok := fm.Nodes.Load(nodeIdStr); ok {
		node := value.(*common.NodeData)
		fm.deleteNodeFromDigitalTwin(node.DigitalTwinId, nodeId)
		fm.Nodes.Delete(nodeIdStr)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateNode(node *common.NodeData) error {
	nodeIdStr := strconv.Itoa(node.Id)
	if value, ok := fm.Nodes.Load(nodeIdStr); ok {
		existingNode := value.(*common.NodeData)
		if existingNode.NumOutputs != node.NumOutputs {
			fm.UpdateNodeWires(existingNode, node)
		}
		fm.Nodes.Store(nodeIdStr, node)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateNodeWires(existentNode *common.NodeData, updatedNode *common.NodeData) error {
     if updatedNode.NumOutputs < existentNode.NumOutputs {
		// Remove excess output wires
		for outputIndex := updatedNode.NumOutputs; outputIndex < existentNode.NumOutputs; outputIndex++ {
			outputIndexKey := makeNodeOutputIndexKey(existentNode.DigitalTwinId, existentNode.Id, outputIndex)
			if value, ok := fm.NodeOutputByIndex.Load(outputIndexKey); ok {
				wire := value.(*common.Wire)
				fm.NodeOutputByIndex.Delete(outputIndexKey)
				fm.deleteWireFromDigitalTwin(existentNode.DigitalTwinId, wire.Id)
				if err := fm.DeleteWire(wire.Id); err != nil {
					fm.log.Errorf("Failed to delete wire %d: %v", wire.Id, err)
				}
			}
		}
	}

	return nil
}


func (fm *FlowsManager) AddNodeToDigitalTwin(digitalTwinId int, node *common.NodeData) error {
	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		return fmt.Errorf("digital twin %d not found", digitalTwinId)
	}

	fm.updateDigitalTwinNodesIndex(digitalTwinId, node, true)

	// Initialize node input and output wires
	fm.NodeOutputWires.Store(makeNodeOutputWiresKey(digitalTwinId, node.Id), [][]*common.Wire{})
	fm.NodeInputWires.Store(makeNodeInputWiresKey(digitalTwinId, node.Id), []*common.Wire{})

	return nil
}

func (fm *FlowsManager) updateDigitalTwinNodesIndex(digitalTwinId int, node *common.NodeData, add bool) {
	indexKey := makeDTNodesKey(digitalTwinId)

	var nodes []*common.NodeData
	if value, ok := fm.DigitalTwinNodes.Load(indexKey); ok {
		nodes = value.([]*common.NodeData)
	}

	if add {
		for _, n := range nodes {
			if n.Id == node.Id {
				return
			}
		}
		nodes = append(nodes, node)
	} else {
		// Remove the node from the list
		for i, n := range nodes {
			if n.Id == node.Id {
				nodes = append(nodes[:i], nodes[i+1:]...)
				break
			}
		}
	}

	fm.DigitalTwinNodes.Store(indexKey, nodes)
}

func (fm *FlowsManager) deleteNodeFromDigitalTwin(digitalTwinId int, nodeId int) error {
	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		return fmt.Errorf("digital twin %d not found", digitalTwinId)
	}


	nodeIdStr := strconv.Itoa(nodeId)
	var node *common.NodeData
	if value, ok := fm.Nodes.Load(nodeIdStr); !ok {
		return common.ErrNotFound
	} else {
		node = value.(*common.NodeData)
	}

	fm.updateDigitalTwinNodesIndex(digitalTwinId, &common.NodeData{Id: nodeId}, false)

	wiresToDelete := []*common.Wire{}
	nodeOutputWires := fm.GetNodeOutputWires(digitalTwinId, nodeId)
	for _, wire := range nodeOutputWires {
		for _, w := range wire {
			wiresToDelete = append(wiresToDelete, w)
		}
	}
	nodeInputWires := fm.GetNodeInputWires(digitalTwinId, nodeId)
	for _, wire := range nodeInputWires {
		wiresToDelete = append(wiresToDelete, wire)
	}

	// Delete all wires connected to this node
	for _, wire := range wiresToDelete {
		fm.updateDigitalTwinWiresIndex(digitalTwinId, wire, false)
		if err := fm.DeleteWire(wire.Id); err != nil {
			fm.log.Errorf("Failed to delete wire %d: %v", wire.Id, err)
		}
	}

	// Remove node input and output wires
	fm.NodeOutputWires.Delete(makeNodeOutputWiresKey(digitalTwinId, nodeId))
	fm.NodeInputWires.Delete(makeNodeInputWiresKey(digitalTwinId, nodeId))

	for outputIndex := 0; outputIndex < node.NumOutputs; outputIndex++ {
		outputIndexKey := makeNodeOutputIndexKey(digitalTwinId, nodeId, outputIndex)
		fm.NodeOutputByIndex.Delete(outputIndexKey)
	}

	return nil
}

func (fm *FlowsManager) GetDigitalTwinNodes(digitalTwinId int) []*common.Node {
	indexKey := makeDTNodesKey(digitalTwinId)
	if value, ok := fm.DigitalTwinNodes.Load(indexKey); ok {
		return value.([]*common.Node)
	}
	return nil
}
