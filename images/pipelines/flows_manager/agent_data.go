package flows_manager

import (
	"context"

	"pipelines/agentdata"
	"pipelines/common"
)

// The agents' sensor_history and asset_state MCP servers read the IoT DB
// through pipelines (package agentdata): an endpoint on the loopback
// interface, a token per digital twin. This file wires it to the flows
// manager.

// startAgentData starts the endpoint; without the IoT DB, or when it does
// not start, the agents run without those MCP servers.
func (fm *FlowsManager) startAgentData(ctx context.Context, addr string) {
	if fm.DBReadPool == nil {
		fm.log.Warnf("Agent data endpoint not started: no IoT DB")
		return
	}
	service, err := agentdata.NewService(addr, fm.DBReadPool, fm, fm.log)
	if err == nil {
		err = service.Start(ctx)
	}
	if err != nil {
		fm.log.Errorf("Agent data endpoint not started (no sensor history or asset states for the agents): %v", err)
		return
	}
	fm.AgentData = service
}

// SensorsInGroup asks admin_api for a group's sensors (agentdata.Source).
func (fm *FlowsManager) SensorsInGroup(ctx context.Context, groupId int) ([]*common.Sensor, error) {
	return fm.Admin.GetSensorsInGroup(ctx, groupId)
}

// AgentDataAccess returns the endpoint and the digital twin's token for its
// sensor_history and asset_state MCP servers.
func (fm *FlowsManager) AgentDataAccess(groupId, digitalTwinId int) (url string, token string, ok bool) {
	if fm.AgentData == nil {
		return "", "", false
	}
	return fm.AgentData.BaseURL(), fm.AgentData.DigitalTwinToken(groupId, digitalTwinId), true
}
