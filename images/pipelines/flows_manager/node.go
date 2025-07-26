package flows_manager

import (
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/nodes"
	"pipelines/utils"
	"strconv"
	"sync"
	"time"
)

func (fm *FlowsManager) GetNode(nodeId int) common.Node {
	if value, exists := fm.Nodes.Load(strconv.Itoa(nodeId)); exists {
		node, ok := value.(common.Node)
		if !ok {
			fm.log.Errorf("Node with ID %d is not of type common.Node", nodeId)
			return nil
		}
		return node
	}
	return nil
}

func (fm *FlowsManager) GetNodes() []common.Node {
	var nodes []common.Node
	fm.Nodes.Range(func(key, value interface{}) bool {
		nodes = append(nodes, value.(common.Node))
		return true
	})
	return nodes
}

func (fm *FlowsManager) AddNode(node *common.NodeData) error {
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
		Debug:         node.Debug,
	}
	var err error = nil
	newNode, err := nodes.CreateNode(*nodeData, fm.log, fm)
	if err != nil {
		return err
	}

	nodeIdStr := strconv.Itoa(node.Id)
	if _, ok := fm.Nodes.Load(nodeIdStr); !ok {
		fm.Nodes.Store(nodeIdStr, newNode)
		fm.addNodeToDigitalTwin(node.DigitalTwinId, newNode)
	} else {
		fm.log.Warnf("Node with ID %d already exists", node.Id)
	}

	return nil
}

func (fm *FlowsManager) AddNodes(nodes []*common.NodeData) error {
	for _, node := range nodes {
		if err := fm.AddNode(node); err != nil {
			fm.handleNodeError(node, err)
			return err
		}
	}
	return nil
}

func (fm *FlowsManager) DeleteNode(nodeId int) error {
	nodeIdStr := strconv.Itoa(nodeId)
	if value, ok := fm.Nodes.Load(nodeIdStr); ok {
		node := value.(common.Node)
		digitalTwinId := node.GetDigitalTwinId()
		fm.deleteNodeFromDigitalTwin(digitalTwinId, node.GetId())
		fm.Nodes.Delete(nodeIdStr)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateNode(node *common.NodeData) error {
	nodeIdStr := strconv.Itoa(node.Id)
	if value, ok := fm.Nodes.Load(nodeIdStr); ok {
		existingNode := value.(common.Node)
		existingNode.Stop(fm.log)

		if existingNode.GetNumOutputs() != node.NumOutputs {
			fm.updateNodeWires(existingNode, node)
		}

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
			Debug:         node.Debug,
		}
		newNode, err := nodes.CreateNode(*nodeData, fm.log, fm)
		if err != nil {
			return err
		}
		fm.Nodes.Store(nodeIdStr, newNode)
		fm.updateDigitalTwinNodesIndex(node.DigitalTwinId, newNode, "replace")
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) regenerateNode(nodeId int) error {
	nodeIdStr := strconv.Itoa(nodeId)
	if value, ok := fm.Nodes.Load(nodeIdStr); ok {
		existingNode := value.(common.Node)
		existingNode.Stop(fm.log)

		nodeData := &common.NodeData{
			Id:            existingNode.GetId(),
			NodeUid:       existingNode.GetUid(),
			OrgId:         existingNode.GetOrgId(),
			GroupId:       existingNode.GetGroupId(),
			AssetId:       existingNode.GetAssetId(),
			DigitalTwinId: existingNode.GetDigitalTwinId(),
			Name:          existingNode.GetName(),
			Type:          existingNode.GetType(),
			NumOutputs:    existingNode.GetNumOutputs(),
			Xpos:          existingNode.GetXpos(),
			Ypos:          existingNode.GetYpos(),
			Settings:      existingNode.GetSettings(),
			Debug:         existingNode.GetDebug(),
		}
		newNode, err := nodes.CreateNode(*nodeData, fm.log, fm)
		if err != nil {
			fm.log.Errorf("Failed to regenerate node %d: %v", nodeId, err)
			return err
		}
		fm.Nodes.Store(nodeIdStr, newNode)
		fm.updateDigitalTwinNodesIndex(existingNode.GetDigitalTwinId(), newNode, "replace")
	} else {
		fm.log.Errorf("Failed to regenerate node %d, it does not exist", nodeId)
		return common.ErrNotFound
	}
	return nil
}

func (fm *FlowsManager) RegenerateNodesInDigitalTwin(digitalTwinId int) {
	nodes := fm.GetDigitalTwinNodes(digitalTwinId)
	if len(nodes) == 0 {
		fm.log.Warnf("No nodes found for digital twin %d", digitalTwinId)
		return
	}
	for _, node := range nodes {
		fm.regenerateNode(node.GetId())
	}
}

func (fm *FlowsManager) updateNodeWires(existentNode common.Node, updatedNode *common.NodeData) error {
	if updatedNode.NumOutputs < existentNode.GetNumOutputs() {
		// Remove excess output wires
		for outputIndex := updatedNode.NumOutputs; outputIndex < existentNode.GetNumOutputs(); outputIndex++ {
			outputIndexKey := makeNodeOutputIndexKey(existentNode.GetDigitalTwinId(), existentNode.GetId(), outputIndex)
			if value, ok := fm.NodeOutputByIndex.Load(outputIndexKey); ok {
				wires := value.([]*common.Wire)
				fm.NodeOutputByIndex.Delete(outputIndexKey)
				for _, wire := range wires {
					fm.deleteWireFromDigitalTwin(existentNode.GetDigitalTwinId(), wire.Id)
					if err := fm.DeleteWire(wire.Id); err != nil {
						if err != common.ErrNotFound {
							fm.log.Errorf("Failed to delete wire %d: %v", wire.Id, err)
						}
					}
				}
			}
		}
	}

	return nil
}

func (fm *FlowsManager) addNodeToDigitalTwin(digitalTwinId int, node common.Node) error {
	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		return fmt.Errorf("digital twin %d not found", digitalTwinId)
	}

	fm.updateDigitalTwinNodesIndex(digitalTwinId, node, "add")

	// Initialize node input and output wires
	fm.NodeOutputWires.Store(makeNodeOutputWiresKey(digitalTwinId, node.GetId()), [][]*common.Wire{})
	fm.NodeInputWires.Store(makeNodeInputWiresKey(digitalTwinId, node.GetId()), []*common.Wire{})

	return nil
}

func (fm *FlowsManager) updateDigitalTwinNodesIndex(digitalTwinId int, node common.Node, action string) {
	indexKey := makeDTNodesKey(digitalTwinId)
	var nodes []common.Node
	if value, ok := fm.DigitalTwinNodes.Load(indexKey); ok {
		nodes = value.([]common.Node)
	}

	switch action {
	case "add":
		for _, n := range nodes {
			if n.GetId() == node.GetId() {
				return
			}
		}
		nodes = append(nodes, node)
	case "remove":
		for i, n := range nodes {
			if n.GetId() == node.GetId() {
				nodes = append(nodes[:i], nodes[i+1:]...)
				break
			}
		}
	case "replace":
		for i, n := range nodes {
			if n.GetId() == node.GetId() {
				nodes[i] = node
				return
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
	var node common.Node
	if value, ok := fm.Nodes.Load(nodeIdStr); !ok {
		return common.ErrNotFound
	} else {
		node = value.(common.Node)
	}

	fm.updateDigitalTwinNodesIndex(digitalTwinId, node, "remove")

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
			if err != common.ErrNotFound {
				fm.log.Errorf("Failed to delete wire %d: %v", wire.Id, err)
			}
		}
	}

	// Remove node input and output wires
	fm.NodeOutputWires.Delete(makeNodeOutputWiresKey(digitalTwinId, nodeId))
	fm.NodeInputWires.Delete(makeNodeInputWiresKey(digitalTwinId, nodeId))

	for outputIndex := 0; outputIndex < node.GetNumOutputs(); outputIndex++ {
		outputIndexKey := makeNodeOutputIndexKey(digitalTwinId, nodeId, outputIndex)
		fm.NodeOutputByIndex.Delete(outputIndexKey)
	}

	return nil
}

func (fm *FlowsManager) GetDigitalTwinNodes(digitalTwinId int) []common.Node {
	indexKey := makeDTNodesKey(digitalTwinId)
	if value, ok := fm.DigitalTwinNodes.Load(indexKey); ok {
		return value.([]common.Node)
	}
	return nil
}

func (fm *FlowsManager) StartNodes() {
	digitalTwins := fm.GetDigitalTwins()
	if len(digitalTwins) == 0 {
		fm.log.Info("No digital twins found to start")
		return
	}

	var wg sync.WaitGroup

	for _, digitalTwin := range digitalTwins {
		wg.Add(1)

		isPipelineInitialized := fm.isPipelineInitialized(digitalTwin)
		needReinitialization := true
		if isPipelineInitialized {
			needReinitialization = false
		}

		go func(dt *common.DigitalTwin, needReinitialization bool) {
			defer wg.Done()
			defer fm.setPipelineInitialization(dt, isPipelineInitialized)
			fm.StartNodesInDigitalTwin(dt.Id, needReinitialization)
		}(digitalTwin, needReinitialization)
	}
	wg.Wait()
	fm.log.Info("All nodes in all digital twins have been started")
}

func (fm *FlowsManager) setPipelineInitialization(digitalTwin *common.DigitalTwin, isPipelineInitialized bool) {
	if !isPipelineInitialized {
		fm.setPipelineInitialized(digitalTwin, true)
	}
}

func (fm *FlowsManager) StopNodes() {
	digitalTwins := fm.GetDigitalTwins()
	if len(digitalTwins) == 0 {
		fm.log.Info("No digital twins found to stop")
		return
	}
	var wg sync.WaitGroup
	for _, digitalTwin := range digitalTwins {
		wg.Add(1)
		go func(dtId int) {
			defer wg.Done()
			fm.StopNodesInDigitalTwin(dtId)
		}(digitalTwin.Id)
	}
	wg.Wait()
	fm.log.Info("All nodes in all digital twins have been stopped")
}

func (fm *FlowsManager) StartNodesInDigitalTwin(digitalTwinId int, needReinitialization bool) {
	fm.log.Infof("Starting nodes for digital twin %d", digitalTwinId)
	
	
	nodes := fm.GetDigitalTwinNodes(digitalTwinId)
	if len(nodes) == 0 {
		fm.log.Warnf("No nodes found for digital twin %d", digitalTwinId)
		return
	}

	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	numNodes := fm.GetNumOfNodesOfPipeline(digitalTwin)
	if numNodes != len(nodes) {
		fm.log.Errorf("Number of nodes in digital twin %d (%d) does not match the number of nodes in the pipeline file (%d)", digitalTwinId, len(nodes), numNodes)
		errDetails := fmt.Sprintf("The number of nodes in digital twin %d (%d) does not match the number of nodes in the pipeline file (%d)", digitalTwinId, len(nodes), numNodes)
		fm.logPipelineError(digitalTwin, "Pipeline start failed", errDetails)
		return
	}

	// Regenerate nodes if they are stopped
	for _, node := range nodes {
		if node.GetStatus() == common.NodeStatusStopped {
			err := fm.regenerateNode(node.GetId())
			if err != nil {
				fm.log.Errorf("Failed to regenerate node %d: %v", node.GetId(), err)
				errDetails := fmt.Sprintf("Failed to regenerate node %d: %v", node.GetId(), err)
				fm.logPipelineError(digitalTwin, "Pipeline start failed", errDetails)
				return
			}
		}
	}

	// Start each node in the digital twin
	for _, node := range nodes {
		node.Start(fm.log, needReinitialization)
	}

	fm.log.Infof("Started %d nodes for digital twin %d, waiting for them to be ready", len(nodes), digitalTwinId)

	// Wait for all nodes to be running
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	timeoutChan := time.After(10 * time.Second)
	startTime := time.Now()

	for {
		select {
		case <-ticker.C:
			if fm.allNodesRunning(digitalTwinId) {
				elapsed := time.Since(startTime)
				fm.log.Infof("All nodes in digital twin %d are running (took %v)", digitalTwinId, elapsed)
				fm.logPipelineInfo(digitalTwin, fmt.Sprintf("Pipeline started successfully (took %v)", elapsed))
				return
			}
		case <-timeoutChan:
			// Obtain information about nodes that are not running
			notRunningNodes := fm.getNotRunningNodes(digitalTwinId)
			fm.log.Warnf("Timeout while waiting for nodes to start in digital twin %d. Nodes not running: %v",
				digitalTwinId, notRunningNodes)
			errorDetails := fmt.Sprintf("Timeout while waiting for nodes to start. Nodes not running: %v", notRunningNodes)
			fm.logPipelineError(digitalTwin, "Pipeline start failed", errorDetails)
			return
		}
	}
}

func (fm *FlowsManager) getNotRunningNodes(digitalTwinId int) []string {
	var notRunning []string
	nodes := fm.GetDigitalTwinNodes(digitalTwinId)

	for _, node := range nodes {
		if node.GetStatus() != common.NodeStatusRunning {
			notRunning = append(notRunning, fmt.Sprintf("%s(%s)", node.GetUid(), node.GetStatus().String()))
		}
	}

	return notRunning
}

func (fm *FlowsManager) StopNodesInDigitalTwin(digitalTwinId int) {
	nodes := fm.GetDigitalTwinNodes(digitalTwinId)
	for _, node := range nodes {
		node.Stop(fm.log)
	}

	// Wait for all nodes to stop
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	timeoutChan := time.After(10 * time.Second)
	for {
		select {
		case <-ticker.C:
			if !fm.anyNodeRunning(digitalTwinId) {
				fm.log.Infof("All nodes in digital twin %d have stopped", digitalTwinId)
				fm.logPipelineInfo(fm.GetDigitalTwin(digitalTwinId), "Pipeline stopped successfully")
				return
			}
		case <-timeoutChan:
			fm.log.Warnf("Timeout while waiting for nodes to stop in digital twin %d", digitalTwinId)
			fm.logPipelineError(fm.GetDigitalTwin(digitalTwinId), "Pipeline stop failed", "Timeout while waiting for nodes to stop")
			return
		}
	}
}

func (fm *FlowsManager) anyNodeRunning(digitalTwinId int) bool {
	nodes := fm.GetDigitalTwinNodes(digitalTwinId)
	for _, node := range nodes {
		if node.GetStatus() == common.NodeStatusRunning {
			return true
		}
	}
	return false
}

func (fm *FlowsManager) allNodesRunning(digitalTwinId int) bool {
	nodes := fm.GetDigitalTwinNodes(digitalTwinId)
	for _, node := range nodes {
		if node.GetStatus() != common.NodeStatusRunning {
			return false
		}
	}
	return true
}

func (fm *FlowsManager) RestartNodesInDigitalTwin(digitalTwinId int, needReinitialization bool) {
	fm.log.Infof("Restarting nodes for digital twin %d", digitalTwinId)

	// Stop all nodes first
	fm.StopNodesInDigitalTwin(digitalTwinId)

	// Start all nodes again
	fm.StartNodesInDigitalTwin(digitalTwinId, needReinitialization)

	fm.log.Infof("Restarted nodes for digital twin %d", digitalTwinId)
}

func (fm *FlowsManager) logPipelineInfo(digitalTwin *common.DigitalTwin, message string) {
	var logData common.PipelineLog

	dtName := fmt.Sprintf("DT: %s", digitalTwin.Description)
	logData = common.PipelineLog{
		Level:     "info",
		Component: "pipeline",
		Name:      dtName,
		Uid:       digitalTwin.DigitalTwinUID,
		Message:   message,
	}

	logTopic := fm.GetTopicByTopicRef(digitalTwin.AssetId, digitalTwin.Id, "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	if logJSON, marshallErr := json.Marshal(logData); marshallErr == nil {
		fm.NatsPublish(logSubject, logJSON)
	} else {
		fm.Log().Errorf("Failed to marshal info data for dt %s: %v", digitalTwin.DigitalTwinUID, marshallErr)
	}

}

func (fm *FlowsManager) logPipelineError(digitalTwin *common.DigitalTwin, description string, message string) {
	var logData common.PipelineLog

	dtName := fmt.Sprintf("DT: %s", digitalTwin.Description)
	logData = common.PipelineLog{
		Level:       "error",
		Component:   "pipeline",
		Name:        dtName,
		Uid:         digitalTwin.DigitalTwinUID,
		Description: description,
		Message:     message,
	}

	logTopic := fm.GetTopicByTopicRef(digitalTwin.AssetId, digitalTwin.Id, "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	if logJSON, marshallErr := json.Marshal(logData); marshallErr == nil {
		fm.NatsPublish(logSubject, logJSON)
	} else {
		fm.Log().Errorf("Failed to marshal error data for dt %s: %v", digitalTwin.DigitalTwinUID, marshallErr)
	}
}