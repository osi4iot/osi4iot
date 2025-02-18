package utils

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
)

type LoginData struct {
	EmailOrLogin string `json:"emailOrLogin"`
	Password     string `json:"password"`
}

type LoginResponse struct {
	AccessToken string `json:"accessToken"`
}

func Login(platformData *common.PlatformData) (string, error) {
	domainCertsType := platformData.PlatformInfo.DomainCertsType
	protocol := "https"
	if domainCertsType == "No certs" {
		protocol = "http"
	}

	urlLogin := fmt.Sprintf("%s://%s/admin_api/auth/login", protocol, platformData.PlatformInfo.DomainName)

	loginData := LoginData{
		EmailOrLogin: platformData.PlatformInfo.PlatformAdminUserName,
		Password:     platformData.PlatformInfo.PlatformAdminPassword,
	}

	jsonData, err := json.Marshal(loginData)
	if err != nil {
		return "", err
	}

	client := &http.Client{}
	if domainCertsType == "No certs" {
		tr := &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
		client = &http.Client{Transport: tr}
	}

	req, err := http.NewRequest("POST", urlLogin, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Login error:", err)
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var loginResp LoginResponse
	err = json.Unmarshal(body, &loginResp)
	if err != nil {
		return "", err
	}

	if loginResp.AccessToken != "" {
		return loginResp.AccessToken, nil
	} else {
		return "", fmt.Errorf("login error: access token not found")
	}
}
