package flows_manager

import (
	"pipelines/common"
	"strconv"
)

func (fm *FlowsManager) GetNotificationChannels() []*common.NotificationChannel {
	var channels []*common.NotificationChannel
	fm.NotificationChannels.Range(func(key, value interface{}) bool {
		if channel, ok := value.(*common.NotificationChannel); ok {
			channels = append(channels, channel)
		}
		return true
	})
	return channels
}

func (fm *FlowsManager) GetNotificationChannel(channelId int) *common.NotificationChannel {
	channelIdStr := strconv.Itoa(channelId)
	if channel, ok := fm.NotificationChannels.Load(channelIdStr); ok {
		return channel.(*common.NotificationChannel)
	} else {
		fm.log.Error("Notification channel with ID %d not found", channelId)
	}
	return nil
}

func (fm *FlowsManager) AddNotificationChannel(channel *common.NotificationChannel) {
	channelIdStr := strconv.Itoa(channel.Id)
	if _, ok := fm.NotificationChannels.Load(channelIdStr); !ok {
		fm.NotificationChannels.Store(channelIdStr, channel)
	} else {
		fm.log.Error("Notification channel with ID %d already exists", channel.Id)
	}
}

func (fm *FlowsManager) AddNotificationChannels(channels []*common.NotificationChannel) {
	for _, channel := range channels {
		channelIdStr := strconv.Itoa(channel.Id)
		if _, ok := fm.NotificationChannels.Load(channelIdStr); !ok {
			fm.NotificationChannels.Store(channelIdStr, channel)
		} else {
			fm.log.Error("Notification channel with ID %d already exists", channel.Id)
		}
	}
}

func (fm *FlowsManager) UpdateNotificationChannel(channel *common.NotificationChannel) error {
	channelIdStr := strconv.Itoa(channel.Id)
	if _, ok := fm.NotificationChannels.Load(channelIdStr); ok {
		fm.NotificationChannels.Store(channelIdStr, channel)
		return nil
	} else {
		fm.log.Error("Notification channel with ID %d not found", channel.Id)
		return common.ErrNotFound
	}
}

func (fm *FlowsManager) DeleteNotificationChannel(channelId int) error {
	channelIdStr := strconv.Itoa(channelId)
	if _, ok := fm.NotificationChannels.Load(channelIdStr); ok {
		fm.NotificationChannels.Delete(channelIdStr)
		return nil
	} else {
		fm.log.Error("Notification channel with ID %d not found", channelId)
		return common.ErrNotFound
	}
}