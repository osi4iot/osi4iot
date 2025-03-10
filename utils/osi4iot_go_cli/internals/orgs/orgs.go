package orgs

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/charmbracelet/bubbles/table"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/docker"
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
	Id        int     `json:"id"`
	OrgId     int     `json:"orgId"`
	GroupId   int     `json:"groupId"`
	NriHash   string  `json:"nriHash"`
	IconRadio int     `json:"iconRadio"`
	Longitude float64 `json:"longitude"`
	Latitude  float64 `json:"latitude"`
	Deleted   bool    `json:"deleted"`
	Created   string  `json:"created"`
	Updated   string  `json:"updated"`
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

	maxHeight := min(len(orgs) + 3, 13)
	uitable.Create(columns, values, maxHeight)

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

func CheckIfOrgExists(orgId int) (*Organization, error) {
	platformData := data.GetData()
	orgs, err := getOrgs(platformData)
	if err != nil {
		return nil, fmt.Errorf("error getting organizations: %w", err)
	}

	for _, org := range orgs {
		if org.Id == orgId {
			return &org, nil
		}
	}
	return nil, nil
}

func RequestCreateOrg(platformData *common.PlatformData, createOrgData CreateOrgData) error {
	accessToken, err := utils.Login(platformData)
	if err != nil || accessToken == "" {
		return fmt.Errorf("error logging in: %w", err)
	}

	domainName := platformData.PlatformInfo.DomainName
	domainCertsType := platformData.PlatformInfo.DomainCertsType
	protocol := "https"
	if domainCertsType == "No certs" {
		protocol = "http"
	}

	jsonData, err := json.Marshal(createOrgData)
	if err != nil {
		return fmt.Errorf("error converting createOrgData to JSON: %w", err)
	}

	urlCreateOrg := fmt.Sprintf("%s://%s/admin_api/organization", protocol, domainName)
	req, err := http.NewRequest("POST", urlCreateOrg, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("error creating POST request: %w", err)
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

func RequestRemoveOrg(platformData *common.PlatformData, orgId int) error {
	accessToken, err := utils.Login(platformData)
	if err != nil || accessToken == "" {
		return fmt.Errorf("error logging in: %w", err)
	}

	domainName := platformData.PlatformInfo.DomainName
	domainCertsType := platformData.PlatformInfo.DomainCertsType
	protocol := "https"
	if domainCertsType == "No certs" {
		protocol = "http"
	}


	urlRemoveOrg := fmt.Sprintf("%s://%s/admin_api/organization/id/%s", protocol, domainName, strconv.Itoa(orgId))
	req, err := http.NewRequest("DELETE", urlRemoveOrg, nil)
	if err != nil {
		return fmt.Errorf("error creating DELETE request: %w", err)
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
		return fmt.Errorf("error in delete org request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("error reading response body: %w", err)
	}

	var removeOrgResp Response
	err = json.Unmarshal(respBody, &removeOrgResp)
	if err != nil {
		return err
	}

	if removeOrgResp.Message != "Organization deleted successfully" {
		return fmt.Errorf("error removing organization: %s", removeOrgResp.Message)
	}

	return nil
}

func RemoveOrg(existingOrg *Organization) error {
	platformData := data.GetData()
	err := RequestRemoveOrg(platformData, existingOrg.Id)
	if err != nil {
		return fmt.Errorf("error requesting remove organization: %w", err)
	}

	newOrgs := []common.Organization{}
	var orgToRemove common.Organization
	for _, org := range platformData.Certs.MqttCerts.Organizations {
		if !strings.EqualFold(org.OrgAcronym, existingOrg.Acronym) {
			newOrgs = append(newOrgs, org)
		} else {
			orgToRemove = org
		}
	}
	platformData.Certs.MqttCerts.Organizations = newOrgs

	err = utils.WritePlatformDataToFile(platformData)
	if err != nil {
		return fmt.Errorf("error writing platform data to file: %w", err)
	}

	err = 	docker.RemoveNriServices(orgToRemove)
	if err != nil {
		return fmt.Errorf("error removing NRI services: %w", err)
	}

	err = docker.RemoveNriVolumesInOrg(orgToRemove)
	if err != nil {
		return err
	}

	err = docker.RemoveNfsFolders(platformData, orgToRemove.OrgAcronym)
	if err != nil {
		return fmt.Errorf("error adding NFS folders on nodes: %w", err)
	}

	err = docker.RemoveEfsFolders(platformData, orgToRemove.OrgAcronym)
	if err != nil {
		return fmt.Errorf("error adding EFS folders on nodes: %w", err)
	}

	return nil
}
