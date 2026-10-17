package nodes

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"runtime"
	"slices"
	"time"

	ort "github.com/yalue/onnxruntime_go"
)

type DynTensor struct {
	Value   ort.Value
	Set     func(any) error
	Destroy func()
}

type MlmNode struct {
	BaseNode
	MlModelId int
	BatchSize int64
	// ExecutionProvider is the provider the session actually runs on
	// (cpu, cuda, tensorrt), after any fallback.
	ExecutionProvider string
	Session           *ort.AdvancedSession
	InputTensors      []*DynTensor
	OutputTensors     []*DynTensor
	inputShapes       []ort.Shape
	outputShapes      []ort.Shape
	inputTypes        []ort.TensorElementDataType
	outputTypes       []ort.TensorElementDataType
	inputNames        []string
	outputNames       []string

	// Cached hot-path functions
	inputSetters  []func(any) error
	outputGetters []func() (any, error)
	outputBuffer  []any

	// ortCalls feeds the node's ORT thread (see startOrtThread).
	ortCalls chan ortCall
}

type ortCall struct {
	fn   func() error
	done chan error
}

func NewInputDynTensor[T ort.TensorData](shape ort.Shape, data []T) (*DynTensor, error) {
	t, err := ort.NewTensor(shape, data)
	if err != nil {
		return nil, err
	}
	dt := &DynTensor{
		Value: t,
		Set: func(v any) error {
			x, ok := v.([]T)
			if !ok {
				return fmt.Errorf("it expected []%T", *new(T))
			}
			buf := t.GetData()
			if len(buf) != len(x) {
				return fmt.Errorf("mismatch: %d vs %d", len(buf), len(x))
			}
			copy(buf, x)
			return nil
		},
		Destroy: func() {
			_ = t.Destroy()
		},
	}
	return dt, nil
}

func NewOutputDynTensor[T ort.TensorData](shape ort.Shape) (*DynTensor, error) {
	t, err := ort.NewEmptyTensor[T](shape)
	if err != nil {
		return nil, err
	}
	return &DynTensor{
		Value: t,
		Set:   func(any) error { return fmt.Errorf("output: setter not supported") },
		Destroy: func() {
			_ = t.Destroy()
		},
	}, nil
}

// ReadDynTensor returns a COPY of the tensor's data. GetData() is the
// tensor's own buffer, which the next Run overwrites: handing it out
// let a message still being post-processed downstream see the results
// of the next message. The copy is cheap next to the inference (~2.7 MB,
// well under 1 ms, for yolo11n's output).
func ReadDynTensor[T ort.TensorData](dt *DynTensor) ([]T, error) {
	t, ok := dt.Value.(*ort.Tensor[T])
	if !ok {
		return nil, fmt.Errorf("it is not *ort.Tensor[%T]", *new(T))
	}
	return slices.Clone(t.GetData()), nil
}

func CreateMlmNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*MlmNode, error) {
	mlModelIdFloat, ok := node.Settings["mlModelId"].(float64)
	if !ok {
		return nil, fmt.Errorf("mlModelId setting is required and must be a number")
	}

	mlModelId := int(mlModelIdFloat)
	if mlModelId <= 0 {
		return nil, fmt.Errorf("mlModelId must be a positive integer, got %d", mlModelId)
	}

	mlModel := fm.GetMlModel(mlModelId)
	if mlModel == nil {
		return nil, fmt.Errorf("ML model with ID %d not found", mlModelId)
	}

	var batchSize int64 = 1
	batchSizeFloat, ok := node.Settings["batchSize"].(float64)
	if ok {
		batchSize = int64(batchSizeFloat)
		if batchSize <= 0 {
			return nil, fmt.Errorf("batchSize must be a positive integer, got %d", batchSize)
		}
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	mlmNode := &MlmNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "MlModel",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		MlModelId: mlModelId,
		BatchSize: batchSize,
	}

	return mlmNode, nil
}

func (n *MlmNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("MlModel %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodectx
	n.Cancel = nodeCancel

	log.Infof("Starting MlModel with UID: %s", n.NodeUid)

	if err := n.initializeONNXRuntime(log); err != nil {
		log.Errorf("Failed to initialize ONNX Runtime: %v", err)
		errMsg := fmt.Errorf("failed to initialize ONNX Runtime: %v", err)
		n.HandleError(errMsg)
		n.SetStatus(common.NodeStatusError)
		return
	}

	if err := n.loadModelInfo(log); err != nil {
		log.Errorf("Failed to load model info: %v", err)
		errMsg := fmt.Errorf("failed to load model info: %v", err)
		n.HandleError(errMsg)
		n.SetStatus(common.NodeStatusError)
		return
	}

	if err := n.createSession(log); err != nil {
		log.Errorf("Failed to create session: %v", err)
		errMsg := fmt.Errorf("failed to create session: %v", err)
		n.HandleError(errMsg)
		n.SetStatus(common.NodeStatusError)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	n.handleInputWires(log, n.processMessage)
}

func (n *MlmNode) initializeONNXRuntime(log *logger.Logger) error {
	return initONNXRuntime(n.getSharedLibPath(), log)
}

func (n *MlmNode) loadModelInfo(log *logger.Logger) error {
	mlModelFilePath := n.Fm.GetMlModelFilePath(n.GetOrgId(), n.GetGroupId(), n.MlModelId)

	inputs, outputs, err := ort.GetInputOutputInfo(mlModelFilePath)
	if err != nil {
		return fmt.Errorf("error getting input/output info: %w", err)
	}

	if len(inputs) == 0 || len(outputs) == 0 {
		return fmt.Errorf("model must have at least one input and one output")
	}

	n.inputShapes = make([]ort.Shape, len(inputs))
	n.inputTypes = make([]ort.TensorElementDataType, len(inputs))
	n.inputNames = make([]string, len(inputs))
	for i, in := range inputs {
		inputDims := make([]int64, len(inputs[i].Dimensions))
		for idim, dim := range inputs[i].Dimensions {
			if dim == -1 {
				inputDims[idim] = n.BatchSize
			} else {
				inputDims[idim] = dim
			}
		}
		n.inputShapes[i] = ort.NewShape(inputDims...)
		n.inputTypes[i] = in.DataType
		n.inputNames[i] = in.Name
	}

	n.outputShapes = make([]ort.Shape, len(outputs))
	n.outputTypes = make([]ort.TensorElementDataType, len(outputs))
	n.outputNames = make([]string, len(outputs))
	for i, out := range outputs {
		outputDims := make([]int64, len(out.Dimensions))
		for i, dim := range out.Dimensions {
			if dim == -1 {
				outputDims[i] = n.BatchSize
			} else {
				outputDims[i] = dim
			}
		}
		n.outputShapes[i] = ort.NewShape(outputDims...)
		n.outputTypes[i] = out.DataType
		n.outputNames[i] = out.Name
	}

	log.Infof("Model input names: %v", n.inputNames)
	log.Infof("Model output names: %v", n.outputNames)
	log.Infof("Model input shapes: %v", n.inputShapes)
	log.Infof("Model output shapes: %v", n.outputShapes)
	log.Infof("Model input types: %v", n.inputTypes)
	log.Infof("Model output types: %v", n.outputTypes)

	return nil
}

func (n *MlmNode) createSession(log *logger.Logger) error {
	mlModelFilePath := n.Fm.GetMlModelFilePath(n.GetOrgId(), n.GetGroupId(), n.MlModelId)

	inputTensors := make([]*DynTensor, len(n.inputShapes))
	sessionInputTensors := make([]ort.Value, len(n.inputShapes))
	for i, shape := range n.inputShapes {
		tensor, err := n.CreateDynInputTensorFromShape(shape, n.inputTypes[i])
		if err != nil {
			return fmt.Errorf("error creating input tensor: %w", err)
		}
		inputTensors[i] = tensor
		sessionInputTensors[i] = tensor.Value
	}

	outputTensors := make([]*DynTensor, len(n.outputShapes))
	sessionOutputTensors := make([]ort.Value, len(n.outputShapes))
	for i, shape := range n.outputShapes {
		tensor, err := n.CreateDynOutputTensorFromShape(shape, n.outputTypes[i])
		if err != nil {
			for _, t := range inputTensors {
				t.Destroy()
			}
			return fmt.Errorf("error creating output tensor: %w", err)
		}
		outputTensors[i] = tensor
		sessionOutputTensors[i] = tensor.Value
	}

	requested := requestedProvider(n.Settings)
	// GPU policy: only organizations AND groups the administrators enabled
	// may use the GPU. Without that permission the model runs on CPU even
	// on a replica with a GPU, whatever the node or the service asks for.
	if requested != ProviderCPU && !common.GpuUsageAllowed(n.Fm.GetOrg(n.GetOrgId()), n.Fm.GetGroup(n.GetGroupId())) {
		log.Infof("MlModel %s: GPU usage not enabled for org %d / group %d, running on CPU",
			n.NodeUid, n.GetOrgId(), n.GetGroupId())
		requested = ProviderCPU
	}

	session, provider, err := newSessionWithFallback(
		mlModelFilePath,
		n.inputNames,
		n.outputNames,
		sessionInputTensors,
		sessionOutputTensors,
		requested,
		log)
	if err != nil {
		for _, t := range inputTensors {
			t.Destroy()
		}
		for _, t := range outputTensors {
			t.Destroy()
		}
		return fmt.Errorf("error creating ORT session: %w", err)
	}

	n.Session = session
	n.ExecutionProvider = provider
	n.InputTensors = inputTensors
	n.OutputTensors = outputTensors

	// Cache setters — Set ya es type-safe por construcción en NewInputDynTensor
	n.inputSetters = make([]func(any) error, len(inputTensors))
	for i, t := range inputTensors {
		n.inputSetters[i] = t.Set
	}

	// Cache getters — el switch de dtype ocurre solo aquí, una única vez
	n.outputGetters = make([]func() (any, error), len(outputTensors))
	for i, t := range outputTensors {
		getter, err := n.buildOutputGetter(t, n.outputTypes[i])
		if err != nil {
			return fmt.Errorf("error building output getter for tensor %d: %w", i, err)
		}
		n.outputGetters[i] = getter
	}

	// Preallocate output buffer para evitar allocs en el hot path
	n.outputBuffer = make([]any, len(outputTensors))

	log.Infof("ONNX session created successfully (execution provider: %s)", provider)
	n.startOrtThread()
	n.warmUp(log)
	return nil
}

// warmUp runs one inference on the freshly created (zero-filled) input
// tensors, so the first real message does not pay the one-off start-up
// cost: with CUDA, loading the kernels and choosing the cuDNN algorithms
// takes ~250 ms on the first Run, against ~5 ms afterwards (yolo11n).
// On CPU it is cheap and still warms the thread pool and caches.
//
// A failure is only logged: some models may reject all-zero inputs, and
// that must not stop a node that would work with real data.
func (n *MlmNode) warmUp(log *logger.Logger) {
	start := time.Now()
	if err := n.onOrtThread(n.Session.Run); err != nil {
		log.Warnf("ONNX warm-up run failed (the node keeps working; the first message will be slower): %v", err)
		return
	}
	log.Infof("ONNX warm-up run on %s took %v", n.ExecutionProvider, time.Since(start))
}

// recreateSessionOnCPU replaces the session with a CPU one on the same
// tensors. Called on the ORT thread after a sticky CUDA error.
func (n *MlmNode) recreateSessionOnCPU(log *logger.Logger) error {
	if n.Session != nil {
		_ = n.Session.Destroy() // may fail too: the CUDA context is gone
		n.Session = nil
	}
	inputs := make([]ort.Value, len(n.InputTensors))
	for i, t := range n.InputTensors {
		inputs[i] = t.Value
	}
	outputs := make([]ort.Value, len(n.OutputTensors))
	for i, t := range n.OutputTensors {
		outputs[i] = t.Value
	}
	modelPath := n.Fm.GetMlModelFilePath(n.GetOrgId(), n.GetGroupId(), n.MlModelId)
	session, provider, err := newSessionWithFallback(modelPath, n.inputNames, n.outputNames, inputs, outputs, ProviderCPU, log)
	if err != nil {
		return err
	}
	n.Session = session
	n.ExecutionProvider = provider
	log.Warnf("MlModel %s: ONNX session rebuilt on %s after a GPU failure", n.NodeUid, provider)
	return nil
}

// startOrtThread starts the goroutine through which every Run of this
// node goes, pinned to one OS thread for its whole life.
//
// Why: with CUDA, ONNX Runtime keeps per-thread state (cuBLAS/cuDNN
// handles, streams) and builds it the first time a thread calls Run. Go
// moves goroutines between OS threads freely, so without pinning a
// message can land on a thread with no such state and pay for building
// it. Pinned, the warm-up builds it once and every message reuses it.
//
// It also serialises the Runs: handleInputWires starts one goroutine per
// input wire, and two of them must not run the same session, writing the
// same input tensors, at the same time.
func (n *MlmNode) startOrtThread() {
	calls := make(chan ortCall)
	n.ortCalls = calls
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		for c := range calls {
			c.done <- c.fn()
		}
	}()
}

// onOrtThread runs fn on the node's ORT thread and waits for it.
func (n *MlmNode) onOrtThread(fn func() error) error {
	if n.ortCalls == nil {
		return fn()
	}
	done := make(chan error, 1)
	n.ortCalls <- ortCall{fn: fn, done: done}
	return <-done
}

func (n *MlmNode) stopOrtThread() {
	if n.ortCalls != nil {
		close(n.ortCalls)
		n.ortCalls = nil
	}
}

func (n *MlmNode) buildOutputGetter(tensor *DynTensor, dtype ort.TensorElementDataType) (func() (any, error), error) {
	switch dtype {
	case ort.TensorElementDataTypeFloat:
		return func() (any, error) { return ReadDynTensor[float32](tensor) }, nil
	case ort.TensorElementDataTypeUint8:
		return func() (any, error) { return ReadDynTensor[uint8](tensor) }, nil
	case ort.TensorElementDataTypeInt8:
		return func() (any, error) { return ReadDynTensor[int8](tensor) }, nil
	case ort.TensorElementDataTypeUint16:
		return func() (any, error) { return ReadDynTensor[uint16](tensor) }, nil
	case ort.TensorElementDataTypeInt16:
		return func() (any, error) { return ReadDynTensor[int16](tensor) }, nil
	case ort.TensorElementDataTypeInt32:
		return func() (any, error) { return ReadDynTensor[int32](tensor) }, nil
	case ort.TensorElementDataTypeInt64:
		return func() (any, error) { return ReadDynTensor[int64](tensor) }, nil
	case ort.TensorElementDataTypeBool:
		return func() (any, error) { return ReadDynTensor[bool](tensor) }, nil
	case ort.TensorElementDataTypeDouble:
		return func() (any, error) { return ReadDynTensor[float64](tensor) }, nil
	case ort.TensorElementDataTypeUint32:
		return func() (any, error) { return ReadDynTensor[uint32](tensor) }, nil
	case ort.TensorElementDataTypeUint64:
		return func() (any, error) { return ReadDynTensor[uint64](tensor) }, nil
	default:
		return nil, fmt.Errorf("unsupported tensor type: %v", dtype)
	}
}

func (n *MlmNode) processMessage(msg common.Message, log *logger.Logger) error {
	start := time.Now()
	payload := msg.GetPayload()

	// Fill the inputs, run and read the outputs as ONE call on the ORT
	// thread: with several input wires, another message must not rewrite
	// the input tensors between this message's copy and its Run.
	err := n.onOrtThread(func() error {
		if len(n.inputSetters) == 1 {
			if err := n.inputSetters[0](payload["mlmInput"]); err != nil {
				return fmt.Errorf("failed to set input tensor: %w", err)
			}
		} else {
			for i, setter := range n.inputSetters {
				if err := setter(payload[fmt.Sprintf("mlmInput%d", i)]); err != nil {
					return fmt.Errorf("failed to set input tensor %d: %w", i, err)
				}
			}
		}

		if n.Session == nil {
			return fmt.Errorf("inference failed: session not initialized")
		}
		if err := n.Session.Run(); err != nil {
			// A sticky CUDA error leaves the GPU unusable for the whole
			// process: rebuild this session on CPU and retry the message
			// instead of failing every message from now on.
			if n.ExecutionProvider != ProviderCPU && IsStickyCUDAError(err) {
				MarkCUDABroken(err, log)
				if rerr := n.recreateSessionOnCPU(log); rerr != nil {
					log.Errorf("could not rebuild ONNX session on CPU: %v", rerr)
				} else {
					n.HandleError(fmt.Errorf("GPU failure (%v): this model now runs on CPU until pipelines is restarted", err))
					err = n.Session.Run()
				}
			}
			if err != nil {
				log.Errorf("error running inference: %v", err)
				return fmt.Errorf("inference failed: error running inference: %w", err)
			}
		}

		if len(n.outputGetters) == 1 {
			result, err := n.outputGetters[0]()
			if err != nil {
				return fmt.Errorf("failed to get output tensor: %w", err)
			}
			payload["mlmOutput"] = result
		} else {
			// A fresh slice per message: the output buffer must not be
			// shared with a message still travelling down the pipeline.
			outputs := make([]any, len(n.outputGetters))
			for i, getter := range n.outputGetters {
				result, err := getter()
				if err != nil {
					return fmt.Errorf("failed to get output tensor %d: %w", i, err)
				}
				outputs[i] = result
			}
			payload["mlmOutput"] = outputs
		}
		return nil
	})
	if err != nil {
		return err
	}

	payload["elapsedTime"] = time.Since(start).String()
	payload["executionProvider"] = n.ExecutionProvider
	n.sendToOutputs(msg, log)
	return nil
}

func (n *MlmNode) runInference(log *logger.Logger) error {
	if n.Session == nil {
		return fmt.Errorf("session not initialized")
	}

	if err := n.onOrtThread(n.Session.Run); err != nil {
		log.Errorf("error running inference: %v", err)
		return fmt.Errorf("error running inference: %w", err)
	}

	return nil
}

func (n *MlmNode) calculateTensorSize(dimensions []int64) int {
	size := 1
	for _, dim := range dimensions {
		size *= int(dim)
	}
	return size
}

func (n *MlmNode) getSharedLibPath() string {
	return defaultSharedLibPath()
}

func (n *MlmNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		log.Infof("MlModel %s is already stopped", n.NodeUid)
		return
	}

	log.Infof("Stopping MlModel with UID: %s", n.NodeUid)
	n.SetStatus(common.NodeStatusStopped)

	// First stop the message goroutines and wait for them, THEN free the
	// session: freeing it first let a message in flight call Run on a
	// destroyed session.
	if n.Cancel != nil {
		n.Cancel()
	}
	n.wg.Wait()
	n.stopOrtThread()

	if n.Session != nil {
		n.Session.Destroy()
		n.Session = nil
	}

	if n.InputTensors != nil {
		for _, t := range n.InputTensors {
			t.Destroy()
		}
		n.InputTensors = nil
	}

	if n.OutputTensors != nil {
		for _, t := range n.OutputTensors {
			t.Destroy()
		}
		n.OutputTensors = nil
	}

	n.SetStatus(common.NodeStatusStopped)
	log.Infof("Node %s stopped successfully", n.NodeUid)
}

func (n *MlmNode) CreateDynInputTensorFromShape(shape []int64, dtype ort.TensorElementDataType) (*DynTensor, error) {
	size := n.calculateTensorSize(shape)
	switch dtype {
	case ort.TensorElementDataTypeFloat:
		t, err := NewInputDynTensor(ort.NewShape(shape...), make([]float32, size))
		return t, err
	case ort.TensorElementDataTypeUint8:
		t, err := NewInputDynTensor(ort.NewShape(shape...), make([]uint8, size))
		return t, err
	case ort.TensorElementDataTypeInt8:
		t, err := NewInputDynTensor(ort.NewShape(shape...), make([]int8, size))
		return t, err
	case ort.TensorElementDataTypeUint16:
		t, err := NewInputDynTensor(ort.NewShape(shape...), make([]uint16, size))
		return t, err
	case ort.TensorElementDataTypeInt16:
		t, err := NewInputDynTensor(ort.NewShape(shape...), make([]int16, size))
		return t, err
	case ort.TensorElementDataTypeInt32:
		t, err := NewInputDynTensor(ort.NewShape(shape...), make([]int32, size))
		return t, err
	case ort.TensorElementDataTypeInt64:
		t, err := NewInputDynTensor(ort.NewShape(shape...), make([]int64, size))
		return t, err
	case ort.TensorElementDataTypeBool:
		t, err := NewInputDynTensor(ort.NewShape(shape...), make([]bool, size))
		return t, err
	case ort.TensorElementDataTypeDouble:
		t, err := NewInputDynTensor(ort.NewShape(shape...), make([]float64, size))
		return t, err
	case ort.TensorElementDataTypeUint32:
		t, err := NewInputDynTensor(ort.NewShape(shape...), make([]uint32, size))
		return t, err
	case ort.TensorElementDataTypeUint64:
		t, err := NewInputDynTensor(ort.NewShape(shape...), make([]uint64, size))
		return t, err
	default:
		return nil, fmt.Errorf("unsupported tensor type: %v", dtype)
	}
}

func (n *MlmNode) CreateDynOutputTensorFromShape(shape []int64, dtype ort.TensorElementDataType) (*DynTensor, error) {
	switch dtype {
	case ort.TensorElementDataTypeFloat:
		t, err := NewOutputDynTensor[float32](ort.NewShape(shape...))
		return t, err
	case ort.TensorElementDataTypeUint8:
		t, err := NewOutputDynTensor[uint8](ort.NewShape(shape...))
		return t, err
	case ort.TensorElementDataTypeInt8:
		t, err := NewOutputDynTensor[int8](ort.NewShape(shape...))
		return t, err
	case ort.TensorElementDataTypeUint16:
		t, err := NewOutputDynTensor[uint16](ort.NewShape(shape...))
		return t, err
	case ort.TensorElementDataTypeInt16:
		t, err := NewOutputDynTensor[int16](ort.NewShape(shape...))
		return t, err
	case ort.TensorElementDataTypeInt32:
		t, err := NewOutputDynTensor[int32](ort.NewShape(shape...))
		return t, err
	case ort.TensorElementDataTypeInt64:
		t, err := NewOutputDynTensor[int64](ort.NewShape(shape...))
		return t, err
	case ort.TensorElementDataTypeBool:
		t, err := NewOutputDynTensor[bool](ort.NewShape(shape...))
		return t, err
	case ort.TensorElementDataTypeDouble:
		t, err := NewOutputDynTensor[float64](ort.NewShape(shape...))
		return t, err
	case ort.TensorElementDataTypeUint32:
		t, err := NewOutputDynTensor[uint32](ort.NewShape(shape...))
		return t, err
	case ort.TensorElementDataTypeUint64:
		t, err := NewOutputDynTensor[uint64](ort.NewShape(shape...))
		return t, err
	default:
		return nil, fmt.Errorf("unsupported tensor type: %v", dtype)
	}
}

func (n *MlmNode) SetInputTensorFromPayload(data any, index int) error {
	dtype := n.inputTypes[index]
	switch dtype {
	case ort.TensorElementDataTypeFloat:
		mlmInput, ok := data.([]float32)
		if !ok {
			return fmt.Errorf("mlmInput is required and must be []float32")
		}
		if len(mlmInput) == 0 {
			return fmt.Errorf("mlmInput cannot be empty")
		}
		err := n.InputTensors[index].Set(mlmInput)
		return err
	case ort.TensorElementDataTypeUint8:
		mlmInput, ok := data.([]uint8)
		if !ok {
			return fmt.Errorf("mlmInput is required and must be []uint8")
		}
		if len(mlmInput) == 0 {
			return fmt.Errorf("mlmInput cannot be empty")
		}
		err := n.InputTensors[index].Set(mlmInput)
		return err
	case ort.TensorElementDataTypeInt8:
		mlmInput, ok := data.([]int8)
		if !ok {
			return fmt.Errorf("mlmInput is required and must be []int8")
		}
		if len(mlmInput) == 0 {
			return fmt.Errorf("mlmInput cannot be empty")
		}
		err := n.InputTensors[index].Set(mlmInput)
		return err
	case ort.TensorElementDataTypeUint16:
		mlmInput, ok := data.([]uint16)
		if !ok {
			return fmt.Errorf("mlmInput is required and must be []uint16")
		}
		if len(mlmInput) == 0 {
			return fmt.Errorf("mlmInput cannot be empty")
		}
		err := n.InputTensors[index].Set(mlmInput)
		return err
	case ort.TensorElementDataTypeInt16:
		mlmInput, ok := data.([]int16)
		if !ok {
			return fmt.Errorf("mlmInput is required and must be []int16")
		}
		if len(mlmInput) == 0 {
			return fmt.Errorf("mlmInput cannot be empty")
		}
		err := n.InputTensors[index].Set(mlmInput)
		return err
	case ort.TensorElementDataTypeInt32:
		mlmInput, ok := data.([]int32)
		if !ok {
			return fmt.Errorf("mlmInput is required and must be []int32")
		}
		if len(mlmInput) == 0 {
			return fmt.Errorf("mlmInput cannot be empty")
		}
		err := n.InputTensors[index].Set(mlmInput)
		return err
	case ort.TensorElementDataTypeInt64:
		mlmInput, ok := data.([]int64)
		if !ok {
			return fmt.Errorf("mlmInput is required and must be []int64")
		}
		if len(mlmInput) == 0 {
			return fmt.Errorf("mlmInput cannot be empty")
		}
		err := n.InputTensors[index].Set(mlmInput)
		return err
	case ort.TensorElementDataTypeBool:
		mlmInput, ok := data.([]bool)
		if !ok {
			return fmt.Errorf("mlmInput is required and must be []bool")
		}
		if len(mlmInput) == 0 {
			return fmt.Errorf("mlmInput cannot be empty")
		}
		err := n.InputTensors[index].Set(mlmInput)
		return err
	case ort.TensorElementDataTypeDouble:
		mlmInput, ok := data.([]float64)
		if !ok {
			return fmt.Errorf("mlmInput is required and must be []float64")
		}
		if len(mlmInput) == 0 {
			return fmt.Errorf("mlmInput cannot be empty")
		}
		err := n.InputTensors[index].Set(mlmInput)
		return err
	case ort.TensorElementDataTypeUint32:
		mlmInput, ok := data.([]uint32)
		if !ok {
			return fmt.Errorf("mlmInput is required and must be []uint32")
		}
		if len(mlmInput) == 0 {
			return fmt.Errorf("mlmInput cannot be empty")
		}
		err := n.InputTensors[index].Set(mlmInput)
		return err
	default:
		return fmt.Errorf("unsupported tensor type: %v", dtype)
	}
}

func (n *MlmNode) GetMlmOutput(tensor *DynTensor, dtype ort.TensorElementDataType) (any, error) {
	switch dtype {
	case ort.TensorElementDataTypeFloat:
		data, err := ReadDynTensor[float32](tensor)
		return data, err
	case ort.TensorElementDataTypeUint8:
		data, err := ReadDynTensor[uint8](tensor)
		return data, err
	case ort.TensorElementDataTypeInt8:
		data, err := ReadDynTensor[int8](tensor)
		return data, err
	case ort.TensorElementDataTypeUint16:
		data, err := ReadDynTensor[uint16](tensor)
		return data, err
	case ort.TensorElementDataTypeInt16:
		data, err := ReadDynTensor[int16](tensor)
		return data, err
	case ort.TensorElementDataTypeInt32:
		data, err := ReadDynTensor[int32](tensor)
		return data, err
	case ort.TensorElementDataTypeInt64:
		data, err := ReadDynTensor[int64](tensor)
		return data, err
	case ort.TensorElementDataTypeBool:
		data, err := ReadDynTensor[bool](tensor)
		return data, err
	case ort.TensorElementDataTypeDouble:
		data, err := ReadDynTensor[float64](tensor)
		return data, err
	case ort.TensorElementDataTypeUint32:
		data, err := ReadDynTensor[uint32](tensor)
		return data, err
	case ort.TensorElementDataTypeUint64:
		data, err := ReadDynTensor[uint64](tensor)
		return data, err
	default:
		return nil, fmt.Errorf("unsupported tensor type: %v", dtype)
	}
}
