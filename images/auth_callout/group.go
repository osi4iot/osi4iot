package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/nats-io/jwt/v2"
)

type Group struct {
	ID                            int64       `json:"id"`
	OrgID                         int64       `json:"org_id"`
	TeamID                        int64       `json:"team_id"`
	FolderID                      int64       `json:"folder_id"`
	FolderUID                     string      `json:"folder_uid"`
	Name                          string      `json:"name"`
	Acronym                       string      `json:"acronym"`
	GroupUID                      string      `json:"group_uid"`
	TelegramInvitationLink        string      `json:"telegram_invitation_link"`
	TelegramChatID                string      `json:"telegram_chatid"`
	EmailNotificationChannelID    int64       `json:"email_notification_channel_id"`
	TelegramNotificationChannelID int64       `json:"telegram_notification_channel_id"`
	IsOrgDefaultGroup             bool        `json:"is_org_default_group"`
	FloorNumber                   int         `json:"floor_number"`
	FeatureIndex                  int         `json:"feature_index"`
	OuterBounds                   [][]float64 `json:"outer_bounds"`
	MQTTAccessControl             string      `json:"mqtt_access_control"`
	OrgMQTTAccessControl          string      `json:"org_mqtt_access_control"`
	Created                       time.Time   `json:"created"`
	Updated                       time.Time   `json:"updated"`
}

// groupSelectColumns are the columns of a group, in the order of the Scans of this file. Most columns of
// grafanadb.group may be NULL (the Telegram fields and notification channels, the folder, the access control,
// the dates...), and pgx cannot scan NULL into a string, an int64, a bool or a time.Time: one group with a NULL
// made the whole query fail, and the user got no permissions. COALESCE gives the zero value instead.
const groupSelectColumns = `grafanadb.group.id,
	COALESCE(grafanadb.group.org_id, 0), COALESCE(grafanadb.group.team_id, 0), COALESCE(grafanadb.group.folder_id, 0),
	COALESCE(grafanadb.group.folder_uid, ''), COALESCE(grafanadb.group.name, ''), COALESCE(grafanadb.group.acronym, ''),
	COALESCE(grafanadb.group.group_uid, ''),
	COALESCE(grafanadb.group.telegram_invitation_link, ''), COALESCE(grafanadb.group.telegram_chatid, ''),
	COALESCE(grafanadb.group.email_notification_channel_id, 0),
	COALESCE(grafanadb.group.telegram_notification_channel_id, 0),
	COALESCE(grafanadb.group.is_org_default_group, false),
	COALESCE(grafanadb.group.floor_number, 0), COALESCE(grafanadb.group.feature_index, 0),
	grafanadb.group.outer_bounds,
	COALESCE(grafanadb.group.mqtt_access_control, 'None'),
	COALESCE(grafanadb.org.mqtt_access_control, 'None') AS org_mqtt_access_control,
	COALESCE(grafanadb.group.created, to_timestamp(0)), COALESCE(grafanadb.group.updated, to_timestamp(0))`

// AssetStateSubjects is where pipelines says that the state of an asset of
// the group changed (the Viewer's "Asset state" panel reads it again at
// once). Every member may subscribe; only pipelines publishes there, so it
// is not one of the topic types (topicTypeArray), which members may also
// publish to.
func AssetStateSubjects(groupUID string) string {
	return "assetstate.Group_" + groupUID + ".*"
}

// PipelineLogSubjects are the pipeline logs of the group's digital twins (dtmlog): only its editors and
// administrators read them (README, "Permissions"), so a Viewer gets them in its Sub.Deny (Deny wins over the
// Allow of the group's topics). They tell how the pipelines work inside, the nodes' errors and what the AI
// agents answered to other users.
func PipelineLogSubjects(groupUID string) string {
	return "dtmlog.Group_" + groupUID + ".*"
}

func (g *Group) GroupPermissions(authModel *AuthModel) jwt.Permissions {
	groupHash := "Group_" + g.GroupUID
	defaultSubjectArray := []string{}
	for _, topicType := range topicTypeArray {
		topic := topicType + "." + groupHash + ".*"
		defaultSubjectArray = append(defaultSubjectArray, topic)
	}
	defaultSubjectArray = append(defaultSubjectArray, "test."+groupHash)

	var pubSubjetArray []string = []string{}
	if (g.MQTTAccessControl == "Pub & Sub" || g.MQTTAccessControl == "Pub") && (g.OrgMQTTAccessControl == "Pub & Sub" || g.OrgMQTTAccessControl == "Pub") {
		pubSubjetArray = append(pubSubjetArray, defaultSubjectArray...)
	}

	var subSubjectArray []string = []string{}
	if (g.MQTTAccessControl == "Pub & Sub" || g.MQTTAccessControl == "Sub") && (g.OrgMQTTAccessControl == "Pub & Sub" || g.OrgMQTTAccessControl == "Sub") {
		subSubjectArray = append(subSubjectArray, defaultSubjectArray...)
		subSubjectArray = append(subSubjectArray, AssetStateSubjects(g.GroupUID))
	}

	var respPermission *jwt.ResponsePermission = &jwt.ResponsePermission{}
	if g.MQTTAccessControl != "None" {
		respPermission = &jwt.ResponsePermission{
			MaxMsgs: 1,
		}
	}

	groupServices, err := authModel.GetServicesByGroupID(g.ID)
	if err != nil {
		slog.Error("Error getting group services", "error", err)
	}

	if len(groupServices) != 0 {
		for _, svc := range groupServices {
			svcHash := "svc_" + svc.SvcHash
			svcPupSubject := svcHash + ".*"
			pubSubjetArray = append(pubSubjetArray, svcPupSubject)
		}
		subSubjectArray = append(subSubjectArray, "_INBOX.>")
	}

	denyPub := []string{}
	denySub := []string{}
	groupTopics, err := authModel.GetDenyTopicsByGroupId([]int64{g.ID})
	if err != nil {
		slog.Error("Error getting group topics", "error", err)
	}

	for _, topic := range groupTopics {
		topicString := topic.TopicType + "." + groupHash + "." + "Topic_" + topic.TopicUID
		if topic.MQTTAccessControl == "None" || topic.MQTTAccessControl == "Sub" {
			denyPub = append(denyPub, topicString)
		}
		if topic.MQTTAccessControl == "None" || topic.MQTTAccessControl == "Pub" {
			denySub = append(denySub, topicString)
		}
	}

	permissions := jwt.Permissions{
		Pub: jwt.Permission{
			Allow: pubSubjetArray,
			Deny:  denyPub,
		},

		Sub: jwt.Permission{
			Allow: subSubjectArray,
			Deny:  denySub,
		},
		Resp: respPermission,
	}

	return permissions
}

func (m *AuthModel) GetGroupByID(id int64) (*Group, error) {
	var group Group
	queryString := `SELECT ` + groupSelectColumns + `
	FROM grafanadb.group
	INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
	WHERE grafanadb.group.id = $1`
	err := m.db.QueryRow(context.Background(), queryString, id).
		Scan(&group.ID,
			&group.OrgID,
			&group.TeamID,
			&group.FolderID,
			&group.FolderUID,
			&group.Name,
			&group.Acronym,
			&group.GroupUID,
			&group.TelegramInvitationLink,
			&group.TelegramChatID,
			&group.EmailNotificationChannelID,
			&group.TelegramNotificationChannelID,
			&group.IsOrgDefaultGroup,
			&group.FloorNumber,
			&group.FeatureIndex,
			&group.OuterBounds,
			&group.MQTTAccessControl,
			&group.OrgMQTTAccessControl,
			&group.Created,
			&group.Updated,
		)
	if err != nil {
		return nil, err
	}
	return &group, nil
}

func (m *AuthModel) GetGroupByUID(groupUid string) (*Group, error) {
	var group Group
	queryString := `SELECT ` + groupSelectColumns + `
	FROM grafanadb.group
	INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
	WHERE grafanadb.group.group_uid = $1`
	err := m.db.QueryRow(context.Background(), queryString, groupUid).
		Scan(&group.ID,
			&group.OrgID,
			&group.TeamID,
			&group.FolderID,
			&group.FolderUID,
			&group.Name,
			&group.Acronym,
			&group.GroupUID,
			&group.TelegramInvitationLink,
			&group.TelegramChatID,
			&group.EmailNotificationChannelID,
			&group.TelegramNotificationChannelID,
			&group.IsOrgDefaultGroup,
			&group.FloorNumber,
			&group.FeatureIndex,
			&group.OuterBounds,
			&group.MQTTAccessControl,
			&group.OrgMQTTAccessControl,
			&group.Created,
			&group.Updated,
		)
	if err != nil {
		return nil, err
	}
	return &group, nil
}

func (m *AuthModel) GetAllGroups() ([]Group, error) {
	var groups []Group
	queryString := `SELECT ` + groupSelectColumns + `
	FROM grafanadb.group
	INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id`
	rows, err := m.db.Query(context.Background(), queryString)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var group Group
		err := rows.Scan(&group.ID,
			&group.OrgID,
			&group.TeamID,
			&group.FolderID,
			&group.FolderUID,
			&group.Name,
			&group.Acronym,
			&group.GroupUID,
			&group.TelegramInvitationLink,
			&group.TelegramChatID,
			&group.EmailNotificationChannelID,
			&group.TelegramNotificationChannelID,
			&group.IsOrgDefaultGroup,
			&group.FloorNumber,
			&group.FeatureIndex,
			&group.OuterBounds,
			&group.MQTTAccessControl,
			&group.OrgMQTTAccessControl,
			&group.Created,
			&group.Updated)
		if err != nil {
			return nil, err
		}
		groups = append(groups, group)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return groups, nil
}

func (m *AuthModel) GetGroupByNatsNKey(natsNKey string) (*Group, error) {
	var group Group
	queryString := `SELECT ` + groupSelectColumns + `
	FROM grafanadb.group
	INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
	WHERE grafanadb.group.nats_nkey = $1`
	err := m.db.QueryRow(context.Background(), queryString, natsNKey).
		Scan(&group.ID,
			&group.OrgID,
			&group.TeamID,
			&group.FolderID,
			&group.FolderUID,
			&group.Name,
			&group.Acronym,
			&group.GroupUID,
			&group.TelegramInvitationLink,
			&group.TelegramChatID,
			&group.EmailNotificationChannelID,
			&group.TelegramNotificationChannelID,
			&group.IsOrgDefaultGroup,
			&group.FloorNumber,
			&group.FeatureIndex,
			&group.OuterBounds,
			&group.MQTTAccessControl,
			&group.OrgMQTTAccessControl,
			&group.Created,
			&group.Updated,
		)
	if err != nil {
		return nil, err
	}
	return &group, nil
}

func (m *AuthModel) GetGroupsByOrgId(orgId int64) ([]Group, error) {
	var groups []Group
	queryString := `SELECT ` + groupSelectColumns + `
	FROM grafanadb.group
	INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
	WHERE grafanadb.group.org_id = $1`
	rows, err := m.db.Query(context.Background(), queryString, orgId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var group Group
		err := rows.Scan(&group.ID,
			&group.OrgID,
			&group.TeamID,
			&group.FolderID,
			&group.FolderUID,
			&group.Name,
			&group.Acronym,
			&group.GroupUID,
			&group.TelegramInvitationLink,
			&group.TelegramChatID,
			&group.EmailNotificationChannelID,
			&group.TelegramNotificationChannelID,
			&group.IsOrgDefaultGroup,
			&group.FloorNumber,
			&group.FeatureIndex,
			&group.OuterBounds,
			&group.MQTTAccessControl,
			&group.OrgMQTTAccessControl,
			&group.Created,
			&group.Updated)
		if err != nil {
			return nil, err
		}
		groups = append(groups, group)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return groups, nil
}

func (m *AuthModel) GetSQLGroupsManagedByUser(user *User) ([]Group, error) {
	return m.getSQLGroupsOfMember(user, []int{4})
}

// GetSQLGroupsOfMemberWithRole are the groups where the user is a member with
// one of these team permissions (1 Viewer, 2 Editor, 4 Admin)
func (m *AuthModel) GetSQLGroupsOfMemberWithRole(user *User, permissions []int) ([]Group, error) {
	return m.getSQLGroupsOfMember(user, permissions)
}

func (m *AuthModel) getSQLGroupsOfMember(user *User, permissions []int) ([]Group, error) {
	var groups []Group
	queryString := `SELECT ` + groupSelectColumns + `
	FROM grafanadb.group
	INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
	INNER JOIN grafanadb.team_member ON grafanadb.team_member.team_id = grafanadb.group.team_id
	WHERE grafanadb.team_member.user_id = $1 AND grafanadb.team_member.permission = ANY($2::int[])`
	rows, err := m.db.Query(context.Background(), queryString, user.ID, permissions)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var group Group
		err := rows.Scan(&group.ID,
			&group.OrgID,
			&group.TeamID,
			&group.FolderID,
			&group.FolderUID,
			&group.Name,
			&group.Acronym,
			&group.GroupUID,
			&group.TelegramInvitationLink,
			&group.TelegramChatID,
			&group.EmailNotificationChannelID,
			&group.TelegramNotificationChannelID,
			&group.IsOrgDefaultGroup,
			&group.FloorNumber,
			&group.FeatureIndex,
			&group.OuterBounds,
			&group.MQTTAccessControl,
			&group.OrgMQTTAccessControl,
			&group.Created,
			&group.Updated)
		if err != nil {
			return nil, err
		}
		groups = append(groups, group)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return groups, nil
}

func (m *AuthModel) GetGroupsManagedByUser(user *User) ([]Group, error) {
	var groups []Group
	var err error
	if user.IsGrafanaAdmin {
		groups, err = m.GetAllGroups()
		if err != nil {
			return nil, err
		}
	} else {
		orgs, err := m.GetOrgsManagedByUserId(user.ID)
		if err != nil {
			return nil, err
		}
		for _, org := range orgs {
			orgGroups, err := m.GetGroupsByOrgId(org.ID)
			if err != nil {
				return nil, err
			}
			groups = append(groups, orgGroups...)
		}
		groupsManaged, err := m.GetSQLGroupsManagedByUser(user)
		if err != nil {
			return nil, err
		}
		groups = append(groups, groupsManaged...)
	}

	return uniqueGroups(groups), nil
}

// uniqueGroups drops the repeated groups (a user can administer a group and its organization): the same
// subjects twice only make the user JWT bigger.
func uniqueGroups(groups []Group) []Group {
	seen := make(map[int64]bool, len(groups))
	out := groups[:0]
	for _, g := range groups {
		if seen[g.ID] {
			continue
		}
		seen[g.ID] = true
		out = append(out, g)
	}
	return out
}
