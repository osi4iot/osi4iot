package llmusage

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"pipelines/logger"
)

// The kinds of operation (admin_api's llm_usage.source).
const (
	SourceAIAgent      = "ai_agent"
	SourceTranslator   = "translator"
	SourceTranscriptor = "transcriptor"
	SourceText2Speech  = "text2speech"
)

// Attribution says whose usage it is.
type Attribution struct {
	OrgID          int
	GroupID        int
	DigitalTwinID  int
	DigitalTwinUID string
	NodeUID        string
	NodeName       string
	NodeType       string
	UserName       string
	Source         string
	ProviderType   string
	// LogSubject is the pipeline log of the node: where the token limit notices are published
	LogSubject string
}

// Record is one operation, as admin_api stores it.
type Record struct {
	Time           time.Time `json:"time"`
	OrgID          int       `json:"orgId"`
	GroupID        int       `json:"groupId,omitempty"`
	DigitalTwinID  int       `json:"digitalTwinId,omitempty"`
	DigitalTwinUID string    `json:"digitalTwinUid,omitempty"`
	NodeUID        string    `json:"nodeUid,omitempty"`
	NodeName       string    `json:"nodeName,omitempty"`
	NodeType       string    `json:"nodeType,omitempty"`
	UserName       string    `json:"userName,omitempty"`
	Source         string    `json:"source"`
	ProviderType   string    `json:"providerType,omitempty"`
	Usage
	logSubject string
}

// OrgStatus is admin_api's answer for each organization of a batch.
type OrgStatus struct {
	OrgID             int    `json:"orgId"`
	Month             string `json:"month"`
	MonthTokens       int64  `json:"monthTokens"`
	MonthlyTokenLimit int64  `json:"monthlyTokenLimit"`
	WarningPercent    int    `json:"warningPercent"`
	// "warning" or "limit" when this batch crossed a threshold not notified yet this month
	Notify string `json:"notify"`
}

// Poster sends records to admin_api.
type Poster func(ctx context.Context, records []Record) ([]OrgStatus, error)

// Notifier tells the users of an organization that a threshold was crossed: logSubjects are the pipeline
// logs of the nodes whose usage is in the batch.
type Notifier func(status OrgStatus, logSubjects []string)

const (
	maxPending   = 20000
	maxPerPost   = 1000
	postTimeout  = 20 * time.Second
	finalTimeout = 5 * time.Second
)

// Meter keeps the records until they are sent, every interval.
type Meter struct {
	mu      sync.Mutex
	pending []Record
	post    Poster
	notify  Notifier
	log     *logger.Logger
	dropped int
	flushMu sync.Mutex
}

var current atomic.Pointer[Meter]

// Start creates the process's meter and sends its records every interval until ctx ends (then once more).
func Start(ctx context.Context, post Poster, notify Notifier, interval time.Duration, log *logger.Logger) *Meter {
	m := &Meter{post: post, notify: notify, log: log}
	current.Store(m)
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				final, cancel := context.WithTimeout(context.Background(), finalTimeout)
				m.Flush(final)
				cancel()
				return
			case <-ticker.C:
				m.Flush(ctx)
			}
		}
	}()
	return m
}

// Add records an operation in the process's meter. Nothing when there is no meter or nothing was consumed.
func Add(a Attribution, u Usage) {
	if m := current.Load(); m != nil {
		m.Add(a, u)
	}
}

// Add keeps an operation until the next flush.
func (m *Meter) Add(a Attribution, u Usage) {
	if u.Empty() || a.OrgID <= 0 {
		return
	}
	r := Record{
		Time:           time.Now().UTC(),
		OrgID:          a.OrgID,
		GroupID:        a.GroupID,
		DigitalTwinID:  a.DigitalTwinID,
		DigitalTwinUID: a.DigitalTwinUID,
		NodeUID:        a.NodeUID,
		NodeName:       a.NodeName,
		NodeType:       a.NodeType,
		UserName:       a.UserName,
		Source:         a.Source,
		ProviderType:   a.ProviderType,
		Usage:          u,
		logSubject:     a.LogSubject,
	}
	if r.Requests == 0 {
		r.Requests = 1
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.pending) >= maxPending {
		// admin_api unreachable for long: the oldest records go
		m.pending = m.pending[1:]
		m.dropped++
	}
	m.pending = append(m.pending, r)
}

// Flush sends the pending records. Those that could not be sent are kept for the next flush.
func (m *Meter) Flush(ctx context.Context) {
	m.flushMu.Lock()
	defer m.flushMu.Unlock()

	m.mu.Lock()
	batch := m.pending
	m.pending = nil
	dropped := m.dropped
	m.dropped = 0
	m.mu.Unlock()
	if dropped > 0 && m.log != nil {
		m.log.Errorf("LLM usage: %d records were dropped (admin_api did not take them for too long)", dropped)
	}

	for start := 0; start < len(batch); start += maxPerPost {
		end := start + maxPerPost
		if end > len(batch) {
			end = len(batch)
		}
		chunk := batch[start:end]
		postCtx, cancel := context.WithTimeout(ctx, postTimeout)
		statuses, err := m.post(postCtx, chunk)
		cancel()
		if err != nil {
			if m.log != nil {
				m.log.Errorf("LLM usage: %d records could not be sent to admin_api (they will be sent later): %v", len(batch)-start, err)
			}
			m.requeue(batch[start:])
			return
		}
		m.notifyCrossed(statuses, chunk)
	}
}

func (m *Meter) requeue(records []Record) {
	m.mu.Lock()
	defer m.mu.Unlock()
	merged := append(append(make([]Record, 0, len(records)+len(m.pending)), records...), m.pending...)
	if over := len(merged) - maxPending; over > 0 {
		merged = merged[over:]
		m.dropped += over
	}
	m.pending = merged
}

func (m *Meter) notifyCrossed(statuses []OrgStatus, records []Record) {
	if m.notify == nil {
		return
	}
	for _, status := range statuses {
		if status.Notify == "" {
			continue
		}
		seen := map[string]bool{}
		subjects := []string{}
		for _, r := range records {
			if r.OrgID == status.OrgID && r.logSubject != "" && !seen[r.logSubject] {
				seen[r.logSubject] = true
				subjects = append(subjects, r.logSubject)
			}
		}
		m.notify(status, subjects)
	}
}
