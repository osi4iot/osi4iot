package flows_manager

import (
	"context"
	"pipelines/common"
	leader_election "pipelines/leader_election"
	"pipelines/telegram"
	"strconv"
	"time"
)

func (fm *FlowsManager) GetOrgs() []*common.Org {
	var orgs []*common.Org
	fm.Orgs.Range(func(key, value interface{}) bool {
		orgs = append(orgs, value.(*common.Org))
		return true
	})
	return orgs
}

func (fm *FlowsManager) GetOrg(orgId int) *common.Org {
	orgIdStr := strconv.Itoa(orgId)
	if org, ok := fm.Orgs.Load(orgIdStr); ok {
		return org.(*common.Org)
	}
	return nil
}

func (fm *FlowsManager) AddOrg(ctx context.Context, org *common.Org) {
	orgIdStr := strconv.Itoa(org.Id)
	if _, ok := fm.Orgs.Load(orgIdStr); !ok {
		if org.TelegramEnabled && org.TelegramBotToken != "" {
			orgLeaderElector := fm.CreateOrgLeaderElector(org)
			telegramBot := fm.StartTelegramBot(ctx, org, orgLeaderElector)
			if telegramBot != nil {
				org.TelegramListener = telegramBot
				orgIdStr := strconv.Itoa(org.Id)
				fm.Orgs.Store(orgIdStr, org)
			}
		} else {
			org.TelegramListener = nil
			org.LeaderElector = nil
		}
		fm.Orgs.Store(orgIdStr, org)
	} else {
		fm.log.Error("Org with ID %d already exists", org.Id)
	}
}

func (fm *FlowsManager) AddOrgs(ctx context.Context, orgs []*common.Org) {
	for _, org := range orgs {
		orgIdStr := strconv.Itoa(org.Id)
		if _, ok := fm.Orgs.Load(orgIdStr); !ok {
			if org.TelegramEnabled && org.TelegramBotToken != "" {
				orgLeaderElector := fm.CreateOrgLeaderElector(org)
				telegramBot := fm.StartTelegramBot(ctx, org, orgLeaderElector)
				if telegramBot != nil {
					org.LeaderElector = orgLeaderElector
					org.TelegramListener = telegramBot
					orgIdStr := strconv.Itoa(org.Id)
					fm.Orgs.Store(orgIdStr, org)
				}
			}
			fm.Orgs.Store(orgIdStr, org)
		} else {
			fm.log.Error("Org with ID %d already exists", org.Id)
		}
	}
}

func (fm *FlowsManager) DeleteOrg(orgId int) error {
	var mlModelsToDelete []int
	fm.MLModels.Range(func(key, value interface{}) bool {
		if mlModel, ok := value.(*common.MLModel); ok {
			if mlModel.OrgId == orgId {
				mlModelsToDelete = append(mlModelsToDelete, mlModel.Id)
			}
		}
		return true
	})
	for _, mlModelId := range mlModelsToDelete {
		mlModelIdStr := strconv.Itoa(mlModelId)
		fm.MLModels.Delete(mlModelIdStr)
	}

	var groupsToDelete []int
	fm.Groups.Range(func(key, value interface{}) bool {
		if group, ok := value.(*common.Group); ok {
			if group.OrgId == orgId {
				groupsToDelete = append(groupsToDelete, group.Id)
			}
		}
		return true
	})
	for _, groupId := range groupsToDelete {
		groupIdStr := strconv.Itoa(groupId)
		fm.Groups.Delete(groupIdStr)
		fm.DeleteGroup(groupId)
	}

	var digitalTwinsToDelete []int
	fm.DigitalTwins.Range(func(key, value interface{}) bool {
		if digitalTwin, ok := value.(*common.DigitalTwin); ok {
			if digitalTwin.OrgId == orgId {
				digitalTwinsToDelete = append(digitalTwinsToDelete, digitalTwin.Id)
			}
		}
		return true
	})
	for _, digitalTwinId := range digitalTwinsToDelete {
		fm.DeleteDigitalTwin(digitalTwinId)
	}

	orgIdStr := strconv.Itoa(orgId)
	if value, ok := fm.Orgs.Load(orgIdStr); ok {
		org := value.(*common.Org)
		if org.TelegramListener != nil {
			org.TelegramListener.Stop()
			fm.log.Infof("Stopped Telegram bot for Org %d", org.Id)
		}
		if org.LeaderElector != nil {
			org.LeaderElector.Stop()
			fm.log.Infof("Stopped Leader Elector for Org %d", org.Id)
		}
		fm.Orgs.Delete(orgIdStr)
	}

	return nil
}

func (fm *FlowsManager) UpdateOrg(ctx context.Context, org *common.Org) error {
	orgIdStr := strconv.Itoa(org.Id)
	value, ok := fm.Orgs.Load(orgIdStr)
	if !ok {
		return common.ErrNotFound
	}

	existentOrg := value.(*common.Org)
	telegramChanged := existentOrg.TelegramEnabled != org.TelegramEnabled

	if telegramChanged {
		digitalTwinsInOrg := fm.GetDigitalTwinsInOrg(org.Id)

		if existentOrg.TelegramListener != nil {
			existentOrg.TelegramListener.Stop()
			for _, dt := range digitalTwinsInOrg {
				if dt.Pipeline != nil && dt.Pipeline.HasTelegramListenNodesData() {
					dt.Pipeline.Stop("telegram_stopped")
				}
			}
		}
		if existentOrg.LeaderElector != nil {
			existentOrg.LeaderElector.Stop()
		}

		if org.TelegramEnabled && org.TelegramBotToken != "" {
			orgLeaderElector := fm.CreateOrgLeaderElector(org)
			telegramBot := fm.StartTelegramBot(ctx, org, orgLeaderElector)
			if telegramBot != nil {
				org.TelegramListener = telegramBot
				org.LeaderElector = orgLeaderElector
				for _, dt := range digitalTwinsInOrg {
					if dt.Pipeline != nil && dt.Pipeline.HasTelegramListenNodesData() {
						err := dt.Pipeline.CreateTelegramListenNodes(ctx, org)
						if err != nil {
							fm.log.Errorf("Failed to create Telegram listen nodes for Digital Twin %d: %v", dt.Id, err)
						}
						dt.Pipeline.Start(ctx, false)
					}
				}
				fm.log.Infof("Started Telegram bot for Org %d", org.Id)
			} else {
				orgLeaderElector.Stop()
				org.LeaderElector = nil
				org.TelegramListener = nil
				fm.log.Errorf("Failed to start Telegram bot for Org %d", org.Id)
			}
		} else {
			org.TelegramListener = nil
			org.LeaderElector = nil
		}
	} else {
		// Sin cambios en Telegram, conservar lo existente
		org.TelegramListener = existentOrg.TelegramListener
		org.LeaderElector = existentOrg.LeaderElector
	}

	fm.Orgs.Store(orgIdStr, org)
	return nil
}

func (fm *FlowsManager) CreateOrgLeaderElector(org *common.Org) *leader_election.LeaderElector {
	replicaIndex := fm.GetReplicaIndex()
	kv := fm.GetLeaderKvStore()
	orgLeaderElector, err := leader_election.NewLeaderElector(
		replicaIndex,   // replicaIndex
		org.OrgHash,    // orgHash
		"organization", // elementType
		org.OrgHash,    // elementID
		kv,
		10*time.Second,
		fm.log,
	)
	if err != nil {
		fm.log.Error("Error creating leader elector for Org %d: %v", org.Id, err)
		return nil
	}

	return orgLeaderElector

}

func (fm *FlowsManager) CreateOrgTelegramListerner(
	org *common.Org,
	orgLeaderElector *leader_election.LeaderElector,
) *telegram.OrgListener {
	orgListener := telegram.NewOrgListener(
		orgLeaderElector,
		org.OrgHash,
		org.TelegramBotToken,
		fm.log,
		telegram.WithOrgDebug(true),
		telegram.WithOrgErrorHandler(func(err error) {
			fm.log.Errorf("Error: %v", err)
		}),
	)

	return orgListener
}

func (fm *FlowsManager) StopTelegramBots() {
	fm.Orgs.Range(func(key, value any) bool {
		org := value.(*common.Org)
		if org.TelegramListener != nil {
			org.TelegramListener.Stop()
			fm.log.Infof("Stopped Telegram bot for Org %d", org.Id)
		}
		if org.LeaderElector != nil {
			org.LeaderElector.Stop()
			fm.log.Infof("Stopped Leader Elector for Org %d", org.Id)
		}
		return true
	})
}

func (fm *FlowsManager) StartTelegramBot(ctx context.Context, org *common.Org, orgLeaderElector *leader_election.LeaderElector) *telegram.OrgListener {
	err := orgLeaderElector.Start(ctx)
	if err != nil {
		fm.log.Errorf("Failed to start leader elector for Org %d: %v", org.Id, err)
		return nil
	}

	telegramBot := fm.CreateOrgTelegramListerner(org, orgLeaderElector)
	if telegramBot != nil {
		telegramBot.Start(ctx)
		fm.log.Infof("Started Telegram bot for Org %d", org.Id)
	} else {
		orgLeaderElector.Stop()
		fm.log.Errorf("Failed to create Telegram bot for Org %d", org.Id)
		return nil
	}

	return telegramBot
}
