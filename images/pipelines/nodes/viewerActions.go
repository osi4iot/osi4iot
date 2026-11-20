package nodes

// Who may act from the viewer on the alarms (acknowledge, shelve, reset) and
// on the requests (approve, reject) of a digital twin: an Editor or an Admin
// of its group (README, "Permissions"). A Viewer sees them, but its presses
// are refused.

import (
	"context"
	"time"

	"pipelines/common"
)

const viewerActionCheckTimeout = 10 * time.Second

// viewerActionRefusal is why a user may not act ("" when it may).
func viewerActionRefusal(ctx context.Context, fm common.Manager, groupId int, user string) string {
	ctx, cancel := context.WithTimeout(ctx, viewerActionCheckTimeout)
	defer cancel()
	ok, err := fm.CanOperateGroup(ctx, groupId, user)
	if err != nil {
		return "your permissions could not be checked now: try again later"
	}
	if !ok {
		return "only the editors and administrators of the group can do it"
	}
	return ""
}
