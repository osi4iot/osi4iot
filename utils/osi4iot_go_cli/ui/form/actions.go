package form

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/ui/tools"
)

func creatingNodeQuestions(m *Model) (submissionResultMsg, error) {
	platformData := data.GetData()
	if m.FindAnswerByKey("DEPLOYMENT_LOCATION") == "On-premise cluster deployment" {
		err := tools.CreateKeyPair(platformData)
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
		defaultNodeData := common.NodeData{}
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
					Key:          "Node_" + strconv.Itoa(inode) + "_HostName",
					QuestionType: "generic",
					Prompt:       "Host name",
					Answer:       defaultNodeData.NodeHostName,
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
	if s3BucketType == "Local Minio" {
		m.removeQuestionByKey("AWS_ACCESS_KEY_ID_S3_BUCKET")
		m.removeQuestionByKey("AWS_SECRET_ACCESS_KEY_S3_BUCKET")
		m.removeQuestionByKey("AWS_REGION_S3_BUCKET")
	} else if s3BucketType == "Cloud AWS S3" {
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
	if deployLocation == "Local deployment" {
		m.removeQuestionByKey("AWS_SSH_KEY_PATH")
		m.removeQuestionByKey("NUMBER_OF_SWARM_NODES")
		m.removeQuestionByKey("AWS_EFS_DNS")
		m.removeQuestionByKey("FLOATING_IP_ADDRESS")
		m.removeQuestionByKey("NETWORK_INTERFACE")
		removingNodeQuestions(m)
	} else if deployLocation == "On-premise cluster deployment" {
		m.removeQuestionByKey("AWS_SSH_KEY_PATH")
		m.removeQuestionByKey("AWS_EFS_DNS")
		addNumNodesQuestion(qIdx+1, m)
		addNodesDataQuestions(m)
		addNetworkInterfaceQuestions(m)
	} else if deployLocation == "AWS cluster deployment" {
		m.removeQuestionByKey("FLOATING_IP_ADDRESS")
		m.removeQuestionByKey("NETWORK_INTERFACE")
		addAwsSsHKeyQuestions(qIdx+1, m)
		addAwsEFSQuestion(qIdx+2, m)
		addNumNodesQuestion(qIdx+3, m)
		addNodesDataQuestions(m)
	}
	return submissionResultMsg("Deploy location questions added succesfully"), nil
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
	if certType == "No certs" {
		m.removeQuestionByKey("DOMAIN_SSL_PRIVATE_KEY_PATH")
		m.removeQuestionByKey("DOMAIN_SSL_CA_PEM_PATH")
		m.removeQuestionByKey("DOMAIN_SSL_CERT_CRT_PATH")
		m.removeQuestionByKey("AWS_ACCESS_KEY_ID_ROUTE_53")
		m.removeQuestionByKey("AWS_SECRET_ACCESS_KEY_ROUTE_53")
		m.removeQuestionByKey("AWS_REGION_ROUTE_53")
		m.removeQuestionByKey("AWS_HOSTED_ZONE_ID_ROUTE_53")
	} else if certType == "Certs provided by an CA" {
		addDomainCertsProvidedByCAQuestions(idx+1, m)
		m.removeQuestionByKey("AWS_ACCESS_KEY_ID_ROUTE_53")
		m.removeQuestionByKey("AWS_SECRET_ACCESS_KEY_ROUTE_53")
	} else if certType == "Let's encrypt certs with HTTP-01 challenge" {
		m.removeQuestionByKey("DOMAIN_SSL_PRIVATE_KEY_PATH")
		m.removeQuestionByKey("DOMAIN_SSL_CA_PEM_PATH")
		m.removeQuestionByKey("DOMAIN_SSL_CERT_CRT_PATH")
		m.removeQuestionByKey("AWS_ACCESS_KEY_ID_ROUTE_53")
		m.removeQuestionByKey("AWS_SECRET_ACCESS_KEY_ROUTE_53")
		m.removeQuestionByKey("AWS_REGION_ROUTE_53")
		m.removeQuestionByKey("AWS_HOSTED_ZONE_ID_ROUTE_53")
	} else if certType == "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
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

		nodeData := common.NodeData{
			NodeHostName: hostName,
			NodeIP:       ip,
			NodeUserName: userName,
			NodeRole:     role,
			NodePassword: password,
		}
		platformData := data.GetData()
		publicKey := platformData.PlatformInfo.SshPubKey
		err = tools.CopyKeyInNode(nodeData, publicKey)
		if err != nil {
			return submissionResultMsg("Error: copying key to node " + hostName), err
		}
		msg = fmt.Sprintf("Public key copied to node %s successfully", hostName)
	}
	return submissionResultMsg(msg), nil
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

	if len(data.Data.Certs.MqttCerts.Organizations) == 0 {
		orgHash := utils.GeneratePassword(16)
		orgAcronym := platformData.PlatformInfo.MainOrganizationAcronym
		numNriInMainOrg := platformData.PlatformInfo.NumberOfNodeRedInstancesInMainOrg
		exclusiveWorkerNodes := make([]string, 0)
		nodered_instances := make([]common.NodeRedInstance, numNriInMainOrg)
		organization := common.Organization{
			OrgHash:              orgHash,
			OrgAcronym:           orgAcronym,
			ExclusiveWorkerNodes: exclusiveWorkerNodes,
			NodeRedInstances:     nodered_instances,
		}
		platformData.Certs.MqttCerts.Organizations = append(platformData.Certs.MqttCerts.Organizations, organization)
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

	data.SetCertsData()
	err = utils.MqttTLSCredentials(platformData)
	if err != nil {
		return platformCreatingMsg("Error: creating mqtt certs"), err
	}

	err = tools.WriteSshPrivateKeyToLocalFile(platformData)
	if err != nil {
		return platformCreatingMsg("Error: writing ssh private key to local file"), err
	}

	return platformCreatingMsg("osi4iot_state.json file created and platform initiated successfully"), nil
}
