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
	queryString := `SELECT grafanadb.group.id, grafanadb.group.org_id, grafanadb.group.team_id, grafanadb.group.folder_id, 
	grafanadb.group.folder_uid, grafanadb.group.name, grafanadb.group.acronym, grafanadb.group.group_uid, 
	grafanadb.group.telegram_invitation_link, grafanadb.group.telegram_chatid, grafanadb.group.email_notification_channel_id, 
	grafanadb.group.telegram_notification_channel_id, grafanadb.group.is_org_default_group, grafanadb.group.floor_number, 
	grafanadb.group.feature_index, grafanadb.group.outer_bounds, grafanadb.group.mqtt_access_control, 
	grafanadb.org.mqtt_access_control AS org_mqtt_access_control, 
	grafanadb.group.created, grafanadb.group.updated
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
	queryString := `SELECT grafanadb.group.id, grafanadb.group.org_id, grafanadb.group.team_id, grafanadb.group.folder_id, 
	grafanadb.group.folder_uid, grafanadb.group.name, grafanadb.group.acronym, grafanadb.group.group_uid, 
	grafanadb.group.telegram_invitation_link, grafanadb.group.telegram_chatid, grafanadb.group.email_notification_channel_id, 
	grafanadb.group.telegram_notification_channel_id, grafanadb.group.is_org_default_group, grafanadb.group.floor_number, 
	grafanadb.group.feature_index, grafanadb.group.outer_bounds, grafanadb.group.mqtt_access_control, 
	grafanadb.org.mqtt_access_control AS org_mqtt_access_control, 
	grafanadb.group.created, grafanadb.group.updated
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
	queryString := `SELECT grafanadb.group.id, grafanadb.group.org_id, grafanadb.group.team_id, grafanadb.group.folder_id, 
	grafanadb.group.folder_uid, grafanadb.group.name, grafanadb.group.acronym, grafanadb.group.group_uid, 
	grafanadb.group.telegram_invitation_link, grafanadb.group.telegram_chatid, grafanadb.group.email_notification_channel_id, 
	grafanadb.group.telegram_notification_channel_id, grafanadb.group.is_org_default_group, grafanadb.group.floor_number, 
	grafanadb.group.feature_index, grafanadb.group.outer_bounds, grafanadb.group.mqtt_access_control, 
	grafanadb.org.mqtt_access_control AS org_mqtt_access_control,
	grafanadb.group.created, grafanadb.group.updated
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
	queryString := `SELECT grafanadb.group.id, grafanadb.group.org_id, grafanadb.group.team_id, grafanadb.group.folder_id, 
	grafanadb.group.folder_uid, grafanadb.group.name, grafanadb.group.acronym, grafanadb.group.group_uid, 
	grafanadb.group.telegram_invitation_link, grafanadb.group.telegram_chatid, grafanadb.group.email_notification_channel_id, 
	grafanadb.group.telegram_notification_channel_id, grafanadb.group.is_org_default_group, grafanadb.group.floor_number, 
	grafanadb.group.feature_index, grafanadb.group.outer_bounds, grafanadb.group.mqtt_access_control, 
	grafanadb.org.mqtt_access_control AS org_mqtt_access_control, 
	grafanadb.group.created, grafanadb.group.updated
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
	queryString := `SELECT grafanadb.group.id, grafanadb.group.org_id, grafanadb.group.team_id, grafanadb.group.folder_id, 
	grafanadb.group.folder_uid, grafanadb.group.name, grafanadb.group.acronym, grafanadb.group.group_uid, 
	grafanadb.group.telegram_invitation_link, grafanadb.group.telegram_chatid, grafanadb.group.email_notification_channel_id, 
	grafanadb.group.telegram_notification_channel_id, grafanadb.group.is_org_default_group, grafanadb.group.floor_number, 
	grafanadb.group.feature_index, grafanadb.group.outer_bounds, grafanadb.group.mqtt_access_control, 
	grafanadb.org.mqtt_access_control AS org_mqtt_access_control,
	grafanadb.group.created, grafanadb.group.updated
	FROM grafanadb.group
	INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
	WHERE grafanadb.team_member.user_id = $1 AND grafanadb.team_member.permission = $2`
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
	var groups []Group
	queryString := `SELECT grafanadb.group.id, grafanadb.group.org_id, grafanadb.group.team_id, grafanadb.group.folder_id, 
	grafanadb.group.folder_uid, grafanadb.group.name, grafanadb.group.acronym, grafanadb.group.group_uid, 
	grafanadb.group.telegram_invitation_link, grafanadb.group.telegram_chatid, grafanadb.group.email_notification_channel_id, 
	grafanadb.group.telegram_notification_channel_id, grafanadb.group.is_org_default_group, grafanadb.group.floor_number, 
	grafanadb.group.feature_index, grafanadb.group.outer_bounds, grafanadb.group.mqtt_access_control,
	grafanadb.org.mqtt_access_control AS org_mqtt_access_control,
	grafanadb.group.created, grafanadb.group.updated
	FROM grafanadb.group
	INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
	INNER JOIN grafanadb.team_member ON grafanadb.team_member.team_id = grafanadb.group.team_id
	WHERE grafanadb.team_member.user_id = $1 AND grafanadb.team_member.permission = $2`
	rows, err := m.db.Query(context.Background(), queryString, user.ID, 4)
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

	return groups, nil
}
