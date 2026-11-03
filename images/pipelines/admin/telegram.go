package admin

import (
	"context"
	"fmt"
	"strings"

	"pipelines/utils"
)

// LinkTelegramUser spends a link code that a user sent to its
// organization's bot ("/link <code>") and links the Telegram account to
// that user. Returns the user's login; an error for an unknown or expired
// code.
func (a *Admin) LinkTelegramUser(ctx context.Context, code string, telegramUserId int64, telegramUsername string) (string, error) {
	url := fmt.Sprintf("%s/application/telegram_link/", a.baseUrl)
	body := map[string]any{"code": code, "telegramUserId": telegramUserId, "telegramUsername": telegramUsername}
	response, err := utils.HttpPostWithJwt(ctx, url, body, a.accessToken)
	if err != nil {
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "400") {
			return "", fmt.Errorf("the code is not valid or has expired")
		}
		return "", err
	}
	var answer struct {
		UserName string `json:"userName"`
	}
	if err := utils.UnmarshalData(response, &answer); err != nil {
		return "", err
	}
	return answer.UserName, nil
}

// GetTelegramApprover is the login of the platform user linked to the
// Telegram account when it administers the group ("" when it does not, or
// it is not linked).
func (a *Admin) GetTelegramApprover(ctx context.Context, groupId int, telegramUserId int64) (string, error) {
	url := fmt.Sprintf("%s/application/telegram_approver/%d/%d", a.baseUrl, groupId, telegramUserId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		return "", err
	}
	var answer struct {
		UserName *string `json:"userName"`
	}
	if err := utils.UnmarshalData(response, &answer); err != nil {
		return "", err
	}
	if answer.UserName == nil {
		return "", nil
	}
	return *answer.UserName, nil
}
