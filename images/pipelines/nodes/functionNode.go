package nodes

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"strings"
	"time"

	"github.com/dop251/goja"
	"github.com/nats-io/nats.go"

	fl "pipelines/function_libray"
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

func CreateFuncNode(node common.NodeData, fm common.Manager) (*FuncNode, error) {
	onMessageScript, ok1 := node.Settings["onMessageScript"].(string)
	onInitializationScript, ok2 := node.Settings["onInitializationScript"].(string)
	onStartScript, ok3 := node.Settings["onStartScript"].(string)
	if !ok1 && !ok2 && !ok3 {
		return nil, fmt.Errorf("missing required scripts in node settings")
	}

	org := fm.GetOrg(node.OrgId)
	digitalTwin := fm.GetDigitalTwin(node.DigitalTwinId)

	logTopic := fm.GetTopicByTopicRef(node.AssetId, node.DigitalTwinId, "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	funNode := &FuncNode{
		BaseNode: BaseNode{
			Id:             node.Id,
			NodeUid:        node.NodeUid,
			OrgId:          node.OrgId,
			GroupId:        node.GroupId,
			AssetId:        node.AssetId,
			DigitalTwinId:  node.DigitalTwinId,
			OrgHash:        org.OrgHash,
			DigitalTwinUID: digitalTwin.DigitalTwinUID,
			Name:           node.Name,
			Xpos:           node.Xpos,
			Ypos:           node.Ypos,
			NumOutputs:     node.NumOutputs,
			Settings:       node.Settings,
			Debug:          node.Debug,
			Type:           "Function",
			LogSubject:     logSubject,
			Fm:             fm,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		nc:                     nil,                          // This will be set later
		vmPool:                 make(chan *goja.Runtime, 10), // Pool size of 10
		onInitializationScript: onInitializationScript,
		onStartScript:          onStartScript,
		onMessageScript:        onMessageScript,
	}

	fm.Log().Infof("Created FuncNode with UID: %s", funNode.NodeUid)

	if funNode.onMessageScript != "" {
		// Precompile the onMessageScript and initialize the VM pool
		if err := funNode.precompileScript(fm.Log()); err != nil {
			nodeError := fmt.Errorf("Failed to precompile script for node %s: %v", funNode.NodeUid, err)
			funNode.HandleError(nodeError)
			return nil, nodeError
		}
		if err := funNode.initVMPool(fm.Log()); err != nil {
			nodeError := fmt.Errorf("Failed to initialize VM pool for node %s: %v", funNode.NodeUid, err)
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

	// Ejecutar onInitializationScript solo la primera vez
	if n.onInitializationScript != "" && needReinitialization {
		if err := n.executeInitializationScript(log); err != nil {
			log.Errorf("Failed to execute initialization script for node %s: %v", n.NodeUid, err)
			n.HandleError(err)
			return
		}
		log.Infof("Initialization script executed successfully for node %s", n.NodeUid)
	}

	// Ejecutar onStartScript cada vez que se inicia/reinicia
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

	// Compilar solo el script de mensaje
	program, err := goja.Compile(n.NodeUid+".js", n.onMessageScript, false)
	if err != nil {
		return fmt.Errorf("failed to compile script: %w", err)
	}

	// Ejecutar para obtener la función process
	_, err = vm.RunProgram(program)
	if err != nil {
		return fmt.Errorf("failed to execute script: %w", err)
	}

	// Verificar que la función process existe
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

	// Crear VM temporal y compilar directamente
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

	// Crear VM temporal y compilar directamente
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
	// Create multiple preconfigured VMs for the pool
	poolSize := 10
	for i := 0; i < poolSize; i++ {
		vm := goja.New()

		// Configure global functions
		n.setupJSGlobals(vm, log)

		// Execute precompiled script
		_, err := vm.RunProgram(n.compiledScript.program)
		if err != nil {
			return fmt.Errorf("failed to initialize VM %d: %w", i, err)
		}

		// Add to the pool
		n.vmPool <- vm
	}

	return nil
}

func (n *FuncNode) setupJSGlobals(vm *goja.Runtime, log *logger.Logger) {
	// Get all JavaScript functions from registered providers
	jsFunctions := fl.GetJSFunctions(n, n.Fm, log)

	// Register each function in the JavaScript VM
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
	// Get VM from the pool
	vm := n.getVM()
	timer := time.AfterFunc(time.Duration(n.Fm.GetFunctionsTimeout())*time.Millisecond, func() {
		vm.Interrupt("halt processing due to timeout")
	})
	defer n.returnVM(vm)
	defer timer.Stop()

	// Get process function from the current VM (each VM has its own instance)
	processFunc, ok := goja.AssertFunction(vm.Get("process"))
	if !ok {
		log.Errorf("Process function not found in VM for node %s", n.NodeUid)
		return fmt.Errorf("process function not found in VM")
	}

	// Convert data to JavaScript object with correct mapping
	jsData := n.convertToJSObject(vm, message)

	// Execute processing
	result, err := processFunc(goja.Undefined(), jsData)
	if err != nil {
		log.Errorf("Script execution error in node %s: %v", n.NodeUid, err)
		return fmt.Errorf("script execution error: %w", err)
	}

	// Process result
	if result != nil && !goja.IsUndefined(result) && !goja.IsNull(result) {
		// Convert JavaScript result to Go
		processedData, err := n.convertFromJSObject(result)
		if err != nil {
			return fmt.Errorf("failed to convert JS result: %w", err)
		}

		nodeOutputWires := n.Fm.GetNodeOutputWires(n.DigitalTwinId, n.Id)

		if len(nodeOutputWires) == 0 {
			if msg, ok := processedData.(common.Message); ok {
				if n.Debug == "on" {
					n.HandleDebug(msg, 0)
				}
			} else {
				errorMsg := fmt.Errorf("Processed data is not of type Message in node %s", n.NodeUid)
				log.Error(errorMsg)
				n.HandleError(errorMsg)
			}
		} else if len(nodeOutputWires) == 1 {
			if msg, ok := processedData.(common.Message); ok {
				n.addEventTriggerTopicType(message.Topic, &msg)
				for _, wire := range nodeOutputWires[0] {
					if n.Debug == "on" {
						n.HandleDebug(msg, 0)
					}
					wire.Channel <- msg
				}
			} else {
				errorMsg := fmt.Errorf("Processed data is not of type Message in node %s", n.NodeUid)
				log.Error(errorMsg)
				n.HandleError(errorMsg)
			}
		} else if len(nodeOutputWires) > 1 {
			if msgs, ok := processedData.([]common.Message); ok {
				for idx, msg := range msgs {
					n.addEventTriggerTopicType(message.Topic, &msg)
					msgs[idx] = msg // Update the message in place
				}
				for idx, wireArray := range nodeOutputWires {
					if n.Debug == "on" {
						n.HandleDebug(msgs[idx], idx)
					}
					for _, wire := range wireArray {
						wire.Channel <- msgs[idx]
					}
				}
			} else {
				if msgs, ok := processedData.([]interface{}); ok {
					for idx, msg := range msgs {
						if msg1, ok1 := msg.(common.Message); ok1 {
							n.addEventTriggerTopicType(message.Topic, &msg1)
							msgs[idx] = msg1 // Update the message in place
						}
					}
					for idx, wireArray := range nodeOutputWires {
						if msg1, ok1 := msgs[idx].(common.Message); ok1 {
							if n.Debug == "on" {
								n.HandleDebug(msg1, idx)
							}
							for _, wire := range wireArray {
								wire.Channel <- msg1
							}
						}
					}
				} else {
					log.Errorf("Processed data is not of type []Message in node %s", n.NodeUid)
				}
			}
		}
	}

	return nil
}

func (n *FuncNode) addEventTriggerTopicType(subject string, msg *common.Message) {
	eventTriggerTopicType := "dev2pdb"
	if strings.Contains(subject, "sim2dtm") {
		eventTriggerTopicType = "sim2dtm"
	}
	msg.Payload["eventTriggerTopicType"] = eventTriggerTopicType
}

// convertToJSObject convert a Go data structure to a JavaScript object
func (n *FuncNode) convertToJSObject(vm *goja.Runtime, data interface{}) goja.Value {
	// Convert to JSON and then parse to get correct mapping
	jsonData, err := utils.MarshalData(data)
	if err != nil {
		n.Fm.Log().Errorf("Failed to marshal data for JS conversion: %v", err)
		return vm.ToValue(data) // fallback
	}

	// Parse as map to have control over keys
	var jsData map[string]interface{}
	if err := utils.UnmarshalData(jsonData, &jsData); err != nil {
		n.Fm.Log().Errorf("Failed to unmarshal data for JS conversion: %v", err)
		return vm.ToValue(data) // fallback
	}

	return vm.ToValue(jsData)
}

func (n *FuncNode) looksLikeMessageData(data map[string]interface{}) bool {
	_, existsPayload := data["payload"]
	return existsPayload
}

// convertFromJSObject convert a JavaScript object back to Go
func (n *FuncNode) convertFromJSObject(jsValue goja.Value) (interface{}, error) {
	exported := jsValue.Export()

	switch v := exported.(type) {
	case map[string]interface{}:
		return n.convertMapToMessage(v)
	case []interface{}:
		return n.convertArrayToMessages(v)
	default:
		return exported, nil
	}
}

// convertMapToMessage converts a single map to a Message if it looks like message data
func (n *FuncNode) convertMapToMessage(mapData map[string]interface{}) (interface{}, error) {
	if !n.looksLikeMessageData(mapData) {
		return mapData, nil
	}

	message, err := n.marshalUnmarshalMessage(mapData)
	if err != nil {
		return mapData, nil // return original map if conversion fails
	}

	return message, nil
}

// convertArrayToMessages converts an array of maps to Messages where possible
func (n *FuncNode) convertArrayToMessages(mapDataArray []interface{}) (interface{}, error) {
	if len(mapDataArray) == 0 {
		return mapDataArray, nil
	}

	messages := make([]common.Message, 0, len(mapDataArray))
	mixedArray := make([]interface{}, 0, len(mapDataArray))
	allAreMessages := true

	for _, item := range mapDataArray {
		if item == nil {
			mixedArray = append(mixedArray, nil)
			allAreMessages = false
			continue
		}

		mapData, ok := item.(map[string]interface{})
		if !ok || !n.looksLikeMessageData(mapData) {
			mixedArray = append(mixedArray, item)
			allAreMessages = false
			continue
		}

		message, err := n.marshalUnmarshalMessage(mapData)
		if err != nil {
			mixedArray = append(mixedArray, item)
			allAreMessages = false
			continue
		}

		messages = append(messages, message)
		mixedArray = append(mixedArray, message)
	}

	// Return homogeneous array of Messages if all items were successfully converted
	if allAreMessages {
		return messages, nil
	}

	// Return mixed array if some items couldn't be converted
	return mixedArray, nil
}

// marshalUnmarshalMessage helper function to convert map to Message
func (n *FuncNode) marshalUnmarshalMessage(mapData interface{}) (common.Message, error) {
	var message common.Message

	jsonData, err := utils.MarshalData(mapData)
	if err != nil {
		return message, err
	}

	err = utils.UnmarshalData(jsonData, &message)
	return message, err
}
