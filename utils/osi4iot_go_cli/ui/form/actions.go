package form

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/ui/tools"
)

func sendRequest(_ string, _ *Model) (submissionResultMsg, error) {
	time.Sleep(2 * time.Second) // Simula retraso
	return submissionResultMsg("Datos enviados a la API"), nil
}

func creatingNodeQuestions(m *Model) (submissionResultMsg, error) {
	err := tools.CreateKeyPair()
	if err != nil {
		return submissionResultMsg("Error creating key pair"), err
	}
	numNodes, _ := strconv.Atoi(m.Questions[m.Focus].Answer)
	newQuestions := []Question{}
	iniNode := 1
	currentNumNodes := m.Data["numNodes"].(int)
	deployLocIdx := m.FindQuestionIdByKey("DEPLOYMENT_LOCATION")
	deployLocation := m.Questions[deployLocIdx].Answer
	numNodeQuestions := 5
	if currentNumNodes < numNodes {
		if currentNumNodes != 0 {
			iniNode = currentNumNodes + 1
		}
		for inode := iniNode; inode <= numNodes; inode++ {
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
					Answer:       "",
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
					Answer:       "",
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
					Answer:       "",
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
					Answer:       "",
					Choices:      []string{"Manager", "Platform worker", "Generic org worker", "Exclusive org worker", "NFS server"},
					ChoiceFocus:  0,
					ErrorMessage: "",
					Rules:        []string{"required", "string"},
					ActionKey:    "",
					Margin:       2,
				},
			}
			newQuestions = append(newQuestions, nodeQuestions...)
			if deployLocation == "On-premise cluster deployment" {
				passwordQuestion := Question{
					Key:          "Node_" + strconv.Itoa(inode) + "_Password",
					QuestionType: "password",
					Prompt:       "Password",
					Answer:       "",
					Choices:      []string{},
					ChoiceFocus:  0,
					ErrorMessage: "",
					Rules:        []string{"required", "string"},
					ActionKey:    "copyKeyInNode",
					Margin:       2,
				}
				newQuestions = append(newQuestions, passwordQuestion)
				numNodeQuestions = 6
			}
		}
	}
	initialIndex := m.Focus + 1
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
	deployLocIdx := m.FindQuestionIdByKey("DEPLOYMENT_LOCATION")
	deployLocation := m.Questions[deployLocIdx].Answer
	numNodeQuestions := 5
	if deployLocation == "On-premise cluster deployment" {
		numNodeQuestions = 6
	}
	for inode := 1; inode <= numNodes; inode++ {
		nodeKey := "Node_" + strconv.Itoa(inode)
		initialIndex := m.FindQuestionIdByKey(nodeKey)
		if initialIndex != -1 {
			finalIndex := initialIndex + numNodeQuestions
			m.removeQuestions(initialIndex, finalIndex)
		}
	}
}

func addNumNodesQuestion(index int, m *Model) {
	numNodesQuestion := Question{
		Key:           "NUMBER_OF_SWARM_NODES",
		QuestionType:  "generic",
		Prompt:        "Number of nodes in the platform",
		Answer:        "",
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

func addAWSQuestions(m *Model) {
	qIdx := m.FindQuestionIdByKey("AWS_ACCESS_KEY_ID")
	if qIdx == -1 {
		awsQuestions := []Question{
			{
				Key:           "AWS_ACCESS_KEY_ID",
				QuestionType:  "password",
				Prompt:        "AWS access key id",
				Answer:        "",
				DefaultAnswer: "",
				Choices:       []string{},
				ChoiceFocus:   0,
				ErrorMessage:  "",
				Rules:         []string{"required", "string"},
				ActionKey:     "",
				Margin:        0,
			},
			{
				Key:          "AWS_SECRET_ACCESS_KEY",
				QuestionType: "password",
				Prompt:       "AWS secret access key",
				Answer:       "",
				Choices:      []string{},
				ChoiceFocus:  0,
				ErrorMessage: "",
				Rules:        []string{"required", "string"},
				ActionKey:    "",
				Margin:       0,
			},
			{
				Key:           "AWS_REGION",
				QuestionType:  "list",
				Prompt:        "AWS region",
				Answer:        "",
				DefaultAnswer: "",
				Choices: []string{
					"US East (N. Virginia)",
					"US West (N. California)",
					"US West (Oregon)",
					"Africa (Cape Town)",
					"Asia Pacific (Hong Kong)",
					"Asia Pacific (Jakarta)",
					"Asia Pacific (Mumbai)",
					"Asia Pacific (Osaka)",
					"Asia Pacific (Seoul)",
					"Asia Pacific (Singapore)",
					"Asia Pacific (Sydney)",
					"Asia Pacific (Tokyo)",
					"Canada (Central)",
					"Europe (Frankfurt)",
					"Europe (Ireland)",
					"Europe (London)",
					"Europe (Milan)",
					"Europe (Paris)",
					"Europe (Stockholm)",
					"Middle East (Bahrain)",
					"Middle East (UAE)",
					"South America (São Paulo)",
				},
				ChoiceFocus:  17,
				ErrorMessage: "",
				Rules:        []string{"required", "string"},
				ActionKey:    "",
				Margin:       0,
			},
		}
		m.addQuestions(m.Focus+1, awsQuestions...)
	}
}

func awsKeyQuestions(m *Model) (submissionResultMsg, error) {
	s3BucketType := m.Questions[m.Focus].Answer
	if s3BucketType == "Local Minio" {
		m.removeQuestionByKey("AWS_ACCESS_KEY_ID")
		m.removeQuestionByKey("AWS_SECRET_ACCESS_KEY")
		m.removeQuestionByKey("AWS_REGION")
	} else if s3BucketType == "Cloud AWS S3" {
		addAWSQuestions(m)
	}
	return submissionResultMsg("Questions added succesfully"), nil
}

func addAwsSsHKeyQuestions(index int, m *Model) {
	awsSSHKeyQuestion := Question{
		Key:           "AWS_SSH_KEY_PATH",
		QuestionType:  "generic",
		Prompt:        "AWS SSH key path",
		Answer:        "",
		DefaultAnswer: "./.osi4iot_keys/aws_ssh_key.pem",
		ErrorMessage:  "",
		Choices:       []string{},
		ChoiceFocus:   0,
		Rules:         []string{"required", "string", "fileExists"},
		ActionKey:     "",
		Margin:        0,
	}
	m.addQuestions(index, awsSSHKeyQuestion)
}

func addAwsEFSQuestion(index int, m *Model) {
	numNodes := m.Data["numNodes"].(int)
	if numNodes > 1 {
		efsQuestion := Question{
			Key:           "AWS_EFS_DNS",
			QuestionType:  "generic",
			Prompt:        "AWS Elastic File System DNS",
			Answer:        "",
			DefaultAnswer: "",
			Choices:       []string{},
			ChoiceFocus:   0,
			ErrorMessage:  "",
			Rules:         []string{"required", "string"},
			ActionKey:     "",
			Margin:        0,
		}
		m.addQuestions(index, efsQuestion)
	} else {
		m.removeQuestionByKey("AWS_EFS_DNS")
	}
}

func addNetworkInterfaceQuestions(index int, m *Model) {
	deployLocIdx := m.FindQuestionIdByKey("DEPLOYMENT_LOCATION")
	deployLocation := m.Questions[deployLocIdx].Answer
	numNodes := m.Data["numNodes"].(int)
	if deployLocation == "On-premise cluster deployment" && numNodes > 1 {
		netInterfQuestions := []Question{
			{
				Key:           "FLOATING_IP_ADDRESS",
				QuestionType:  "generic",
				Prompt:        "Floating IP address",
				Answer:        "",
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
				Answer:        "",
				DefaultAnswer: "eth0",
				Choices:       []string{},
				ChoiceFocus:   0,
				ErrorMessage:  "",
				Rules:         []string{"required", "string", "minlen:4"},
				ActionKey:     "",
				Margin:        0,
			},
		}
		m.addQuestions(index, netInterfQuestions...)
	}
}

func deployLocationQuestions(m *Model) (submissionResultMsg, error) {
	deployLocation := m.Questions[m.Focus].Answer
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
		addNumNodesQuestion(m.Focus+1, m)
		addNetworkInterfaceQuestions(m.Focus+2, m)
	} else if deployLocation == "AWS cluster deployment" {
		m.removeQuestionByKey("FLOATING_IP_ADDRESS")
		m.removeQuestionByKey("NETWORK_INTERFACE")
		addAwsSsHKeyQuestions(m.Focus+1, m)
		addNumNodesQuestion(m.Focus+2, m)
		addAwsEFSQuestion(m.Focus+3, m)
	}
	return submissionResultMsg("Questions added succesfully"), nil
}

func addDomainCertsQuestions(index int, m *Model) {
	domainCertsQuestions := []Question{
		{
			Key:          "DOMAIN_SSL_PRIVATE_KEY_PATH",
			QuestionType: "generic",
			Prompt:       "Domain SSL private key path",
			Answer:        "",
			DefaultAnswer: "./certs/domain_certs/iot_platform.key",
			Choices:      []string{},
			ChoiceFocus:  0,
			ErrorMessage: "",
			Rules:        []string{"required", "string", "fileExists"},
			ActionKey:    "",
			Margin:       0,
		},
		{
			Key:          "DOMAIN_SSL_CA_CERT_PATH",
			QuestionType: "generic",
			Prompt:       "Domain SSL CA certificate path",
			Answer:       "",
			DefaultAnswer: "./certs/domain_certs/iot_platform_ca.pem",
			Choices:      []string{},
			ChoiceFocus:  0,
			ErrorMessage: "",
			Rules:        []string{"required", "string", "fileExists"},
			ActionKey:    "",
			Margin:       0,
		},
		{
			Key:          "DOMAIN_SSL_CERTICATE_PATH",
			QuestionType: "generic",
			Prompt:       "Domain SSL certificate path",
			Answer:       "",
			DefaultAnswer: "./certs/domain_certs/iot_platform_cert.cer",
			Choices:      []string{},
			ChoiceFocus:  0,
			ErrorMessage: "",
			Rules:        []string{"required", "string", "fileExists"},
			ActionKey:    "",
			Margin:       0,
		},
	}
	m.addQuestions(index, domainCertsQuestions...)
}

func domainCertsQuestions(m *Model) (submissionResultMsg, error) {
	certType := m.Questions[m.Focus].Answer
	if certType == "Certs provided by an CA" {
		addDomainCertsQuestions(m.Focus+1, m)
	} else {
		m.removeQuestionByKey("DOMAIN_SSL_PRIVATE_KEY_PATH")
		m.removeQuestionByKey("DOMAIN_SSL_CA_CERT_PATH")
		m.removeQuestionByKey("DOMAIN_SSL_CERTICATE_PATH")
	}
	return submissionResultMsg("Questions added succesfully"), nil
}

func copyKeyInNode(m *Model) (submissionResultMsg, error) {
	deployLocIdx := m.FindQuestionIdByKey("DEPLOYMENT_LOCATION")
	deployLocation := m.Questions[deployLocIdx].Answer
	if deployLocation == "On-premise cluster deployment" {
		passwordKey := m.Questions[m.Focus].Key
		password := m.Questions[m.Focus].Answer

		pkSlice := strings.Split(passwordKey, "_")
		nodeKey := pkSlice[0] + "_" + pkSlice[1]

		hostNameKey := nodeKey + "_HostName"
		hostName := m.Questions[m.FindQuestionIdByKey(hostNameKey)].Answer
		ipKey := nodeKey + "_IP"
		ip := m.Questions[m.FindQuestionIdByKey(ipKey)].Answer
		userNameKey := nodeKey + "_UserName"
		userName := m.Questions[m.FindQuestionIdByKey(userNameKey)].Answer
		roleKey := nodeKey + "_Role"
		role := m.Questions[m.FindQuestionIdByKey(roleKey)].Answer

		nodeData := tools.NodeData{
			HostName: hostName,
			IP:       ip,
			UserName: userName,
			Role:     role,
			Password: password,
		}
		err := tools.CopyKeyInNode(nodeData)
		if err != nil {
			return submissionResultMsg("Error: copying key to node " + hostName), err
		}
		msg := fmt.Sprintf("Public key copied to node %s successfully", hostName)
		return submissionResultMsg(msg), nil
	}
	return submissionResultMsg(""), nil
}
