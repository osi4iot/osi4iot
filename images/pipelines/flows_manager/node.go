package flows_manager

import (
	"pipelines/common"
	"sync"
)

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
			if dt.Pipeline != nil {
				defer fm.setPipelineInitialization(dt, isPipelineInitialized)
				dt.Pipeline.Start(needReinitialization)
			}
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
			fm.StopNodesInDigitalTwin(dtId, "stop")
		}(digitalTwin.Id)
	}
	wg.Wait()
	fm.log.Info("All nodes in all digital twins have been stopped")
}

func (fm *FlowsManager) CreatePipelineInDigitalTwin(digitalTwinId int) {
	fm.log.Infof("Creating pipeline for digital twin %d", digitalTwinId)

	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		fm.log.Errorf("Digital twin %d not found", digitalTwinId)
		return
	}

	org := fm.GetOrg(digitalTwin.OrgId)
	digitalTwin.Pipeline = fm.createPipeline(digitalTwin, org, "create")
	digitalTwin.Pipeline.Start(true)
}

func (fm *FlowsManager) UpdatePipelineInDigitalTwin(digitalTwinId int) {
	fm.log.Infof("Updating pipeline for digital twin %d", digitalTwinId)

	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		fm.log.Errorf("Digital twin %d not found", digitalTwinId)
		return
	}

	if digitalTwin.Pipeline != nil {
		digitalTwin.Pipeline.Stop("update")
	}
	org := fm.GetOrg(digitalTwin.OrgId)
	digitalTwin.Pipeline = fm.createPipeline(digitalTwin, org, "update")
	digitalTwin.Pipeline.Start(false)
}

func (fm *FlowsManager) StartNodesInDigitalTwin(digitalTwinId int, needReinitialization bool) {
	fm.log.Infof("Starting nodes for digital twin %d", digitalTwinId)

	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		fm.log.Errorf("Digital twin %d not found", digitalTwinId)
		return
	}

	if digitalTwin.Pipeline != nil {
		digitalTwin.Pipeline.Start(needReinitialization)
	}
}

func (fm *FlowsManager) StopNodesInDigitalTwin(digitalTwinId int, action string) {
	fm.log.Infof("Stopping nodes for digital twin %d", digitalTwinId)

	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		fm.log.Errorf("Digital twin %d not found", digitalTwinId)
		return
	}

	if digitalTwin.Pipeline != nil {
		digitalTwin.Pipeline.Stop(action)
	}
}

func (fm *FlowsManager) RestartNodesInDigitalTwin(digitalTwinId int, needReinitialization bool) {
	fm.log.Infof("Restarting nodes for digital twin %d", digitalTwinId)

	// Stop all nodes first
	fm.StopNodesInDigitalTwin(digitalTwinId, "restart")

	// Start all nodes again
	fm.StartNodesInDigitalTwin(digitalTwinId, needReinitialization)

	fm.log.Infof("Restarted nodes for digital twin %d", digitalTwinId)
}

func (fm *FlowsManager) DeletePipelineInDigitalTwin(digitalTwinId int) {
	fm.log.Infof("Deleting pipeline for digital twin %d", digitalTwinId)

	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		fm.log.Errorf("Digital twin %d not found", digitalTwinId)
		return
	}

	if digitalTwin.Pipeline != nil {
		digitalTwin.Pipeline.Stop("stop")
		digitalTwin.Pipeline.SetStatus(common.PipelineStatusUnknown)
	}
	digitalTwin.Pipeline = nil
	fm.setPipelineInitialized(digitalTwin, false)
	fm.log.Infof("Deleted pipeline for digital twin %d", digitalTwinId)
}
