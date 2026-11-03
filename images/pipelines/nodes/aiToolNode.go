package nodes

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"pipelines/common"
	"pipelines/logger"
	"pipelines/message"
	"pipelines/utils"

	"github.com/Ingenimax/agent-sdk-go/pkg/interfaces"
	"github.com/nats-io/nats.go"
)

// AI Tool node: the start of a flow that the AI Agent nodes of the same pipeline can call as a tool.
//
// The node declares the tool (its name, a description for the model, its parameters and a timeout).
// When the model calls it, the AI Agent node validates the arguments and sends them as the payload of
// a message out of this node, with a reply context on a one-off NATS inbox: the flow (Function, IoTDb,
// ML Model...) ends in a Publish node set to "Reply", whose message is the tool's result. Each call has
// its own inbox, so calls at the same time do not mix. A flow that does not reply in time gives the
// model an error.
//
// The message also carries the user who asked (its verified sender and the "userName" field), so that
// the flow can decide what that user may do. The model sees the tool as flow__<name>.

const (
	aiToolNamePrefix      = "flow__"
	aiToolDefaultTimeout  = 30 * time.Second
	aiToolMaxTimeout      = 300 * time.Second
	aiToolMaxResultBytes  = 32 << 10
	aiToolMaxParameters   = 20
	aiToolUserNameField   = "userName"
	aiToolToolNameField   = "toolName"
	aiToolMaxNameLength   = 48
	aiToolMaxDescription  = 2000
	aiToolMaxEnumElements = 50
)

var aiToolNamePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]*$`)

var aiToolParameterTypes = map[string]bool{"string": true, "number": true, "integer": true, "boolean": true, "array": true}

// AiToolParameter is a parameter of the tool, as the node's settings declare it.
type AiToolParameter struct {
	Name        string
	Type        string // string, number, integer, boolean or array
	Items       string // array: the type of its elements (string, number, integer or boolean)
	Description string
	Required    bool
	Enum        []string // string: the allowed values (none: any)
}

type AiToolNode struct {
	BaseNode
	ToolName    string
	Description string
	Parameters  []AiToolParameter
	Timeout     time.Duration
}

func CreateAiToolNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*AiToolNode, error) {
	toolName, description, parameters, timeout, err := parseAiToolSettings(node.Settings)
	if err != nil {
		fm.Log().Errorf("AiToolNode %s: %v", node.NodeUid, err)
		return nil, err
	}

	logSubject := ""
	if logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog"); logTopic != nil {
		logSubject = utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)
	}

	return &AiToolNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "AiTool",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			status:     common.NodeStatusCreated,
		},
		ToolName:    toolName,
		Description: description,
		Parameters:  parameters,
		Timeout:     timeout,
	}, nil
}

// parseAiToolSettings reads and checks the node's settings: toolName, description, parameters
// ([{name, type, items, description, required, enum}]) and timeoutSeconds.
func parseAiToolSettings(settings map[string]any) (string, string, []AiToolParameter, time.Duration, error) {
	toolName, _ := settings["toolName"].(string)
	toolName = strings.TrimSpace(toolName)
	if !aiToolNamePattern.MatchString(toolName) || len(toolName) > aiToolMaxNameLength {
		return "", "", nil, 0, fmt.Errorf("invalid tool name %q: letters, digits and _, starting with a letter, at most %d characters",
			toolName, aiToolMaxNameLength)
	}
	description, _ := settings["description"].(string)
	description = strings.TrimSpace(description)
	if description == "" {
		return "", "", nil, 0, fmt.Errorf("tool %s: the description is required (the model chooses the tool by it)", toolName)
	}
	if len(description) > aiToolMaxDescription {
		description = description[:aiToolMaxDescription]
	}

	var parameters []AiToolParameter
	rawList, _ := settings["parameters"].([]any)
	if len(rawList) > aiToolMaxParameters {
		return "", "", nil, 0, fmt.Errorf("tool %s: at most %d parameters", toolName, aiToolMaxParameters)
	}
	seen := map[string]bool{}
	for i, raw := range rawList {
		item, ok := raw.(map[string]any)
		if !ok {
			return "", "", nil, 0, fmt.Errorf("tool %s: parameter %d is not an object", toolName, i+1)
		}
		param := AiToolParameter{}
		param.Name, _ = item["name"].(string)
		param.Name = strings.TrimSpace(param.Name)
		if !aiToolNamePattern.MatchString(param.Name) || len(param.Name) > aiToolMaxNameLength {
			return "", "", nil, 0, fmt.Errorf("tool %s: invalid parameter name %q", toolName, param.Name)
		}
		if param.Name == aiToolUserNameField || param.Name == aiToolToolNameField {
			return "", "", nil, 0, fmt.Errorf("tool %s: the parameter name %q is reserved", toolName, param.Name)
		}
		if seen[param.Name] {
			return "", "", nil, 0, fmt.Errorf("tool %s: the parameter %q is repeated", toolName, param.Name)
		}
		seen[param.Name] = true
		param.Type, _ = item["type"].(string)
		if param.Type == "" {
			param.Type = "string"
		}
		if !aiToolParameterTypes[param.Type] {
			return "", "", nil, 0, fmt.Errorf("tool %s: parameter %s has an unknown type %q", toolName, param.Name, param.Type)
		}
		if param.Type == "array" {
			param.Items, _ = item["items"].(string)
			if param.Items == "" {
				param.Items = "string"
			}
			if param.Items == "array" || !aiToolParameterTypes[param.Items] {
				return "", "", nil, 0, fmt.Errorf("tool %s: parameter %s has an unknown element type %q", toolName, param.Name, param.Items)
			}
		}
		param.Description, _ = item["description"].(string)
		param.Description = strings.TrimSpace(param.Description)
		param.Required, _ = item["required"].(bool)
		if param.Type == "string" {
			param.Enum = parseAiToolEnum(item["enum"])
		}
		parameters = append(parameters, param)
	}

	timeout := aiToolDefaultTimeout
	if seconds, ok := toFloat(settings["timeoutSeconds"]); ok && seconds > 0 {
		timeout = time.Duration(math.Min(seconds, aiToolMaxTimeout.Seconds()) * float64(time.Second))
	}
	return toolName, description, parameters, timeout, nil
}

// parseAiToolEnum takes the allowed values as a list or as a comma separated text
func parseAiToolEnum(raw any) []string {
	var values []string
	switch v := raw.(type) {
	case []any:
		for _, e := range v {
			if s := strings.TrimSpace(fmt.Sprint(e)); s != "" {
				values = append(values, s)
			}
		}
	case string:
		for _, e := range strings.Split(v, ",") {
			if s := strings.TrimSpace(e); s != "" {
				values = append(values, s)
			}
		}
	}
	if len(values) > aiToolMaxEnumElements {
		values = values[:aiToolMaxEnumElements]
	}
	return values
}

func toFloat(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	}
	return 0, false
}

func (n *AiToolNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("AiToolNode %s is already running", n.NodeUid)
		return
	}
	nodeCtx, cancel := context.WithCancel(ctx)
	n.Ctx = nodeCtx
	n.Cancel = cancel
	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting AiToolNode %s: tool %s%s", n.NodeUid, aiToolNamePrefix, n.ToolName)
}

func (n *AiToolNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		log.Infof("AiToolNode %s is already stopped", n.NodeUid)
		return
	}
	n.SetStatus(common.NodeStatusStopped)
	if n.Cancel != nil {
		n.Cancel()
	}
	log.Infof("AiToolNode %s stopped", n.NodeUid)
}

// ToolParameters is the parameters' specification for the model.
func (n *AiToolNode) ToolParameters() map[string]interfaces.ParameterSpec {
	specs := make(map[string]interfaces.ParameterSpec, len(n.Parameters))
	for _, p := range n.Parameters {
		spec := interfaces.ParameterSpec{Type: p.Type, Description: p.Description, Required: p.Required}
		if p.Type == "array" {
			spec.Items = &interfaces.ParameterSpec{Type: p.Items}
		}
		if len(p.Enum) > 0 {
			spec.Enum = make([]interface{}, len(p.Enum))
			for i, e := range p.Enum {
				spec.Enum[i] = e
			}
		}
		specs[p.Name] = spec
	}
	return specs
}

// ValidateArguments checks the model's arguments against the declared parameters: the required ones
// are there, the types match (a number written as text is accepted) and nothing undeclared comes. It
// returns the arguments to send to the flow.
func (n *AiToolNode) ValidateArguments(raw string) (map[string]any, error) {
	args := map[string]any{}
	if strings.TrimSpace(raw) != "" {
		dec := json.NewDecoder(strings.NewReader(raw))
		dec.UseNumber()
		if err := dec.Decode(&args); err != nil {
			return nil, fmt.Errorf("the arguments must be a JSON object: %v", err)
		}
	}
	declared := make(map[string]AiToolParameter, len(n.Parameters))
	for _, p := range n.Parameters {
		declared[p.Name] = p
	}
	var problems []string
	out := make(map[string]any, len(args))
	for name, value := range args {
		param, ok := declared[name]
		if !ok {
			problems = append(problems, fmt.Sprintf("unknown parameter %q", name))
			continue
		}
		if value == nil {
			continue
		}
		converted, err := convertAiToolValue(value, param.Type, param.Items)
		if err != nil {
			problems = append(problems, fmt.Sprintf("%s: %v", name, err))
			continue
		}
		if len(param.Enum) > 0 {
			if s, _ := converted.(string); !containsString(param.Enum, s) {
				problems = append(problems, fmt.Sprintf("%s must be one of: %s", name, strings.Join(param.Enum, ", ")))
				continue
			}
		}
		out[name] = converted
	}
	for _, p := range n.Parameters {
		if _, ok := out[p.Name]; p.Required && !ok {
			problems = append(problems, fmt.Sprintf("the parameter %q is required", p.Name))
		}
	}
	if len(problems) > 0 {
		sort.Strings(problems)
		return nil, errors.New(strings.Join(problems, "; "))
	}
	return out, nil
}

func convertAiToolValue(value any, typ, items string) (any, error) {
	switch typ {
	case "string":
		switch v := value.(type) {
		case string:
			return v, nil
		case json.Number:
			return v.String(), nil
		case bool:
			return fmt.Sprint(v), nil
		}
		return nil, fmt.Errorf("expected a text")
	case "number", "integer":
		var f float64
		switch v := value.(type) {
		case json.Number:
			parsed, err := v.Float64()
			if err != nil {
				return nil, fmt.Errorf("expected a number")
			}
			f = parsed
		case float64:
			f = v
		case string:
			parsed, err := json.Number(strings.TrimSpace(v)).Float64()
			if err != nil {
				return nil, fmt.Errorf("expected a number")
			}
			f = parsed
		default:
			return nil, fmt.Errorf("expected a number")
		}
		if typ == "integer" {
			if f != math.Trunc(f) {
				return nil, fmt.Errorf("expected a whole number")
			}
			return int64(f), nil
		}
		return f, nil
	case "boolean":
		switch v := value.(type) {
		case bool:
			return v, nil
		case string:
			if v == "true" || v == "false" {
				return v == "true", nil
			}
		}
		return nil, fmt.Errorf("expected true or false")
	case "array":
		list, ok := value.([]any)
		if !ok {
			return nil, fmt.Errorf("expected a list")
		}
		out := make([]any, len(list))
		for i, element := range list {
			converted, err := convertAiToolValue(element, items, "")
			if err != nil {
				return nil, fmt.Errorf("element %d: %v", i+1, err)
			}
			out[i] = converted
		}
		return out, nil
	}
	return nil, fmt.Errorf("unknown type %q", typ)
}

func containsString(list []string, s string) bool {
	for _, e := range list {
		if e == s {
			return true
		}
	}
	return false
}

// Call runs the flow with the arguments (already validated) and returns what its Publish "Reply" node
// sent, or an error the model can understand.
func (n *AiToolNode) Call(ctx context.Context, args map[string]any, userName string, sender *common.Sender, log *logger.Logger) (string, error) {
	if n.GetStatus() != common.NodeStatusRunning || n.Ctx == nil {
		return "", fmt.Errorf("the tool %s is not running (the pipeline is stopped or being deployed)", n.ToolName)
	}
	if len(n.GetNodeOutputWires()) == 0 || len(n.GetNodeOutputWires()[0]) == 0 {
		return "", fmt.Errorf("the tool %s is not connected to any node in the pipeline", n.ToolName)
	}
	nc := n.Fm.GetNatsClient()
	if nc == nil {
		return "", fmt.Errorf("the tool %s cannot run: no NATS connection", n.ToolName)
	}

	inbox := nats.NewInbox()
	sub, err := nc.SubscribeSync(inbox)
	if err != nil {
		return "", fmt.Errorf("the tool %s could not wait for its reply: %v", n.ToolName, err)
	}
	defer func() { _ = sub.Unsubscribe() }()

	payload := make(map[string]any, len(args)+2)
	for k, v := range args {
		payload[k] = v
	}
	payload[aiToolToolNameField] = n.ToolName
	if userName != "" {
		payload[aiToolUserNameField] = userName
	}
	msg := message.NewMessageFromPayload(payload)
	msg.SetSender(sender)
	msg.SetReplyContext(&common.ReplyContext{Subject: inbox, ExpiresAt: time.Now().Add(n.Timeout)})
	n.sendToOutputs(msg, log)

	waitCtx, cancel := context.WithTimeout(ctx, n.Timeout)
	defer cancel()
	reply, err := sub.NextMsgWithContext(waitCtx)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return "", fmt.Errorf("the flow of the tool %s did not reply within %s: it may have failed (see the pipeline logs) or "+
				"it does not end in a Publish node set to Reply", n.ToolName, n.Timeout)
		}
		return "", fmt.Errorf("the tool %s was interrupted: %v", n.ToolName, err)
	}
	return aiToolResult(reply), nil
}

// aiToolResult is the reply as text for the model: JSON or text as it came, a file described, and at
// most aiToolMaxResultBytes (the model's context is not the place for large data).
func aiToolResult(reply *nats.Msg) string {
	contentType := ""
	if reply.Header != nil {
		contentType = strings.ToLower(reply.Header.Get("Content-Type"))
	}
	data := reply.Data
	textual := contentType == "" || strings.Contains(contentType, "json") || strings.HasPrefix(contentType, "text/")
	if !textual {
		return fmt.Sprintf("[the flow replied with a %s file of %d bytes, which cannot be shown to the model]", contentType, len(data))
	}
	if len(data) > aiToolMaxResultBytes {
		cut := data[:aiToolMaxResultBytes]
		// do not cut a UTF-8 character in two
		for i := 0; i < utf8.UTFMax && len(cut) > 0 && !utf8.Valid(cut); i++ {
			cut = cut[:len(cut)-1]
		}
		return string(cut) + fmt.Sprintf("\n[result truncated: %d of %d bytes]", len(cut), len(data))
	}
	if len(data) == 0 {
		return "{}"
	}
	return string(data)
}

// ---------------------------------------------------------------- the tools of an AI Agent node

// flowTool is an AI Tool node of the pipeline as a tool of the agent.
type flowTool struct {
	node  *AiToolNode
	agent *AiAgentNode
}

func (t *flowTool) Name() string        { return aiToolNamePrefix + t.node.ToolName }
func (t *flowTool) DisplayName() string { return t.Name() }
func (t *flowTool) Internal() bool      { return false }
func (t *flowTool) Description() string { return t.node.Description }
func (t *flowTool) Parameters() map[string]interfaces.ParameterSpec {
	return t.node.ToolParameters()
}

func (t *flowTool) Run(ctx context.Context, input string) (string, error) {
	return t.Execute(ctx, input)
}

func (t *flowTool) Execute(ctx context.Context, args string) (string, error) {
	log := t.agent.Fm.Log()
	values, err := t.node.ValidateArguments(args)
	if err != nil {
		return "", fmt.Errorf("invalid arguments for %s: %v", t.Name(), err)
	}
	user, sender := t.agent.currentPromptUser()
	start := time.Now()
	result, err := t.node.Call(ctx, values, user, sender, log)
	if err != nil {
		log.Warnf("AiAgentNode %s: tool %s failed after %s: %v", t.agent.NodeUid, t.Name(), time.Since(start).Round(time.Millisecond), err)
		return "", err
	}
	log.Infof("AiAgentNode %s: tool %s answered in %s (%d bytes)", t.agent.NodeUid, t.Name(), time.Since(start).Round(time.Millisecond), len(result))
	return result, nil
}

// parseAiAgentFlowTools reads the "flowTools" setting of an AI Agent node: the names of the AI Tool
// nodes it may call. nil (no setting): all of them.
func parseAiAgentFlowTools(settings map[string]any) map[string]bool {
	list, ok := settings["flowTools"].([]any)
	if !ok {
		return nil
	}
	chosen := make(map[string]bool, len(list))
	for _, v := range list {
		if name, ok := v.(string); ok && strings.TrimSpace(name) != "" {
			chosen[strings.TrimSpace(name)] = true
		}
	}
	return chosen
}

// flowToolsMu guards the warnings about repeated tool names (logged once per name)
var (
	flowToolsMu     sync.Mutex
	flowToolsWarned = map[string]bool{}
)

// flowTools returns the AI Tool nodes of the node's pipeline that it may call, read at each prompt: a
// redeployed pipeline gives its new tools without restarting the agent. Two nodes with the same tool
// name: only the first one (by node uid, so always the same) counts.
func (n *AiAgentNode) flowTools() []interfaces.Tool {
	var toolNodes []*AiToolNode
	for _, node := range n.Pipeline.GetNodes() {
		if toolNode, ok := node.(*AiToolNode); ok {
			toolNodes = append(toolNodes, toolNode)
		}
	}
	sort.Slice(toolNodes, func(i, j int) bool { return toolNodes[i].NodeUid < toolNodes[j].NodeUid })
	byName := map[string]bool{}
	tools := make([]interfaces.Tool, 0, len(toolNodes))
	for _, toolNode := range toolNodes {
		if n.flowToolsSelected != nil && !n.flowToolsSelected[toolNode.ToolName] {
			continue
		}
		if byName[toolNode.ToolName] {
			key := n.NodeUid + "|" + toolNode.ToolName
			flowToolsMu.Lock()
			if !flowToolsWarned[key] {
				flowToolsWarned[key] = true
				n.Fm.Log().Warnf("AiAgentNode %s: two AI Tool nodes are named %s; only one is used", n.NodeUid, toolNode.ToolName)
			}
			flowToolsMu.Unlock()
			continue
		}
		byName[toolNode.ToolName] = true
		tools = append(tools, &flowTool{node: toolNode, agent: n})
	}
	return tools
}
