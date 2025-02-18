package orgs

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/charmbracelet/bubbles/table"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/ui/uitable"
)

type Organization struct {
	Id                int    `json:"id"`
	Name              string `json:"name"`
	Acronym           string `json:"acronym"`
	Role              string `json:"role"`
	City              string `json:"city"`
	Country           string `json:"country"`
	BuildingId        int    `json:"buildingId"`
	OrgHash           string `json:"orgHash"`
	MqttAccessControl string `json:"mqttAccessControl"`
	NumNri            int    `json:"numNri"`
}

type NodeRedInstance struct {
	Id       int    `json:"id"`
	OrgId    int    `json:"orgId"`
	GroupId  int    `json:"groupId"`
	NriHash  string `json:"nriHash"`
	IconRadio int    `json:"iconRadio"`
	Longitude float64 `json:"longitude"`
	Latitude float64 `json:"latitude"`
	Deleted  bool   `json:"deleted"`
	Created  string `json:"created"`
	Updated  string `json:"updated"`
}

type Admin struct {
	FirstName string `json:"firstName"`
	Surname   string `json:"surname"`
	Email     string `json:"email"`
}

type CreateOrgData struct {
	Name                   string   `json:"name"`
	Acronym                string   `json:"acronym"`
	Role                   string   `json:"role"`
	BuildingId             int      `json:"buildingId"`
	OrgHash                string   `json:"orgHash"`
	NriHashes              []string `json:"nriHashes"`
	TelegramInvitationLink string   `json:"telegramInvitationLink"`
	TelegramChatId         string   `json:"telegramChatId"`
	MqttAccessControl      string   `json:"mqttAccessControl"`
	OrgAdminArray          []Admin  `json:"orgAdminArray"`
}

type Response struct {
	Message string `json:"message"`
}

func getOrgs(platformData *common.PlatformData) ([]Organization, error) {
	var orgs []Organization = []Organization{}
	accessToken, err := utils.Login(platformData)
	if err != nil {
		return []Organization{}, fmt.Errorf("error logging in: %w", err)
	}

	if accessToken == "" {
		return orgs, fmt.Errorf("error logging in: %w", err)
	}

	domainName := platformData.PlatformInfo.DomainName
	domainCertsType := platformData.PlatformInfo.DomainCertsType
	protocol := "https"
	if domainCertsType == "No certs" {
		protocol = "http"
	}

	urlGetOrgs := fmt.Sprintf("%s://%s/admin_api/organizations/user_managed", protocol, domainName)

	client := &http.Client{}
	if domainCertsType == "No certs" {
		tr := &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
		client = &http.Client{Transport: tr}
	}

	req, err := http.NewRequest("GET", urlGetOrgs, nil)
	if err != nil {
		return orgs, fmt.Errorf("error creating request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return orgs, fmt.Errorf("error making request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return orgs, fmt.Errorf("error reading response body: %w", err)
	}

	if err := json.Unmarshal(body, &orgs); err != nil {
		return orgs, fmt.Errorf("error parsing JSON response: %w", err)
	}

	nodeRedInstances, err := getNodeRedInstances(platformData, accessToken)
	if err != nil {
		return orgs, fmt.Errorf("error getting nodered instances: %w", err)
	}

	for i, org := range orgs {
		numNri := 0
		for _, nri := range nodeRedInstances {
			if nri.OrgId == org.Id {
				numNri++
			}
		}
		orgs[i].NumNri = numNri
	}

	return orgs, nil
}

func ListOrgs() error {
	platformData := data.GetData()
	orgs, err := getOrgs(platformData)
	if err != nil {
		return fmt.Errorf("error getting organizations: %w", err)
	}

	columns := []table.Column{
		{Title: "Id", Width: 5},
		{Title: "Name", Width: 30},
		{Title: "Acronym", Width: 15},
		{Title: "Role", Width: 9},
		{Title: "City", Width: 19},
		{Title: "Country", Width: 19},
		{Title: "Building Id", Width: 12},
		{Title: "Org Hash", Width: 18},
		{Title: "Mqtt acc", Width: 12},
		{Title: "Num nri", Width: 8},
	}


	values := []table.Row{}
	for _, org := range orgs {
		values = append(values,
			table.Row{
				strconv.Itoa(org.Id),
				org.Name,
				org.Acronym,
				org.Role,
				org.City,
				org.Country,
				strconv.Itoa(org.BuildingId),
				org.OrgHash,
				org.MqttAccessControl,
				strconv.Itoa(org.NumNri),
			},
		)
	}

	uitable.Create(columns, values, len(orgs)+3)

	return nil
}

func getNodeRedInstances(platformData *common.PlatformData, accessToken string) ([]NodeRedInstance, error) {
	var nodeRedInstances []NodeRedInstance = []NodeRedInstance{}

	domainName := platformData.PlatformInfo.DomainName
	domainCertsType := platformData.PlatformInfo.DomainCertsType
	protocol := "https"
	if domainCertsType == "No certs" {
		protocol = "http"
	}
	urlGetNodeRedInstances := fmt.Sprintf("%s://%s/admin_api/nodered_instances", protocol, domainName)

	client := &http.Client{}
	if domainCertsType == "No certs" {
		tr := &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
		client = &http.Client{Transport: tr}
	}

	req, err := http.NewRequest("GET", urlGetNodeRedInstances, nil)
	if err != nil {
		return nodeRedInstances, fmt.Errorf("error creating request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nodeRedInstances, fmt.Errorf("error in nodered instances request: %w", err)
	}
	defer resp.Body.Close()

	// Lee y parsea la respuesta.
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nodeRedInstances, fmt.Errorf("error reading response body: %w", err)
	}

	if err := json.Unmarshal(body, &nodeRedInstances); err != nil {
		return nodeRedInstances, fmt.Errorf("error parsing JSON response: %w", err)
	}

	return nodeRedInstances, nil
}

func RequestCreateOrg(plaformData *common.PlatformData, createOrgData CreateOrgData) error {
	accessToken, err := utils.Login(plaformData)
	if err != nil || accessToken == "" {
		return fmt.Errorf("error logging in: %w", err)
	}

	domainName := plaformData.PlatformInfo.DomainName
	domainCertsType := plaformData.PlatformInfo.DomainCertsType
	protocol := "https"
	if domainCertsType == "No certs" {
		protocol = "http"
	}

	
	jsonData, err := json.Marshal(createOrgData)
	if err != nil {
		return fmt.Errorf("error al convertir createOrgData a JSON: %w", err)
	}
	
	urlCreateOrg := fmt.Sprintf("%s://%s/admin_api/organization", protocol, domainName)
	req, err := http.NewRequest("POST", urlCreateOrg, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("error al crear la solicitud POST: %w", err)
	}

	client := &http.Client{}
	if domainCertsType == "No certs" {
		tr := &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
		client = &http.Client{Transport: tr}
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("error in create org request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("error reading response body: %w", err)
	}

	var createOrgResp Response
	err = json.Unmarshal(respBody, &createOrgResp)
	if err != nil {
		return err
	}

	if createOrgResp.Message != "Organization created successfully" {
		return fmt.Errorf("error creating organization: %s", createOrgResp.Message)
	}

	return nil
}

