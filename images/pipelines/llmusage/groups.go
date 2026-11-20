package llmusage

// The monthly token limit of each group (README, "Permissions"): set by the
// administrator of its organization in admin_api. A group that reaches it is
// blocked until the month ends: its nodes do not call the LLM provider (AI
// agents, translations, transcriptions, voices). admin_api says which groups
// are blocked in the answer to each batch of usage (the groups of the batch)
// and when asked for all of them (SetBlockedGroups, every minute), so that a
// blocked group, which consumes nothing any more, is unblocked when the month
// changes or its limit is raised.

import (
	"sync"
)

// GroupStatus is admin_api's answer for each group with a limit of a batch.
type GroupStatus struct {
	GroupID           int    `json:"groupId"`
	OrgID             int    `json:"orgId"`
	Month             string `json:"month"`
	MonthTokens       int64  `json:"monthTokens"`
	MonthlyTokenLimit int64  `json:"monthlyTokenLimit"`
	WarningPercent    int    `json:"warningPercent"`
	Blocked           bool   `json:"blocked"`
	// "warning" or "limit" when this batch crossed a threshold not notified yet this month
	Notify string `json:"notify"`
}

// GroupNotifier tells the users of a group that a threshold of its limit was crossed: logSubjects are the
// pipeline logs of the nodes whose usage is in the batch.
type GroupNotifier func(status GroupStatus, logSubjects []string)

var (
	groupsMu      sync.RWMutex
	blockedGroups = map[int]bool{}
	groupNotifier GroupNotifier
)

// OnGroupThreshold sets who tells the users that a group crossed a threshold.
func OnGroupThreshold(notify GroupNotifier) {
	groupsMu.Lock()
	defer groupsMu.Unlock()
	groupNotifier = notify
}

// GroupBlocked says whether a group reached its monthly token limit.
func GroupBlocked(groupID int) bool {
	groupsMu.RLock()
	defer groupsMu.RUnlock()
	return blockedGroups[groupID]
}

// SetBlockedGroups replaces the blocked groups (all of them, as admin_api says).
func SetBlockedGroups(groupIDs []int) {
	next := make(map[int]bool, len(groupIDs))
	for _, id := range groupIDs {
		next[id] = true
	}
	groupsMu.Lock()
	defer groupsMu.Unlock()
	blockedGroups = next
}

// UpdateGroups takes admin_api's answer for the groups of a batch of records: who is blocked now, and the
// thresholds crossed (told in the pipeline logs of the nodes of the batch of each group).
func UpdateGroups(statuses []GroupStatus, records []Record) {
	groupsMu.Lock()
	for _, s := range statuses {
		if s.Blocked {
			blockedGroups[s.GroupID] = true
		} else {
			delete(blockedGroups, s.GroupID)
		}
	}
	notify := groupNotifier
	groupsMu.Unlock()
	if notify == nil {
		return
	}
	for _, s := range statuses {
		if s.Notify == "" {
			continue
		}
		seen := map[string]bool{}
		var subjects []string
		for _, r := range records {
			if r.GroupID == s.GroupID && r.logSubject != "" && !seen[r.logSubject] {
				seen[r.logSubject] = true
				subjects = append(subjects, r.logSubject)
			}
		}
		notify(s, subjects)
	}
}
