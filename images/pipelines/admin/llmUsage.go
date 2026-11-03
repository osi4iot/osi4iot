package admin

import (
	"context"
	"encoding/json"
	"fmt"

	"pipelines/llmusage"
	"pipelines/utils"
)

// PostLlmUsage sends the usage of the LLM providers to admin_api (POST /llm_usage). The answer says, for
// each organization of the batch, the month's tokens and whether a threshold of its limit was crossed.
func (a *Admin) PostLlmUsage(ctx context.Context, records []llmusage.Record) ([]llmusage.OrgStatus, error) {
	a.mutex.RLock()
	token := a.accessToken
	a.mutex.RUnlock()
	url := fmt.Sprintf("%s/llm_usage", a.baseUrl)
	body, err := utils.HttpPostWithJwt(ctx, url, map[string]any{"records": records}, token)
	if err != nil {
		return nil, err
	}
	var answer struct {
		Orgs []llmusage.OrgStatus `json:"orgs"`
	}
	if err := json.Unmarshal(body, &answer); err != nil {
		return nil, fmt.Errorf("unexpected answer of admin_api: %w", err)
	}
	return answer.Orgs, nil
}
