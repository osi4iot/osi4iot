package flows_manager

import (
	"fmt"
	"log"
	"org_flows/logger"
	"org_flows/utils"
	"time"

	"github.com/dop251/goja"
	"github.com/nats-io/nats.go"
)

type CompiledScript struct {
	program     *goja.Program
	processFunc goja.Callable
}

type FuncNode struct {
	BaseNode
	nc             *nats.Conn
	errorSubject   string
	script         string
	compiledScript *CompiledScript
	vmPool         chan *goja.Runtime
}

func CreateFuncNode(nodeUid string, script string, flow *Flow, log *logger.Logger) (*FuncNode, error) {
	// Create a new FuncNode instance
	node := &FuncNode{
		BaseNode: BaseNode{
			Uid:  nodeUid,
			Type: "FuncNode",
			Flow: flow,
		},
		nc:           nil,                          // This will be set later
		vmPool:       make(chan *goja.Runtime, 10), // Pool size of 10
		script:       script,
		errorSubject: "error.subject", // Default error subject
	}

	log.Infof("Created FuncNode with UID: %s", node.Uid)

	if err := node.precompileScript(log); err != nil {
		nodeError := fmt.Errorf("Failed to precompile script for node %s: %v", node.Uid, err)
		node.handleError(nodeError)
		return nil, nodeError
	}

	if err := node.initVMPool(); err != nil {
		nodeError := fmt.Errorf("Failed to initialize VM pool for node %s: %v", node.Uid, err)
		node.handleError(nodeError)
		return nil, nodeError
	}

	log.Infof("FuncNode %s initialized successfully", node.Uid)

	return node, nil
}

func (n *FuncNode) Start(log *logger.Logger) {
	log.Infof("Starting FuncNode with UID: %s", n.Uid)
	go func() {
		for msg := range n.Flow.Channels[n.Uid] {
			if err := n.processMessage(msg, log); err != nil {
				n.handleError(err)
			}
		}
	}()
}

func (n *FuncNode) precompileScript(log *logger.Logger) error {
	vm := goja.New()

	n.setupJSGlobals(vm)

	// Compile the script
	program, err := goja.Compile(n.Uid+".js", n.script, false)
	if err != nil {
		return fmt.Errorf("failed to compile script: %w", err)
	}

	// Execute to obtain the process function
	_, err = vm.RunProgram(program)
	if err != nil {
		return fmt.Errorf("failed to execute script: %w", err)
	}

	// Verify that the process function exists
	processFunc, ok := goja.AssertFunction(vm.Get("process"))
	if !ok {
		return fmt.Errorf("process function not found in script")
	}

	n.compiledScript = &CompiledScript{
		program:     program,
		processFunc: processFunc,
	}

	log.Infof("Script precompiled successfully for node: %s", n.Uid)
	return nil
}

func (n *FuncNode) initVMPool() error {
	// Create multiple preconfigured VMs for the pool
	poolSize := 10
	for i := 0; i < poolSize; i++ {
		vm := goja.New()

		// Configure global functions
		n.setupJSGlobals(vm)

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

func (n *FuncNode) setupJSGlobals(vm *goja.Runtime) {
	// Expose useful functions to the JavaScript context
	vm.Set("log", func(level, message string) {
		log.Printf("[%s] %s: %s\n", n.Uid, level, message)
	})

	vm.Set("getCurrentTime", func() string {
		return time.Now().UTC().Format(time.RFC3339)
	})
}

func (n *FuncNode) getVM() *goja.Runtime {
	return <-n.vmPool
}

func (n *FuncNode) returnVM(vm *goja.Runtime) {
	n.vmPool <- vm
}

func (n *FuncNode) processMessage(message Message, log *logger.Logger) error {
	// Get VM from the pool
	vm := n.getVM()
	defer n.returnVM(vm)

	// Get process function from the current VM (each VM has its own instance)
	processFunc, ok := goja.AssertFunction(vm.Get("process"))
	if !ok {
		log.Errorf("Process function not found in VM for node %s", n.Uid)
		return fmt.Errorf("process function not found in VM")
	}

	// Convert data to JavaScript object with correct mapping
	jsData := n.convertToJSObject(vm, message)

	// Execute processing
	result, err := processFunc(goja.Undefined(), jsData)
	if err != nil {
		log.Errorf("Script execution error in node %s: %v", n.Uid, err)
		return fmt.Errorf("script execution error: %w", err)
	}

	// Process result
	if result != nil && !goja.IsUndefined(result) && !goja.IsNull(result) {
		// Convert JavaScript result to Go
		processedData, err := n.convertFromJSObject(result)
		if err != nil {
			log.Errorf("Failed to convert JS result in node %s: %v", n.Uid, err)
			return fmt.Errorf("failed to convert JS result: %w", err)
		}

		if len(n.Flow.Children[n.Uid]) == 1 {
			if msg, ok := processedData.(Message); ok {
				childNodeUid := n.Flow.Children[n.Uid][0]
				n.Flow.Channels[childNodeUid] <- msg
			} else {
				log.Errorf("Processed data is not of type Message in node %s", n.Uid)
			}
		} else {
			if msgs, ok := processedData.([]Message); ok {
				for idx, childNodeUid := range n.Flow.Children[n.Uid] {
					n.Flow.Channels[childNodeUid] <- msgs[idx]
				}
			} else {
				log.Errorf("Processed data is not of type []Message in node %s", n.Uid)
			}
		}
	}

	return nil
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

	// We consider it looks like message data if at least 3 of the required fields are present
	return foundFields >= 3
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

			var message Message
			if err := utils.UnmarshalData(jsonData, &message); err != nil {
				return exported, nil // return original map if conversion fails
			}

			return message, nil
		}
	}

	if mapDataArray, ok := exported.([]interface{}); ok {
		messages := make([]Message, len(mapDataArray))
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
