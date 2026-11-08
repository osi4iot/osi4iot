package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"pipelines/common"
	"pipelines/logger"
	"pipelines/message"
	"pipelines/telegram"
	"pipelines/utils"

	"github.com/nats-io/nats.go"
)

// ApprovalNode holds each message until a group administrator approves or
// rejects it, from the viewer or from Telegram (approvalLogic.go). The
// pending requests are in the digital twin's KV (one entry each), so any
// replica can take a decision, and only one decision counts (the entry is
// removed atomically); the leader replica expires them.
type ApprovalNode struct {
	BaseNode
	cfg      *approvalConfig
	state    *signalState
	subject  string // the digital twin's approval topic
	location *time.Location

	botToken     string
	tgListener   *telegram.OrgListener
	tgMessages   chan *telegram.TelegramMessage
	tgUnsubcribe func()
}

func CreateApprovalNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*ApprovalNode, error) {
	n, err := createApprovalNode(node, fm, p)
	if err != nil {
		fm.Log().Errorf("ApprovalNode %s: %v", node.NodeUid, err)
		return nil, fmt.Errorf("approval node: %w", err)
	}
	return n, nil
}

func createApprovalNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*ApprovalNode, error) {
	cfg, err := parseApprovalConfig(node.Settings)
	if err != nil {
		return nil, err
	}
	loc, err := nodeLocation(node.Settings, fm, p)
	if err != nil {
		return nil, err
	}
	n := &ApprovalNode{BaseNode: newSignalBase(node, fm, p, "Approval"), cfg: cfg, location: loc}
	n.state = newSignalState(&n.BaseNode)
	if cfg.usesViewer() {
		topic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), approvalTopicRef)
		if topic == nil {
			return nil, fmt.Errorf("the digital twin has no %q topic (saving the pipeline creates it)", approvalTopicRef)
		}
		n.subject = utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
	}
	if cfg.usesTelegram() {
		org := fm.GetOrg(p.GetOrgId())
		if org == nil || !org.TelegramEnabled || org.TelegramListener == nil || org.TelegramBotToken == "" {
			return nil, fmt.Errorf("Telegram is not enabled for the organization")
		}
		n.botToken, n.tgListener = org.TelegramBotToken, org.TelegramListener
		n.tgMessages = make(chan *telegram.TelegramMessage, 100)
	}
	return n, nil
}

func (n *ApprovalNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if !n.startSignalNode(ctx, log, n.processMessage) {
		return
	}
	if n.cfg.usesViewer() {
		// the copies of the approval topic of all the users: the subject says who decides
		n.wg.Add(1)
		go n.handleNatsSubscription(log, utils.AllUsersChatSubject(n.subject), n.processViewerMessage)
	}
	if n.cfg.usesTelegram() {
		n.tgUnsubcribe = n.tgListener.Subscribe(n.cfg.ChatId, n.tgMessages)
		n.wg.Add(1)
		go n.processTelegram(log)
	}
	n.runLeaderClock(5*time.Second, func(now time.Time) { n.expire(now, log) })
}

func (n *ApprovalNode) Stop(log *logger.Logger) {
	if n.tgUnsubcribe != nil {
		n.tgUnsubcribe()
		n.tgUnsubcribe = nil
	}
	n.BaseNode.Stop(log)
}

// processMessage makes a request of a message of the flow.
func (n *ApprovalNode) processMessage(msg common.Message, log *logger.Logger) error {
	now := time.Now()
	req := n.cfg.newRequest(msg.GetTopic(), msg.GetPayload(), msg.GetState(), now)
	keys, err := n.state.keys(n.Ctx)
	if err != nil {
		return fmt.Errorf("approval requests: %w", err)
	}
	if len(keys) >= approvalMaxPending {
		comment := fmt.Sprintf("more than %d requests pending", approvalMaxPending)
		payload := req.decisionPayload("rejected", "", "", comment, now)
		n.recordApproval(req, "rejected", "", "node", comment, now)
		n.sendToOutput(emitMessage(msg, msg.GetTopic(), payload), approvalOutputRejected, log)
		n.HandleInfo(fmt.Sprintf("Request rejected: %d requests are pending", len(keys)))
		return nil
	}
	if n.cfg.usesTelegram() {
		req.TelegramChatId = n.cfg.ChatId
		id, err := telegram.SendTelegramMessageWithID(n.botToken, n.cfg.ChatId, req.telegramText("", "", now, n.location),
			telegram.WithInlineKeyboard([][]telegram.InlineKeyboardButton{{
				{Text: "✅ Approve", CallbackData: approvalCallback(n.NodeUid, req.Id, true)},
				{Text: "❌ Reject", CallbackData: approvalCallback(n.NodeUid, req.Id, false)},
			}}))
		if err != nil {
			n.HandleError(fmt.Errorf("sending the request to Telegram: %w", err))
		}
		req.TelegramMessageId = id
	}
	err = modifyState(n.Ctx, n.state, n.state.key(req.Id), func(*approvalRequest) (*approvalRequest, error) {
		return req, nil
	})
	if err != nil {
		return fmt.Errorf("storing the approval request: %w", err)
	}
	n.recordApproval(req, "requested", "", "", "", now)
	n.sendToOutput(emitMessage(msg, msg.GetTopic(), req.notification(n.cfg.Channel)), approvalOutputRequests, log)
	return nil
}

// take removes a pending request (nil if there is none: decided or
// expired); with onlyExpired, only if it has expired at now.
func (n *ApprovalNode) take(id string, onlyExpired bool, now time.Time) (*approvalRequest, error) {
	var taken *approvalRequest
	err := modifyState(n.Ctx, n.state, n.state.key(id), func(current *approvalRequest) (*approvalRequest, error) {
		taken = nil
		if current == nil || (onlyExpired && !current.expired(now)) {
			return current, nil
		}
		taken = current
		return nil, nil
	})
	return taken, err
}

// decide approves or rejects a request: false when it was not pending.
func (n *ApprovalNode) decide(id string, approve bool, by, via, comment string, log *logger.Logger) (bool, error) {
	now := time.Now()
	req, err := n.take(id, false, now)
	if err != nil || req == nil {
		return false, err
	}
	if req.expired(now) {
		n.finish(req, "expired", "", "", "", now, log)
		return false, nil
	}
	decision := "rejected"
	if approve {
		decision = "approved"
	}
	n.finish(req, decision, by, via, comment, now, log)
	return true, nil
}

// finish sends the original message to the output of the decision and
// shows it in Telegram.
func (n *ApprovalNode) finish(req *approvalRequest, decision, by, via, comment string, at time.Time, log *logger.Logger) {
	output := map[string]int{"approved": approvalOutputApproved, "rejected": approvalOutputRejected, "expired": approvalOutputExpired}[decision]
	n.recordApproval(req, decision, by, via, comment, at)
	out := message.NewMessage(req.Topic, req.decisionPayload(decision, by, via, comment, at), req.State, "", nil)
	n.sendToOutput(out, output, log)
	if req.TelegramMessageId != 0 && n.botToken != "" {
		if err := telegram.EditTelegramMessageText(n.botToken, req.TelegramChatId, req.TelegramMessageId, req.telegramText(decision, by, at, n.location)); err != nil {
			log.Warnf("ApprovalNode %s: showing the decision in Telegram: %v", n.NodeUid, err)
		}
	}
	if by != "" {
		n.HandleInfo(fmt.Sprintf("Request %s %s by %s (%s)", req.Id, decision, by, via))
	} else {
		n.HandleInfo(fmt.Sprintf("Request %s %s", req.Id, decision))
	}
}

// pending lists the pending requests, oldest first.
func (n *ApprovalNode) pending() ([]*approvalRequest, error) {
	keys, err := n.state.keys(n.Ctx)
	if err != nil {
		return nil, err
	}
	var out []*approvalRequest
	for _, key := range keys {
		var req *approvalRequest
		err := modifyState(n.Ctx, n.state, key, func(current *approvalRequest) (*approvalRequest, error) {
			req = current
			return current, nil
		})
		if err != nil {
			return nil, err
		}
		if req != nil {
			out = append(out, req)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Created < out[j].Created })
	return out, nil
}

// expire is the leader's clock: the requests past their timeout.
func (n *ApprovalNode) expire(now time.Time, log *logger.Logger) {
	if n.cfg.Timeout <= 0 {
		return
	}
	requests, err := n.pending()
	if err != nil {
		log.Warnf("ApprovalNode %s: listing the requests: %v", n.NodeUid, err)
		return
	}
	for _, r := range requests {
		if !r.expired(now) {
			continue
		}
		req, err := n.take(r.Id, true, now)
		if err != nil {
			log.Warnf("ApprovalNode %s: %v", n.NodeUid, err)
			continue
		}
		if req != nil {
			n.finish(req, "expired", "", "", "", now, log)
		}
	}
}

// processViewerMessage takes a press of the viewer's button: the user is in
// the subject (its own copy of the approval topic), and only the presses
// addressed to this node count. The answer goes to the request's reply.
func (n *ApprovalNode) processViewerMessage(msg *nats.Msg, log *logger.Logger) error {
	if msg.Header == nil || msg.Header.Get(approvalNodeHeader) != n.NodeUid {
		return nil
	}
	reply := func(answer map[string]any) {
		if msg.Reply == "" {
			return
		}
		b, _ := json.Marshal(answer)
		if err := msg.Respond(b); err != nil {
			log.Warnf("ApprovalNode %s: answering the viewer: %v", n.NodeUid, err)
		}
	}
	user, ok := utils.UserOfChatSubject(msg.Subject, n.subject)
	if !ok {
		return nil
	}
	var request approvalViewerRequest
	if err := json.Unmarshal(msg.Data, &request); err != nil {
		reply(map[string]any{"ok": false, "error": "invalid request"})
		return nil
	}
	switch request.Action {
	case "list":
		requests, err := n.pending()
		if err != nil {
			reply(map[string]any{"ok": false, "error": err.Error()})
			return err
		}
		list := make([]map[string]any, 0, len(requests))
		for _, r := range requests {
			list = append(list, r.summary())
		}
		reply(map[string]any{"ok": true, "requests": list})
	case "approve", "reject":
		decided, err := n.decide(request.RequestId, request.Action == "approve", user, "viewer", request.Comment, log)
		switch {
		case err != nil:
			reply(map[string]any{"ok": false, "error": err.Error()})
			return err
		case !decided:
			reply(map[string]any{"ok": false, "error": "the request is no longer pending (decided or expired)"})
		default:
			reply(map[string]any{"ok": true})
		}
	default:
		reply(map[string]any{"ok": false, "error": "unknown action"})
	}
	return nil
}

// processTelegram takes the presses of the request buttons in the chat.
func (n *ApprovalNode) processTelegram(log *logger.Logger) {
	defer n.wg.Done()
	for {
		select {
		case <-n.Ctx.Done():
			return
		case msg, ok := <-n.tgMessages:
			if !ok {
				return
			}
			if msg.Type != telegram.MessageTypeCallback {
				continue
			}
			id, approve, ok := parseApprovalCallback(msg.CallbackData, n.NodeUid)
			if !ok {
				continue
			}
			answer := n.telegramDecision(id, approve, msg, log)
			if err := telegram.AnswerCallbackQuery(n.botToken, msg.CallbackQueryID, answer); err != nil {
				log.Warnf("ApprovalNode %s: answering Telegram: %v", n.NodeUid, err)
			}
		}
	}
}

func (n *ApprovalNode) telegramDecision(id string, approve bool, msg *telegram.TelegramMessage, log *logger.Logger) string {
	ctx, cancel := context.WithTimeout(n.Ctx, 15*time.Second)
	defer cancel()
	user, err := n.Fm.GetTelegramApprover(ctx, n.GetGroupId(), msg.UserID)
	if err != nil {
		log.Warnf("ApprovalNode %s: checking the Telegram user %d: %v", n.NodeUid, msg.UserID, err)
		return "The decision could not be checked now: try again later"
	}
	if user == "" {
		return "Only group administrators with a Telegram account linked in their profile can decide"
	}
	decided, err := n.decide(id, approve, user, "telegram", "", log)
	switch {
	case err != nil:
		n.HandleError(err)
		return "The decision could not be saved: try again"
	case !decided:
		return "This request is no longer pending"
	case approve:
		return "Approved"
	default:
		return "Rejected"
	}
}
