package nodes

import (
	"context"
	"fmt"
	"image"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"strings"
	"time"

	"github.com/dop251/goja"
	"github.com/nats-io/nats.go"

	fl "pipelines/function_library"
)

type CompiledScript struct {
	program     *goja.Program
	processFunc goja.Callable
}

type FuncNode struct {
	BaseNode
	nc                     *nats.Conn
	onInitializationScript string
	onStartScript          string
	onMessageScript        string
	compiledScript         *CompiledScript
	vmPool                 chan *goja.Runtime
}

func CreateFuncNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*FuncNode, error) {
	onMessageScript, ok1 := node.Settings["onMessageScript"].(string)
	onInitializationScript, ok2 := node.Settings["onInitializationScript"].(string)
	onStartScript, ok3 := node.Settings["onStartScript"].(string)
	if !ok1 && !ok2 && !ok3 {
		return nil, fmt.Errorf("missing required scripts in node settings")
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	funNode := &FuncNode{
		BaseNode: BaseNode{
			NodeUid:        node.NodeUid,
			Name:           node.Name,
			Xpos:           node.Xpos,
			Ypos:           node.Ypos,
			NumOutputs:     node.NumOutputs,
			Settings:       node.Settings,
			Debug:          node.Debug,
			Type:           "Function",
			LogSubject:     logSubject,
			Fm:             fm,
			Pipeline:       p,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		nc:                     nil,
		vmPool:                 make(chan *goja.Runtime, 10),
		onInitializationScript: onInitializationScript,
		onStartScript:          onStartScript,
		onMessageScript:        onMessageScript,
	}

	fm.Log().Infof("Created FuncNode with UID: %s", funNode.NodeUid)

	if funNode.onMessageScript != "" {
		if err := funNode.precompileScript(fm.Log()); err != nil {
			nodeError := fmt.Errorf("failed to precompile script for node %s: %v", funNode.NodeUid, err)
			funNode.HandleError(nodeError)
			return nil, nodeError
		}
		if err := funNode.initVMPool(fm.Log()); err != nil {
			nodeError := fmt.Errorf("failed to initialize VM pool for node %s: %v", funNode.NodeUid, err)
			funNode.HandleError(nodeError)
			return nil, nodeError
		}
	}

	fm.Log().Infof("FuncNode %s initialized successfully", funNode.NodeUid)
	return funNode, nil
}

func (n *FuncNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("FuncNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting FuncNode with UID: %s", n.NodeUid)

	if n.onInitializationScript != "" && needReinitialization {
		if err := n.executeInitializationScript(log); err != nil {
			log.Errorf("Failed to execute initialization script for node %s: %v", n.NodeUid, err)
			n.HandleError(err)
			return
		}
		log.Infof("Initialization script executed successfully for node %s", n.NodeUid)
	}

	if n.onStartScript != "" {
		if err := n.executeStartScript(log); err != nil {
			log.Errorf("Failed to execute start script for node %s: %v", n.NodeUid, err)
			n.HandleError(err)
			return
		}
		log.Infof("Start script executed successfully for node %s", n.NodeUid)
	}

	if n.onMessageScript != "" {
		n.handleInputWires(log, n.processMessage)
	}
}

func (n *FuncNode) precompileScript(log *logger.Logger) error {
	vm := goja.New()
	n.setupJSGlobals(vm, log)

	program, err := goja.Compile(n.NodeUid+".js", n.onMessageScript, false)
	if err != nil {
		return fmt.Errorf("failed to compile script: %w", err)
	}

	_, err = vm.RunProgram(program)
	if err != nil {
		return fmt.Errorf("failed to execute script: %w", err)
	}

	processFunc, ok := goja.AssertFunction(vm.Get("process"))
	if !ok {
		return fmt.Errorf("process function not found in script")
	}

	n.compiledScript = &CompiledScript{
		program:     program,
		processFunc: processFunc,
	}

	log.Infof("Script precompiled successfully for node: %s", n.NodeUid)
	return nil
}

func (n *FuncNode) executeInitializationScript(log *logger.Logger) error {
	if n.onInitializationScript == "" {
		log.Infof("No initialization script to execute for node %s", n.NodeUid)
		return nil
	}

	vm := goja.New()
	n.setupJSGlobals(vm, log)

	program, err := goja.Compile(n.NodeUid+"_init.js", n.onInitializationScript, false)
	if err != nil {
		return fmt.Errorf("failed to compile initialization script: %w", err)
	}

	_, err = vm.RunProgram(program)
	if err != nil {
		return fmt.Errorf("failed to execute initialization script: %w", err)
	}

	initFunc, ok := goja.AssertFunction(vm.Get("init"))
	if !ok {
		return fmt.Errorf("init function not found in script")
	}

	_, err = initFunc(goja.Undefined())
	if err != nil {
		log.Errorf("Script execution error in node %s: %v", n.NodeUid, err)
		return fmt.Errorf("script execution error: %w", err)
	}
	return nil
}

func (n *FuncNode) executeStartScript(log *logger.Logger) error {
	if n.onStartScript == "" {
		log.Infof("No start script to execute for node %s", n.NodeUid)
		return nil
	}

	vm := goja.New()
	n.setupJSGlobals(vm, log)

	program, err := goja.Compile(n.NodeUid+"_start.js", n.onStartScript, false)
	if err != nil {
		return fmt.Errorf("failed to compile start script: %w", err)
	}

	_, err = vm.RunProgram(program)
	if err != nil {
		return fmt.Errorf("failed to execute start script: %w", err)
	}

	startFunc, ok := goja.AssertFunction(vm.Get("start"))
	if !ok {
		return fmt.Errorf("start function not found in script")
	}

	_, err = startFunc(goja.Undefined())
	if err != nil {
		log.Errorf("Script execution error in node %s: %v", n.NodeUid, err)
		return fmt.Errorf("script execution error: %w", err)
	}

	return nil
}

func (n *FuncNode) initVMPool(log *logger.Logger) error {
	poolSize := 10
	for i := 0; i < poolSize; i++ {
		vm := goja.New()
		n.setupJSGlobals(vm, log)

		_, err := vm.RunProgram(n.compiledScript.program)
		if err != nil {
			return fmt.Errorf("failed to initialize VM %d: %w", i, err)
		}

		n.vmPool <- vm
	}
	return nil
}

func (n *FuncNode) setupJSGlobals(vm *goja.Runtime, log *logger.Logger) {
	jsFunctions := fl.GetJSFunctions(n, n.Fm, log)
	for _, jsFunc := range jsFunctions {
		vm.Set(jsFunc.Name, jsFunc.Func)
	}
}

func (n *FuncNode) getVM() *goja.Runtime {
	return <-n.vmPool
}

func (n *FuncNode) returnVM(vm *goja.Runtime) {
	n.vmPool <- vm
}

func (n *FuncNode) processMessage(message common.Message, log *logger.Logger) error {
	vm := n.getVM()
	timer := time.AfterFunc(time.Duration(n.Fm.GetFunctionsTimeout())*time.Millisecond, func() {
		vm.Interrupt("halt processing due to timeout")
	})
	defer n.returnVM(vm)
	defer timer.Stop()

	processFunc, ok := goja.AssertFunction(vm.Get("process"))
	if !ok {
		log.Errorf("Process function not found in VM for node %s", n.NodeUid)
		return fmt.Errorf("process function not found in VM")
	}

	jsData := n.convertMessageToJS(vm, message)

	result, err := processFunc(goja.Undefined(), jsData)
	if err != nil {
		log.Errorf("Script execution error in node %s: %v", n.NodeUid, err)
		return fmt.Errorf("script execution error: %w", err)
	}

	if result != nil && !goja.IsUndefined(result) && !goja.IsNull(result) {
		processedData, err := n.convertFromJSToMessage(result)
		if err != nil {
			return fmt.Errorf("failed to convert JS result: %w", err)
		}

		nodeOutputWires := n.GetNodeOutputWires()
		return n.handleProcessedData(processedData, message, nodeOutputWires, log)
	}

	return nil
}

func (n *FuncNode) convertMessageToJS(vm *goja.Runtime, message common.Message) goja.Value {
	jsObj := vm.NewObject()
	
	jsObj.Set("topic", message.Topic)
	
	if message.Payload != nil {
		jsObj.Set("payload", vm.ToValue(message.Payload))
	} else {
		jsObj.Set("payload", vm.NewObject())
	}
	
	if message.State != nil {
		jsObj.Set("state", vm.ToValue(message.State))
	} else {
		jsObj.Set("state", vm.NewObject())
	}
	
	if message.Image != nil {
		jsObj.Set("image", vm.ToValue(message.Image))
	}
	
	return jsObj
}

func (n *FuncNode) convertFromJSToMessage(jsValue goja.Value) (interface{}, error) {
	exported := jsValue.Export()
	
	switch v := exported.(type) {
	case map[string]interface{}:
		if n.isMessageLike(v) {
			return n.mapToMessageDirect(v), nil
		}
		return v, nil
	case []interface{}:
		return n.convertArrayToMessagesDirect(v), nil
	default:
		return exported, nil
	}
}

func (n *FuncNode) isMessageLike(data map[string]interface{}) bool {
	_, hasPayload := data["payload"]
	return hasPayload
}

func (n *FuncNode) mapToMessageDirect(data map[string]interface{}) common.Message {
	msg := common.Message{}
	
	// Topic
	if topic, ok := data["topic"].(string); ok {
		msg.Topic = topic
	}
	
	// Payload
	if payload, ok := data["payload"].(map[string]interface{}); ok {
		msg.Payload = payload
	} else {
		msg.Payload = make(map[string]interface{})
	}
	
	// State  
	if state, ok := data["state"].(map[string]interface{}); ok {
		msg.State = state
	} else {
		msg.State = make(map[string]interface{})
	}
	
	// Image
	if img, ok := data["image"].(image.Image); ok {
		msg.Image = img
	}
	
	return msg
}

func (n *FuncNode) convertArrayToMessagesDirect(array []interface{}) interface{} {
	if len(array) == 0 {
		return array
	}
	
	messages := make([]common.Message, 0, len(array))
	mixedArray := make([]interface{}, 0, len(array))
	allMessages := true
	
	for _, item := range array {
		if item == nil {
			mixedArray = append(mixedArray, nil)
			allMessages = false
			continue
		}
		
		if mapData, ok := item.(map[string]interface{}); ok && n.isMessageLike(mapData) {
			msg := n.mapToMessageDirect(mapData)
			messages = append(messages, msg)
			mixedArray = append(mixedArray, msg)
		} else {
			mixedArray = append(mixedArray, item)
			allMessages = false
		}
	}
	
	if allMessages {
		return messages
	}
	return mixedArray
}

func (n *FuncNode) handleProcessedData(processedData interface{}, originalMessage common.Message, nodeOutputWires [][]*common.Wire, log *logger.Logger) error {
	if len(nodeOutputWires) == 0 {
		if msg, ok := processedData.(common.Message); ok {
			if n.Debug == "on" {
				n.HandleDebug(msg, 0)
			}
		} else {
			errorMsg := fmt.Errorf("processed data is not of type Message in node %s", n.NodeUid)
			log.Error(errorMsg)
			n.HandleError(errorMsg)
		}
	} else if len(nodeOutputWires) == 1 {
		if msg, ok := processedData.(common.Message); ok {
			n.addEventTriggerTopicType(originalMessage.Topic, &msg)
			for _, wire := range nodeOutputWires[0] {
				if n.Debug == "on" {
					n.HandleDebug(msg, 0)
				}
				wire.Channel <- msg
			}
		} else {
			errorMsg := fmt.Errorf("processed data is not of type Message in node %s", n.NodeUid)
			log.Error(errorMsg)
			n.HandleError(errorMsg)
		}
	} else {
		if msgs, ok := processedData.([]common.Message); ok {
			for idx, msg := range msgs {
				n.addEventTriggerTopicType(originalMessage.Topic, &msg)
				msgs[idx] = msg
			}
			for idx, wireArray := range nodeOutputWires {
				if idx < len(msgs) {
					if n.Debug == "on" {
						n.HandleDebug(msgs[idx], idx)
					}
					for _, wire := range wireArray {
						wire.Channel <- msgs[idx]
					}
				}
			}
		} else if msgs, ok := processedData.([]interface{}); ok {
			for idx, msg := range msgs {
				if msg1, ok1 := msg.(common.Message); ok1 {
					n.addEventTriggerTopicType(originalMessage.Topic, &msg1)
					msgs[idx] = msg1
				}
			}
			for idx, wireArray := range nodeOutputWires {
				if idx < len(msgs) {
					if msg1, ok1 := msgs[idx].(common.Message); ok1 {
						if n.Debug == "on" {
							n.HandleDebug(msg1, idx)
						}
						for _, wire := range wireArray {
							wire.Channel <- msg1
						}
					}
				}
			}
		} else {
			log.Errorf("Processed data is not of type []Message in node %s", n.NodeUid)
		}
	}
	return nil
}

func (n *FuncNode) addEventTriggerTopicType(subject string, msg *common.Message) {
	if msg.Payload["eventTriggerTopicType"] == nil {
		eventTriggerTopicType := "dev2pdb"
		if strings.Contains(subject, "sim2dtm") {
			eventTriggerTopicType = "sim2dtm"
		}
		msg.Payload["eventTriggerTopicType"] = eventTriggerTopicType
	}
}