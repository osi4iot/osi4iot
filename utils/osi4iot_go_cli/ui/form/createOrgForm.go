package form

import (
	"log"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	clipboard "github.com/tiagomelo/go-clipboard/clipboard"
)

func CreateOrgForm() {
	p := tea.NewProgram(initialModelCreateOrg())

	if _, err := p.Run(); err != nil {
		log.Fatal(err)
	}
}

func initialModelCreateOrg() Model {
	newClipboard := clipboard.New()
	model := Model{
		Questions: []Question{
			{
				Key:           "ORGANIZATION_NAME",
				QuestionType:  "generic",
				Prompt:        "Organization name",
				Answer:        "",
				DefaultAnswer: "",
				ErrorMessage:  "",
				Choices:       []string{},
				ChoiceFocus:   0,
				Rules:         []string{"required", "isString", "minlen:4", "maxlen:40"},
				ActionKey:     "",
				Margin:        0,
			},
			{
				Key:           "ORGANIZATION_ACRONYM",
				QuestionType:  "generic",
				Prompt:        "Organization acronym",
				Answer:        "",
				DefaultAnswer: "",
				ErrorMessage:  "",
				Choices:       []string{},
				ChoiceFocus:   0,
				Rules:         []string{"required", "isString", "minlen:3", "maxlen:11"},
				ActionKey:     "",
				Margin:        0,
			},
			{
				Key:           "ORGANIZATION_ROLE",
				QuestionType:  "list",
				Prompt:        "Organization role in platform",
				Answer:        "",
				DefaultAnswer: "",
				ErrorMessage:  "",
				Choices:       []string{"Generic", "Provider"},
				ChoiceFocus:   0,
				Rules:         []string{"required", "isString"},
				ActionKey:     "",
				Margin:        0,
			},
			{
				Key:           "BUILDING_ID",
				QuestionType:  "generic",
				Prompt:        "Organization building id",
				Answer:        "",
				DefaultAnswer: "1",
				ErrorMessage:  "",
				Choices:       []string{},
				ChoiceFocus:   0,
				Rules:         []string{"required", "isInt", "minval:1"},
				ActionKey:     "",
				Margin:        0,
			},
			{
				Key:           "ORGANIZATION_TELEGRAM_CHAT_ID",
				QuestionType:  "generic",
				Prompt:        "Telegram chat id for main organization default group",
				Answer:        "",
				DefaultAnswer: "",
				ErrorMessage:  "",
				Choices:       []string{},
				ChoiceFocus:   0,
				Rules:         []string{"required", "int"},
				ActionKey:     "",
				Margin:        0,
			},
			{
				Key:           "ORGANIZATION_TELEGRAM_INVITATION_LINK",
				QuestionType:  "generic",
				Prompt:        "Telegram invitation link for main organization default group",
				Answer:        "",
				DefaultAnswer: "",
				ErrorMessage:  "",
				Choices:       []string{},
				ChoiceFocus:   0,
				Rules:         []string{"required", "url"},
				ActionKey:     "",
				Margin:        0,
			},
			{
				Key:          "MQTT_ACCESS_CONTROL",
				QuestionType: "list",
				Prompt:       "Mqtt access control for the organization",
				Answer:       "",
				ErrorMessage: "",
				Choices:      []string{"Pub & Sub", "Pub", "Sub", "None"},
				ChoiceFocus:  0,
				Rules:        []string{"required", "string"},
				ActionKey:    "",
				Margin:       0,
			},
			{
				Key:           "NUMBER_OF_NODERED_INSTANCES_IN_ORG",
				QuestionType:  "generic",
				Prompt:        "Number of node-red intances in org",
				Answer:        "",
				DefaultAnswer: "1",
				ErrorMessage:  "",
				Choices:       []string{},
				ChoiceFocus:   0,
				Rules:         []string{"required", "int", "minval:1", "maxval:3"},
				ActionKey:     "",
				Margin:        0,
			},
			{
				Key:           "ORG_ADMIN_FIRST_NAME",
				QuestionType:  "generic",
				Prompt:        "Org admin first name",
				Answer:        "",
				DefaultAnswer: "",
				ErrorMessage:  "",
				Choices:       []string{},
				ChoiceFocus:   0,
				Rules:         []string{"required", "string", "minlen:2", "maxlen:40"},
				ActionKey:     "",
				Margin:        0,
			},
			{
				Key:           "ORG_ADMIN_SURNAME",
				QuestionType:  "generic",
				Prompt:        "Org admin last name",
				Answer:        "",
				DefaultAnswer: "",
				ErrorMessage:  "",
				Choices:       []string{},
				ChoiceFocus:   0,
				Rules:         []string{"required", "string", "minlen:2", "maxlen:40"},
				ActionKey:     "",
				Margin:        0,
			},
			{
				Key:           "ORG_ADMIN_EMAIL",
				QuestionType:  "generic",
				Prompt:        "Org admin email",
				Answer:        "",
				DefaultAnswer: "",
				ErrorMessage:  "",
				Choices:       []string{},
				ChoiceFocus:   0,
				Rules:         []string{"required", "string", "email"},
				ActionKey:     "createOrg",
				Margin:        0,
			},
		},
		Focus:    0,
		Cursor:   0,
		Loading:  false,
		Finished: false,
		SubmitMsgMap: map[string]string{
			"createOrg": "Creating organization",
		},
		RecievedMsg:   "",
		PageSize:      11,
		CurrentPage:   1,
		TickInterval:  500 * time.Millisecond,
		CursorVisible: true,
		Clipboard:     newClipboard,
		Data:          map[string]interface{}{},
	}

	model.Cursor = len(model.Questions[0].Answer)

	return model
}
