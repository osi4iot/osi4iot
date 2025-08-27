package form

import (
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"runtime"
	"strconv"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/orgs"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
	"github.com/shirou/gopsutil/mem"
)

func creatingNodeQuestions(m *Model) (submissionResultMsg, error) {
	platformData := data.GetData()
	if m.FindAnswerByKey("DEPLOYMENT_LOCATION") == "On-premise cluster deployment" {
		err := utils.CreateKeyPair(platformData)
		if err != nil {
			return submissionResultMsg("Error creating key pair"), err
		}
	}
	qIdx := m.FindQuestionIdByKey("NUMBER_OF_SWARM_NODES")
	numNodes, _ := strconv.Atoi(m.Questions[qIdx].Answer)
	newQuestions := []Question{}
	iniNode := 1
	currentNumNodes := m.NumNodesQuestions()
	deploymentLocation := m.FindAnswerByKey("DEPLOYMENT_LOCATION")
	numNodeQuestions := 5
	if deploymentLocation == "On-premise cluster deployment" {
		numNodeQuestions = 6
	}
	if currentNumNodes < numNodes {
		if currentNumNodes != 0 {
			iniNode = currentNumNodes + 1
		}
		defaultNodeData := types.NodeData{}
		for inode := iniNode; inode <= numNodes; inode++ {
			if len(platformData.PlatformInfo.NodesData) >= inode {
				defaultNodeData = platformData.PlatformInfo.NodesData[inode-1]
			}
			nodeQuestions := []Question{
				{
					Key:          "Node_" + strconv.Itoa(inode),
					QuestionType: "label",
					Prompt:       "Node " + strconv.Itoa(inode),
					Answer:       "",
					Choices:      []string{},
					ChoiceFocus:  0,
					ErrorMessage: "",
					Rules:        []string{},
					ActionKey:    "",
					Margin:       0,
				},
				{
					Key:          "Node_" + strconv.Itoa(inode) + "_Label",
					QuestionType: "generic",
					Prompt:       "Label",
					Answer:       defaultNodeData.NodeLabel,
					Choices:      []string{},
					ChoiceFocus:  0,
					ErrorMessage: "",
					Rules:        []string{"required", "string", "minlen:3", "maxlen:20"},
					ActionKey:    "",
					Margin:       2,
				},
				{
					Key:          "Node_" + strconv.Itoa(inode) + "_IP",
					QuestionType: "generic",
					Prompt:       "IP",
					Answer:       defaultNodeData.NodeIP,
					Choices:      []string{},
					ChoiceFocus:  0,
					ErrorMessage: "",
					Rules:        []string{"required", "string", "ip"},
					ActionKey:    "",
					Margin:       2,
				},
				{
					Key:          "Node_" + strconv.Itoa(inode) + "_UserName",
					QuestionType: "generic",
					Prompt:       "User name",
					Answer:       defaultNodeData.NodeUserName,
					Choices:      []string{},
					ChoiceFocus:  0,
					ErrorMessage: "",
					Rules:        []string{"required", "string"},
					ActionKey:    "",
					Margin:       2,
				},
				{
					Key:          "Node_" + strconv.Itoa(inode) + "_Role",
					QuestionType: "list",
					Prompt:       "Role",
					Answer:       defaultNodeData.NodeRole,
					Choices:      []string{"Manager", "Platform worker", "Generic org worker", "Exclusive org worker", "NFS server"},
					ChoiceFocus:  0,
					ErrorMessage: "",
					Rules:        []string{"required", "string"},
					ActionKey:    "",
					Margin:       2,
				},
			}
			newQuestions = append(newQuestions, nodeQuestions...)
			if deploymentLocation == "On-premise cluster deployment" {
				passwordQuestion := Question{
					Key:          "Node_" + strconv.Itoa(inode) + "_Password",
					QuestionType: "password",
					Prompt:       "Password",
					Answer:       defaultNodeData.NodePassword,
					Choices:      []string{},
					ChoiceFocus:  0,
					ErrorMessage: "",
					Rules:        []string{"required", "string"},
					ActionKey:    "copyKeyInNode",
					Margin:       2,
				}
				newQuestions = append(newQuestions, passwordQuestion)
			}
		}
	}
	initialIndex := qIdx + 1
	if currentNumNodes < numNodes {
		if currentNumNodes != 0 {
			initialIndex = initialIndex + numNodeQuestions*currentNumNodes
		}
		m.addQuestions(initialIndex, newQuestions...)
	} else {
		initialIndex2 := initialIndex + numNodeQuestions*numNodes
		finalIndex := initialIndex + numNodeQuestions*currentNumNodes
		m.removeQuestions(initialIndex2, finalIndex)
	}
	m.Data["numNodes"] = numNodes
	return submissionResultMsg("Nodes added succesfully"), nil
}

func removingNodeQuestions(m *Model) {
	numNodes := m.Data["numNodes"].(int)
	for inode := 1; inode <= numNodes; inode++ {
		nodeKey := "Node_" + strconv.Itoa(inode)
		initialIndex := m.FindQuestionIdByKey(nodeKey)
		if initialIndex != -1 {
			passwordKey := nodeKey + "_Password"
			passwordIndex := m.FindQuestionIdByKey(passwordKey)
			numNodeQuestions := 5
			if passwordIndex != -1 {
				numNodeQuestions = 6
			}
			finalIndex := initialIndex + numNodeQuestions
			m.removeQuestions(initialIndex, finalIndex)
		}
	}
}

func addNumNodesQuestion(index int, m *Model) {
	idx := m.FindQuestionIdByKey("NUMBER_OF_SWARM_NODES")
	if idx == -1 {
		numNodesQuestion := Question{
			Key:           "NUMBER_OF_SWARM_NODES",
			QuestionType:  "generic",
			Prompt:        "Number of nodes in the platform",
			Answer:        utils.IntValueToStr(len(data.Data.PlatformInfo.NodesData)),
			DefaultAnswer: "1",
			ErrorMessage:  "",
			Choices:       []string{},
			ChoiceFocus:   0,
			Rules:         []string{"required", "isInt", "minval:1", "maxval:100"},
			ActionKey:     "creatingNodeQuestions",
			Margin:        0,
		}
		m.addQuestions(index, numNodesQuestion)
	}
}

func addAWSRoute53Questions(m *Model) {
	domainCertsType := m.FindAnswerByKey("DOMAIN_CERTS_TYPE")
	if domainCertsType == "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
		qIdx := m.FindQuestionIdByKey("AWS_ACCESS_KEY_ID_ROUTE_53")
		if qIdx == -1 {
			awsQuestions := []Question{
				{
					Key:           "AWS_ACCESS_KEY_ID_ROUTE_53",
					QuestionType:  "password",
					Prompt:        "AWS access key id for Route 53",
					Answer:        data.Data.PlatformInfo.AWSAccessKeyIDRoute53,
					DefaultAnswer: "",
					Choices:       []string{},
					ChoiceFocus:   0,
					ErrorMessage:  "",
					Rules:         []string{"required", "string"},
					ActionKey:     "",
					Margin:        0,
				},
				{
					Key:          "AWS_SECRET_ACCESS_KEY_ROUTE_53",
					QuestionType: "password",
					Prompt:       "AWS secret access key for Route 53",
					Answer:       data.Data.PlatformInfo.AWSSecretAccessKeyRoute53,
					Choices:      []string{},
					ChoiceFocus:  0,
					ErrorMessage: "",
					Rules:        []string{"required", "string"},
					ActionKey:    "",
					Margin:       0,
				},
				{
					Key:          "AWS_REGION_ROUTE_53",
					QuestionType: "list",
					Prompt:       "AWS region for Route 53",
					Answer:       data.Data.PlatformInfo.AWSRegionRoute53,
					Choices:      utils.AwsRegions,
					ChoiceFocus:  utils.GiveChoiceFocus(data.Data.PlatformInfo.AWSRegionRoute53, utils.AwsRegions, 17),
					Rules:        []string{"required", "string"},
					ActionKey:    "",
					Margin:       0,
				},
				{
					Key:          "AWS_HOSTED_ZONE_ID_ROUTE_53",
					QuestionType: "password",
					Prompt:       "AWS hosted zone ID for Route 53",
					Answer:       data.Data.PlatformInfo.AWSHostedZoneIdRoute53,
					Choices:      []string{},
					ChoiceFocus:  0,
					ErrorMessage: "",
					Rules:        []string{"required", "string"},
					ActionKey:    "",
					Margin:       0,
				},
			}
			m.addQuestions(m.Focus+1, awsQuestions...)
		}
	}
}

func addAwsS3BucketQuestions(m *Model) {
	idx := m.FindQuestionIdByKey("S3_BUCKET_TYPE")
	if m.Questions[idx].Answer == "Cloud AWS S3" {
		indKey := m.FindQuestionIdByKey("AWS_ACCESS_KEY_ID_S3_BUCKET")
		if indKey == -1 {
			awsS3BucketQuestions := []Question{
				{
					Key:          "AWS_ACCESS_KEY_ID_S3_BUCKET",
					QuestionType: "password",
					Prompt:       "AWS access key id for S3 bucket",
					Answer:       data.Data.PlatformInfo.AWSAccessKeyIDS3Bucket,
					Choices:      []string{},
					ChoiceFocus:  0,
					ErrorMessage: "",
					Rules:        []string{"required", "string"},
					ActionKey:    "",
					Margin:       0,
				},
				{
					Key:          "AWS_SECRET_ACCESS_KEY_S3_BUCKET",
					QuestionType: "password",
					Prompt:       "AWS secret access key for S3 bucket",
					Answer:       data.Data.PlatformInfo.AWSSecretAccessKeyS3Bucket,
					Choices:      []string{},
					ChoiceFocus:  0,
					ErrorMessage: "",
					Rules:        []string{"required", "string"},
					ActionKey:    "",
					Margin:       0,
				},
				{
					Key:          "AWS_REGION_S3_BUCKET",
					QuestionType: "list",
					Prompt:       "AWS region for S3 bucket",
					Answer:       data.Data.PlatformInfo.AWSRegionS3Bucket,
					Choices:      utils.AwsRegions,
					ChoiceFocus:  utils.GiveChoiceFocus(data.Data.PlatformInfo.AWSRegionS3Bucket, utils.AwsRegions, 17),
					ErrorMessage: "",
					Rules:        []string{"required", "string"},
					ActionKey:    "",
					Margin:       0,
				},
			}
			m.addQuestions(idx+1, awsS3BucketQuestions...)
		}
	}
}

func awsS3BucketQuestions(m *Model) (submissionResultMsg, error) {
	plaformName := m.FindAnswerByKey("PLATFORM_NAME")
	if plaformName != "" {
		plaformNameLower := strings.ToLower(plaformName)
		qIdx := m.FindQuestionIdByKey("S3_BUCKET_NAME")
		if m.Questions[qIdx].Answer == "" {
			m.Questions[qIdx].DefaultAnswer = plaformNameLower
		}
	}

	s3BucketType := m.FindAnswerByKey("S3_BUCKET_TYPE")
	switch s3BucketType {
	case "Local Minio":
		m.removeQuestionByKey("AWS_ACCESS_KEY_ID_S3_BUCKET")
		m.removeQuestionByKey("AWS_SECRET_ACCESS_KEY_S3_BUCKET")
		m.removeQuestionByKey("AWS_REGION_S3_BUCKET")
	case "Cloud AWS S3":
		addAwsS3BucketQuestions(m)
	}
	return submissionResultMsg("AWS S3 Bucket questions added succesfully"), nil
}

func addAwsSsHKeyQuestions(index int, m *Model) {
	idx := m.FindQuestionIdByKey("AWS_SSH_KEY_PATH")
	if idx == -1 {
		awsSSHKeyQuestion := Question{
			Key:           "AWS_SSH_KEY_PATH",
			QuestionType:  "generic",
			Prompt:        "AWS SSH key path",
			Answer:        data.Data.PlatformInfo.AwsSshKeyPath,
			DefaultAnswer: "./.osi4iot_keys/aws_ssh_key.pem",
			ErrorMessage:  "",
			Choices:       []string{},
			ChoiceFocus:   0,
			Rules:         []string{"required", "string", "fileOrFieldExists"},
			ActionKey:     "",
			Margin:        0,
		}
		m.addQuestions(index, awsSSHKeyQuestion)
	}
}

func addAwsEFSQuestion(index int, m *Model) {
	numNodes := m.Data["numNodes"].(int)
	if numNodes > 1 {
		idx := m.FindQuestionIdByKey("AWS_EFS_DNS")
		if idx == -1 {
			efsQuestion := Question{
				Key:           "AWS_EFS_DNS",
				QuestionType:  "generic",
				Prompt:        "AWS Elastic File System DNS",
				Answer:        data.Data.PlatformInfo.AwsEfsDNS,
				DefaultAnswer: "",
				Choices:       []string{},
				ChoiceFocus:   0,
				ErrorMessage:  "",
				Rules:         []string{"required", "string"},
				ActionKey:     "",
				Margin:        0,
			}
			m.addQuestions(index, efsQuestion)
		}
	} else {
		m.removeQuestionByKey("AWS_EFS_DNS")
	}
}

func addNetworkInterfaceQuestions(m *Model) {
	deploymentLocation := m.FindAnswerByKey("DEPLOYMENT_LOCATION")
	numNodes := m.Data["numNodes"].(int)
	if deploymentLocation == "On-premise cluster deployment" && numNodes > 1 {
		idx := m.FindQuestionIdByKey("FLOATING_IP_ADDRESS")
		if idx == -1 {
			numNodesIdx := m.FindQuestionIdByKey("NUMBER_OF_SWARM_NODES")
			initialIndex := numNodesIdx + numNodes*6 + 1
			netInterfQuestions := []Question{
				{
					Key:           "FLOATING_IP_ADDRESS",
					QuestionType:  "generic",
					Prompt:        "Floating IP address",
					Answer:        data.Data.PlatformInfo.FloatingIPAddress,
					DefaultAnswer: "",
					Choices:       []string{},
					ChoiceFocus:   0,
					ErrorMessage:  "",
					Rules:         []string{"required", "string", "ip"},
					ActionKey:     "",
					Margin:        0,
				},
				{
					Key:           "NETWORK_INTERFACE",
					QuestionType:  "generic",
					Prompt:        "Manager nodes network interface",
					Answer:        data.Data.PlatformInfo.NetworkInterface,
					DefaultAnswer: "eth0",
					Choices:       []string{},
					ChoiceFocus:   0,
					ErrorMessage:  "",
					Rules:         []string{"required", "string", "minlen:4"},
					ActionKey:     "",
					Margin:        0,
				},
			}
			m.addQuestions(initialIndex, netInterfQuestions...)
		}
	}
}

func DeployLocationQuestions(m *Model) (submissionResultMsg, error) {
	qIdx := m.FindQuestionIdByKey("DEPLOYMENT_LOCATION")
	deployLocation := m.Questions[qIdx].Answer
	switch deployLocation {
	case "Local deployment":
		m.removeQuestionByKey("AWS_SSH_KEY_PATH")
		m.removeQuestionByKey("NUMBER_OF_SWARM_NODES")
		m.removeQuestionByKey("AWS_EFS_DNS")
		m.removeQuestionByKey("FLOATING_IP_ADDRESS")
		m.removeQuestionByKey("NETWORK_INTERFACE")
		removingNodeQuestions(m)
		addLocalResourceUtilizationQuestion(qIdx+1, m)
	case "On-premise cluster deployment":
		m.removeQuestionByKey("AWS_SSH_KEY_PATH")
		m.removeQuestionByKey("AWS_EFS_DNS")
		m.removeQuestionByKey("LOCAL_RESOURCE_UTILIZATION_PERCENTAGE")
		addNumNodesQuestion(qIdx+1, m)
		addNodesDataQuestions(m)
		addNetworkInterfaceQuestions(m)
	case "AWS cluster deployment":
		m.removeQuestionByKey("FLOATING_IP_ADDRESS")
		m.removeQuestionByKey("NETWORK_INTERFACE")
		m.removeQuestionByKey("LOCAL_RESOURCE_UTILIZATION_PERCENTAGE")
		addAwsSsHKeyQuestions(qIdx+1, m)
		addAwsEFSQuestion(qIdx+2, m)
		addNumNodesQuestion(qIdx+3, m)
		addNodesDataQuestions(m)
	}
	return submissionResultMsg("Deploy location questions added succesfully"), nil
}

func addLocalResourceUtilizationQuestion(index int, m *Model) {
	idx := m.FindQuestionIdByKey("LOCAL_RESOURCE_UTILIZATION_PERCENTAGE")
	if idx == -1 {
		localResourceUtilizationQuestion := Question{
			Key:           "LOCAL_RESOURCE_UTILIZATION_PERCENTAGE",
			QuestionType:  "generic",
			Prompt:        "Local computer resource utilization percentage",
			Answer:        utils.IntValueToStr(data.Data.PlatformInfo.LocalResourceUtilization),
			DefaultAnswer: "100",
			ErrorMessage:  "",
			Choices:       []string{},
			ChoiceFocus:   0,
			Rules:         []string{"required", "int", "minval:50", "maxval:100"},
			ActionKey:     "",
			Margin:        0,
		}
		m.addQuestions(index, localResourceUtilizationQuestion)
	}
}

func addNodesDataQuestions(m *Model) (submissionResultMsg, error) {
	deploymentLocation := m.FindAnswerByKey("DEPLOYMENT_LOCATION")
	if deploymentLocation == "On-premise cluster deployment" || deploymentLocation == "AWS cluster deployment" {
		creatingNodeQuestions(m)
	}
	return submissionResultMsg("Node data questions added succesfully"), nil
}

func addDomainCertsProvidedByCAQuestions(index int, m *Model) {
	idx := m.FindQuestionIdByKey("DOMAIN_SSL_PRIVATE_KEY_PATH")
	if idx == -1 {
		domainCertsQuestions := []Question{
			{
				Key:           "DOMAIN_SSL_PRIVATE_KEY_PATH",
				QuestionType:  "generic",
				Prompt:        "Domain SSL private key path",
				Answer:        data.Data.PlatformInfo.DOMAIN_SSL_PRIVATE_KEY_PATH,
				DefaultAnswer: "./certs/domain_certs/iot_platform.key",
				Choices:       []string{},
				ChoiceFocus:   0,
				ErrorMessage:  "",
				Rules:         []string{"required", "string", "fileOrFieldExists"},
				ActionKey:     "",
				Margin:        0,
			},
			{
				Key:           "DOMAIN_SSL_CA_PEM_PATH",
				QuestionType:  "generic",
				Prompt:        "Domain SSL CA certificate path",
				Answer:        data.Data.PlatformInfo.DOMAIN_SSL_CA_PEM_PATH,
				DefaultAnswer: "./certs/domain_certs/iot_platform_ca.pem",
				Choices:       []string{},
				ChoiceFocus:   0,
				ErrorMessage:  "",
				Rules:         []string{"required", "string", "fileOrFieldExists"},
				ActionKey:     "",
				Margin:        0,
			},
			{
				Key:           "DOMAIN_SSL_CERT_CRT_PATH",
				QuestionType:  "generic",
				Prompt:        "Domain SSL certificate path",
				Answer:        data.Data.PlatformInfo.DOMAIN_SSL_CERT_CRT_PATH,
				DefaultAnswer: "./certs/domain_certs/iot_platform_cert.cer",
				Choices:       []string{},
				ChoiceFocus:   0,
				ErrorMessage:  "",
				Rules:         []string{"required", "string", "fileOrFieldExists"},
				ActionKey:     "",
				Margin:        0,
			},
		}
		m.addQuestions(index, domainCertsQuestions...)
	}
}

func DomainCertsQuestions(m *Model) (submissionResultMsg, error) {
	idx := m.FindQuestionIdByKey("DOMAIN_CERTS_TYPE")
	certType := m.Questions[idx].Answer
	switch certType {
	case "No certs":
		m.removeQuestionByKey("DOMAIN_SSL_PRIVATE_KEY_PATH")
		m.removeQuestionByKey("DOMAIN_SSL_CA_PEM_PATH")
		m.removeQuestionByKey("DOMAIN_SSL_CERT_CRT_PATH")
		m.removeQuestionByKey("AWS_ACCESS_KEY_ID_ROUTE_53")
		m.removeQuestionByKey("AWS_SECRET_ACCESS_KEY_ROUTE_53")
		m.removeQuestionByKey("AWS_REGION_ROUTE_53")
		m.removeQuestionByKey("AWS_HOSTED_ZONE_ID_ROUTE_53")
	case "Certs provided by an CA":
		addDomainCertsProvidedByCAQuestions(idx+1, m)
		m.removeQuestionByKey("AWS_ACCESS_KEY_ID_ROUTE_53")
		m.removeQuestionByKey("AWS_SECRET_ACCESS_KEY_ROUTE_53")
	case "Let's encrypt certs with HTTP-01 challenge":
		m.removeQuestionByKey("DOMAIN_SSL_PRIVATE_KEY_PATH")
		m.removeQuestionByKey("DOMAIN_SSL_CA_PEM_PATH")
		m.removeQuestionByKey("DOMAIN_SSL_CERT_CRT_PATH")
		m.removeQuestionByKey("AWS_ACCESS_KEY_ID_ROUTE_53")
		m.removeQuestionByKey("AWS_SECRET_ACCESS_KEY_ROUTE_53")
		m.removeQuestionByKey("AWS_REGION_ROUTE_53")
		m.removeQuestionByKey("AWS_HOSTED_ZONE_ID_ROUTE_53")
	case "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider":
		addAWSRoute53Questions(m)
		m.removeQuestionByKey("DOMAIN_SSL_PRIVATE_KEY_PATH")
		m.removeQuestionByKey("DOMAIN_SSL_CA_PEM_PATH")
		m.removeQuestionByKey("DOMAIN_SSL_CERT_CRT_PATH")
	}
	return submissionResultMsg("Domain certs questions added succesfully"), nil
}

func copyKeyInNode(m *Model) (submissionResultMsg, error) {
	deploymentLocation := m.FindAnswerByKey("DEPLOYMENT_LOCATION")
	msg := ""
	if deploymentLocation == "On-premise cluster deployment" {
		passwordKey := m.Questions[m.Focus].Key
		password := m.Questions[m.Focus].Answer

		pkSlice := strings.Split(passwordKey, "_")
		nodeKey := pkSlice[0] + "_" + pkSlice[1]

		hostNameKey := nodeKey + "_HostName"
		hostName := m.FindAnswerByKey(hostNameKey)
		ipKey := nodeKey + "_IP"
		ip := m.FindAnswerByKey(ipKey)
		userNameKey := nodeKey + "_UserName"
		userName := m.FindAnswerByKey(userNameKey)
		roleKey := nodeKey + "_Role"
		role := m.FindAnswerByKey(roleKey)

		runningInLocalHost, err := utils.IsHostIP(ip)
		if err != nil {
			return submissionResultMsg("Error: getting host IP of node " + hostName), err
		}
		if runningInLocalHost {
			msg = fmt.Sprintf("Node %s is local node", hostName)
			return submissionResultMsg(msg), nil
		}

		nodeData := types.NodeData{
			NodeHostName: hostName,
			NodeIP:       ip,
			NodeUserName: userName,
			NodeRole:     role,
			NodePassword: password,
		}
		platformData := data.GetData()
		publicKey := platformData.PlatformInfo.SshPubKey
		err = utils.CopyKeyInNode(nodeData, publicKey)
		if err != nil {
			return submissionResultMsg("Error: copying key to node " + hostName), err
		}
		msg = fmt.Sprintf("Public key copied to node %s successfully", hostName)
	}
	return submissionResultMsg(msg), nil
}

func messagingSystemQuestions(m *Model) (submissionResultMsg, error) {
	qIdx := m.FindQuestionIdByKey("MESSAGING_SYSTEM")
	messagingSystem := m.Questions[qIdx].Answer
	switch messagingSystem {
	case "mqtt":
		m.removeQuestionByKey("NATS_NKEY_VALIDITY_DAYS")
		m.removeQuestionByKey("NUM_NATS_CLUSTER_NODES")
		addMqttCertsValidityDaysQuestions(qIdx+1, m)
	case "nats":
		m.removeQuestionByKey("MQTT_SSL_CERTS_VALIDITY_DAYS")
		addNumNatsClusterNodesQuestions(qIdx+1, m)
	}
	return submissionResultMsg("Messaging system questions added/removed succesfully"), nil
}

func addMqttCertsValidityDaysQuestions(index int, m *Model) {
	idx := m.FindQuestionIdByKey("MQTT_SSL_CERTS_VALIDITY_DAYS")
	if idx == -1 {
		mqttCertsValidityDaysQuestion := Question{
			Key:           "MQTT_SSL_CERTS_VALIDITY_DAYS",
			QuestionType:  "generic",
			Prompt:        "Mqtt ssl certs validity days",
			Answer:        utils.IntValueToStr(data.Data.PlatformInfo.MQTTSslCertsValidityDays),
			DefaultAnswer: "365",
			ErrorMessage:  "",
			Choices:       []string{},
			ChoiceFocus:   0,
			Rules:         []string{"required", "int", "minval:30"},
			ActionKey:     "",
			Margin:        0,
		}
		m.addQuestions(index, mqttCertsValidityDaysQuestion)
	}
}

func addNumNatsClusterNodesQuestions(index int, m *Model) {
	idx := m.FindQuestionIdByKey("NUM_NATS_CLUSTER_NODES")
	if idx == -1 {
		numNatsClusterNodesQuestion := Question{
			Key:           "NUM_NATS_CLUSTER_NODES",
			QuestionType:  "list",
			Prompt:        "Number of NATS cluster nodes",
			Answer:        utils.IntValueToStr(data.Data.PlatformInfo.NumNatsClusterNodes),
			DefaultAnswer: "1",
			ErrorMessage:  "",
			Choices:       []string{"1", "3", "5"},
			ChoiceFocus:   0,
			Rules:         []string{"required", "int", "minval:1"},
			ActionKey:     "",
			Margin:        0,
		}
		m.addQuestions(index, numNatsClusterNodesQuestion)
	}
}

func createPlatform(m *Model) (platformCreatingMsg, error) {
	platformData := data.GetData()
	areAllQuestionsOK := true
	for idx := 0; idx < len(m.Questions); idx++ {
		if m.Questions[idx].Answer == "" {
			isValid, errorMessage := m.validateAnswer(idx)
			if !isValid {
				areAllQuestionsOK = false
				m.Questions[idx].ErrorMessage = errorMessage
			}
		}
	}
	if !areAllQuestionsOK {
		return platformCreatingMsg("Error: Some questions are not answered correctly"), nil
	}

	if len(data.Data.Organizations) == 0 {
		orgHash := utils.GeneratePassword(16)
		orgAcronym := platformData.PlatformInfo.MainOrganizationAcronym
		numNriInMainOrg := platformData.PlatformInfo.NumberOfNodeRedInstancesInMainOrg
		exclusiveWorkerNodes := []string{}
		noderedInstances := make([]types.NodeRedInstance, numNriInMainOrg)
		organization := types.Organization{
			OrgHash:              orgHash,
			OrgAcronym:           orgAcronym,
			ExclusiveWorkerNodes: exclusiveWorkerNodes,
			NodeRedInstances:     noderedInstances,
		}
		for idx := range numNriInMainOrg {
			nriHash := utils.GeneratePassword(10)
			nriUserName := fmt.Sprintf("nri_%s", nriHash)
			nriPassword := utils.GeneratePassword(20)
			nriNkeyPublic, nriNkeySeed, err := utils.CreateUserNatsNkey()
			if err != nil {
				return platformCreatingMsg("Error: generating NATS Nkey pair for " + nriUserName), err
			}
			nriNatsCerts := types.NriNatsCerts{
				NriNkeyPublic: nriNkeyPublic,
				NriNkeySeed:   nriNkeySeed,
			}

			nri := types.NodeRedInstance{
				NriHash:      nriHash,
				NriUserName:  nriUserName,
				NriPassword:  nriPassword,
				NriMqttCerts: types.NriMqttCerts{},
				NriNatsCerts: nriNatsCerts,
			}
			organization.NodeRedInstances[idx] = nri
		}

		platformData.Organizations = append(platformData.Organizations, organization)
	}

	notificationsEmailAddress := m.FindAnswerByKey("NOTIFICATIONS_EMAIL_ADDRESS")
	data.SetData("NOTIFICATIONS_EMAIL_USER", notificationsEmailAddress)

	refreshTokenSecret := utils.GeneratePassword(20)
	data.SetData("REFRESH_TOKEN_SECRET", refreshTokenSecret)

	accessTokenSecret := utils.GeneratePassword(20)
	data.SetData("ACCESS_TOKEN_SECRET", accessTokenSecret)

	encryptionSecretKey := utils.GeneratePassword(32)
	data.SetData("ENCRYPTION_SECRET_KEY", encryptionSecretKey)

	platformAdminPassword := m.FindAnswerByKey("PLATFORM_ADMIN_PASSWORD")
	data.SetData("GRAFANA_ADMIN_PASSWORD", platformAdminPassword)

	platformAdminUserName := m.FindAnswerByKey("PLATFORM_ADMIN_USER_NAME")
	data.SetData("POSTGRES_USER", platformAdminUserName)

	data.SetData("POSTGRES_PASSWORD", platformAdminPassword)

	postgresDB := "iot_platform_db"
	data.SetData("POSTGRES_DB", postgresDB)

	data.SetData("TIMESCALE_USER", platformAdminUserName)
	data.SetData("TIMESCALE_PASSWORD", platformAdminPassword)

	timescaleDB := "iot_data_db"
	data.SetData("TIMESCALE_DB", timescaleDB)

	grafanaDBPassword := utils.GeneratePassword(20)
	data.SetData("GRAFANA_DB_PASSWORD", grafanaDBPassword)

	grafanaDatasourcePassword := utils.GeneratePassword(20)
	data.SetData("GRAFANA_DATASOURCE_PASSWORD", grafanaDatasourcePassword)

	dev2PDBPassword := platformAdminPassword
	data.SetData("DEV2PDB_PASSWORD", dev2PDBPassword)

	nodeRedAdmin := platformAdminUserName
	data.SetData("NODE_RED_ADMIN", nodeRedAdmin)

	nodeRedAdminHash, err := utils.HashPassword(platformAdminPassword)
	if err != nil {
		return platformCreatingMsg("Error: hashing NodeRed admin password"), err
	}
	data.SetData("NODE_RED_ADMIN_HASH", nodeRedAdminHash)

	pgAdminDefaultEmail := m.FindAnswerByKey("PLATFORM_ADMIN_EMAIL")
	data.SetData("PGADMIN_DEFAULT_EMAIL", pgAdminDefaultEmail)

	pgAdminDefaultPassword := platformAdminPassword
	data.SetData("PGADMIN_DEFAULT_PASSWORD", pgAdminDefaultPassword)

	if platformData.PlatformInfo.DomainCertsType == "Certs provided by an CA" {
		utils.SetCertsNamesAndExpirationTime(platformData)
	}

	switch platformData.PlatformInfo.MessagingSystem {
	case "mqtt":
		err = utils.MqttTLSCredentials(platformData)
		if err != nil {
			return platformCreatingMsg("Error: creating mqtt certs"), err
		}
	case "nats":
		err = utils.NatsCredentials(platformData)
		if err != nil {
			return platformCreatingMsg("Error: creating nats certs"), err
		}
	}

	deployLocation := platformData.PlatformInfo.DeploymentLocation
	nodesData := []types.NodeData{}
	numNodes := platformData.PlatformInfo.NumberOfSwarmNodes
	if deployLocation == "Local deployment" {
		localNodeData, err := GetLocalNodeData()
		if err != nil {
			return platformCreatingMsg("Error: getting local node data"), err
		}
		nodesData = append(nodesData, localNodeData)
	} else {
		for idx := 0; idx < numNodes; idx++ {
			nodeData := platformData.PlatformInfo.NodesData[idx]
			nodesData = append(nodesData, nodeData)
		}
	}
	platformData.PlatformInfo.NodesData = nodesData

	err = utils.WritePlatformDataToFile(platformData)
	if err != nil {
		return platformCreatingMsg("Error: writing platform data to file"), err
	}

	return platformCreatingMsg("osi4iot_state.json file created successfully"), nil
}

func GetLocalNodeData() (types.NodeData, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return types.NodeData{}, err
	}

	usr, err := user.Current()
	if err != nil {
		return types.NodeData{}, err
	}

	cmd := exec.Command("uname", "-m")
	output, err := cmd.Output()
	if err != nil {
		return types.NodeData{}, err
	}
	nodeArch := strings.TrimSpace(string(output))

	localIP, err := utils.GetLocalNodeIP()
	if err != nil {
		return types.NodeData{}, fmt.Errorf("error getting local node IP: %v", err)
	}

	nodeNanoCpus := int64(runtime.NumCPU() * 1e9)

	vm, err := mem.VirtualMemory()
	if err != nil {
		return types.NodeData{}, fmt.Errorf("error getting memory: %v", err)
	}

	nodeData := types.NodeData{
		NodeHostName:    hostname,
		NodeIP:          localIP,
		NodeUserName:    usr.Username,
		NodeRole:        "Manager",
		NodeArch:        nodeArch,
		NodeNanoCPUs:    nodeNanoCpus,
		NodeMemoryBytes: int64(vm.Total),
	}
	return nodeData, nil
}

func createOrg(m *Model) (creatingOrgMsg, error) {
	platformData := data.GetData()
	orgHash := utils.GeneratePassword(16)
	orgName := m.FindAnswerByKey("ORGANIZATION_NAME")
	orgAcronym := m.FindAnswerByKey("ORGANIZATION_ACRONYM")
	orgRole := m.FindAnswerByKey("ORGANIZATION_ROLE")
	buildingId, _ := strconv.Atoi(m.FindAnswerByKey("BUILDING_ID"))
	orgTelegramChatId := m.FindAnswerByKey("ORGANIZATION_TELEGRAM_CHAT_ID")
	orgTelegramInvitationLink := m.FindAnswerByKey("ORGANIZATION_TELEGRAM_INVITATION_LINK")
	mqttAccessControl := m.FindAnswerByKey("MQTT_ACCESS_CONTROL")
	numNriInOrg, _ := strconv.Atoi(m.FindAnswerByKey("NUMBER_OF_NODERED_INSTANCES_IN_ORG"))
	nriHashes := make([]string, numNriInOrg)

	newOrg := types.Organization{
		OrgHash:              orgHash,
		OrgAcronym:           orgAcronym,
		ExclusiveWorkerNodes: []string{},
		NodeRedInstances:     []types.NodeRedInstance{},
	}
	for idx := 0; idx < numNriInOrg; idx++ {
		nriHash := utils.GeneratePassword(10)
		nriHashes[idx] = nriHash
		nriUserName := fmt.Sprintf("nri_%s", nriHash)
		nriPassword := utils.GeneratePassword(20)
		nriNkeyPublic, nriNkeySeed, err := utils.CreateUserNatsNkey()
		if err != nil {
			return creatingOrgMsg("Error: generating NATS Nkey pair"), err
		}
		nriNatsCerts := types.NriNatsCerts{
			NriNkeyPublic: nriNkeyPublic,
			NriNkeySeed:   nriNkeySeed,
		}

		nri := types.NodeRedInstance{
			NriHash:      nriHash,
			NriUserName:  nriUserName,
			NriPassword:  nriPassword,
			NriMqttCerts: types.NriMqttCerts{},
			NriNatsCerts: nriNatsCerts,
		}
		newOrg.NodeRedInstances = append(newOrg.NodeRedInstances, nri)
	}
	platformData.Organizations = append(platformData.Organizations, newOrg)

	orgAdminFirstName := m.FindAnswerByKey("ORG_ADMIN_FIRST_NAME")
	orgAdminSurname := m.FindAnswerByKey("ORG_ADMIN_SURNAME")
	orgAdminEmail := m.FindAnswerByKey("ORG_ADMIN_EMAIL")
	orgAdminArray := []orgs.Admin{
		{
			FirstName: orgAdminFirstName,
			Surname:   orgAdminSurname,
			Email:     orgAdminEmail,
		},
	}

	createOrgData := orgs.CreateOrgData{
		Name:                   orgName,
		Acronym:                orgAcronym,
		Role:                   orgRole,
		BuildingId:             buildingId,
		OrgHash:                orgHash,
		NriHashes:              nriHashes,
		TelegramInvitationLink: orgTelegramInvitationLink,
		TelegramChatId:         orgTelegramChatId,
		MqttAccessControl:      mqttAccessControl,
		OrgAdminArray:          orgAdminArray,
	}

	err := orgs.RequestCreateOrg(platformData, createOrgData)
	if err != nil {
		errMsg := fmt.Sprintf("Error: creating organization: %v", err)
		return creatingOrgMsg(errMsg), err
	}

	err = utils.MqttTLSCredentials(platformData)
	if err != nil {
		return creatingOrgMsg("Error: creating mqtt certs"), err
	}

	err = utils.WritePlatformDataToFile(platformData)
	if err != nil {
		return creatingOrgMsg("Error: writing platform data to file"), err
	}

	err = docker.AddNFSFolders(platformData)
	if err != nil {
		return creatingOrgMsg("Error: adding NFS folders on nodes"), err
	}

	err = docker.AddEfsFolders(platformData)
	if err != nil {
		return creatingOrgMsg("Error: adding EFS folders on nodes"), err
	}

	err = docker.CreateNriSwarmServicesForOrg(platformData, newOrg)
	if err != nil {
		return creatingOrgMsg("Error: creating NodeRed instances services"), err
	}

	return creatingOrgMsg("Organization created successfully"), nil
}
