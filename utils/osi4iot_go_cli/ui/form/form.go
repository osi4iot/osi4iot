package form

import (
	"fmt"
	"math"
	"runtime"
	"slices"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/ui/tools"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/ui/validation"
	clipboard "github.com/tiagomelo/go-clipboard/clipboard"
)

type Question struct {
	Key           string
	QuestionType  string //generic, list, label,  password, fileSelect
	Prompt        string
	Answer        string
	DefaultAnswer string
	Choices       []string
	ChoiceFocus   int
	ErrorMessage  string
	Rules         []string
	ActionKey     string
	Margin        int
}

type Model struct {
	Questions     []Question
	Focus         int
	Cursor        int
	Loading       bool
	Finished      bool
	SubmitMsgMap  map[string]string
	RecievedMsg   string
	PageSize      int
	CurrentPage   int
	CursorVisible bool
	TickInterval  time.Duration
	Keys          KeyMap
	Clipboard     clipboard.Clipboard
	Data          map[string]interface{}
}

type KeyMap struct {
	Copy  tea.Key
	Paste tea.Key
}

func (m *Model) validateAnswer(qIdx int) (bool, string) {
	q := m.Questions[qIdx]
	data := make(map[string]string)
	if qIdx > 0 && len(m.Questions[qIdx-1].Rules) > 0 {
		if slices.Contains(m.Questions[qIdx].Rules, "matchPrevious") {
			data["previousValue"] = m.Questions[qIdx-1].Answer
		}

		if slices.Contains(m.Questions[qIdx].Rules, "s3BucketName") {
			data["s3BucketName"] = m.Questions[qIdx-1].Answer
			data["s3BucketType"] = m.FindAnswerByKey("S3_BUCKET_TYPE")
		}

		if slices.Contains(m.Questions[qIdx].Rules, "domainCertsType") {
			data["deploymentLocation"] = m.FindAnswerByKey("DEPLOYMENT_LOCATION")
		}
	}
	return validation.Run(q.Answer, q.Prompt, q.Rules, data)
}

func (m *Model) addQuestions(idx int, qs ...Question) {
	m.Questions = append(m.Questions[:idx], append(qs, m.Questions[idx:]...)...)
}

func (m *Model) removeQuestions(initialIndex, finalIndex int) {
	m.Questions = append(m.Questions[:initialIndex], m.Questions[finalIndex:]...)
}

func (m *Model) removeQuestionByKey(key string) {
	idx := m.FindQuestionIdByKey(key)
	if idx != -1 {
		m.Questions = append(m.Questions[:idx], m.Questions[idx+1:]...)
	}
}

func (m Model) Init() tea.Cmd {
	return tick(m.TickInterval)
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tickMsg:
		m.CursorVisible = !m.CursorVisible
		return m, tick(m.TickInterval)
	case tea.KeyMsg:
		m.resetMessages(msg.String())
		switch msg.Type {
		case tea.KeyCtrlQ, tea.KeyCtrlD:
			return m, tea.Quit
		case tea.KeyCtrlPgDown:
		case tea.KeyCtrlPgUp:
			{
			} // do nothing
		case tea.KeyCtrlDown:
			numPages := int(math.Ceil(float64(len(m.Questions)) / float64(m.PageSize+1)))
			if m.PageSize < len(m.Questions) && m.CurrentPage <= numPages {
				m.PageSize++
			}
			m.Focus = (m.CurrentPage - 1) * m.PageSize
			m.Cursor = len(m.Questions[m.Focus].Answer)
		case tea.KeyCtrlUp:
			if m.PageSize > 10 {
				m.PageSize--
			}
			m.Focus = (m.CurrentPage - 1) * m.PageSize
			m.Cursor = len(m.Questions[m.Focus].Answer)
		case tea.KeyEnter:
			if m.Questions[m.Focus].QuestionType == "list" {
				choiceFocus := m.Questions[m.Focus].ChoiceFocus
				m.Questions[m.Focus].Answer = m.Questions[m.Focus].Choices[choiceFocus]
			}
			if m.Questions[m.Focus].Answer == "" && m.Questions[m.Focus].DefaultAnswer != "" {
				m.Questions[m.Focus].Answer = m.Questions[m.Focus].DefaultAnswer
			}
			isValid, errorMessage := m.validateAnswer(m.Focus)
			if isValid {
				data.SetData(m.Questions[m.Focus].Key, m.Questions[m.Focus].Answer)
				actionKey := m.Questions[m.Focus].ActionKey
				if actionKey != "" {
					m.Loading = true
					response := runActionMsg(actionKey)
					return m, sendMessage(response)
				} else {
					m.updateFocus("down")
				}
			} else {
				if m.Questions[m.Focus].ErrorMessage == "" {
					m.Questions[m.Focus].ErrorMessage = errorMessage
				} else {
					m.Questions[m.Focus].ErrorMessage = ""
				}
			}
		case tea.KeyRight:
			if m.Questions[m.Focus].QuestionType != "list" {
				if len(m.Questions[m.Focus].Answer) > m.Cursor {
					m.Cursor++
				}
			}
		case tea.KeyLeft:
			if m.Questions[m.Focus].QuestionType != "list" {
				if m.Cursor > 0 {
					m.Cursor--
				}
			}
		case tea.KeyUp:
			if m.Questions[m.Focus].QuestionType == "list" {
				m.updateChoiceFocus("up")
			} else {
				m.updateFocus("up")
			}
		case tea.KeyDown:
			if m.Questions[m.Focus].QuestionType == "list" {
				m.updateChoiceFocus("down")
			} else {
				m.updateFocus("down")
			}
		case tea.KeyPgUp:
			if m.CurrentPage > 1 {
				m.CurrentPage--
				m.Focus = m.PageSize * (m.CurrentPage - 1)
			} else {
				m.CurrentPage = 1
				m.Focus = 0
			}
			m.Cursor = len(m.Questions[m.Focus].Answer)
		case tea.KeyPgDown:
			if m.PageSize*m.CurrentPage < len(m.Questions) {
				m.CurrentPage++
				m.Focus = m.PageSize * (m.CurrentPage - 1)
			}
			m.Cursor = len(m.Questions[m.Focus].Answer)
		case tea.KeyBackspace:
			if m.Questions[m.Focus].ErrorMessage != "" {
				m.Questions[m.Focus].ErrorMessage = ""
			} else {
				if len(m.Questions[m.Focus].Answer) > 0 && m.Cursor > 0 {
					if m.Questions[m.Focus].QuestionType == "list" {
						m.Questions[m.Focus].Answer = ""
						m.Cursor = 0
					} else {
						m.Questions[m.Focus].Answer = m.Questions[m.Focus].Answer[:m.Cursor-1] + m.Questions[m.Focus].Answer[m.Cursor:]
						m.Cursor--
					}
				}
			}
		case tea.KeyDelete:
			if m.Questions[m.Focus].ErrorMessage != "" {
				m.Questions[m.Focus].ErrorMessage = ""
			} else {
				if len(m.Questions[m.Focus].Answer) > 0 && m.Cursor > 0 {
					if m.Questions[m.Focus].QuestionType == "list" {
						m.Questions[m.Focus].Answer = ""
						m.Cursor = 0
					} else {
						if m.Cursor < len(m.Questions[m.Focus].Answer) {
							m.Questions[m.Focus].Answer = m.Questions[m.Focus].Answer[:m.Cursor] + m.Questions[m.Focus].Answer[m.Cursor+1:]
						}
					}
				}
			}
		case tea.KeyCtrlC:
			if err := m.Clipboard.CopyText(m.Questions[m.Focus].Answer); err != nil {
				m.Questions[m.Focus].ErrorMessage = fmt.Sprintf("Failed to copy to clipboard: %v", err)
			}
		case tea.KeyCtrlV:
			pasted, err := m.Clipboard.PasteText()
			if err != nil {
				m.Questions[m.Focus].ErrorMessage = "An error occurred while pasting from the clipboard"
			}
			pasted = strings.TrimSpace(pasted)
			m.Questions[m.Focus].Answer = m.Questions[m.Focus].Answer[:m.Cursor] + pasted + m.Questions[m.Focus].Answer[m.Cursor:]
			m.Cursor += len(pasted)
		default:
			character := msg.String()
			if runtime.GOOS == "windows" {
				character = tools.AltCtrlCharWindows(character)
			}
			lenChar := len(character)
			m.Questions[m.Focus].Answer = m.Questions[m.Focus].Answer[:m.Cursor] + character + m.Questions[m.Focus].Answer[m.Cursor:]
			answer := m.Questions[m.Focus].Answer
			if answer[0] == '[' && answer[len(answer)-1] == ']' {
				m.Questions[m.Focus].Answer = answer[1 : len(answer)-1]
				lenChar = lenChar - 2
			}
			m.Cursor += lenChar
		}
	case runActionMsg:
		actionKey := string(msg)
		response := runAction(actionKey, &m)
		m.Loading = true
		return m, sendMessage(response)
	case submissionResultMsg:
		m.Loading = false
		m.RecievedMsg = string(msg)
		if m.RecievedMsg[:5] != "Error" {
			m.updateFocus("down")
		}
	case platformInitiatedMsg:
		m.Loading = false
		m.RecievedMsg = string(msg)
		if m.RecievedMsg[:5] != "Error" {
			m.Finished = true
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m Model) View() string {
	var output string
	var caret string
	for i := m.PageSize * (m.CurrentPage - 1); i < m.PageSize*m.CurrentPage; i++ {
		if i < len(m.Questions) {
			margin := strings.Repeat(" ", m.Questions[i].Margin)
			marginList := strings.Repeat(" ", m.Questions[i].Margin+4)
			Cursor := " "
			labelCursor := " "
			questionPrompt := m.Questions[i].Prompt + ":"
			if m.Focus == i {
				Cursor = ">"
				labelCursor = ">"
				questionPrompt = style.Render(questionPrompt)
			}
			if m.Questions[i].QuestionType == "generic" || m.Questions[i].QuestionType == "password" {
				var answer string
				var styledAnswer string
				var isDefaultAnswer bool
				var cursorPos = m.Cursor
				if (m.Questions[i].Answer == "" && m.Questions[i].DefaultAnswer != "") || m.Questions[i].Answer == "" {
					answer = m.Questions[i].DefaultAnswer
					isDefaultAnswer = true
					cursorPos = len(m.Questions[i].DefaultAnswer)
					styledAnswer = styleDefaultAnswer.Render(answer)
				} else {
					answer = m.Questions[i].Answer
					isDefaultAnswer = false
					styledAnswer = answer
				}
				if m.Questions[i].QuestionType == "password" {
					answer = strings.Repeat("*", len(answer))
				}
				if m.Focus == i && m.Questions[i].ErrorMessage == "" {
					if cursorPos == len(answer) {
						if m.CursorVisible {
							caret = styleCaret.Render(" ")
						} else {
							caret = ""
						}
						if isDefaultAnswer {
							answer = styledAnswer + caret
						} else {
							answer += caret
						}
					} else {
						var blinkingLetter string
						letter := string(answer[m.Cursor])
						if m.CursorVisible {
							blinkingLetter = styleCaret.Render(letter)
						} else {
							blinkingLetter = letter
						}
						answer = answer[:m.Cursor] + blinkingLetter + answer[m.Cursor+1:]
					}
				} else {
					if isDefaultAnswer {
						answer = styledAnswer
					}
				}
				CursorAndMargin := style.Render(Cursor) + margin
				if m.Questions[i].Margin != 0 {
					CursorAndMargin = margin + style.Render(Cursor)
				}
				output += fmt.Sprintf("%s %s %s %s\n",
					CursorAndMargin,
					questionPrompt,
					answer,
					styleErrMsg.Render(m.Questions[i].ErrorMessage),
				)
			} else if m.Questions[i].QuestionType == "list" {
				CursorAndMargin := style.Render(Cursor) + margin
				if m.Questions[i].Margin != 0 {
					CursorAndMargin = margin + style.Render(Cursor)
				}
				output += fmt.Sprintf("%s %s %s %s\n",
					CursorAndMargin,
					questionPrompt,
					m.Questions[i].Answer,
					styleErrMsg.Render(m.Questions[i].ErrorMessage),
				)
				if m.Focus == i {
					for j, choice := range m.Questions[i].Choices {
						CursorChoice := " "
						if m.Questions[m.Focus].ChoiceFocus == j {
							CursorChoice = "x"
						}
						output += fmt.Sprintf("%s[%s] %s\n", marginList, style.Render(CursorChoice), choice)
					}
				}
			} else if m.Questions[i].QuestionType == "label" {
				questionLabel := m.Questions[i].Key
				labelPrompt := m.Questions[i].Prompt + ":"
				if strings.Contains(m.Questions[m.Focus].Key, questionLabel) {
					labelPrompt = style.Render(labelPrompt)
					if m.Focus == i {
						labelCursor = style.Render(">")
					} else {
						labelCursor = style.Render("*")
					}
				}
				output += fmt.Sprintf("%s%s %s\n", labelCursor, margin, labelPrompt)
			}
		}
	}

	message := ""
	if m.Loading {
		message = m.SubmitMsgMap[m.Questions[m.Focus].ActionKey]
	} else {
		if len(m.RecievedMsg) >= 5 && m.RecievedMsg[:5] == "Error" {
			message = styleErrMsg.Render(m.RecievedMsg)
		} else {
			message = styleOKMsg.Render(m.RecievedMsg)
		}
	}
	output += fmt.Sprintf("\n%s: %s", style.Render("Message"), message)

	if !m.Finished {
		numPages := int(math.Ceil(float64(len(m.Questions)) / float64(m.PageSize)))
		footer := fmt.Sprintf("\nQuestion: %d/%d, Page: %d/%d, Page size: %d, Cursor: %d, Focus: %d",
			m.Focus+1, len(m.Questions),
			m.CurrentPage, numPages,
			m.PageSize,
			m.Cursor,
			m.Focus,
		)
		output += styleSend.Render(footer)
		output += styleSend.Render("\nPress Enter to submit and Ctrl+D or Ctrl+Q to exit.")
		output += styleSend.Render("\nScroll with ↑ ↓ PgUp PgDn. Scale page with Ctrl+↑ Ctrl+↓\n")
	}

	return output
}

func (m *Model) resetMessages(msg string) {
	if msg == "ctrl+right" || msg == "ctrl+left" || msg == "up" || msg == "down" || msg == "pgup" || msg == "pgdown" || msg == "backspace" {
		m.RecievedMsg = ""
		m.Loading = false
	} else if !(msg == "ctrl+c" || msg == "enter") {
		if len(m.Questions[m.Focus].Answer) > 0 {
			m.RecievedMsg = ""
			m.Loading = false
		}
	}
}

func (m *Model) updateFocus(dir string) {
	if dir == "up" {
		if m.Focus > 0 {
			m.Focus--
		}
		if m.Focus < (m.CurrentPage-1)*m.PageSize && m.CurrentPage > 1 {
			m.CurrentPage--
		}
	} else if dir == "down" {
		if m.Focus < len(m.Questions)-1 {
			m.Focus++
		}
		if m.Focus >= m.CurrentPage*m.PageSize && m.CurrentPage*m.PageSize < len(m.Questions) {
			m.CurrentPage++
		}
	}
	m.Cursor = len(m.Questions[m.Focus].Answer)
}

func (m *Model) updateChoiceFocus(dir string) {
	if m.Questions[m.Focus].Answer == "" {
		if dir == "up" {
			if m.Questions[m.Focus].ChoiceFocus > 0 {
				m.Questions[m.Focus].ChoiceFocus--
			} else {
				m.Questions[m.Focus].ChoiceFocus = len(m.Questions[m.Focus].Choices) - 1
			}
		} else if dir == "down" {
			if m.Questions[m.Focus].ChoiceFocus < len(m.Questions[m.Focus].Choices)-1 {
				m.Questions[m.Focus].ChoiceFocus++
			} else {
				m.Questions[m.Focus].ChoiceFocus = 0
			}
		}
	} else {
		m.updateFocus(dir)
	}
}

type runActionMsg string
type submissionResultMsg string
type platformInitiatedMsg string
type tickMsg time.Time

func tick(d time.Duration) tea.Cmd {
	return tea.Tick(d, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

type Message interface{}

func sendMessage[T Message](response T) tea.Cmd {
	return func() tea.Msg {
		return response
	}
}

func runAction(actionKey string, m *Model) tea.Msg {
	switch actionKey {
	case "initPlatform":
		response, _ := initPlatform(m)
		return response
	case "deploymentLocation":
		response, _ := DeployLocationQuestions(m)
		return response
	case "creatingNodeQuestions":
		response, _ := creatingNodeQuestions(m)
		return response
	case "awsKeyQuestions":
		response, _ := awsKeyQuestions(m)
		return response
	case "domainCertsQuestions":
		response, _ := DomainCertsQuestions(m)
		return response
	case "copyKeyInNode":
		response, err := copyKeyInNode(m)
		if err != nil {
			return submissionResultMsg("Error copying key to node: " + err.Error())
		}
		return response
	}
	return nil
}

func (m Model) FindQuestionIdByKey(key string) int {
	for i := range m.Questions {
		if m.Questions[i].Key == key {
			return i
		}
	}
	return -1
}

func (m Model) FindAnswerByKey(key string) string {
	for i := range m.Questions {
		if m.Questions[i].Key == key {
			return m.Questions[i].Answer
		}
	}
	return ""
}

func (m Model) NumNodesQuestions() int {
	numNodes := 0
	for i := range m.Questions {
		if m.Questions[i].Key[:4] == "Node" && m.Questions[i].QuestionType == "label" {
			numNodes++
		}
	}
	return numNodes
}

var style = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("12"))

var styleErrMsg = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("9"))

var styleOKMsg = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("#00FF00"))

var styleSend = lipgloss.NewStyle().
	Foreground(lipgloss.Color("#595757"))

var styleDefaultAnswer = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("#595757"))

var styleCaret = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.NoColor{}).
	Background(lipgloss.Color("#ffffff"))
