package nodes

import (
	"strings"

	"pipelines/common"
	"pipelines/llmusage"
)

// recordLlmUsage records what an operation of the node consumed of the organization's LLM provider
// (sent to admin_api by the llmusage meter). model is used when the provider's answer did not name it.
func (n *BaseNode) recordLlmUsage(source, userName, providerType, model string, usage llmusage.Usage) {
	if usage.Model == "" {
		usage.Model = model
	}
	llmusage.Add(llmusage.Attribution{
		OrgID:          n.Pipeline.GetOrgId(),
		GroupID:        n.Pipeline.GetGroupId(),
		DigitalTwinID:  n.Pipeline.GetDigitalTwinId(),
		DigitalTwinUID: n.Pipeline.GetDigitalTwinUid(),
		NodeUID:        n.NodeUid,
		NodeName:       n.Name,
		NodeType:       n.Type,
		UserName:       userName,
		Source:         source,
		ProviderType:   providerType,
		LogSubject:     n.LogSubject,
	}, usage)
}

// messageUserName is who sent a message, when known: the verified sender or its "userName" field.
func messageUserName(msg common.Message) string {
	if sender := msg.GetSender(); sender != nil && strings.TrimSpace(sender.User) != "" {
		return sender.User
	}
	if name, ok := msg.GetStringFromPayload("userName"); ok {
		return strings.TrimSpace(name)
	}
	return ""
}

// splitAgentModel splits the agent engines' "<provider type>:<model>".
func splitAgentModel(model string) (providerType, id string) {
	if p, rest, ok := strings.Cut(model, ":"); ok {
		return p, rest
	}
	return "", model
}
