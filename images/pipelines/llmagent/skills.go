package llmagent

import (
	"context"

	"github.com/Ingenimax/agent-sdk-go/pkg/interfaces"
	"github.com/Ingenimax/agent-sdk-go/pkg/skill"
)

// Skills (agent-sdk-go's pkg/skill): SKILL.md bundles the LLM loads when
// it needs them. Only their names and descriptions are in every request
// (in the load_skill tool); load_skill returns a skill's instructions and
// read_skill_resource one of its files. Nothing in a skill runs.
//
// They are tools of this process, not MCP servers: SetSkills replaces
// them at any time, without restarting the MCP servers. A prompt being
// answered keeps the ones it started with.

// SetSkills gives the agent lib's skills (nil or empty: none), from the
// next prompt on.
func (h *Host) SetSkills(lib *skill.Library) {
	tools := skillTools(lib)
	h.skillsMu.Lock()
	h.skillTools = tools
	h.skillsMu.Unlock()
}

func (h *Host) currentSkillTools() []interfaces.Tool {
	h.skillsMu.Lock()
	defer h.skillsMu.Unlock()
	return h.skillTools
}

// skillTools returns load_skill and read_skill_resource for lib, wrapped
// so that their calls are recorded for the chat like the MCP tools'
// (Answer.ToolCalls). No tools when there are no skills: an empty
// load_skill would only cost tokens.
func skillTools(lib *skill.Library) []interfaces.Tool {
	if lib == nil || lib.Len() == 0 {
		return nil
	}
	sdkTools := skill.Tools(lib)
	out := make([]interfaces.Tool, 0, len(sdkTools))
	for _, t := range sdkTools {
		out = append(out, &recordedTool{Tool: t})
	}
	return out
}

// recordedTool records each call of a local (non-MCP) tool.
type recordedTool struct {
	interfaces.Tool
}

func (t *recordedTool) DisplayName() string { return t.Name() }
func (t *recordedTool) Internal() bool      { return false }

func (t *recordedTool) Run(ctx context.Context, input string) (string, error) {
	return t.Execute(ctx, input)
}

func (t *recordedTool) Execute(ctx context.Context, args string) (string, error) {
	recorderFrom(ctx).add(ToolCall{ToolName: t.Name(), Args: args})
	return t.Tool.Execute(ctx, args)
}
