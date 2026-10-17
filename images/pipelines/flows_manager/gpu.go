package flows_manager

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/nodes"
	"pipelines/utils"
	"strconv"
	"strings"
	"time"

	"github.com/nats-io/nats.go"
)

// GPU pipelines
//
// A digital twin with PipelineRequiresGpu == true has its pipeline created
// ONLY on the replicas that can run ONNX models on CUDA. Every input of a
// pipeline is a NATS queue subscription, so the replicas without the
// pipeline simply never receive its messages: the whole digital twin is
// processed by the GPU replicas, load-balanced among them.
//
// Three things that used to rely on "every replica has every pipeline"
// are handled here:
//
//   - Who reports creation errors. That was replica 1, which may have no
//     GPU. For GPU pipelines it is the lowest GPU replica alive.
//   - Who answers "queryPipelineStatus" when NO replica has a GPU. The
//     pipeline then runs nowhere, and saying nothing would look like a
//     hang. The replicas without the pipeline answer "error" through a
//     queue group of their own, and only while no GPU replica is alive.
//   - Toggling the flag on a running digital twin: each replica creates
//     or drops its local copy (ReconcilePipelineRequiresGpu).
//
// The GPU replicas announce themselves in the leader KV store
// (pipelines_gpu_replica.<index> = unix time, refreshed every 10 s).

const (
	gpuReplicaKeyPrefix   = "pipelines_gpu_replica"
	gpuHeartbeatInterval  = 10 * time.Second
	gpuReplicaFreshWithin = 35 * time.Second
)

func gpuReplicaKey(replicaIndex int) string {
	return fmt.Sprintf("%s.%d", gpuReplicaKeyPrefix, replicaIndex)
}

// initGpuCapability probes the GPU once at start-up and, if there is one,
// starts announcing this replica. Must run before the digital twins are
// added, since it decides which pipelines this replica creates.
func (fm *FlowsManager) initGpuCapability(ctx context.Context) {
	fm.GpuCapable, fm.GpuReason = nodes.ProbeGPU(fm.log)
	fm.log.Infof("Replica %d GPU capable: %v (%s)", fm.ReplicaIndex, fm.GpuCapable, fm.GpuReason)
	if !fm.GpuCapable {
		return
	}

	fm.publishGpuHeartbeat(ctx)
	go func() {
		ticker := time.NewTicker(gpuHeartbeatInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				fm.publishGpuHeartbeat(ctx)
			}
		}
	}()
}

func (fm *FlowsManager) publishGpuHeartbeat(ctx context.Context) {
	// CUDA failed for good in this process: stop announcing the replica,
	// so its entry expires and GPU pipelines stop choosing it.
	if broken, reason := nodes.CUDABroken(); broken {
		if fm.GpuCapable {
			fm.GpuCapable = false
			fm.GpuReason = "CUDA failed at runtime: " + reason
			fm.log.Errorf("Replica %d no longer GPU capable (%s); restart pipelines to recover the GPU",
				fm.ReplicaIndex, fm.GpuReason)
		}
		return
	}
	kv := fm.GetLeaderKvStore()
	if kv == nil {
		return
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	if _, err := kv.Put(ctx, gpuReplicaKey(fm.ReplicaIndex), []byte(now)); err != nil {
		fm.log.Warnf("Failed to publish GPU heartbeat of replica %d: %v", fm.ReplicaIndex, err)
	}
}

// aliveGpuReplicas returns the indexes of the GPU replicas that announced
// themselves recently, this one included.
func (fm *FlowsManager) aliveGpuReplicas(ctx context.Context) []int {
	kv := fm.GetLeaderKvStore()
	if kv == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	lister, err := kv.ListKeysFiltered(ctx, gpuReplicaKeyPrefix+".*")
	if err != nil {
		return nil
	}
	defer lister.Stop()

	var alive []int
	for key := range lister.Keys() {
		index, err := strconv.Atoi(strings.TrimPrefix(key, gpuReplicaKeyPrefix+"."))
		if err != nil {
			continue
		}
		entry, err := kv.Get(ctx, key)
		if err != nil {
			continue
		}
		ts, err := strconv.ParseInt(string(entry.Value()), 10, 64)
		if err != nil || time.Since(time.Unix(ts, 0)) > gpuReplicaFreshWithin {
			continue
		}
		alive = append(alive, index)
	}
	return alive
}

// gpuAllowed applies the platform's GPU policy to a digital twin: its
// organization AND its group must have gpuUsageEnabled.
func (fm *FlowsManager) gpuAllowed(dt *common.DigitalTwin) bool {
	return common.GpuUsageAllowed(fm.GetOrg(dt.OrgId), fm.GetGroup(dt.GroupId))
}

// usesGpuReplicas reports whether a digital twin's pipeline is confined to
// the GPU replicas: it asks for a GPU AND is allowed one. A pipeline that
// asks without permission is an ordinary pipeline: every replica, CPU.
func (fm *FlowsManager) usesGpuReplicas(dt *common.DigitalTwin) bool {
	return dt.PipelineRequiresGpu && fm.gpuAllowed(dt)
}

// canRunPipeline reports whether this replica must hold the pipeline of a
// digital twin.
func (fm *FlowsManager) canRunPipeline(dt *common.DigitalTwin) bool {
	return !fm.usesGpuReplicas(dt) || fm.GpuCapable
}

// isPipelineErrorReporter decides which replica publishes "Pipeline
// creation failed": replica 1 for ordinary pipelines, the lowest GPU
// replica alive for GPU ones (replica 1 may not even have the pipeline).
func (fm *FlowsManager) isPipelineErrorReporter(ctx context.Context, requiresGpu bool) bool {
	if !requiresGpu {
		return fm.ReplicaIndex == 1
	}
	if !fm.GpuCapable {
		return false
	}
	lowest := fm.ReplicaIndex
	for _, index := range fm.aliveGpuReplicas(ctx) {
		if index < lowest {
			lowest = index
		}
	}
	return lowest == fm.ReplicaIndex
}

// dropLocalPipeline stops and forgets this replica's copy of a pipeline
// WITHOUT publishing any status: the pipeline goes on running on the
// other replicas, and "stopped"/"deleted" would be a lie for them.
func (fm *FlowsManager) dropLocalPipeline(ctx context.Context, dt *common.DigitalTwin) {
	if dt.PipelineStatusSubscription != nil {
		dt.PipelineStatusSubscription.Unsubscribe()
		dt.PipelineStatusSubscription = nil
	}
	if dt.Pipeline != nil {
		dt.Pipeline.StopStatusPublisher()
		// "update" is the action that stops nodes and releases the
		// leader lock without publishing a status.
		dt.Pipeline.Stop(ctx, "update")
		dt.Pipeline = nil
	}
}

// skipPipelineOnThisReplica is what a replica without GPU does instead of
// creating a GPU pipeline: drop any local copy, and stand by to answer
// status queries in case no GPU replica exists at all.
func (fm *FlowsManager) skipPipelineOnThisReplica(ctx context.Context, dt *common.DigitalTwin, announce bool) {
	fm.dropLocalPipeline(ctx, dt)
	fm.log.Infof("Digital twin %d requires GPU; replica %d has none (%s): pipeline not created here",
		dt.Id, fm.ReplicaIndex, fm.GpuReason)
	dt.PipelineStatusSubscription = fm.setNoGpuStatusSubscription(ctx, dt)

	// One replica says it, once per create/update, and only when the
	// pipeline really has nowhere to run.
	if announce && fm.ReplicaIndex == 1 && len(fm.aliveGpuReplicas(ctx)) == 0 {
		fm.publishNoGpuError(dt)
	}
}

// setNoGpuStatusSubscription answers "queryPipelineStatus" for a GPU
// pipeline while no GPU replica is alive. Its own queue group, so exactly
// one replica without GPU answers, and it stays silent as soon as a GPU
// replica exists (that one answers through pipeline_status_<uid>).
func (fm *FlowsManager) setNoGpuStatusSubscription(ctx context.Context, dt *common.DigitalTwin) *nats.Subscription {
	subject := fm.dtSubject(dt, "sim2state")
	if subject == "" {
		return nil
	}
	queueName := fmt.Sprintf("pipeline_status_nogpu_%s", dt.DigitalTwinUid)
	sub, err := fm.NatsQueueSubscribe(subject, queueName, func(msg *nats.Msg) {
		var raw map[string]any
		if err := json.Unmarshal(msg.Data, &raw); err != nil {
			return
		}
		if action, _ := raw["action"].(string); action != "queryPipelineStatus" {
			return
		}
		if len(fm.aliveGpuReplicas(ctx)) > 0 {
			return
		}
		fm.publishDtStatus(dt, common.PipelineStatusMessage{
			PipelineStatus:     common.PipelineStatusError.String(),
			ReplicaIndexLeader: -1,
		})
	})
	if err != nil {
		fm.log.Errorf("Failed to subscribe no-GPU status handler for digital twin %d: %v", dt.Id, err)
		return nil
	}
	return sub
}

func (fm *FlowsManager) publishNoGpuError(dt *common.DigitalTwin) {
	fm.publishDtStatus(dt, common.PipelineStatusMessage{
		PipelineStatus:     common.PipelineStatusError.String(),
		ReplicaIndexLeader: -1,
	})

	subject := fm.dtSubject(dt, "dtmlog")
	if subject == "" {
		return
	}
	logData := common.PipelineLog{
		Level:       "error",
		Component:   "pipeline",
		Name:        fmt.Sprintf("DT: %s", dt.Description),
		Uid:         dt.DigitalTwinUid,
		Description: "No GPU replica available",
		Message: "This pipeline requires GPU, and no pipelines replica can run ONNX models on CUDA. " +
			"It will start as soon as one is available.",
	}
	if data, err := json.Marshal(logData); err == nil {
		fm.NatsPublish(subject, data)
	}
}

func (fm *FlowsManager) publishDtStatus(dt *common.DigitalTwin, payload common.PipelineStatusMessage) {
	subject := fm.dtSubject(dt, "state2sim")
	if subject == "" {
		return
	}
	if data, err := json.Marshal(payload); err == nil {
		fm.NatsPublish(subject, data)
	}
}

func (fm *FlowsManager) dtSubject(dt *common.DigitalTwin, topicRef string) string {
	topic := fm.GetTopicByTopicRef(dt.AssetId, dt.Id, topicRef)
	if topic == nil {
		return ""
	}
	return utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
}

// ReconcilePipelineRequiresGpu makes this replica hold, or stop holding, the
// pipeline of a digital twin whose PipelineRequiresGpu just changed.
func (fm *FlowsManager) ReconcilePipelineRequiresGpu(ctx context.Context, digitalTwinId int) {
	dt := fm.GetDigitalTwin(digitalTwinId)
	if dt == nil {
		return
	}

	if !fm.canRunPipeline(dt) {
		fm.skipPipelineOnThisReplica(ctx, dt, true)
		return
	}

	if dt.Pipeline != nil {
		return // already here (e.g. GPU replica, flag switched off)
	}

	// Leaving GPU-only mode on a replica without GPU: the no-GPU status
	// handler goes, the real one comes with the pipeline.
	if dt.PipelineStatusSubscription != nil {
		dt.PipelineStatusSubscription.Unsubscribe()
		dt.PipelineStatusSubscription = nil
	}
	if dt.PipelineFileData == "" {
		return // nothing to run yet; "pipeline_action create" will come
	}

	// "update" semantics: the pipeline already exists on other replicas,
	// so no "created" status and no reinitialization of shared state.
	org := fm.GetOrg(dt.OrgId)
	if org == nil {
		fm.log.Errorf("Organization with ID %d not found for digital twin %d", dt.OrgId, dt.Id)
		return
	}
	pipeline := fm.createPipeline(ctx, dt, org, "update")
	dt.Pipeline = pipeline
	dt.PipelineStatusSubscription = fm.SetPipelineStatusSubscription(ctx, dt)
	pipeline.Start(ctx, false)
	pipeline.StartStatusPublisher(ctx)
}

// ApplyGpuPolicyChange re-applies the GPU policy to the digital twins of
// an organization or group whose gpuUsageEnabled just changed: each one
// may move to or from the GPU replicas, and its MlModel nodes must pick
// the provider again (CUDA allowed or not). Recreating the pipeline with
// "update" semantics does both, on every replica (each one receives the
// admin message). Pipelines with no ML model and no GPU request are left
// alone: the policy changes nothing for them.
func (fm *FlowsManager) ApplyGpuPolicyChange(ctx context.Context, dts []*common.DigitalTwin) {
	for _, dt := range dts {
		if dt.PipelineFileData == "" {
			continue
		}
		if !dt.PipelineRequiresGpu && !pipelineHasMlModelNodes(dt) {
			continue
		}
		fm.log.Infof("GPU policy changed for digital twin %d (allowed: %v): updating its pipeline",
			dt.Id, fm.gpuAllowed(dt))
		fm.UpdatePipelineInDigitalTwin(ctx, dt.Id)
	}
}

func pipelineHasMlModelNodes(dt *common.DigitalTwin) bool {
	var nodes []common.PipelineNode
	if err := json.Unmarshal([]byte(dt.PipelineFileData), &nodes); err != nil {
		return true // unknown: better an unneeded restart than a wrong provider
	}
	for _, node := range nodes {
		if node.Type == "MlModel" {
			return true
		}
	}
	return false
}

// GetDigitalTwinsInGroup returns the digital twins of a group.
func (fm *FlowsManager) GetDigitalTwinsInGroup(groupId int) []*common.DigitalTwin {
	var dts []*common.DigitalTwin
	fm.DigitalTwins.Range(func(key, value interface{}) bool {
		if dt := value.(*common.DigitalTwin); dt.GroupId == groupId {
			dts = append(dts, dt)
		}
		return true
	})
	return dts
}
