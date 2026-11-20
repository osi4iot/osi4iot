package llmusage

import "testing"

func TestGroupLimits(t *testing.T) {
	SetBlockedGroups(nil)
	var told []string
	OnGroupThreshold(func(s GroupStatus, subjects []string) {
		told = append(told, s.Notify+":"+subjects[0])
	})
	defer OnGroupThreshold(nil)
	records := []Record{{GroupID: 7, logSubject: "log.7"}, {GroupID: 8, logSubject: "log.8"}}
	UpdateGroups([]GroupStatus{{GroupID: 7, Blocked: true, Notify: "limit"}, {GroupID: 8, Notify: "warning"}}, records)
	if !GroupBlocked(7) || GroupBlocked(8) {
		t.Fatal("blocked groups")
	}
	if len(told) != 2 || told[0] != "limit:log.7" || told[1] != "warning:log.8" {
		t.Errorf("told %v", told)
	}
	UpdateGroups([]GroupStatus{{GroupID: 7, Blocked: false}}, nil)
	if GroupBlocked(7) {
		t.Error("still blocked")
	}
	SetBlockedGroups([]int{9})
	if !GroupBlocked(9) || GroupBlocked(7) {
		t.Error("set")
	}
	SetBlockedGroups(nil)
}
