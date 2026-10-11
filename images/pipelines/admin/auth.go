package admin

import (
	"context"
	"fmt"
	"pipelines/utils"

	"time"
)

type LoginData struct {
	EmailOrLogin string `json:"emailOrLogin"`
	Password     string `json:"password"`
}

type LoginResponse struct {
	AccessToken    string `json:"accessToken"`
	RefreshToken   string `json:"refreshToken"`
	Username       string `json:"userName"`
	ExpirationDate string `json:"expirationDate"`
}

func (a *Admin) Login() error {
	loginData := LoginData{
		EmailOrLogin: a.userName,
		Password:     a.password,
	}
	
	url := fmt.Sprintf("%s/auth/login", a.baseUrl)
	response, err := utils.HttpPost(url, loginData)
	if err != nil {
		a.log.Errorf("failed to login: %v", err)
		return fmt.Errorf("failed to login: %v", err)
	}

	if response == nil {
		a.log.Error("login response is nil")
		return fmt.Errorf("login response is nil")
	}

	var loginResponse LoginResponse
	err = utils.UnmarshalData(response, &loginResponse)
	if err != nil {
		a.log.Errorf("failed to unmarshal login response: %v", err)
		return fmt.Errorf("failed to unmarshal login response: %v", err)
	}

	err = a.updateTokens(loginResponse)
	if err != nil {
		a.log.Errorf("failed to update tokens: %v", err)
		return fmt.Errorf("failed to update tokens: %v", err)
	}

	return nil
}

func (a *Admin) updateTokens(loginResponse LoginResponse) error {
	a.mutex.Lock()
	defer a.mutex.Unlock()

	accessClaims, err := utils.ParseTokenClaims(loginResponse.AccessToken)
	if err != nil {
		a.log.Errorf("failed to validate access token: %v", err)
		return fmt.Errorf("failed to validate access token: %v", err)
	}

	const layout = "2006-01-02 15:04:05 -0700 MST"
	a.accessExpiry, err = time.Parse(layout, accessClaims.ExpiresAt.String())
	if err != nil {
		a.log.Errorf("failed to parse access token expiry: %v", err)
		return fmt.Errorf("failed to parse access token expiry: %v", err)
	}

	refreshClaims, err := utils.ParseTokenClaims(loginResponse.RefreshToken)
	if err != nil {
		a.log.Errorf("failed to validate refresh token: %v", err)
		return fmt.Errorf("failed to validate refresh token: %v", err)
	}

	a.refreshExpiry, err = time.Parse(layout, refreshClaims.ExpiresAt.String())
	if err != nil {
		a.log.Errorf("failed to parse refresh token expiry: %v", err)
		return fmt.Errorf("failed to parse refresh token expiry: %v", err)
	}

	a.accessToken = loginResponse.AccessToken
	a.refreshToken = loginResponse.RefreshToken

	if a.onTokenRefresh != nil {
		go a.onTokenRefresh(loginResponse)
	}

	return nil
}

func (a *Admin) refreshTokens(ctx context.Context) error {
	if a.refreshToken == "" {
		return fmt.Errorf("refresh token is empty")
	}

	var loginResponse LoginResponse
	if time.Until(a.refreshExpiry) <= 24 *time.Hour {
		a.log.Warn("Refresh token is nearing expiration, re-login required")
		a.Login()
	} else {
		url := fmt.Sprintf("%s/auth/update_token", a.baseUrl)
		response, err := utils.HttpPostWithJwt(ctx, url, nil, a.refreshToken)
		if err != nil {
			a.log.Errorf("failed to refresh token: %v", err)
			return fmt.Errorf("failed to refresh token: %v", err)
		}
	
		err = utils.UnmarshalData(response, &loginResponse)
		if err != nil {
			a.log.Errorf("failed to unmarshal login response: %v", err)
			return fmt.Errorf("failed to unmarshal login response: %v", err)
		}
	
		err = a.updateTokens(loginResponse)
		if err != nil {
			a.log.Errorf("failed to update tokens: %v", err)
			return fmt.Errorf("failed to update tokens: %v", err)
		}
	}


	return nil
}

func (a *Admin) GetValidAccessToken(ctx context.Context) (string, error) {
	a.mutex.RLock()

	if time.Until(a.accessExpiry) > a.refreshThreshold {
		token := a.accessToken
		a.mutex.RUnlock()
		return token, nil
	}

	a.mutex.RUnlock()

	if err := a.refreshTokens(ctx); err != nil {
		if a.onAuthError != nil {
			a.onAuthError(err)
		}
		return "", fmt.Errorf("error refreshing tokens: %v", err)
	}

	a.mutex.RLock()
	token := a.accessToken
	a.mutex.RUnlock()

	return token, nil
}

// Verificar si necesita refresh
func (a *Admin) needsRefresh() bool {
	a.mutex.RLock()
	defer a.mutex.RUnlock()

	return time.Until(a.accessExpiry) <= a.refreshThreshold
}

func (a *Admin) StartAutoRefresh(ctx context.Context, checkInterval time.Duration) {
	a.refreshOnce.Do(func() {
		go a.autoRefreshLoop(ctx, checkInterval)
	})
}

func (a *Admin) autoRefreshLoop(ctx context.Context, checkInterval time.Duration) {
	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	a.log.Infof("Initializing auto-refresh every %v", checkInterval)

	for {
		select {
		case <-ctx.Done():
			a.log.Warn("Stopping auto-refresh due to canceled context")
			return
		case <-a.stopRefresh:
			a.log.Warn("Stopping auto-refresh due to stop signal")
			return
		case <-ticker.C:
			if a.needsRefresh() {
				if err := a.refreshTokens(ctx); err != nil {
					a.log.Errorf("Error in auto-refresh: %v", err)
					if a.onAuthError != nil {
						a.onAuthError(err)
					}
				}
			}
		}
	}
}

func (a *Admin) StopAutoRefresh() {
	close(a.stopRefresh)
}

func (a *Admin) OnTokenRefresh(callback func(LoginResponse)) {
	a.onTokenRefresh = callback
}

func (a *Admin) OnAuthError(callback func(error)) {
	a.onAuthError = callback
}