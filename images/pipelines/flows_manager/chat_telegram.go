package flows_manager

// The Telegram channel of the viewer's chat assistant (nodes/chatChannels.go): when a digital twin's chat has a
// Telegram chat (chatTelegramChatId), its text messages and voice notes go to the chat as questions of the
// platform user linked to the sender's Telegram account (/link <code>, from the user's profile), who must be
// able to use the group's chat. The answer of the AI agent comes to the user's inbox (llm2sim), where the
// viewers show it, and goes back to the Telegram chat as text.
//
// The organization's bot (its OrgListener) reads the messages: only the leader replica polls Telegram, so only
// one replica handles each message.

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"pipelines/common"
	"pipelines/nodes"
	"pipelines/telegram"
	"pipelines/utils"

	"github.com/nats-io/nats.go"
)

// how long an answer is waited for to send it to Telegram
const chatTelegramAnswerWait = 5 * time.Minute

type chatTelegramPending struct {
	chatId int64
	at     time.Time
}

type chatTelegramChannel struct {
	digitalTwinId int
	chatId        int64
	botToken      string
	llm2sim       string
	unsubscribe   func()
	cancel        context.CancelFunc

	mu      sync.Mutex
	pending map[string]chatTelegramPending // by user
	inboxes map[string]*nats.Subscription  // the inbox (llm2sim) of each user that asked
}

// the Telegram channel of each digital twin (by id)
var chatTelegramChannels sync.Map

// SyncChatTelegramChannel starts, changes or stops the Telegram channel of a digital twin as its settings say
func (fm *FlowsManager) SyncChatTelegramChannel(ctx context.Context, dt *common.DigitalTwin) {
	if dt == nil {
		return
	}
	var chatId int64
	if dt.ChatAssistantEnabled && strings.TrimSpace(dt.ChatTelegramChatId) != "" {
		id, err := strconv.ParseInt(strings.TrimSpace(dt.ChatTelegramChatId), 10, 64)
		if err != nil {
			fm.log.Warnf("Digital twin %d: invalid Telegram chat id %q for the chat", dt.Id, dt.ChatTelegramChatId)
		} else {
			chatId = id
		}
	}
	if entry, ok := chatTelegramChannels.Load(dt.Id); ok {
		if entry.(*chatTelegramChannel).chatId == chatId {
			return
		}
		fm.StopChatTelegramChannel(dt.Id)
	}
	if chatId == 0 {
		return
	}
	org := fm.GetOrg(dt.OrgId)
	if org == nil || !org.TelegramEnabled || org.TelegramListener == nil || org.TelegramBotToken == "" {
		fm.log.Warnf("Digital twin %d: its chat has the Telegram chat %d, but Telegram is not enabled for organization %d",
			dt.Id, chatId, dt.OrgId)
		return
	}
	llm2sim := ""
	if topic := fm.GetTopicByTopicRef(dt.AssetId, dt.Id, "llm2sim"); topic != nil {
		llm2sim = utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
	}
	if llm2sim == "" {
		fm.log.Warnf("Digital twin %d: no llm2sim topic, the chat cannot answer in Telegram", dt.Id)
		return
	}
	channelCtx, cancel := context.WithCancel(ctx)
	messages := make(chan *telegram.TelegramMessage, 50)
	channel := &chatTelegramChannel{
		digitalTwinId: dt.Id,
		chatId:        chatId,
		botToken:      org.TelegramBotToken,
		llm2sim:       llm2sim,
		unsubscribe:   org.TelegramListener.Subscribe(chatId, messages),
		cancel:        cancel,
		pending:       map[string]chatTelegramPending{},
		inboxes:       map[string]*nats.Subscription{},
	}
	chatTelegramChannels.Store(dt.Id, channel)
	go func() {
		for {
			select {
			case <-channelCtx.Done():
				return
			case msg, ok := <-messages:
				if !ok {
					return
				}
				fm.handleChatTelegramMessage(channelCtx, channel, msg)
			}
		}
	}()
	fm.log.Infof("Digital twin %d: the messages of the Telegram chat %d go to its chat", dt.Id, chatId)
}

// StopChatTelegramChannel stops the Telegram channel of a digital twin
func (fm *FlowsManager) StopChatTelegramChannel(digitalTwinId int) {
	entry, ok := chatTelegramChannels.LoadAndDelete(digitalTwinId)
	if !ok {
		return
	}
	channel := entry.(*chatTelegramChannel)
	channel.unsubscribe()
	channel.cancel()
	channel.mu.Lock()
	for _, sub := range channel.inboxes {
		_ = sub.Unsubscribe()
	}
	channel.inboxes = map[string]*nats.Subscription{}
	channel.mu.Unlock()
	fm.log.Infof("Digital twin %d: the Telegram chat %d no longer goes to its chat", digitalTwinId, channel.chatId)
}

func (fm *FlowsManager) chatTelegramReply(channel *chatTelegramChannel, text string, htmlText bool) {
	var opts []telegram.MessageOption
	if htmlText {
		opts = append(opts, telegram.WithParseMode(telegram.ParseModeHTML))
	}
	if err := telegram.SendTelegramMessage(channel.botToken, channel.chatId, text, fm.log, opts...); err != nil {
		fm.log.Errorf("Digital twin %d: answering in the Telegram chat %d: %v", channel.digitalTwinId, channel.chatId, err)
	}
}

func (fm *FlowsManager) handleChatTelegramMessage(ctx context.Context, channel *chatTelegramChannel, msg *telegram.TelegramMessage) {
	dt := fm.GetDigitalTwin(channel.digitalTwinId)
	if dt == nil || !dt.ChatAssistantEnabled || msg == nil || msg.UserID == 0 {
		return
	}
	text := strings.TrimSpace(msg.Text)
	if msg.Type == telegram.MessageTypeText && strings.HasPrefix(text, "/") {
		command, _, _ := strings.Cut(strings.Fields(text + " ")[0], "@")
		if command == "/start" || command == "/help" || command == "/chat" {
			fm.chatTelegramReply(channel, fmt.Sprintf("Write or send a voice note: it goes to the chat assistant of "+
				"the digital twin %q, and its answer comes back here. First link your Telegram account: send "+
				"/link followed by the code shown in your profile of the platform.", dt.Description), false)
		}
		return // other commands are for the nodes of the pipeline (TelegramListen)
	}
	if msg.Type != telegram.MessageTypeText && msg.Type != telegram.MessageTypeVoice && msg.Type != telegram.MessageTypeAudio {
		return
	}

	lookupCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if fm.Admin == nil {
		return
	}
	userName, err := fm.Admin.GetTelegramGroupMember(lookupCtx, dt.GroupId, msg.UserID)
	if err != nil {
		fm.log.Errorf("Digital twin %d: who is the Telegram user %d: %v", dt.Id, msg.UserID, err)
		fm.chatTelegramReply(channel, "The message could not be sent to the chat now: try again later.", false)
		return
	}
	if userName == "" {
		fm.chatTelegramReply(channel, "Your Telegram account is not linked to a user of this group. Get a code in "+
			"your profile of the platform and send /link followed by the code.", false)
		return
	}

	switch msg.Type {
	case telegram.MessageTypeVoice, telegram.MessageTypeAudio:
		fileId, mime := "", "audio/ogg"
		if msg.Voice != nil {
			fileId = msg.Voice.FileID
			if msg.Voice.MimeType != "" {
				mime = msg.Voice.MimeType
			}
		} else if msg.Audio != nil {
			fileId = msg.Audio.FileID
			if msg.Audio.MimeType != "" {
				mime = msg.Audio.MimeType
			}
		}
		if fileId == "" {
			return
		}
		audio, _, err := telegram.DownloadFile(channel.botToken, fileId)
		if err != nil {
			fm.log.Errorf("Digital twin %d: voice note of %s not downloaded: %v", dt.Id, userName, err)
			fm.chatTelegramReply(channel, "The voice note could not be read.", false)
			return
		}
		text, err = nodes.TranscribeChatAudio(ctx, fm, dt, userName, audio, mime, "")
		if err != nil {
			fm.log.Errorf("Digital twin %d: voice note of %s not transcribed: %v", dt.Id, userName, err)
			fm.chatTelegramReply(channel, "The voice note could not be transcribed.", false)
			return
		}
		if text == "" {
			fm.chatTelegramReply(channel, "The voice note was not understood.", false)
			return
		}
		// what was understood, before the answer
		fm.chatTelegramReply(channel, "🎤 "+text, false)
	}
	if text == "" {
		return
	}

	if err := fm.chatTelegramWaitAnswer(channel, userName); err != nil {
		fm.log.Errorf("Digital twin %d: the answer for %s would not reach Telegram: %v", dt.Id, userName, err)
	}
	if err := nodes.AskChatAsUser(fm, dt, userName, text, "telegram"); err != nil {
		fm.log.Errorf("Digital twin %d: the Telegram message of %s not sent to the chat: %v", dt.Id, userName, err)
		fm.chatTelegramReply(channel, "The message could not be sent to the chat.", false)
		return
	}
	fm.log.Infof("Digital twin %d: Telegram message of %s sent to the chat", dt.Id, userName)
}

// chatTelegramWaitAnswer waits for the next answer of the AI agent to the user (in the user's inbox) to send it
// to Telegram
func (fm *FlowsManager) chatTelegramWaitAnswer(channel *chatTelegramChannel, userName string) error {
	channel.mu.Lock()
	defer channel.mu.Unlock()
	channel.pending[userName] = chatTelegramPending{chatId: channel.chatId, at: time.Now()}
	if _, ok := channel.inboxes[userName]; ok {
		return nil
	}
	sub, err := fm.NatsSubscribe(utils.UserInboxSubject(userName, channel.llm2sim), func(m *nats.Msg) {
		var answer nodes.ChatInboxMessage
		if err := json.Unmarshal(m.Data, &answer); err != nil || !answer.IsAnswer() {
			return
		}
		channel.mu.Lock()
		pending, ok := channel.pending[userName]
		if ok {
			delete(channel.pending, userName)
		}
		channel.mu.Unlock()
		if !ok || time.Since(pending.at) > chatTelegramAnswerWait {
			return
		}
		fm.chatTelegramReply(channel, nodes.TelegramAnswerText(answer), true)
	})
	if err != nil {
		delete(channel.pending, userName)
		return err
	}
	channel.inboxes[userName] = sub
	return nil
}
