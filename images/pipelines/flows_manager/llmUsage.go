package flows_manager

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"pipelines/common"
	"pipelines/llmusage"
)

// llmUsageFlushInterval: how often the usage of the LLM providers is sent to admin_api.
const llmUsageFlushInterval = 30 * time.Second

// LlmTokenLimitDescription is the description of the pipeline logs that announce that an organization
// crossed its monthly token limit (or its warning percentage): the 3D viewer also shows them in the chat.
const LlmTokenLimitDescription = "LLM token limit"

// llmBlockedGroupsInterval: how often admin_api is asked which groups reached their monthly token limit.
const llmBlockedGroupsInterval = time.Minute

// StartLlmUsageMeter starts sending the nodes' LLM usage to admin_api until ctx ends, and keeping which
// groups reached their monthly token limit (blocked until the month ends: llmusage/groups.go).
func (fm *FlowsManager) StartLlmUsageMeter(ctx context.Context) {
	llmusage.OnGroupThreshold(fm.notifyGroupTokenLimit)
	llmusage.Start(ctx, fm.Admin.PostLlmUsage, fm.notifyLlmTokenLimit, llmUsageFlushInterval, fm.log)
	go func() {
		refresh := func() {
			askCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
			defer cancel()
			groups, err := fm.Admin.GetLlmBlockedGroups(askCtx)
			if err != nil {
				fm.log.Warnf("LLM usage: the groups blocked by their token limit could not be read: %v", err)
				return
			}
			llmusage.SetBlockedGroups(groups)
		}
		refresh()
		ticker := time.NewTicker(llmBlockedGroupsInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				refresh()
			}
		}
	}()
}

// notifyGroupTokenLimit publishes, in the pipeline logs of the nodes that consumed, that the group crossed the
// warning percentage or reached its monthly token limit (then its LLM operations stop until the month ends).
func (fm *FlowsManager) notifyGroupTokenLimit(status llmusage.GroupStatus, logSubjects []string) {
	level := "info"
	var text string
	if status.Notify == "limit" {
		level = "error"
		text = fmt.Sprintf("The group has reached its monthly LLM token limit: %s of %s tokens in %s. "+
			"The AI tools of the group are stopped until the month ends or the organization administrator raises the limit.",
			formatThousands(status.MonthTokens), formatThousands(status.MonthlyTokenLimit), status.Month)
	} else {
		text = fmt.Sprintf("The group has used %d %% of its monthly LLM token limit: %s of %s tokens in %s. "+
			"At the limit its AI tools stop until the month ends.",
			percentOf(status.MonthTokens, status.MonthlyTokenLimit), formatThousands(status.MonthTokens),
			formatThousands(status.MonthlyTokenLimit), status.Month)
	}
	fm.log.Warnf("LLM usage of group %d: %s", status.GroupID, text)
	data, err := json.Marshal(common.PipelineLog{
		Level:       level,
		Component:   "pipeline",
		Name:        "LLM usage",
		Description: LlmTokenLimitDescription,
		Message:     text,
	})
	if err != nil {
		return
	}
	for _, subject := range logSubjects {
		if err := fm.NatsPublish(subject, data); err != nil {
			fm.log.Errorf("LLM usage: the token limit notice could not be published on %s: %v", subject, err)
		}
	}
}

// notifyLlmTokenLimit publishes, in the pipeline logs of the nodes that consumed, that the organization
// crossed the warning percentage or the limit of its monthly tokens. Nothing is blocked.
func (fm *FlowsManager) notifyLlmTokenLimit(status llmusage.OrgStatus, logSubjects []string) {
	level := "info"
	var text string
	if status.Notify == "limit" {
		level = "error"
		text = fmt.Sprintf("The organization has reached its monthly LLM token limit: %s of %s tokens in %s. "+
			"The AI tools keep working; the organization administrator can review the usage in AI usage.",
			formatThousands(status.MonthTokens), formatThousands(status.MonthlyTokenLimit), status.Month)
	} else {
		text = fmt.Sprintf("The organization has used %d %% of its monthly LLM token limit: %s of %s tokens in %s.",
			percentOf(status.MonthTokens, status.MonthlyTokenLimit), formatThousands(status.MonthTokens),
			formatThousands(status.MonthlyTokenLimit), status.Month)
	}
	fm.log.Warnf("LLM usage of organization %d: %s", status.OrgID, text)
	logData := common.PipelineLog{
		Level:       level,
		Component:   "pipeline",
		Name:        "LLM usage",
		Description: LlmTokenLimitDescription,
		Message:     text,
	}
	data, err := json.Marshal(logData)
	if err != nil {
		return
	}
	for _, subject := range logSubjects {
		if err := fm.NatsPublish(subject, data); err != nil {
			fm.log.Errorf("LLM usage: the token limit notice could not be published on %s: %v", subject, err)
		}
	}
}

func percentOf(value, total int64) int64 {
	if total <= 0 {
		return 0
	}
	return value * 100 / total
}

// formatThousands writes 1234567 as "1,234,567".
func formatThousands(n int64) string {
	s := fmt.Sprintf("%d", n)
	neg := false
	if n < 0 {
		neg = true
		s = s[1:]
	}
	out := make([]byte, 0, len(s)+len(s)/3)
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, c)
	}
	if neg {
		return "-" + string(out)
	}
	return string(out)
}
