package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"slices"
	"sync"
	"time"
)

type TriggerNode struct {
	BaseNode
	SendMode                   string // "wait_for", "resend_every", "wait_to_be_reset"
	FirstMessageType           string // "Timestamp", "first_message", "JSON", "nothing"
	FirstMessagePayload        map[string]interface{}
	SecondMessageType          string // "Timestamp", "first_message", "latest_message", "JSON", "nothing"
	SecondMessagePayload       map[string]interface{}
	Delay                      int    // Delay in milliseconds
	ResendInterval             int    // Resend interval in milliseconds (for resend_every mode)
	ExtendDelay                bool   // Extend delay if new message arrives
	OverrideDelay              bool   // Allow msg.delay to override delay setting
	SeparateOutput             bool   // Send second message to separate output
	ResetTriggerOption         string // Payload value that will reset the trigger
	CustomPayloadFieldForReset string // Custom payload field to identify reset messages
	HandleMessagesBy           string // "strem_name" or "all"

	// Leadership and high availability
	isCurrentlyLeader   bool
	leadershipMutex     sync.RWMutex
	periodicCheckCancel context.CancelFunc
	localTimers         map[string]*localTimerState
	localTimerMutex     sync.RWMutex
}

// localTimerState mantiene el estado local de timers para wait_for mode
type localTimerState struct {
	timer  *time.Timer
	cancel context.CancelFunc
}

// TriggerState representa el estado persistente de un trigger en KV store
// Note: Mode is not stored here because all instances share the same configuration
type TriggerState struct {
	StreamKey       string                 `json:"stream_key"`
	OriginalPayload map[string]interface{} `json:"original_payload"`
	OriginalTopic   string                 `json:"original_topic"`
	FirstPayload    map[string]interface{} `json:"first_payload"`  // Store first message payload
	LatestPayload   map[string]interface{} `json:"latest_payload"` // Store latest message payload
	StartTime       time.Time              `json:"start_time"`
	LastSentTime    time.Time              `json:"last_sent_time"`
	DelayMs         int                    `json:"delay_ms"`
	IsWaitingReset  bool                   `json:"is_waiting_reset"`
	SecondMsgSent   bool                   `json:"second_msg_sent"`
}

func CreateTriggerNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*TriggerNode, error) {
	// Validate SendMode
	sendMode, ok := node.Settings["sendMode"].(string)
	if !ok || sendMode == "" {
		sendMode = "wait_for" // default
	}
	validModes := []string{"wait_for", "resend_every", "wait_to_be_reset"}
	if !slices.Contains(validModes, sendMode) {
		fm.Log().Errorf("TriggerNode %s: invalid sendMode '%s'", node.NodeUid, sendMode)
		return nil, fmt.Errorf("invalid sendMode: %s", sendMode)
	}

	// Validate FirstMessage
	firstMessageType, ok := node.Settings["firstMessageType"].(string)
	if !ok || firstMessageType == "" {
		firstMessageType = "first_message" // default
	}
	validFirstMessageTypes := []string{"Timestamp", "first_message", "JSON", "nothing"}
	if !slices.Contains(validFirstMessageTypes, firstMessageType) {
		fm.Log().Errorf("TriggerNode %s: invalid firstMessageType '%s'", node.NodeUid, firstMessageType)
		return nil, fmt.Errorf("invalid firstMessageType: %s", firstMessageType)
	}

	firstMessagePayload := map[string]interface{}{}
	if firstMessageType == "JSON" {
		if err := json.Unmarshal([]byte(node.Settings["firstMessagePayload"].(string)), &firstMessagePayload); err != nil {
			fm.Log().Errorf("TriggerNode %s: failed to unmarshal firstMessagePayload: %w", node.NodeUid, err)
			return nil, fmt.Errorf("failed to unmarshal firstMessagePayload: %w", err)
		}
	}

	// Validate SecondMessage and related settings
	secondMessageType := "nothing"
	validSecondMessageTypes := []string{"Timestamp", "first_message", "latest_message", "JSON", "nothing"}
	secondMessagePayload := map[string]interface{}{}
	var delay int

	if sendMode == "wait_for" {
		secondMessageType, ok = node.Settings["secondMessageType"].(string)
		if !ok || secondMessageType == "" {
			secondMessageType = "first_message" // default
		}
		if !slices.Contains(validSecondMessageTypes, secondMessageType) {
			fm.Log().Errorf("TriggerNode %s: invalid secondMessageType '%s'", node.NodeUid, secondMessageType)
			return nil, fmt.Errorf("invalid secondMessageType: %s", secondMessageType)
		}

		if secondMessageType == "JSON" {
			if err := json.Unmarshal([]byte(node.Settings["secondMessagePayload"].(string)), &secondMessagePayload); err != nil {
				fm.Log().Errorf("TriggerNode %s: failed to unmarshal secondMessagePayload: %w", node.NodeUid, err)
				return nil, fmt.Errorf("failed to unmarshal secondMessagePayload: %w", err)
			}
		}

		delayFloat, ok := node.Settings["delay"].(float64)
		delay = int(delayFloat * 1000) // Convert seconds to milliseconds
		if !ok || delay <= 0 {
			fm.Log().Errorf("TriggerNode %s: 'delay' setting is required and must be positive", node.NodeUid)
			return nil, fmt.Errorf("delay setting is required and must be positive")
		}
	}

	// Validate ResendInterval for resend_every mode
	var resendInterval int
	if sendMode == "resend_every" {
		resendIntervalFloat, ok := node.Settings["resendInterval"].(float64)
		resendInterval = int(resendIntervalFloat * 1000) // Convert seconds to milliseconds
		if !ok || resendInterval <= 0 {
			fm.Log().Errorf("TriggerNode %s: 'resendInterval' setting is required for resend_every mode", node.NodeUid)
			return nil, fmt.Errorf("resendInterval setting is required for resend_every mode")
		}
	}

	// Other settings
	extendDelay := false
	if val, ok := node.Settings["extendDelay"].(bool); ok {
		extendDelay = val
	}

	separateOutput := false
	if val, ok := node.Settings["separateOutput"].(bool); ok {
		separateOutput = val
	}

	validResetTriggerOptions := []string{"msg.payload.reset", "optional msg.payload field"}
	resetTriggerOption := ""
	if val, ok := node.Settings["resetTriggerOption"].(string); ok {
		resetTriggerOption = val
	}
	if resetTriggerOption != "" && !slices.Contains(validResetTriggerOptions, resetTriggerOption) {
		fm.Log().Errorf("TriggerNode %s: invalid resetTriggerOption '%s'", node.NodeUid, resetTriggerOption)
		return nil, fmt.Errorf("invalid resetTriggerOption: %s", resetTriggerOption)
	}

	customPayloadFieldForReset := ""
	if resetTriggerOption == "optional msg.payload field" {
		if val, ok := node.Settings["customPayloadFieldForReset"].(string); ok && val != "" {
			customPayloadFieldForReset = val
		}
	}

	handleMessagesBy := "all"
	if val, ok := node.Settings["handleMessagesBy"].(string); ok {
		handleMessagesBy = val
	}
	validHandleTypes := []string{"stream_name", "all"}
	if !slices.Contains(validHandleTypes, handleMessagesBy) {
		fm.Log().Errorf("TriggerNode %s: invalid handleMessagesBy '%s'", node.NodeUid, handleMessagesBy)
		return nil, fmt.Errorf("invalid handleMessagesBy: %s", handleMessagesBy)
	}

	overrideDelay := false
	if val, ok := node.Settings["overrideDelay"].(bool); ok {
		overrideDelay = val
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())

	numOutputs := 1
	if separateOutput && sendMode == "wait_for" && secondMessageType != "nothing" {
		numOutputs = 2
	}

	return &TriggerNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: numOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "Trigger",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     cancel,
			Ctx:        ctx,
			status:     common.NodeStatusCreated,
		},
		SendMode:                   sendMode,
		FirstMessageType:           firstMessageType,
		FirstMessagePayload:        firstMessagePayload,
		SecondMessageType:          secondMessageType,
		SecondMessagePayload:       secondMessagePayload,
		Delay:                      delay,
		ResendInterval:             resendInterval,
		ExtendDelay:                extendDelay,
		SeparateOutput:             separateOutput,
		ResetTriggerOption:         resetTriggerOption,
		CustomPayloadFieldForReset: customPayloadFieldForReset,
		HandleMessagesBy:           handleMessagesBy,
		OverrideDelay:              overrideDelay,
		isCurrentlyLeader:          false,
		localTimers:                make(map[string]*localTimerState),
	}, nil
}

func (n *TriggerNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("TriggerNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting TriggerNode with UID: %s", n.NodeUid)

	// Initialize leadership status
	n.leadershipMutex.Lock()
	n.isCurrentlyLeader = n.IsLeader()
	n.leadershipMutex.Unlock()

	// Start input message processing
	n.handleInputWires(log, n.processMessage)

	// Start leadership monitoring and periodic tasks
	n.wg.Add(1)
	go n.monitorLeadershipChanges(log)

	// Start periodic tasks if leader
	if n.isCurrentlyLeader && n.SendMode != "wait_to_be_reset" {
		n.startPeriodicCheck(log)
	}
}

func (n *TriggerNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		log.Infof("TriggerNode %s is already stopped", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusStopped)
	log.Infof("Stopping TriggerNode with UID: %s", n.NodeUid)

	// Cancel context
	if n.Cancel != nil {
		n.Cancel()
	}

	n.stopPeriodicCheck()
	n.wg.Wait()

	n.ResetNodeContext()

	// Clean up all local timers
	n.localTimerMutex.Lock()
	for streamKey, localState := range n.localTimers {
		n.cleanupLocalTimer(localState)
		delete(n.localTimers, streamKey)
	}
	n.localTimerMutex.Unlock()

	// Delete all trigger states from KV store
	err := n.deleteAllStreamStates()
	if err != nil {
		log.Errorf("TriggerNode %s: Failed to delete all trigger states: %v", n.NodeUid, err)
	}

}

func (n *TriggerNode) monitorLeadershipChanges(log *logger.Logger) {
	defer n.wg.Done()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			wasLeader := n.isCurrentLeader()
			isLeaderNow := n.IsLeader()

			if wasLeader != isLeaderNow {
				n.leadershipMutex.Lock()
				n.isCurrentlyLeader = isLeaderNow
				n.leadershipMutex.Unlock()

				if isLeaderNow {
					log.Infof("TriggerNode %s: Became leader, starting periodic checks", n.NodeUid)
					n.startPeriodicCheck(log)
				} else {
					log.Infof("TriggerNode %s: Lost leadership, stopping periodic checks", n.NodeUid)
					n.stopPeriodicCheck()
				}
			}
		case <-n.Ctx.Done():
			log.Infof("TriggerNode %s: Leadership monitoring stopped", n.NodeUid)
			return
		}
	}
}

func (n *TriggerNode) startPeriodicCheck(log *logger.Logger) {
    ctx, cancel := context.WithCancel(n.Ctx)
    n.periodicCheckCancel = cancel

    switch n.SendMode {
    case "wait_for":
        // Solo recuperar timers, no necesita polling
        n.recoverPendingTimers(log)
        return
        
    case "resend_every":
        // Iniciar polling solo para resend_every
        n.wg.Add(1)
        go n.runResendEveryLoop(ctx, log)
        
    case "wait_to_be_reset":
        // No necesita nada
        return
    }
}

func (n *TriggerNode) runResendEveryLoop(ctx context.Context, log *logger.Logger) {
    defer n.wg.Done()

    checkInterval := time.Duration(n.ResendInterval/10) * time.Millisecond
    if checkInterval < 100*time.Millisecond {
        checkInterval = 100 * time.Millisecond
    }

    ticker := time.NewTicker(checkInterval)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            if n.isCurrentLeader() {
                n.checkAllResendEveryTriggers(log)
            }
        case <-ctx.Done():
            return
        }
    }
}

func (n *TriggerNode) checkAllResendEveryTriggers(log *logger.Logger) {
    kvStore, err := n.GetDigitalTwinKvStore(n.GetDigitalTwinId())
    if err != nil {
        return
    }

    keys, err := kvStore.ListKeys(context.Background(), n.getTriggerKvStorePrefix())
    if err != nil {
        return
    }

    now := time.Now()
    for _, key := range keys {
        state, err := n.getTriggerStateByKey(key)
        if err != nil || state == nil {
            continue
        }
        n.checkResendEveryTrigger(state, now, log)
    }
}

func (n *TriggerNode) stopPeriodicCheck() {
	n.leadershipMutex.Lock()
	defer n.leadershipMutex.Unlock()

	if n.periodicCheckCancel != nil {
		n.periodicCheckCancel()
		n.periodicCheckCancel = nil
	}
}

func (n *TriggerNode) checkResendEveryTrigger(state *TriggerState, now time.Time, log *logger.Logger) {
	// Verify state still exists (could have been reset)
	if state == nil {
		return
	}

	// Use the state's DelayMs (which may have been overridden) if available
	// Otherwise fall back to the node's ResendInterval
	interval := n.ResendInterval
	if state.DelayMs > 0 {
		interval = state.DelayMs
	}

	timeSinceLastSend := now.Sub(state.LastSentTime)
	if timeSinceLastSend >= time.Duration(interval)*time.Millisecond {
		msg := common.Message{
			Payload: state.OriginalPayload,
			Topic:   state.OriginalTopic,
		}
		n.sendToOutputs(msg, log)

		state.LastSentTime = now
		if err := n.saveTriggerState(state.StreamKey, state); err != nil {
			log.Errorf("TriggerNode %s: Failed to update last sent time: %v", n.NodeUid, err)
		}
	}
}

func (n *TriggerNode) recoverPendingTimers(log *logger.Logger) {
    kvStore, err := n.GetDigitalTwinKvStore(n.GetDigitalTwinId())
    if err != nil {
        log.Errorf("TriggerNode %s: Failed to get KV store for recovery: %v", n.NodeUid, err)
        return
    }

    prefix := n.getTriggerKvStorePrefix()
    keys, err := kvStore.ListKeys(context.Background(), prefix)
    if err != nil {
        log.Errorf("TriggerNode %s: Failed to list keys for recovery: %v", n.NodeUid, err)
        return
    }

    for _, key := range keys {
        state, err := n.getTriggerStateByKey(key)
        if err != nil || state == nil || state.SecondMsgSent {
            continue
        }

        elapsed := time.Since(state.StartTime)
        remaining := time.Duration(state.DelayMs)*time.Millisecond - elapsed

        if remaining > 0 {
            // Timer aún no ha expirado, iniciar localTimer
            log.Infof("TriggerNode %s: Recovering timer for stream %s, %v remaining", 
                n.NodeUid, state.StreamKey, remaining)
            n.startLocalTimer(state.StreamKey, state, log)
        } else {
            // ⭐ NUEVO: Timer ya expiró, enviar mensaje inmediatamente
            log.Infof("TriggerNode %s: Timer already expired for stream %s, sending now", 
                n.NodeUid, state.StreamKey)
            
            msg := common.Message{
                Payload: state.OriginalPayload,
                Topic:   state.OriginalTopic,
            }
            n.sendSecondMessage(msg, log)
            
            // Limpiar estado
            if err := n.deleteTriggerState(state.StreamKey); err != nil {
                log.Errorf("TriggerNode %s: Failed to delete expired trigger: %v", n.NodeUid, err)
            }
        }
    }
}

func (n *TriggerNode) processMessage(msg common.Message, log *logger.Logger) error {
	// Get stream key first (needed for reset as well)
	streamKey := n.getStreamKey(msg)

	// Check if this is a reset message
	if n.isResetMessage(msg) {
		log.Infof("TriggerNode %s: Reset message received for stream %s", n.NodeUid, streamKey)
		return n.resetTrigger(msg, log)
	}

	// Get current delay (may be overridden by msg.delay)
	delay := n.Delay
	if n.OverrideDelay {
		if msgDelay, ok := msg.Payload["delay"].(float64); ok && msgDelay > 0 {
			delay = int(msgDelay * 1000) // Convert seconds to milliseconds
		}
	}

	switch n.SendMode {
	case "wait_for":
		n.handleWaitForMode(msg, streamKey, delay, log)
	case "resend_every":
		n.handleResendEveryMode(msg, streamKey, log)
	case "wait_to_be_reset":
		n.handleWaitToBeResetMode(msg, streamKey, log)
	}
	return nil
}

func (n *TriggerNode) handleWaitForMode(msg common.Message, streamKey string, delay int, log *logger.Logger) {
	state, err := n.getTriggerState(streamKey)
	if err != nil {
		log.Errorf("TriggerNode %s: Failed to get trigger state: %v", n.NodeUid, err)
		return
	}

	if state != nil {
		// Existing trigger
		if n.ExtendDelay {
			// Update the state with new message and reset timer
			state.LatestPayload = utils.DeepCopyPayload(msg.Payload)
			state.StartTime = time.Now()
			state.DelayMs = delay

			if err := n.saveTriggerState(streamKey, state); err != nil {
				log.Errorf("TriggerNode %s: Failed to update trigger state: %v", n.NodeUid, err)
				return
			}

			// Restart local timer
			n.localTimerMutex.Lock()
			if localState, exists := n.localTimers[streamKey]; exists {
				n.cleanupLocalTimer(localState)
			}
			n.localTimerMutex.Unlock()
			n.startLocalTimer(streamKey, state, log)

			log.Infof("TriggerNode %s: Extended delay for stream %s", n.NodeUid, streamKey)
		} else {
			// Update latest message but don't reset timer
			state.LatestPayload = utils.DeepCopyPayload(msg.Payload)
			if err := n.saveTriggerState(streamKey, state); err != nil {
				log.Errorf("TriggerNode %s: Failed to update latest payload: %v", n.NodeUid, err)
			}
			log.Infof("TriggerNode %s: Ignoring message, trigger already active for stream %s", n.NodeUid, streamKey)
		}
		return
	}

	// New trigger - send first message
	n.sendFirstMessage(msg, log)

	// Create new state if second message is needed
	if n.SecondMessageType != "nothing" {
		newState := &TriggerState{
			StreamKey:       streamKey,
			OriginalPayload: utils.DeepCopyPayload(msg.Payload),
			OriginalTopic:   msg.Topic,
			FirstPayload:    utils.DeepCopyPayload(msg.Payload), // Store first message
			LatestPayload:   utils.DeepCopyPayload(msg.Payload),
			StartTime:       time.Now(),
			DelayMs:         delay,
			SecondMsgSent:   false,
		}

		if err := n.saveTriggerState(streamKey, newState); err != nil {
			log.Errorf("TriggerNode %s: Failed to save trigger state: %v", n.NodeUid, err)
			return
		}

		// Start local timer for this trigger
		n.startLocalTimer(streamKey, newState, log)
	}
}

func (n *TriggerNode) handleResendEveryMode(msg common.Message, streamKey string, log *logger.Logger) {
	state, err := n.getTriggerState(streamKey)
	if err != nil {
		log.Errorf("TriggerNode %s: Failed to get trigger state: %v", n.NodeUid, err)
		return
	}

	// Get current resend interval (may be overridden by msg.delay)
	resendInterval := n.ResendInterval
	if n.OverrideDelay {
		if msgDelay, ok := msg.Payload["delay"].(float64); ok && msgDelay > 0 {
			resendInterval = int(msgDelay * 1000) // Convert seconds to milliseconds
			log.Infof("TriggerNode %s: Overriding resend interval to %d ms for stream %s", n.NodeUid, resendInterval, streamKey)
		}
	}

	if state != nil {
		// Update the message payload
		state.OriginalPayload = utils.DeepCopyPayload(msg.Payload)
		state.LatestPayload = utils.DeepCopyPayload(msg.Payload)

		// Update delay if overridden
		if n.OverrideDelay && resendInterval != n.ResendInterval {
			state.DelayMs = resendInterval
			log.Infof("TriggerNode %s: Updated resend interval in state to %d ms for stream %s", n.NodeUid, resendInterval, streamKey)
		}

		if err := n.saveTriggerState(streamKey, state); err != nil {
			log.Errorf("TriggerNode %s: Failed to update trigger state: %v", n.NodeUid, err)
		}
		return
	}

	// New trigger - send first message and create state
	n.sendFirstMessage(msg, log)

	newState := &TriggerState{
		StreamKey:       streamKey,
		OriginalPayload: utils.DeepCopyPayload(msg.Payload),
		OriginalTopic:   msg.Topic,
		FirstPayload:    utils.DeepCopyPayload(msg.Payload), // Store first message
		LatestPayload:   utils.DeepCopyPayload(msg.Payload),
		StartTime:       time.Now(),
		LastSentTime:    time.Now(),
		DelayMs:         resendInterval,
		IsWaitingReset:  false,
	}

	if err := n.saveTriggerState(streamKey, newState); err != nil {
		log.Errorf("TriggerNode %s: Failed to save trigger state: %v", n.NodeUid, err)
	}
}

func (n *TriggerNode) handleWaitToBeResetMode(msg common.Message, streamKey string, log *logger.Logger) {
	state, err := n.getTriggerState(streamKey)
	if err != nil {
		log.Errorf("TriggerNode %s: Failed to get trigger state: %v", n.NodeUid, err)
		return
	}

	if state != nil && state.IsWaitingReset {
		// Already waiting for reset, ignore new messages
		log.Infof("TriggerNode %s: Ignoring message, waiting for reset on stream %s", n.NodeUid, streamKey)
		return
	}

	// Send first message and enter waiting state
	n.sendFirstMessage(msg, log)

	newState := &TriggerState{
		StreamKey:       streamKey,
		OriginalPayload: utils.DeepCopyPayload(msg.Payload),
		OriginalTopic:   msg.Topic,
		FirstPayload:    utils.DeepCopyPayload(msg.Payload), // Store first message
		LatestPayload:   utils.DeepCopyPayload(msg.Payload),
		StartTime:       time.Now(),
		IsWaitingReset:  true,
	}

	if err := n.saveTriggerState(streamKey, newState); err != nil {
		log.Errorf("TriggerNode %s: Failed to save trigger state: %v", n.NodeUid, err)
	}
}

func (n *TriggerNode) startLocalTimer(streamKey string, state *TriggerState, log *logger.Logger) {
	// Clean up any existing timer for this stream
	n.localTimerMutex.Lock()
	if existingState, exists := n.localTimers[streamKey]; exists {
		n.cleanupLocalTimer(existingState)
	}
	n.localTimerMutex.Unlock()

	// Calculate remaining time
	elapsed := time.Since(state.StartTime)
	remaining := time.Duration(state.DelayMs)*time.Millisecond - elapsed
	if remaining <= 0 {
		remaining = 1 * time.Millisecond
	}

	timer := time.NewTimer(remaining)
	ctx, cancel := context.WithCancel(n.Ctx)

	localState := &localTimerState{
		timer:  timer,
		cancel: cancel,
	}

	n.localTimerMutex.Lock()
	n.localTimers[streamKey] = localState
	n.localTimerMutex.Unlock()

	n.wg.Add(1)
	go func() {
		defer n.wg.Done()
		select {
		case <-timer.C:
			// Limpiar el timer local
			n.localTimerMutex.Lock()
			delete(n.localTimers, streamKey)
			n.localTimerMutex.Unlock()

			// Verificar que el estado aún existe (podría haber sido reseteado)
			currentState, err := n.getTriggerState(streamKey)
			if err != nil || currentState == nil || currentState.SecondMsgSent {
				log.Infof("TriggerNode %s: State already processed or reset for stream %s", n.NodeUid, streamKey)
				return
			}

			// Construir mensaje y enviar segundo mensaje
			msg := common.Message{
				Payload: currentState.OriginalPayload,
				Topic:   currentState.OriginalTopic,
			}
			n.sendSecondMessage(msg, log)

			// Marcar como enviado y eliminar estado
			currentState.SecondMsgSent = true
			if err := n.saveTriggerState(streamKey, currentState); err != nil {
				log.Errorf("TriggerNode %s: Failed to update trigger state: %v", n.NodeUid, err)
			}
			if err := n.deleteTriggerState(streamKey); err != nil {
				log.Errorf("TriggerNode %s: Failed to delete completed trigger: %v", n.NodeUid, err)
			}

		case <-ctx.Done():
			log.Infof("TriggerNode %s: Local timer cancelled for stream %s", n.NodeUid, streamKey)
		}
	}()
}

func (n *TriggerNode) cleanupLocalTimer(state *localTimerState) {
	if state.timer != nil {
		state.timer.Stop()
	}
	if state.cancel != nil {
		state.cancel()
	}
}

// KV Store operations
func (n *TriggerNode) getTriggerKvStorePrefix() string {
	return fmt.Sprintf("org_%s.dt_%s.trigger_%s", n.GetOrgHash(), n.GetDigitalTwinUid(), n.NodeUid)
}

func (n *TriggerNode) getTriggerKvStoreKey(streamKey string) string {
	return fmt.Sprintf("%s.%s", n.getTriggerKvStorePrefix(), streamKey)
}

func (n *TriggerNode) getTriggerState(streamKey string) (*TriggerState, error) {
	kvKey := n.getTriggerKvStoreKey(streamKey)
	return n.getTriggerStateByKey(kvKey)
}

func (n *TriggerNode) getTriggerStateByKey(kvKey string) (*TriggerState, error) {
	kvStore, err := n.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if err != nil {
		return nil, err
	}

	stateData, err := kvStore.GetObjectValue(context.Background(), kvKey)
	if err != nil {
		if err.Error() == fmt.Sprintf("key %s not found", kvKey) {
			return nil, nil // Key doesn't exist
		}
		return nil, err
	}

	// Parse the state
	state := &TriggerState{}

	if streamKey, ok := stateData["stream_key"].(string); ok {
		state.StreamKey = streamKey
	}

	if originalPayload, ok := stateData["original_payload"].(map[string]interface{}); ok {
		state.OriginalPayload = originalPayload
	}

	if originalTopic, ok := stateData["original_topic"].(string); ok {
		state.OriginalTopic = originalTopic
	}

	if firstPayload, ok := stateData["first_payload"].(map[string]interface{}); ok {
		state.FirstPayload = firstPayload
	}

	if latestPayload, ok := stateData["latest_payload"].(map[string]interface{}); ok {
		state.LatestPayload = latestPayload
	}

	if startTimeStr, ok := stateData["start_time"].(string); ok {
		if startTime, err := time.Parse(time.RFC3339, startTimeStr); err == nil {
			state.StartTime = startTime
		}
	}

	if lastSentTimeStr, ok := stateData["last_sent_time"].(string); ok {
		if lastSentTime, err := time.Parse(time.RFC3339, lastSentTimeStr); err == nil {
			state.LastSentTime = lastSentTime
		}
	}

	if delayMs, ok := stateData["delay_ms"].(float64); ok {
		state.DelayMs = int(delayMs)
	}

	if isWaitingReset, ok := stateData["is_waiting_reset"].(bool); ok {
		state.IsWaitingReset = isWaitingReset
	}

	if secondMsgSent, ok := stateData["second_msg_sent"].(bool); ok {
		state.SecondMsgSent = secondMsgSent
	}

	return state, nil
}

func (n *TriggerNode) saveTriggerState(streamKey string, state *TriggerState) error {
	kvStore, err := n.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if err != nil {
		return err
	}

	kvKey := n.getTriggerKvStoreKey(streamKey)
	return kvStore.SetValue(context.Background(), kvKey, state)
}

func (n *TriggerNode) deleteTriggerState(streamKey string) error {
	kvStore, err := n.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if err != nil {
		return err
	}

	kvKey := n.getTriggerKvStoreKey(streamKey)

	return kvStore.DeleteEntry(context.Background(), kvKey)
}

func (n *TriggerNode) deleteAllStreamStates() error {
	kvStore, err := n.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if err != nil {
		return err
	}

	prefix := n.getTriggerKvStorePrefix()
	keys, err := kvStore.ListKeys(context.Background(), prefix)
	if err != nil {
		return err
	}

	for _, key := range keys {
		if err := kvStore.DeleteEntry(context.Background(), key); err != nil {
			return err
		}
	}

	return nil
}

// Message sending with improved type support
func (n *TriggerNode) sendFirstMessage(msg common.Message, log *logger.Logger) {
	outputMsg := n.buildMessage(msg, n.FirstMessageType, n.FirstMessagePayload, true, "")
	if outputMsg != nil {
		n.sendToOutputs(*outputMsg, log)
	}
}

func (n *TriggerNode) sendSecondMessage(msg common.Message, log *logger.Logger) {
	streamKey := n.getStreamKey(msg)
	outputMsg := n.buildMessage(msg, n.SecondMessageType, n.SecondMessagePayload, false, streamKey)
	if outputMsg != nil {
		// If separate output is enabled, send to second output
		if n.SeparateOutput {
			n.sendToSpecificOutput(*outputMsg, 1, log)
		} else {
			n.sendToOutputs(*outputMsg, log)
		}
	}
}

// buildMessage constructs the message based on the message type
func (n *TriggerNode) buildMessage(
	originalMsg common.Message,
	msgType string,
	customPayload map[string]interface{},
	isFirst bool,
	streamKey string,
) *common.Message {
	switch msgType {
	case "nothing":
		return nil

	case "Timestamp":
		return &common.Message{
			Payload: map[string]interface{}{
				"timestamp": time.Now().UnixMilli(),
			},
			Topic: originalMsg.Topic,
		}

	case "first_message":
		var payload map[string]interface{}
		if isFirst {
			// For first message, use current message
			payload = utils.DeepCopyPayload(originalMsg.Payload)
		} else {
			// For second message, get from state
			state, err := n.getTriggerState(streamKey)
			if err == nil && state != nil && state.FirstPayload != nil {
				payload = utils.DeepCopyPayload(state.FirstPayload)
			} else {
				payload = utils.DeepCopyPayload(originalMsg.Payload)
			}
		}
		return &common.Message{
			Payload: payload,
			Topic:   originalMsg.Topic,
		}

	case "latest_message":
		// Only valid for second message
		if !isFirst {
			state, err := n.getTriggerState(streamKey)
			if err == nil && state != nil && state.LatestPayload != nil {
				return &common.Message{
					Payload: utils.DeepCopyPayload(state.LatestPayload),
					Topic:   originalMsg.Topic,
				}
			}
			return &common.Message{
				Payload: utils.DeepCopyPayload(originalMsg.Payload),
				Topic:   originalMsg.Topic,
			}
		}
		return nil

	case "JSON":
		return &common.Message{
			Payload: utils.DeepCopyPayload(customPayload),
			Topic:   originalMsg.Topic,
		}

	default:
		// Fallback to original message
		return &common.Message{
			Payload: utils.DeepCopyPayload(originalMsg.Payload),
			Topic:   originalMsg.Topic,
		}
	}
}

func (n *TriggerNode) sendToSpecificOutput(msg common.Message, outputIndex int, log *logger.Logger) {
	nodeOutputWires := n.GetNodeOutputWires()
	if outputIndex >= len(nodeOutputWires) {
		log.Warnf("TriggerNode %s: Output index %d does not exist", n.NodeUid, outputIndex)
		return
	}

	wireArray := nodeOutputWires[outputIndex]
	for idx, wire := range wireArray {
		select {
		case wire.Channel <- msg:
			if n.Debug == "on" && idx == 0 {
				n.HandleDebug(msg, outputIndex)
			}
		case <-n.Ctx.Done():
			log.Infof("Context cancelled while sending message from node %s", n.NodeUid)
			return
		default:
			log.Warnf("Output channel full for node %s, dropping message", n.NodeUid)
		}
	}
}

// Reset handling
func (n *TriggerNode) isResetMessage(msg common.Message) bool {
	switch n.ResetTriggerOption {
	case "msg.payload.reset":
		// Check for reset property in payload
		if reset, ok := msg.Payload["reset"].(bool); ok && reset {
			return true
		}
		return false

	case "optional msg.payload field":
		// Check if payload matches resetPayload string
		if n.CustomPayloadFieldForReset != "" {
			if reset, ok := msg.Payload[n.CustomPayloadFieldForReset].(bool); ok && reset {
				return true
			}
		}
		return false

	default:
		return false
	}
}

func (n *TriggerNode) resetTrigger(msg common.Message, log *logger.Logger) error {
	streamKey := n.getStreamKey(msg)

	// Delete from KV store
	// IMPORTANT: For resend_every mode, this stops periodic sending because
	// periodicCheck() only processes states that exist in the KV store
	if err := n.deleteTriggerState(streamKey); err != nil {
		log.Errorf("TriggerNode %s: Failed to delete trigger state: %v", n.NodeUid, err)
		return err
	}

	// Clean up local timer if exists (only relevant for wait_for mode)
	n.localTimerMutex.Lock()
	if localState, exists := n.localTimers[streamKey]; exists {
		n.cleanupLocalTimer(localState)
		delete(n.localTimers, streamKey)
	}
	n.localTimerMutex.Unlock()

	log.Infof("TriggerNode %s: Trigger reset for stream %s (mode: %s)", n.NodeUid, streamKey, n.SendMode)
	return nil
}

// Helper methods
func (n *TriggerNode) getStreamKey(msg common.Message) string {
	switch n.HandleMessagesBy {
	case "all":
		return "all"
	case "stream_name":
		if value, exists := msg.Payload["stream"]; exists {
			if streamValue, ok := value.(string); ok {
				return streamValue
			}
		}
	}

	// If property not found, fall back to "all"
	return "all"
}

func (n *TriggerNode) isCurrentLeader() bool {
	n.leadershipMutex.RLock()
	defer n.leadershipMutex.RUnlock()
	return n.isCurrentlyLeader
}
