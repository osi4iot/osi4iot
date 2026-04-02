package flows_manager

import (
	"context"
	"pipelines/common"
	"sync"
)

func (fm *FlowsManager) StartNodes(ctx context.Context) {
    digitalTwins := fm.GetDigitalTwins()
    if len(digitalTwins) == 0 {
        fm.log.Info("No digital twins found to start")
        return
    }

    var wg sync.WaitGroup
    for _, digitalTwin := range digitalTwins {
        wg.Add(1)

        isPipelineInitialized := fm.isPipelineInitialized(ctx, digitalTwin)
        needReinitialization := !isPipelineInitialized

        go func(dt *common.DigitalTwin, needReinitialization bool, isPipelineInitialized bool) {
            defer wg.Done()
            if dt.Pipeline != nil {
                defer fm.setPipelineInitialization(ctx, dt, isPipelineInitialized) // ✅ ya es parámetro
                dt.Pipeline.Start(ctx, needReinitialization)
                dt.Pipeline.StartStatusPublisher(ctx)
            }
        }(digitalTwin, needReinitialization, isPipelineInitialized) // ✅ pasado como parámetro
    }
    wg.Wait()
    fm.log.Info("All nodes in all digital twins have been started")
}

func (fm *FlowsManager) setPipelineInitialization(ctx context.Context, digitalTwin *common.DigitalTwin, isPipelineInitialized bool) {
	if !isPipelineInitialized {
		fm.setPipelineInitialized(ctx, digitalTwin, true)
	}
}

func (fm *FlowsManager) StopPipelines(ctx context.Context) {
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
			fm.StopNodesInDigitalTwin(ctx, dtId, "stop")
			fm.StopPipelineStatusPublisher(dtId)
		}(digitalTwin.Id)
	}
	wg.Wait()
	fm.log.Info("All nodes in all digital twins have been stopped")
}

func (fm *FlowsManager) StartNodesInDigitalTwin(ctx context.Context, digitalTwinId int, needReinitialization bool) {
	fm.log.Infof("Starting nodes for digital twin %d", digitalTwinId)

	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		fm.log.Errorf("Digital twin %d not found", digitalTwinId)
		return
	}

	if digitalTwin.Pipeline != nil {
		digitalTwin.Pipeline.Start(ctx, needReinitialization)
	}
}

func (fm *FlowsManager) StopNodesInDigitalTwin(ctx context.Context, digitalTwinId int, action string) {
	fm.log.Infof("Stopping nodes for digital twin %d", digitalTwinId)

	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		fm.log.Errorf("Digital twin %d not found", digitalTwinId)
		return
	}

	if digitalTwin.Pipeline != nil {
		digitalTwin.Pipeline.Stop(ctx, action)
	}
}

func (fm *FlowsManager) StopPipelineStatusPublisher(digitalTwinId int) {
	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		fm.log.Errorf("Digital twin %d not found", digitalTwinId)
		return
	}

	if digitalTwin.Pipeline != nil {
		digitalTwin.Pipeline.StopStatusPublisher()
	}
}

func (fm *FlowsManager) RestartNodesInDigitalTwin(ctx context.Context, digitalTwinId int, needReinitialization bool) {
	fm.log.Infof("Restarting nodes for digital twin %d", digitalTwinId)

	// Stop all nodes first
	fm.StopNodesInDigitalTwin(ctx, digitalTwinId, "restart")

	// Start all nodes again
	fm.StartNodesInDigitalTwin(ctx, digitalTwinId, needReinitialization)

	fm.log.Infof("Restarted nodes for digital twin %d", digitalTwinId)
}

func (fm *FlowsManager) DeletePipelineInDigitalTwin(ctx context.Context, digitalTwinId int) {
	fm.log.Infof("Deleting pipeline for digital twin %d", digitalTwinId)

	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		fm.log.Errorf("Digital twin %d not found", digitalTwinId)
		return
	}

	if digitalTwin.Pipeline != nil {
		digitalTwin.Pipeline.Stop(ctx, "delete")
		digitalTwin.Pipeline.SetStatus(ctx, common.PipelineStatusUnknown)
	}
	digitalTwin.Pipeline = nil
	fm.setPipelineInitialized(ctx, digitalTwin, false)
	fm.log.Infof("Deleted pipeline for digital twin %d", digitalTwinId)
}
