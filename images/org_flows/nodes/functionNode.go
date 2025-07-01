package nodes

import (
	"context"
	"fmt"
	"log"
	"org_flows/common"
	"org_flows/logger"
	"org_flows/utils"
	"strconv"
	"time"

	"github.com/dop251/goja"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
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

func CreateFuncNode(nodeUid string, script string, flow common.Flow, log *logger.Logger) (*FuncNode, error) {
	ctx, cancel := context.WithCancel(context.Background())
	node := &FuncNode{
		BaseNode: BaseNode{
			Uid:    nodeUid,
			Type:   "FuncNode",
			Flow:   flow,
			Cancel: cancel,
			Ctx:    ctx,
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

	if err := node.initVMPool(log); err != nil {
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
		for {
			select {
			case <-n.Ctx.Done():
				log.Infof("Stopping FuncNode with UID: %s", n.Uid)
				close(n.vmPool)
				for vm := range n.vmPool {
					vm.ClearInterrupt()
				}
				return
			case msg, ok := <-n.Flow.Channels[n.Uid]:
				if !ok {
					log.Infof("Channel closed for FuncNode with UID: %s", n.Uid)
					return
				}

				if err := n.processMessage(msg, log); err != nil {
					n.handleError(err)
				}
			}
		}

	}()
}

func (n *FuncNode) precompileScript(log *logger.Logger) error {
	vm := goja.New()

	n.setupJSGlobals(vm, log)

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
	// Expose useful functions to the JavaScript context
	vm.Set("log", func(level, message string) {
		log.Infof("[%s] %s: %s\n", n.Uid, level, message)
	})

	vm.Set("getCurrentTime", func() string {
		return time.Now().UTC().Format(time.RFC3339)
	})

	vm.Set("getValueFromStore", func(key string) map[string]interface{} {
		fullKey := fmt.Sprintf("org_%s.flow_%s.kvstore.%s", n.Flow.OrgHash, n.Flow.FlowUID, key)
		ctx := context.Background()
		entry, err := n.Flow.KeyValueStore.Get(ctx, fullKey)
		if err != nil {
			log.Errorf("Failed to get key %s: %v", key, err)
			return nil
		}
		var store map[string]interface{}
		if err := utils.UnmarshalData(entry.Value(), &store); err != nil {
			log.Errorf("Failed to unmarshal data for key %s: %v", key, err)
			return nil
		}
		return store
	})

	vm.Set("setValueInStore", func(key string, data map[string]interface{}) {
		jsonData, err := utils.MarshalData(data)
		if err != nil {
			log.Errorf("Failed to marshal data for key %s: %v", key, err)
			return
		}

		fullKey := fmt.Sprintf("org_%s.flow_%s.kvstore.%s", n.Flow.OrgHash, n.Flow.FlowUID, key)
		ctx := context.Background()
		entry, err := n.Flow.KeyValueStore.Get(ctx, fullKey)
		if err != nil {
			if err == jetstream.ErrKeyNotFound {
				newRevision, err := n.Flow.KeyValueStore.Put(ctx, fullKey, jsonData)
				if err != nil {
					log.Errorf("Failed to set key %s: %v", fullKey, err)
				}
				n.saveHeartbeatEntry(ctx,  newRevision, log)
				return
			} else {
				log.Errorf("Failed to get key %s: %v", fullKey, err)
				return
			}
		}

		if entry != nil {
			retries := 3
			for i := 0; i < retries; i++ {
				revision, err := n.getHeartbeatRevision(ctx, log)
				if err != nil {
					return
				}

				newRevision, err := n.Flow.KeyValueStore.Update(ctx, fullKey, jsonData, revision)
				if err != nil {
					log.Errorf("Failed to update key %s at trial %d/%d: %v", fullKey, i+1, retries, err)
				} else {
					n.saveHeartbeatEntry(ctx, newRevision, log)
					return
				}
			}
		}
	})

	vm.Set("delay", func(duration int) {
		if duration < 0 {
			log.Errorf("Invalid delay duration: %d", duration)
			return
		}
		time.Sleep(time.Duration(duration) * time.Millisecond)
	})

	vm.Set("httpGet", func(url string) interface{} {
		response, err := utils.HttpGet(url)
		if err != nil {
			log.Errorf("Failed to get HTTP response: %v", err)
			return nil
		}
		
		var responseData interface{}
		if err := utils.UnmarshalData(response, &responseData); err != nil {
			log.Errorf("Failed to unmarshal HTTP response: %v", err)
		}
		return responseData
	})
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
			if msg, ok := processedData.(common.Message); ok {
				childNodeUid := n.Flow.Children[n.Uid][0]
				n.Flow.Channels[childNodeUid] <- msg
			} else {
				log.Errorf("Processed data is not of type Message in node %s", n.Uid)
			}
		} else if len(n.Flow.Children[n.Uid]) > 1 {
			if msgs, ok := processedData.([]common.Message); ok {
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

func (n *FuncNode) saveHeartbeatEntry(ctx context.Context, revision uint64, log *logger.Logger) {
	kv := n.Flow.KeyValueStore
	heartbeatValue := fmt.Sprintf("%d", revision)
	fullKey := fmt.Sprintf("org_%s.flow_%s.kvstore.last_revision", n.Flow.OrgHash, n.Flow.FlowUID)
	_, err := kv.Put(ctx, fullKey, []byte(heartbeatValue))
	if err != nil {
		log.Infof("Failed to set heartbeat entry: %v", err)
	}
}

func (n *FuncNode) getHeartbeatRevision(ctx context.Context, log *logger.Logger) (uint64, error) {
	kv := n.Flow.KeyValueStore
	fullKey := fmt.Sprintf("org_%s.flow_%s.kvstore.last_revision", n.Flow.OrgHash, n.Flow.FlowUID)
	heartbeatEntry, err := kv.Get(ctx, fullKey)
	if err != nil {
		log.Errorf("Failed to get heartbeatEntry: %v", err)
		return 0, err
	}

	revision, err := strconv.ParseUint(string(heartbeatEntry.Value()), 10, 64)
	if err != nil {
		log.Errorf("Failed to parse heartbeat revision: %v", err)
		return 0, err
	}

	return revision, nil
}
