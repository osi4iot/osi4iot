package nodes

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"runtime"
	"time"

	ort "github.com/yalue/onnxruntime_go"
)

type DynTensor struct {
	Value   ort.Value
	Set     func(any) error
	Destroy func()
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

func ReadDynTensor[T ort.TensorData](dt *DynTensor) ([]T, error) {
	t, ok := dt.Value.(*ort.Tensor[T])
	if !ok {
		return nil, fmt.Errorf("it is not *ort.Tensor[%T]", *new(T))
	}
	return t.GetData(), nil
}

type MlmNode struct {
	BaseNode
	MlModelId     int
	BatchSize     int64
	Session       *ort.AdvancedSession
	InputTensors  []*DynTensor
	OutputTensors []*DynTensor
	inputShapes   []ort.Shape
	outputShapes  []ort.Shape
	inputTypes    []ort.TensorElementDataType
	outputTypes   []ort.TensorElementDataType
	inputNames    []string
	outputNames   []string
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

	ctx, cancel := context.WithCancel(context.Background())

	mlmNode := &MlmNode{
		BaseNode: BaseNode{
			NodeUid:        node.NodeUid,
			Name:           node.Name,
			Xpos:           node.Xpos,
			Ypos:           node.Ypos,
			NumOutputs:     node.NumOutputs,
			Settings:       node.Settings,
			Debug:          node.Debug,
			Type:           "MlModel",
			LogSubject:     logSubject,
			Fm:             fm,
			Pipeline:       p,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		MlModelId: mlModelId,
		BatchSize: batchSize,
	}

	return mlmNode, nil
}

func (n *MlmNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("MlModel %s is already running", n.NodeUid)
		return
	}

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
	sharedLibPath := n.getSharedLibPath()
	ort.SetSharedLibraryPath(sharedLibPath)

	if !ort.IsInitialized() {
		if err := ort.InitializeEnvironment(); err != nil {
			return fmt.Errorf("error initializing ORT environment: %w", err)
		}
		log.Infof("ONNX Runtime initialized with library: %s", sharedLibPath)
	}
	return nil
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
				(*t).Destroy()
			}
			return fmt.Errorf("error creating output tensor: %w", err)
		}
		outputTensors[i] = tensor
		sessionOutputTensors[i] = tensor.Value
	}

	options, err := ort.NewSessionOptions()
	if err != nil {
		for _, t := range inputTensors {
			(*t).Destroy()
		}
		for _, t := range outputTensors {
			(*t).Destroy()
		}
		return fmt.Errorf("error creating session options: %w", err)
	}
	defer options.Destroy()

	session, err := ort.NewAdvancedSession(
		mlModelFilePath,
		n.inputNames,
		n.outputNames,
		sessionInputTensors,
		sessionOutputTensors,
		options)

	if err != nil {
		for _, t := range inputTensors {
			(*t).Destroy()
		}
		for _, t := range outputTensors {
			(*t).Destroy()
		}
		return fmt.Errorf("error creating ORT session: %w", err)
	}

	n.Session = session
	n.InputTensors = inputTensors
	n.OutputTensors = outputTensors

	log.Infof("ONNX session created successfully")
	return nil
}

func (n *MlmNode) processMessage(msg common.Message, log *logger.Logger) error {
	start := time.Now()

	if len(n.InputTensors) == 1 {
		n.SetInputTensorFromPayload(msg.Payload["mlmInput"], 0)
	} else {
		for i := 0; i < len(n.InputTensors); i++ {
			n.SetInputTensorFromPayload(msg.Payload[fmt.Sprintf("mlmInput%d", i)], i)
		}
	}

	err := n.runInference(log)
	if err != nil {
		return fmt.Errorf("inference failed: %w", err)
	}

	
	if len(n.OutputTensors) == 1 {
		mlmOutput, err := n.GetMlmOutput(n.OutputTensors[0], n.outputTypes[0])
		if err != nil {
			return fmt.Errorf("failed to get MLM output: %w", err)
		}
		msg.Payload["mlmOutput"] = mlmOutput
	} else {
		mlmOutput := make([]any, len(n.OutputTensors))
		for i, output := range n.OutputTensors {
			outputData, err := n.GetMlmOutput(output, n.outputTypes[i])
			if err != nil {
				return fmt.Errorf("failed to get MLM output: %w", err)
			}
			mlmOutput[i] = outputData
		}
		msg.Payload["mlmOutput"] = mlmOutput
	}

	msg.Payload["elapsedTime"] = time.Since(start).String()

	n.sendToOutputs(msg, log)
	return nil
}

func (n *MlmNode) runInference(log *logger.Logger) error {
	if n.Session == nil {
		return fmt.Errorf("session not initialized")
	}

	if err := n.Session.Run(); err != nil {
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
	switch runtime.GOOS {
	case "linux":
		if runtime.GOARCH == "arm64" {
			return "./assets/onnx_runtime_linux_arm64/onnxruntime_arm64.so"
		}
		return "./assets/onnx_runtime_linux_amd64/onnxruntime.so"
	case "darwin":
		return "./assets/onnx_runtime_darwin/onnxruntime.dylib"
	case "windows":
		return "./assets/onnx_runtime_windows/onnxruntime.dll"
	default:
		panic(fmt.Sprintf("Unsupported platform: %s/%s", runtime.GOOS, runtime.GOARCH))
	}
}

func (n *MlmNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		log.Infof("MlModel %s is already stopped", n.NodeUid)
		return
	}

	log.Infof("Stopping MlModel with UID: %s", n.NodeUid)
	n.SetStatus(common.NodeStatusStopped)

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

	if n.Cancel != nil {
		n.Cancel()
	}

	n.wg.Wait()

	n.ResetNodeContext()

	log.Infof("MlModel %s stopped successfully", n.NodeUid)
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
