package nodes

import (
	"context"
	"fmt"
	"log"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"strings"

	"github.com/dop251/goja"
	"github.com/nats-io/nats.go"

	fl "pipelines/function_libray"
)

type JSGlobalRegistry struct {
	providers []common.JSGlobalProvider
}

// NewJSGlobalRegistry creates a new registry with default providers
func NewJSGlobalRegistry() *JSGlobalRegistry {
	return &JSGlobalRegistry{
		providers: []common.JSGlobalProvider{
			&fl.CoreJSProvider{},
			&fl.HTTPJSProvider{},
		},
	}
}

// RegisterProvider adds a new provider to the registry
func (r *JSGlobalRegistry) RegisterProvider(provider common.JSGlobalProvider) {
	r.providers = append(r.providers, provider)
}

// GetAllFunctions returns all JavaScript functions from all providers
func (r *JSGlobalRegistry) GetAllFunctions(node common.Node, fm common.Manager, log *logger.Logger) []common.JSFunction {
	var allFunctions []common.JSFunction

	for _, provider := range r.providers {
		functions := provider.GetJSFunctions(node, fm, log)
		allFunctions = append(allFunctions, functions...)
	}

	return allFunctions
}

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
	jsRegistry             *JSGlobalRegistry
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
			Type:           "Function",
			Fm:             fm,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		nc:                     nil,                          // This will be set later
		vmPool:                 make(chan *goja.Runtime, 10), // Pool size of 10
		jsRegistry:             NewJSGlobalRegistry(),        // Initialize the JS global registry
		onInitializationScript: onInitializationScript,
		onStartScript:          onStartScript,
		onMessageScript:        onMessageScript,
	}

	fm.Log().Infof("Created FuncNode with UID: %s", funNode.NodeUid)

	if funNode.onMessageScript != "" {
		// Precompilar solo onMessageScript
		if err := funNode.precompileScript(fm.Log()); err != nil {
			nodeError := fmt.Errorf("Failed to precompile script for node %s: %v", funNode.NodeUid, err)
			funNode.handleError(nodeError)
			return nil, nodeError
		}
		if err := funNode.initVMPool(fm.Log()); err != nil {
			nodeError := fmt.Errorf("Failed to initialize VM pool for node %s: %v", funNode.NodeUid, err)
			funNode.handleError(nodeError)
			return nil, nodeError
		}
	}

	fm.Log().Infof("FuncNode %s initialized successfully", funNode.NodeUid)

	return funNode, nil
}

func (n *FuncNode) RegisterJSProvider(provider common.JSGlobalProvider) {
	n.jsRegistry.RegisterProvider(provider)
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
			n.handleError(err)
			return
		}
		log.Infof("Initialization script executed successfully for node %s", n.NodeUid)
	}

	// Ejecutar onStartScript cada vez que se inicia/reinicia
	if n.onStartScript != "" {
		if err := n.executeStartScript(log); err != nil {
			log.Errorf("Failed to execute start script for node %s: %v", n.NodeUid, err)
			n.handleError(err)
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
	jsFunctions := n.jsRegistry.GetAllFunctions(n, n.Fm, log)

	// Register each function in the JavaScript VM
	for _, jsFunc := range jsFunctions {
		vm.Set(jsFunc.Name, jsFunc.Func)
	}

	log.Infof("Registered %d JavaScript global functions for node %s", len(jsFunctions), n.NodeUid)
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
	defer n.returnVM(vm)

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

		if len(nodeOutputWires) == 1 {
			if msg, ok := processedData.(common.Message); ok {
				n.addEventTriggerTopicType(message.Subject, &msg)
				for _, wire := range nodeOutputWires[0] {
					wire.Channel <- msg
				}
			} else {
				log.Errorf("Processed data is not of type Message in node %s", n.NodeUid)
			}
		} else if len(nodeOutputWires) > 1 {
			if msgs, ok := processedData.([]common.Message); ok {
				for idx, msg := range msgs {
					n.addEventTriggerTopicType(message.Subject, &msg)
					msgs[idx] = msg // Update the message in place
				}
				for idx, wireArray := range nodeOutputWires {
					for _, wire := range wireArray {
						wire.Channel <- msgs[idx]
					}
				}
			} else {
				log.Errorf("Processed data is not of type []Message in node %s", n.NodeUid)
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
		log.Printf("Failed to marshal data for JS conversion: %v", err)
		return vm.ToValue(data) // fallback
	}

	// Parse as map to have control over keys
	var jsData map[string]interface{}
	if err := utils.UnmarshalData(jsonData, &jsData); err != nil {
		log.Printf("Failed to unmarshal data for JS conversion: %v", err)
		return vm.ToValue(data) // fallback
	}

	return vm.ToValue(jsData)
}

func (n *FuncNode) looksLikeMessageData(data map[string]interface{}) bool {
	requiredFields := []string{"timestamp", "subject", "payload"}
	foundFields := 0

	for _, field := range requiredFields {
		if _, exists := data[field]; exists {
			foundFields++
		}
	}

	// We consider it looks like message data if at least 2 of the required fields are present
	return foundFields >= 2
}

// convertFromJSObject convert a JavaScript object back to Go
func (n *FuncNode) convertFromJSObject(jsValue goja.Value) (interface{}, error) {
	// Export the JavaScript value to Go
	exported := jsValue.Export()

	// If it's a map, we can convert it back
	if mapData, ok := exported.(map[string]interface{}); ok {
		if n.looksLikeMessageData(mapData) {
			jsonData, err := utils.MarshalData(mapData)
			if err != nil {
				return exported, nil // return original map if conversion fails
			}

			var message common.Message
			if err := utils.UnmarshalData(jsonData, &message); err != nil {
				return exported, nil // return original map if conversion fails
			}

			return message, nil
		}
	}

	if mapDataArray, ok := exported.([]interface{}); ok {
		messages := make([]common.Message, len(mapDataArray))
		for idx, mapData := range mapDataArray {
			if n.looksLikeMessageData(mapData.(map[string]interface{})) {
				jsonData, err := utils.MarshalData(mapData)
				if err != nil {
					return exported, nil // return original map if conversion fails
				}

				if err := utils.UnmarshalData(jsonData, &messages[idx]); err != nil {
					return exported, nil // return original map if conversion fails
				}
			}
		}
		return messages, nil
	}

	return exported, nil
}
