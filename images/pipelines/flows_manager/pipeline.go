package flows_manager

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/nodes"
	"pipelines/utils"
	"strings"
	"sync"
	"time"

	leader_election "pipelines/leader_election"
)

type Pipeline struct {
	OrgId                  int
	OrgHash                string
	GroupId                int
	AssetId                int
	DigitalTwinId          int
	DigitalTwinUid         string
	DigitalTwinDescription string
	Fm                     *FlowsManager
	Status                 common.PipelineStatus
	NodesData              map[string]*common.NodeData
	Wires                  map[string]*common.Wire
	Nodes                  map[string]common.Node
	NodeOutputWires        map[string][][]*common.Wire // key: "nodeID" -> [][]*Wire (wires that leave the node)
	NodeInputWires         map[string][]*common.Wire   // key: "nodeID" -> []*Wire (wires that arrive at the node)
	NodeOutputByIndex      map[string][]*common.Wire   // key: "nodeID:outputIndex" -> []*Wire
	LeaderElector          *leader_election.LeaderElector
	mu                     sync.RWMutex
	statusPublisherCancel  context.CancelFunc
	statusPublisherWg      sync.WaitGroup
}

type PipelineCreationError struct {
	ErrorMessages []string
}

func (p *PipelineCreationError) Error() string {
	return fmt.Sprintf("Pipeline creation failed with %d errors:\n%s",
		len(p.ErrorMessages), strings.Join(p.ErrorMessages, "\n"))
}

func (p *PipelineCreationError) AddErrorMsg(errMsg string) {
	p.ErrorMessages = append(p.ErrorMessages, errMsg)
}

func (fm *FlowsManager) createPipeline(
	ctx context.Context,
	digitalTwin *common.DigitalTwin,
	org *common.Org,
	action string,
) *Pipeline {
	pipelineData := &common.PipelineData{
		OrgId:                  digitalTwin.OrgId,
		OrgHash:                org.OrgHash,
		GroupId:                digitalTwin.GroupId,
		AssetId:                digitalTwin.AssetId,
		DigitalTwinId:          digitalTwin.Id,
		DigitalTwinUid:         digitalTwin.DigitalTwinUid,
		DigitalTwinDescription: digitalTwin.Description,
		FileData:               digitalTwin.PipelineFileData,
		FileName:               digitalTwin.PipelineFileName,
		FileLastModifDate:      digitalTwin.PipelineFileLastModifDate,
	}

	pipeline, err := fm.createPipelineInstanceFromData(ctx, pipelineData)
	if err != nil {
		errorDetails := fmt.Sprintf("Failed to create pipeline for Digital Twin %d: %v", digitalTwin.Id, err)
		fm.log.Errorf("%s", errorDetails)
		pipeline.LogPipelineError("Pipeline creation failed", errorDetails)
		pipeline.SetStatus(ctx, common.PipelineStatusError)
	} else {
		msg := fmt.Sprintf("Pipeline of digital twin '%s' created successfully", digitalTwin.Description)
		fm.log.Info(msg)
		if action == "create" {
			pipeline.LogPipelineInfo(msg)
			pipeline.SetStatus(ctx, common.PipelineStatusCreated)
		}
	}

	return pipeline
}

func (fm *FlowsManager) createPipelineInstanceFromData(ctx context.Context, pd *common.PipelineData) (*Pipeline, error) {
	pipelineErrors := &PipelineCreationError{}

	pipeline := &Pipeline{
		OrgId:                  pd.OrgId,
		OrgHash:                pd.OrgHash,
		GroupId:                pd.GroupId,
		AssetId:                pd.AssetId,
		DigitalTwinId:          pd.DigitalTwinId,
		DigitalTwinUid:         pd.DigitalTwinUid,
		DigitalTwinDescription: pd.DigitalTwinDescription,
		Fm:                     fm,
		Status:                 common.PipelineStatusUnknown,
		NodesData:              make(map[string]*common.NodeData),
		Wires:                  make(map[string]*common.Wire),
		Nodes:                  make(map[string]common.Node),
		NodeOutputWires:        make(map[string][][]*common.Wire),
		NodeInputWires:         make(map[string][]*common.Wire),
		NodeOutputByIndex:      make(map[string][]*common.Wire),
	}

	replicaIndex := fm.ReplicaIndex
	orgHash := pipeline.OrgHash
	elementType := "pipeline"
	elementID := pipeline.DigitalTwinUid
	kv := fm.GetLeaderKvStore()
	leaderElector, err := leader_election.NewLeaderElector(replicaIndex, orgHash, elementType, elementID, kv, 10*time.Second, fm.log)
	if err != nil {
		pipelineErrors.AddErrorMsg(fmt.Sprintf("Failed to create leader elector: %v", err))
	} else {
		pipeline.LeaderElector = leaderElector
	}

	if pd.FileData == "" {
		if len(pipelineErrors.ErrorMessages) > 0 {
			return pipeline, pipelineErrors
		}
		return pipeline, nil
	}

	var pipelineNodes []common.PipelineNode
	if err := json.Unmarshal([]byte(pd.FileData), &pipelineNodes); err != nil {
		fm.log.Errorf("Failed to unmarshal pipeline file data: %v", err)
		return nil, err
	}
	wires := []*common.Wire{}

	for _, node := range pipelineNodes {
		debug := node.Debug
		if debug == "" {
			debug = "off"
		}

		var settings map[string]any
		if err := json.Unmarshal([]byte(node.Settings), &settings); err != nil {
			errMsg := fmt.Sprintf("Failed to unmarshal settings for node %s: %v", node.Name, err)
			fm.log.Error(errMsg)
		}

		nodeData := &common.NodeData{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Type:       node.Type,
			Xpos:       node.X,
			Ypos:       node.Y,
			Settings:   settings,
			NumOutputs: node.NumOutputs,
			Debug:      debug,
		}
		pipeline.NodesData[node.NodeUid] = nodeData
	}

	for _, node := range pipelineNodes {
		for outputIndex, wireArray := range node.Wires {
			for _, wire := range wireArray {
				wireUid, _ := utils.GenerateNanoID(20)
				wireName := fmt.Sprintf("%s:%d:%s", node.Name, outputIndex, wire.NodeEndUid)
				newWire := common.Wire{
					WireUid:         wireUid,
					Name:            wireName,
					NodeIniUid:      node.NodeUid,
					NodeEndUid:      wire.NodeEndUid,
					NiniOutputIndex: outputIndex,
				}
				wires = append(wires, &newWire)
			}
		}
	}

	for _, nodeData := range pipeline.NodesData {
		node, err := nodes.CreateNode(ctx, *nodeData, fm.log, fm, pipeline)
		if err != nil {
			errMsg := fmt.Sprintf("Failed to create node %s: %v.", nodeData.Name, err)
			pipelineErrors.AddErrorMsg(errMsg)
		} else if node != nil {
			pipeline.Nodes[nodeData.NodeUid] = node
		}
	}

	for _, wire := range wires {
		newWire := fm.CreatePipelineWire(ctx, wire)
		pipeline.Wires[wire.WireUid] = newWire
	}

	for _, wire := range pipeline.Wires {
		err := pipeline.addWireToPipelineUnsafe(wire)
		if err != nil {
			pipelineErrors.AddErrorMsg(fmt.Sprintf("Failed to add wire with UID %s: %v.", wire.WireUid, err))
		}
	}

	if len(pipelineErrors.ErrorMessages) > 0 {
		return pipeline, pipelineErrors
	}

	return pipeline, nil
}

func (fm *FlowsManager) CreatePipelineWire(ctx context.Context, wire *common.Wire) *common.Wire {
	ctx, cancel := context.WithCancel(ctx)
	channel := make(chan common.Message, 10)
	newWire := &common.Wire{
		WireUid:         wire.WireUid,
		Name:            wire.Name,
		NodeIniUid:      wire.NodeIniUid,
		NodeEndUid:      wire.NodeEndUid,
		NiniOutputIndex: wire.NiniOutputIndex,
		Ctx:             ctx,
		Cancel:          cancel,
		BufferSize:      10,
		Channel:         channel,
	}
	return newWire

}

func (p *Pipeline) AddWire(newWire *common.Wire) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if _, exists := p.Wires[newWire.WireUid]; !exists {
		p.Wires[newWire.WireUid] = newWire
		err := p.addWireToPipelineUnsafe(newWire)
		if err != nil {
			p.Fm.log.Errorf("Failed to add wire %d to digital twin %d: %v", newWire.WireUid, p.DigitalTwinId, err)
		}
	} else {
		p.Fm.log.Warnf("Wire with UID %d already exists", newWire.WireUid)
	}
}

func (p *Pipeline) addWireToPipelineUnsafe(wire *common.Wire) error {
	// Validate that the node NodeIniId exists
	nodeIni := p.GetNode(wire.NodeIniUid)
	if nodeIni == nil {
		return fmt.Errorf("from node %s not found", wire.NodeIniUid)
	}

	// Validate that the node NodeEndId exists
	nodeEnd := p.GetNode(wire.NodeEndUid)
	if nodeEnd == nil {
		return fmt.Errorf("to node %s not found", wire.NodeEndUid)
	}

	// Validate that the output index is valid
	if wire.NiniOutputIndex >= nodeIni.GetNumOutputs() {
		return fmt.Errorf("output index %d exceeds node %s outputs (%d)",
			wire.NiniOutputIndex, wire.NodeIniUid, nodeIni.GetNumOutputs())
	}

	// Update NodeOutputByIndex
	outputIndexKey := makePipelineNodeOutputIndexKey(wire.NodeIniUid, wire.NiniOutputIndex)
	existingWires, exists := p.NodeOutputByIndex[outputIndexKey]
	if exists {
		existsWire := false
		for _, w := range existingWires {
			if w.WireUid == wire.WireUid {
				existsWire = true
				break
			}
		}
		if !existsWire {
			existingWires = append(existingWires, wire)
			p.NodeOutputByIndex[outputIndexKey] = existingWires
		}
	} else {
		// Create a new slice for this output index
		p.NodeOutputByIndex[outputIndexKey] = []*common.Wire{wire}
	}

	// Update indices
	p.updatePipelineWiresIndexUnsafe(wire, true)
	p.updatePipelineNodeWireIndicesUnsafe(wire, true)

	return nil
}

func (p *Pipeline) allNodesRunning() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.allNodesRunningUnsafe()
}

func (p *Pipeline) allNodesRunningUnsafe() bool {
	for _, nodeData := range p.NodesData {
		node := p.Nodes[nodeData.NodeUid]
		if node == nil {
			return false
		}
		if node.GetStatus() != common.NodeStatusRunning {
			return false
		}
	}
	return true
}

func (p *Pipeline) anyNodeRunning() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.anyNodeRunningUnsafe()
}

func (p *Pipeline) anyNodeRunningUnsafe() bool {
	for _, node := range p.Nodes {
		if node.GetStatus() == common.NodeStatusRunning {
			return true
		}
	}
	return false
}

func (p *Pipeline) ClearChatMessagesHistory(ctx context.Context, userName string) {
	state2simTopic := p.Fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "state2sim")
	state2simSubject := utils.TopicToNatsSubject(state2simTopic.TopicType, state2simTopic.GroupUid, state2simTopic.TopicUid)

	if state2simSubject == "" {
		p.Fm.Log().Errorf("No state2sim subject is set for digital twin %d", p.DigitalTwinId)
		return
	}

	kvStore := p.Fm.GetDigitalTwinKvStore(p.GetDigitalTwinId())
	key := utils.GetFullChatMessageKvStoreKey(userName, p.GetOrgHash(), p.GetDigitalTwinUid())
	kvStore.DeleteEntry(ctx, key)

	var chatMessages []utils.ChatMessage = []utils.ChatMessage{}
	payload := ChatMessagesPayload{
		ChatMessages: chatMessages,
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		p.Fm.Log().Errorf("failed to marshal message for digital twin %d: %w", p.GetDigitalTwinId(), err)
		return
	}
	err = p.Fm.NatsPublish(state2simSubject, jsonData)
	if err != nil {
		p.Fm.Log().Errorf("failed to publish message for digital twin %d: %w", p.GetDigitalTwinId(), err)
		return
	}
}

func (p *Pipeline) CreateTelegramListenNodes(ctx context.Context, org *common.Org) error {
	nodesData := []*common.NodeData{}
	for _, node := range p.NodesData {
		if node.Type == "TelegramListen" {
			nodeUid := node.NodeUid
			if _, exists := p.Nodes[nodeUid]; exists {
				continue
			}
			nodesData = append(nodesData, node)
		}
	}

	pipelineErrors := &PipelineCreationError{}
	for _, nodeData := range nodesData {
		newNode, err := nodes.CreateTelegramListenNode(*nodeData, p.Fm, p, org)
		if err != nil {
			errMsg := fmt.Sprintf("Failed to create node %s: %v.", nodeData.Name, err)
			pipelineErrors.AddErrorMsg(errMsg)
		} else {
			p.Nodes[nodeData.NodeUid] = newNode
		}
	}
	if len(pipelineErrors.ErrorMessages) > 0 {
		return pipelineErrors
	}
	return nil
}

func (p *Pipeline) createNodeUnsafe(ctx context.Context, nodeUid string) error {
	nodeData, ok := p.NodesData[nodeUid]
	if !ok {
		return fmt.Errorf("node data with UID %s not found", nodeUid)
	}

	newNode, err := nodes.CreateNode(ctx, *nodeData, p.Fm.log, p.Fm, p)
	if err != nil {
		return err
	}
	p.Nodes[nodeUid] = newNode

	return nil
}

func (p *Pipeline) DeleteWire(wireUid string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	wire := p.Wires[wireUid]
	if wire == nil {
		return common.ErrNotFound
	}

	// Remove from digital twin wires index
	p.updatePipelineWiresIndexUnsafe(wire, false)

	// Remove from node output and input wires
	p.updatePipelineNodeWireIndicesUnsafe(wire, false)

	// Remove from NodeOutputByIndex
	outputIndexKey := makePipelineNodeOutputIndexKey(wire.NodeIniUid, wire.NiniOutputIndex)
	wires, ok := p.NodeOutputByIndex[outputIndexKey]
	if ok {
		if len(wires) == 1 && wires[0].WireUid == wire.WireUid {
			delete(p.NodeOutputByIndex, outputIndexKey)
		} else {
			// Otherwise, remove the specific wire from the slice
			for i, w := range wires {
				if w.WireUid == wire.WireUid {
					wires = append(wires[:i], wires[i+1:]...)
					break
				}
			}
			p.NodeOutputByIndex[outputIndexKey] = wires
		}
	}

	return nil
}

func (p *Pipeline) GetAssetId() int {
	return p.AssetId
}

func (p *Pipeline) GetDigitalTwinDescription() string {
	return p.DigitalTwinDescription
}

func (p *Pipeline) GetDigitalTwinId() int {
	return p.DigitalTwinId
}

func (p *Pipeline) GetDigitalTwinUid() string {
	return p.DigitalTwinUid
}

func (p *Pipeline) GetGroupId() int {
	return p.GroupId
}

func (p *Pipeline) GetLeaderElector() common.LeaderElector {
	return p.LeaderElector
}

func (p *Pipeline) GetNode(nodeUid string) common.Node {
	p.mu.RLock()
	defer p.mu.RUnlock()
	if node, exists := p.Nodes[nodeUid]; exists {
		return node
	}

	return nil
}

func (p *Pipeline) GetNodeData(nodeUid string) *common.NodeData {
	p.mu.RLock()
	defer p.mu.RUnlock()
	if nodeData, exists := p.NodesData[nodeUid]; exists {
		return nodeData
	}
	return nil
}

func (p *Pipeline) GetNodeInputWires(nodeUid string) []*common.Wire {
	p.mu.RLock()
	defer p.mu.RUnlock()

	if inputWires, ok := p.NodeInputWires[nodeUid]; ok {
		result := make([]*common.Wire, len(inputWires))
		copy(result, inputWires)
		return result
	}
	return nil
}

func (p *Pipeline) GetNodeOutputIndex(nodeUid string, outputIndex int) []*common.Wire {
	p.mu.RLock()
	defer p.mu.RUnlock()

	indexKey := makePipelineNodeOutputIndexKey(nodeUid, outputIndex)
	if wires, ok := p.NodeOutputByIndex[indexKey]; ok {
		result := make([]*common.Wire, len(wires))
		copy(result, wires)
		return result
	}
	return nil
}

func (p *Pipeline) GetNodeOutputWires(nodeUid string) [][]*common.Wire {
	p.mu.RLock()
	defer p.mu.RUnlock()

	if outputWires, ok := p.NodeOutputWires[nodeUid]; ok {
		result := make([][]*common.Wire, len(outputWires))
		for i, wireSlice := range outputWires {
			result[i] = make([]*common.Wire, len(wireSlice))
			copy(result[i], wireSlice)
		}
		return result
	}
	return nil
}

func (p *Pipeline) GetOrgHash() string {
	return p.OrgHash
}

func (p *Pipeline) GetOrgId() int {
	return p.OrgId
}

func (p *Pipeline) GetPipelineWires() []*common.Wire {
	p.mu.RLock()
	defer p.mu.RUnlock()
	wires := make([]*common.Wire, 0, len(p.Wires))
	for _, wire := range p.Wires {
		wires = append(wires, wire)
	}
	return wires
}

func (p *Pipeline) GetReplicaIndexLeader(ctx context.Context) int {
	replicaIndexLeader := -1
	if p.LeaderElector != nil {
		replicaIndexLeader = p.LeaderElector.GetReplicaIndexLeader(ctx)
	}
	return replicaIndexLeader
}

func (p *Pipeline) GetStatus() common.PipelineStatus {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.Status
}

func (p *Pipeline) getNodesSnapshot() map[string]common.Node {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.Nodes
}

func (p *Pipeline) getNotRunningNodes() []string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.getNotRunningNodesUnsafe()
}

func (p *Pipeline) getNotRunningNodesUnsafe() []string {
	var notRunning []string

	for _, nodeData := range p.NodesData {
		node := p.Nodes[nodeData.NodeUid]
		if node == nil {
			notRunning = append(notRunning, fmt.Sprintf("Node with UID: %s (not created).", nodeData.NodeUid))
			continue
		}
		if node.GetStatus() != common.NodeStatusRunning {
			notRunning = append(notRunning, fmt.Sprintf("Node: %s (%s).", node.GetUid(), node.GetStatus().String()))
		}
	}

	return notRunning
}

func (p *Pipeline) HandleNodeError(n *common.NodeData, err error) {
	logTopic := p.Fm.GetTopicByTopicRef(p.AssetId, p.DigitalTwinId, "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	if logSubject == "" {
		p.Fm.Log().Errorf("Node %s encountered an error but no log subject is set", n.NodeUid)
		return
	}

	description := fmt.Sprintf("Error in a node type %s ", n.Type)
	logData := common.PipelineLog{
		Level:       "error",
		Component:   "node",
		Name:        n.Name,
		Uid:         n.NodeUid,
		Description: description,
		Message:     err.Error(),
	}

	if logJSON, marshallErr := json.Marshal(logData); marshallErr == nil {
		p.Fm.NatsPublish(logSubject, logJSON)
	} else {
		p.Fm.Log().Errorf("Failed to marshal log error data for node %s: %v", n.NodeUid, marshallErr)
	}
}

func (p *Pipeline) HasTelegramListenNodes() bool {
	hasTelegramListenNodes := false
	for _, node := range p.Nodes {
		if node.GetType() == "TelegramListen" {
			hasTelegramListenNodes = true
			break
		}
	}
	return hasTelegramListenNodes
}

func (p *Pipeline) HasTelegramListenNodesData() bool {
	hasTelegramListenNodes := false
	for _, node := range p.NodesData {
		if node.Type == "TelegramListen" {
			hasTelegramListenNodes = true
			break
		}
	}
	return hasTelegramListenNodes
}

func (p *Pipeline) LogPipelineError(description string, message string) {
	mustLog := false
	if p.LeaderElector != nil && p.LeaderElector.IsLeader() {
		mustLog = true
	} else if description == "Pipeline creation failed" && p.Fm.ReplicaIndex == 1 {
		mustLog = true
	}
	if !mustLog {
		return
	}

	var logData common.PipelineLog
	dtName := fmt.Sprintf("DT: %s", p.GetDigitalTwinDescription())
	logData = common.PipelineLog{
		Level:       "error",
		Component:   "pipeline",
		Name:        dtName,
		Uid:         p.GetDigitalTwinUid(),
		Description: description,
		Message:     message,
	}

	logTopic := p.Fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	if logJSON, marshallErr := json.Marshal(logData); marshallErr == nil {
		p.Fm.NatsPublish(logSubject, logJSON)
	} else {
		p.Fm.Log().Errorf("Failed to marshal error data for dt %s: %v", p.GetDigitalTwinUid(), marshallErr)
	}
}

func (p *Pipeline) LogPipelineInfo(message string) {
	if p.LeaderElector != nil && !p.LeaderElector.IsLeader() {
		return
	}

	var logData common.PipelineLog
	dtName := fmt.Sprintf("DT: %s", p.GetDigitalTwinDescription())
	logData = common.PipelineLog{
		Level:     "info",
		Component: "pipeline",
		Name:      dtName,
		Uid:       p.GetDigitalTwinUid(),
		Message:   message,
	}

	logTopic := p.Fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	if logJSON, marshallErr := json.Marshal(logData); marshallErr == nil {
		p.Fm.NatsPublish(logSubject, logJSON)
	} else {
		p.Fm.Log().Errorf("Failed to marshal info data for dt %s: %v", p.GetDigitalTwinUid(), marshallErr)
	}
}

func (p *Pipeline) PublishPipelineStatus(payload common.PipelineStatusMessage) {
	state2simTopic := p.Fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "state2sim")
	state2simSubject := utils.TopicToNatsSubject(state2simTopic.TopicType, state2simTopic.GroupUid, state2simTopic.TopicUid)

	if state2simSubject == "" {
		p.Fm.Log().Errorf("No state2sim subject is set for digital twin %d", p.DigitalTwinId)
		return
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		p.Fm.Log().Errorf("failed to marshal message for digital twin %d: %w", p.GetDigitalTwinId(), err)
		return
	}
	err = p.Fm.NatsPublish(state2simSubject, jsonData)
	if err != nil {
		p.Fm.Log().Errorf("failed to publish message for digital twin %d: %w", p.GetDigitalTwinId(), err)
		return
	}
}

type ChatMessagesPayload struct {
	ChatMessages []utils.ChatMessage `json:"chatMessages"`
}

func (p *Pipeline) PublishChatMessages(ctx context.Context, userName string) {
	state2simTopic := p.Fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "state2sim")
	state2simSubject := utils.TopicToNatsSubject(state2simTopic.TopicType, state2simTopic.GroupUid, state2simTopic.TopicUid)

	if state2simSubject == "" {
		p.Fm.Log().Errorf("No state2sim subject is set for digital twin %d", p.DigitalTwinId)
		return
	}

	kvStore := p.Fm.GetDigitalTwinKvStore(p.GetDigitalTwinId())
	key := utils.GetFullChatMessageKvStoreKey(userName, p.GetOrgHash(), p.GetDigitalTwinUid())

	chatSchemaMessages, mcpToolCallsArray, err := utils.GetCurrentChatMessages(ctx, p.Fm.Log(), kvStore, key, userName)
	if err != nil {
		p.Fm.Log().Errorf("Failed to get current chat messages for user %s: %v", userName, err)
		return
	}

	var chatMessages []utils.ChatMessage
	for index, msg := range chatSchemaMessages {
		chatMessages = append(chatMessages, utils.ChatMessage{
			Message:      msg.Content,
			UserName:     userName,
			Sender:       string(msg.Role),
			McpToolCalls: mcpToolCallsArray[index],
		})
	}

	payload := ChatMessagesPayload{
		ChatMessages: chatMessages,
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		p.Fm.Log().Errorf("failed to marshal message for digital twin %d: %w", p.GetDigitalTwinId(), err)
		return
	}
	err = p.Fm.NatsPublish(state2simSubject, jsonData)
	if err != nil {
		p.Fm.Log().Errorf("failed to publish message for digital twin %d: %w", p.GetDigitalTwinId(), err)
		return
	}
}

func (p *Pipeline) publishStatus(ctx context.Context) {
	if p.LeaderElector != nil && p.LeaderElector.IsLeader() {
		pipelineStatus := p.GetStatus().String()
		replicaIndexLeader := p.GetReplicaIndexLeader(ctx)

		payload := common.PipelineStatusMessage{
			PipelineStatus:     pipelineStatus,
			ReplicaIndexLeader: replicaIndexLeader,
		}

		p.PublishPipelineStatus(payload)
	}
}

func (p *Pipeline) ResetNode(ctx context.Context, nodeUid string) error {
	p.mu.RLock()
	defer p.mu.RUnlock()

	if len(p.NodesData) == 0 {
		return fmt.Errorf("no nodes data available to restart node %s", nodeUid)
	}

	err := p.createNodeUnsafe(ctx, nodeUid)
	if err != nil {
		return err
	}

	return nil
}

func (p *Pipeline) RestartNode(ctx context.Context, nodeUid string) error {
	p.mu.RLock()
	nodes := p.Nodes
	p.mu.RUnlock()

	if len(nodes) == 0 {
		return fmt.Errorf("no nodes data available to restart node %s", nodeUid)
	}

	err := p.createNodeUnsafe(ctx, nodeUid)
	if err != nil {
		return err
	}

	p.Nodes[nodeUid].Start(ctx, p.Fm.log, false)

	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	timeoutChan := time.After(5 * time.Second)
	startTime := time.Now()

	for {
		select {
		case <-ticker.C:
			if p.Nodes[nodeUid].GetStatus() == common.NodeStatusRunning {
				elapsed := time.Since(startTime)
				msg := fmt.Sprintf("Node %s in digital twin %d has been restarted successfully (took %v)", p.Nodes[nodeUid].GetName(), p.DigitalTwinId, elapsed)
				p.Fm.log.Infof(msg)
				p.SetStatus(ctx, common.PipelineStatusRunning)
				return nil
			}
		case <-timeoutChan:
			errMsg := fmt.Sprintf("Timeout while waiting for node %s to restart in digital twin %d.", p.Nodes[nodeUid].GetName(), p.DigitalTwinId)
			p.Fm.log.Warnf(errMsg)
			p.LogPipelineError("Pipeline start failed", errMsg)
			return nil
		}
	}
}

func (p *Pipeline) SetStatus(ctx context.Context, status common.PipelineStatus) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.setStatusUnsafe(ctx, status)
}

func (p *Pipeline) setStatusUnsafe(ctx context.Context, status common.PipelineStatus) {
	pipelineStatus := status.String()
	p.Status = status
	replicaIndexLeader := p.GetReplicaIndexLeader(ctx)
	payload := common.PipelineStatusMessage{
		PipelineStatus:     pipelineStatus,
		ReplicaIndexLeader: replicaIndexLeader,
	}
	p.PublishPipelineStatus(payload)
}

func (p *Pipeline) Start(ctx context.Context, needReinitialization bool) {
	nodes := p.getNodesSnapshot()
	if len(nodes) == 0 {
		return
	}

	p.LeaderElector.Start(ctx)
	for _, node := range nodes {
		node.Start(ctx, p.Fm.log, needReinitialization)
	}

	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	startTime := time.Now()

	for {
		select {
		case <-ctx.Done():
			p.SetStatus(ctx, common.PipelineStatusError)
			return
		case <-ticker.C:
			if p.allNodesRunning() {
				p.Fm.log.Infof("All nodes running in digital twin %d (took %v)", p.DigitalTwinId, time.Since(startTime))
				p.LogPipelineInfo(fmt.Sprintf("Pipeline of digital twin '%s' started successfully.", p.DigitalTwinDescription))
				p.SetStatus(ctx, common.PipelineStatusRunning)
				return
			}
		case <-timer.C:
			notRunning := p.getNotRunningNodes()
			p.Fm.log.Warnf("Timeout waiting for nodes in digital twin %d: %v", p.DigitalTwinId, notRunning)
			p.LogPipelineError("Pipeline start failed", fmt.Sprintf("Timeout waiting for nodes: %v", notRunning))
			p.SetStatus(ctx, common.PipelineStatusError)
			return
		}
	}
}

func (p *Pipeline) StartStatusPublisher(ctx context.Context) {
	if p.statusPublisherCancel != nil {
		p.Fm.Log().Warn("Status publisher already running for pipeline")
		return
	}

	ctx, cancel := context.WithCancel(ctx)
	p.statusPublisherCancel = cancel

	p.statusPublisherWg.Add(1)
	go func() {
		defer p.statusPublisherWg.Done()

		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		// Publish immediately at the start
		p.publishStatus(ctx)

		for {
			select {
			case <-ctx.Done():
				p.Fm.Log().Infof("Stopping status publisher for pipeline DigitalTwin: %d", p.GetDigitalTwinId())
				return
			case <-ticker.C:
				p.publishStatus(ctx)
			}
		}
	}()

	p.Fm.Log().Infof("Started status publisher for pipeline DigitalTwin: %d", p.GetDigitalTwinId())
}

func (p *Pipeline) Stop(ctx context.Context, action string) error {
	nodes := p.getNodesSnapshot()
	if len(nodes) == 0 {
		return fmt.Errorf("no nodes data available to stop pipeline")
	}

	for _, node := range nodes {
		node.Stop(p.Fm.log)
	}

	defer p.LeaderElector.Stop(ctx)

	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()

	for {
		select {
		case <-ticker.C:
			if !p.anyNodeRunning() {
				p.Fm.log.Infof("All nodes in digital twin %d have stopped", p.GetDigitalTwinId())
				switch action {
				case "stop":
					p.SetStatus(ctx, common.PipelineStatusStopped)
					p.LogPipelineInfo("Pipeline stopped successfully")
				case "telegram_stopped":
					p.SetStatus(ctx, common.PipelineStatusError)
					p.LogPipelineError("Pipeline stopped by change in Telegram bot settings", "The Telegram bot settings have changed, so the pipeline has been stopped.")
				case "delete":
					p.SetStatus(ctx, common.PipelineStatusDeleted)
					p.LogPipelineInfo("Pipeline deleted successfully")
				}
				return nil
			}
		case <-timer.C:
			p.Fm.log.Warnf("Timeout while waiting for nodes to stop in digital twin %d", p.GetDigitalTwinId())
			p.LogPipelineError("Pipeline stop failed", "Timeout while waiting for nodes to stop")
			p.SetStatus(ctx, common.PipelineStatusError)
			return fmt.Errorf("timeout while waiting for nodes to stop in digital twin %d", p.GetDigitalTwinId())
		}
	}
}

// StopStatusPublisher() stops the periodic status publisher goroutine.
func (p *Pipeline) StopStatusPublisher() {
	if p.statusPublisherCancel == nil {
		return
	}

	p.Fm.Log().Infof("Requesting stop for status publisher DigitalTwin: %d", p.GetDigitalTwinId())

	// Cancelar el contexto
	p.statusPublisherCancel()

	// Esperar a que termine la goroutine
	p.statusPublisherWg.Wait()

	// Limpiar referencias
	p.statusPublisherCancel = nil

	p.Fm.Log().Infof("Status publisher stopped DigitalTwin: %d", p.GetDigitalTwinId())
}

func (p *Pipeline) updatePipelineNodeWireIndicesUnsafe(wire *common.Wire, add bool) {
	// Update input wires for the destination node
	inputKey := wire.NodeEndUid
	inputWires := p.NodeInputWires[inputKey]

	// Update output wires for the source node
	outputKey := wire.NodeIniUid
	outputWires := p.NodeOutputWires[outputKey]

	if add {
		currentNumOutputs := len(outputWires)
		if currentNumOutputs < (wire.NiniOutputIndex + 1) {
			for i := currentNumOutputs; i < (wire.NiniOutputIndex + 1); i++ {
				outputWires = append(outputWires, []*common.Wire{})
			}
		}
		outputWires[wire.NiniOutputIndex] = append(outputWires[wire.NiniOutputIndex], wire)

		// Add to input wires
		inputWires = append(inputWires, wire)
	} else {
		// Remove from output wires
		for i, wireArray := range outputWires {
			for j, w := range wireArray {
				if w.WireUid == wire.WireUid {
					// Remove the wire from the specific output index
					outputWires[i] = append(outputWires[i][:j], outputWires[i][j+1:]...)
					if len(outputWires[i]) == 0 {
						// If no wires left at this output index, remove the index
						outputWires = append(outputWires[:i], outputWires[i+1:]...)
					}
					break
				}
			}
		}
		// Remove from input wires
		for i, w := range inputWires {
			if w.WireUid == wire.WireUid {
				inputWires = append(inputWires[:i], inputWires[i+1:]...)
				break
			}
		}
	}

	p.NodeOutputWires[outputKey] = outputWires
	p.NodeInputWires[inputKey] = inputWires
}

func (p *Pipeline) updatePipelineWiresIndexUnsafe(wire *common.Wire, add bool) {
	wires := p.Wires
	if add {
		// Verify that the wire does not already exist
		for _, w := range wires {
			if w.WireUid == wire.WireUid {
				return // Already exists
			}
		}
		wires[wire.WireUid] = wire
	} else {
		// Remove by ID
		delete(wires, wire.WireUid)
	}
}

func makePipelineNodeOutputIndexKey(nodeUID string, outputIndex int) string {
	return fmt.Sprintf("outidx:%s:%d", nodeUID, outputIndex)
}
