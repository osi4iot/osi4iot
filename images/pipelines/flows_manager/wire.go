package flows_manager

import (
	"context"
	"fmt"
	"pipelines/common"
	"strconv"
)

func (fm *FlowsManager) GetWire(wireId int) *common.Wire {
	wireIdStr := strconv.Itoa(wireId)
	if wire, ok := fm.Wires.Load(wireIdStr); ok {
		return wire.(*common.Wire)
	}
	return nil
}

func (fm *FlowsManager) GetWires() []*common.Wire {
	var wires []*common.Wire
	fm.Wires.Range(func(key, value interface{}) bool {
		wires = append(wires, value.(*common.Wire))
		return true
	})
	return wires
}

func (fm *FlowsManager) AddWire(wire *common.Wire) {
	ctx, cancel := context.WithCancel(context.Background())
	channel := make(chan common.Message, 10)
	newWire := &common.Wire{
		Id:              wire.Id,
		WireUid:         wire.WireUid,
		OrgId:           wire.OrgId,
		GroupId:         wire.GroupId,
		AssetId:         wire.AssetId,
		DigitalTwinId:   wire.DigitalTwinId,
		NodeIniId:       wire.NodeIniId,
		NodeEndId:       wire.NodeEndId,
		NiniOutputIndex: wire.NiniOutputIndex,
		Ctx:             ctx,
		Cancel:          cancel,
		BufferSize:      10,
		Channel:         channel,
	}
	wireIdStr := strconv.Itoa(wire.Id)
	if _, ok := fm.Wires.Load(wireIdStr); !ok {
		fm.Wires.Store(wireIdStr, newWire)
		err := fm.AddWireToDigitalTwin(wire.DigitalTwinId, newWire)
		if err != nil {
			fm.Log().Errorf("Failed to add wire %d to digital twin %d: %v", wire.Id, wire.DigitalTwinId, err)
		}
	} else {
		fm.Log().Error("Wire with ID %d already exists", wire.Id)
	}
}

func (fm *FlowsManager) AddWires(wires []*common.Wire) {
	for _, wire := range wires {
		fm.AddWire(wire)
	}
}

func (fm *FlowsManager) DeleteWire(wireId int) error {
	wireIdStr := strconv.Itoa(wireId)
	if value, ok := fm.Wires.Load(wireIdStr); ok {
		fm.Wires.Delete(wireIdStr)
		wire := value.(*common.Wire)
		fm.deleteWireFromDigitalTwin(wire.DigitalTwinId, wire.Id)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateWire(wire *common.Wire) error {
	wireIdStr := strconv.Itoa(wire.Id)
	if _, ok := fm.Wires.Load(wireIdStr); ok {
		fm.Wires.Store(wireIdStr, wire)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) AddWireToDigitalTwin(digitalTwinId int, wire *common.Wire) error {
	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		return fmt.Errorf("digital twin %d not found", digitalTwinId)
	}

	// Validate that the node NodeIniId exists
	nodeIni := fm.GetNode(wire.NodeIniId)
	if nodeIni == nil {
		return fmt.Errorf("from node %d not found", wire.NodeIniId)
	}

	// Validate that the node NodeEndId exists
	nodeEnd := fm.GetNode(wire.NodeEndId)
	if nodeEnd == nil {
		return fmt.Errorf("to node %d not found", wire.NodeEndId)
	}

	// Validate that the output index is valid
	if wire.NiniOutputIndex >= (*nodeIni).GetNumOutputs() {
		return fmt.Errorf("output index %d exceeds node %d outputs (%d)",
			wire.NiniOutputIndex, wire.NodeIniId, (*nodeIni).GetNumOutputs())
	}

	// Verify that no wire already exists at this output index
	outputIndexKey := makeNodeOutputIndexKey(digitalTwinId, wire.NodeIniId, wire.NiniOutputIndex)
	if _, exists := fm.NodeOutputByIndex.Load(outputIndexKey); exists {
		return fmt.Errorf("output index %d already used by node %d",
			wire.NiniOutputIndex, wire.NodeIniId)
	}

	// Update indices
	fm.updateDigitalTwinWiresIndex(digitalTwinId, wire, true)
	fm.updateNodeWireIndices(digitalTwinId, wire, true)

	// Map output by index
	fm.NodeOutputByIndex.Store(outputIndexKey, wire)

	return nil
}

func (fm *FlowsManager) updateDigitalTwinWiresIndex(digitalTwinId int, wire *common.Wire, add bool) {
	indexKey := makeDTWiresKey(digitalTwinId)

	var wires []*common.Wire
	if value, ok := fm.DigitalTwinWires.Load(indexKey); ok {
		wires = value.([]*common.Wire)
	}

	if add {
		// Verificar que no existe ya
		for _, w := range wires {
			if w.Id == wire.Id {
				return // Ya existe
			}
		}
		wires = append(wires, wire)
	} else {
		// Remove by ID
		for i, w := range wires {
			if w.Id == wire.Id {
				wires = append(wires[:i], wires[i+1:]...)
				break
			}
		}
	}

	fm.DigitalTwinWires.Store(indexKey, wires)
}

func (fm *FlowsManager) updateNodeWireIndices(digitalTwinId int, wire *common.Wire, add bool) {
	// Update output wires for the source node
	outputKey := makeNodeOutputWiresKey(digitalTwinId, wire.NodeIniId)
	var outputWires [][]*common.Wire
	if value, ok := fm.NodeOutputWires.Load(outputKey); ok {
		outputWires = value.([][]*common.Wire)
	}

	// Update input wires for the destination node
	inputKey := makeNodeInputWiresKey(digitalTwinId, wire.NodeEndId)
	var inputWires []*common.Wire
	if value, ok := fm.NodeInputWires.Load(inputKey); ok {
		inputWires = value.([]*common.Wire)
	}

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
		for i, wireArray:= range outputWires {
			for j, w := range wireArray {
				if w.Id == wire.Id {
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
			if w.Id == wire.Id {
				inputWires = append(inputWires[:i], inputWires[i+1:]...)
				break
			}
		}
	}

	fm.NodeOutputWires.Store(outputKey, outputWires)
	fm.NodeInputWires.Store(inputKey, inputWires)
}

func (fm *FlowsManager) deleteWireFromDigitalTwin(digitalTwinId int, wireId int) error {
	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		return fmt.Errorf("digital twin %d not found", digitalTwinId)
	}

	wireIdStr := strconv.Itoa(wireId)
	if value, ok := fm.Wires.Load(wireIdStr); ok {
		wire := value.(*common.Wire)

		// Remove from digital twin wires index
		fm.updateDigitalTwinWiresIndex(digitalTwinId, wire, false)

		// Remove from node output and input wires
		fm.updateNodeWireIndices(digitalTwinId, wire, false)

		// Remove from NodeOutputByIndex
		outputIndexKey := makeNodeOutputIndexKey(digitalTwinId, wire.NodeIniId, wire.NiniOutputIndex)
		fm.NodeOutputByIndex.Delete(outputIndexKey)

		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) GetDigitalTwinWires(digitalTwinId int) []*common.Wire {
	indexKey := makeDTWiresKey(digitalTwinId)
	if value, ok := fm.DigitalTwinWires.Load(indexKey); ok {
		return value.([]*common.Wire)
	}
	return nil
}

func (fm *FlowsManager) GetNodeOutputWires(digitalTwinId int, nodeId int) [][]*common.Wire {
	indexKey := makeNodeOutputWiresKey(digitalTwinId, nodeId)
	if value, ok := fm.NodeOutputWires.Load(indexKey); ok {
		return value.([][]*common.Wire)
	}
	return nil
}

func (fm *FlowsManager) GetNodeInputWires(digitalTwinId int, nodeId int) []*common.Wire {
	indexKey := makeNodeInputWiresKey(digitalTwinId, nodeId)
	if value, ok := fm.NodeInputWires.Load(indexKey); ok {
		return value.([]*common.Wire)
	}
	return nil
}

func (fm *FlowsManager) GetNodeOutputIndex(digitalTwinId int, nodeId int, outputIndex int) *common.Wire {
	indexKey := makeNodeOutputIndexKey(digitalTwinId, nodeId, outputIndex)
	if value, ok := fm.NodeOutputByIndex.Load(indexKey); ok {
		return value.(*common.Wire)
	}
	return nil
}
