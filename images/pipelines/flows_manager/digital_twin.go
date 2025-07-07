package flows_manager

import (
	"pipelines/common"
	"strconv"
	nats_pkg "pipelines/nats"
)

func (fm *FlowsManager) GetADigitalTwins() []*common.DigitalTwin {
	var digitalTwins []*common.DigitalTwin
	fm.DigitalTwins.Range(func(key, value interface{}) bool {
		digitalTwins = append(digitalTwins, value.(*common.DigitalTwin))
		return true
	})
	return digitalTwins
}

func (fm *FlowsManager) GetDigitalTwin(digitalTwinId int) *common.DigitalTwin {
	digitalTwinIdStr := strconv.Itoa(digitalTwinId)
	if digitalTwin, ok := fm.DigitalTwins.Load(digitalTwinIdStr); ok {
		return digitalTwin.(*common.DigitalTwin)
	}
	return nil
}

func (fm *FlowsManager) AddDigitalTwin(digitalTwin *common.DigitalTwin) {
	digitalTwinIdStr := strconv.Itoa(digitalTwin.Id)
	if _, ok := fm.DigitalTwins.Load(digitalTwinIdStr); !ok {
		fm.DigitalTwins.Store(digitalTwinIdStr, digitalTwin)
		org := fm.Admin.GetOrg(digitalTwin.OrgId)
		kv, _ := nats_pkg.CreateDigitalTwinKeyValueStore(org.OrgHash, digitalTwin.DigitalTwinUID, fm.log, fm.JetStream)
		fm.KvStores.Store(digitalTwinIdStr, kv)
	} else {
		fm.log.Error("Digital Twin with ID %d already exists", digitalTwin.Id)
	}
}

func (fm *FlowsManager) AddDigitalTwins(digitalTwins []*common.DigitalTwin) {
	for _, digitalTwin := range digitalTwins {
		fm.AddDigitalTwin(digitalTwin)
	}
}

func (fm *FlowsManager) DeleteDigitalTwin(digitalTwinId int) error {
	digitalTwinIdStr := strconv.Itoa(digitalTwinId)
	if _, ok := fm.DigitalTwins.Load(digitalTwinIdStr); ok {
		fm.DigitalTwins.Delete(digitalTwinIdStr)
		fm.KvStores.Delete(digitalTwinIdStr)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateDigitalTwin(digitalTwin *common.DigitalTwin) error {
	digitalTwinIdStr := strconv.Itoa(digitalTwin.Id)
	if _, ok := fm.DigitalTwins.Load(digitalTwinIdStr); ok {
		fm.DigitalTwins.Store(digitalTwinIdStr, digitalTwin)
		org := fm.Admin.GetOrg(digitalTwin.OrgId)
		kv, _ := nats_pkg.CreateDigitalTwinKeyValueStore(org.OrgHash, digitalTwin.DigitalTwinUID, fm.log, fm.JetStream)
		fm.KvStores.Store(digitalTwinIdStr, kv)
		return nil
	}
	return common.ErrNotFound
}
