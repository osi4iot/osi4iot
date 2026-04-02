package flows_manager

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/common"

	"github.com/nats-io/nats.go/jetstream"
)

func (fm *FlowsManager) Listen(ctx context.Context) {
	consumeCtx, err := fm.JsConsumer.Consume(func(msg jetstream.Msg) {
		// 1. Inmediate defer: decide Ack or Nak based on ctx at the end
		defer func() {
			select {
			case <-ctx.Done():
				msg.Nak() // shutdown in progress, discard
			default:
				msg.Ack() // processed successfully
			}
		}()

		// 2. Intial check: if we're already in shutdown, exit before processing
		select {
		case <-ctx.Done():
			return
		default:
		}

		var adminMsg common.AdminMessage
		if err := json.Unmarshal(msg.Data(), &adminMsg); err != nil {
			fm.log.Errorf("Failed to unmarshal message: %v", err)
			return
		}
		fm.log.Infof("Received message in pipeline admin => component: %s, action: %s, id: %d",
			adminMsg.Component, adminMsg.Action, adminMsg.Id)
		encryptionSecretKey := fm.GetEncryptionSecretKey()

		switch adminMsg.Component {
		case "org":
			switch adminMsg.Action {
			case "create":
				fmt.Printf("Creating org with ID: %d\n", adminMsg.Id)
				org := fm.Admin.GetOrg(ctx, adminMsg.Id, encryptionSecretKey)
				if org != nil {
					fm.AddOrg(ctx, org)
				}
			case "update":
				org := fm.Admin.GetOrg(ctx, adminMsg.Id, encryptionSecretKey)
				if org != nil {
					fm.UpdateOrg(ctx, org)
				}
			case "delete":
				fm.DeleteOrg(ctx, adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "group":
			switch adminMsg.Action {
			case "create":
				group := fm.Admin.GetGroup(ctx, adminMsg.Id)
				if group != nil {
					fm.AddGroup(ctx, group)
				}
			case "update":
				group := fm.Admin.GetGroup(ctx, adminMsg.Id)
				if group != nil {
					fm.UpdateGroup(group)
				}
			case "delete":
				fm.DeleteGroup(ctx, adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "notification_channel":
			switch adminMsg.Action {
			case "create":
				channel := fm.Admin.GetNotificationChannel(ctx, adminMsg.Id)
				if channel != nil {
					fm.AddNotificationChannel(channel)
				}
			case "update":
				channel := fm.Admin.GetNotificationChannel(ctx, adminMsg.Id)
				if channel != nil {
					fm.UpdateNotificationChannel(channel)
				}
			case "delete":
				fm.DeleteNotificationChannel(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "asset":
			switch adminMsg.Action {
			case "create":
				groupId := int(adminMsg.Context["groupId"].(float64))
				asset := fm.Admin.GetAsset(ctx, groupId, adminMsg.Id)
				if asset != nil {

					fm.AddAsset(ctx, asset)
				}
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				asset := fm.Admin.GetAsset(ctx, groupId, adminMsg.Id)
				if asset != nil {
					fm.UpdateAsset(asset)
				}
			case "delete":
				fm.DeleteAsset(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "sensor":
			switch adminMsg.Action {
			case "delete":
				fm.DeleteSensor(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "topic":
			switch adminMsg.Action {
			case "create":
				groupId := int(adminMsg.Context["groupId"].(float64))
				topic := fm.Admin.GetTopic(ctx, groupId, adminMsg.Id)
				if topic != nil {
					fm.AddTopic(topic)
				}
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				topic := fm.Admin.GetTopic(ctx, groupId, adminMsg.Id)
				if topic != nil {
					fm.UpdateTopic(topic)
				}
			case "delete":
				fm.DeleteTopic(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "asset_topic":
			switch adminMsg.Action {
			case "create":
				topicId := int(adminMsg.Context["topicId"].(float64))
				topicRef := adminMsg.Context["topicRef"].(string)
				fm.AddAssetTopicRef(adminMsg.Id, topicId, topicRef)
			case "delete":
				topicRef := adminMsg.Context["topicRef"].(string)
				fm.DeleteAssetTopicRef(adminMsg.Id, topicRef)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "digital_twin_topic":
			switch adminMsg.Action {
			case "create":
				topicId := int(adminMsg.Context["topicId"].(float64))
				topicRef := adminMsg.Context["topicRef"].(string)
				fm.AddDigitalTwinTopicRef(adminMsg.Id, topicRef, topicId)
			case "delete":
				topicRef := adminMsg.Context["topicRef"].(string)
				fm.DeleteDigitalTwinTopicRef(adminMsg.Id, topicRef)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "ml_model":
			switch adminMsg.Action {
			case "create":
				groupId := int(adminMsg.Context["groupId"].(float64))
				mlModel := fm.Admin.GetMlModel(ctx, groupId, adminMsg.Id)
				if mlModel != nil {
					fm.AddMlModel(mlModel)
				}
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				mlModel := fm.Admin.GetMlModel(ctx, groupId, adminMsg.Id)
				if mlModel != nil {
					fm.UpdateMlModel(mlModel)
				}
			case "delete":
				fm.DeleteMlModel(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "ml_model_file":
			switch adminMsg.Action {
			case "upload":
				groupId := int(adminMsg.Context["groupId"].(float64))
				fm.GetMlModelFile(ctx, groupId, adminMsg.Id)

			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "digitalTwin":
			switch adminMsg.Action {
			case "create":
				groupId := int(adminMsg.Context["groupId"].(float64))
				digitalTwin := fm.Admin.GetDigitalTwin(ctx, groupId, adminMsg.Id)
				if digitalTwin != nil {
					fm.AddDigitalTwin(ctx, digitalTwin, false)
				}
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				digitalTwin := fm.Admin.GetDigitalTwin(ctx, groupId, adminMsg.Id)
				if digitalTwin != nil {
					fm.UpdateDigitalTwin(digitalTwin)
				}
			case "delete":
				fm.DeleteDigitalTwin(ctx, adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "s3_folder":
			switch adminMsg.Action {
			case "create":
				groupId := int(adminMsg.Context["groupId"].(float64))
				assetId := int(adminMsg.Context["assetId"].(float64))
				assetS3Folder := fm.Admin.GetAssetS3Folder(ctx, groupId, assetId, adminMsg.Id)
				fm.AddAssetS3Folder(ctx, assetS3Folder)
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				assetId := int(adminMsg.Context["assetId"].(float64))
				updatedField := adminMsg.Context["updatedField"].(string)
				assetS3Folder := fm.Admin.GetAssetS3Folder(ctx, groupId, assetId, adminMsg.Id)
				switch updatedField {
				case "parquet_schema":
				case "parquet_file_stats":
					fm.AddAssetS3Folder(ctx, assetS3Folder)
				}
			case "delete":
				assetId := int(adminMsg.Context["assetId"].(float64))
				folderName := adminMsg.Context["folderName"].(string)
				fm.DeleteAssetS3Folder(ctx, assetId, folderName)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "femResults":
			switch adminMsg.Action {
			case "create":
				fm.AddFemResultsInDigitalTwin(ctx, adminMsg.Id)
			case "delete":
				fm.DeleteFemResultsInDigitalTwin(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "docInfoFile":
			switch adminMsg.Action {
			case "create":
				fm.AddDocInfoFileInDigitalTwin(ctx, adminMsg.Id)
			case "delete":
				fm.DeleteDocInfoFileInDigitalTwin(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "pipeline_action":
			digitalTwinId := adminMsg.Id
			switch adminMsg.Action {
			case "create":
				fm.CreatePipelineInDigitalTwin(ctx, digitalTwinId)
			case "update":
				fm.UpdatePipelineInDigitalTwin(ctx, digitalTwinId)
			case "stop":
				fm.StopNodesInDigitalTwin(ctx, digitalTwinId, "stop")
			case "start":
				reinitialize := adminMsg.Context["reinitialize"].(bool)
				fm.StartNodesInDigitalTwin(ctx, digitalTwinId, reinitialize)
			case "restart":
				reinitialize := adminMsg.Context["reinitialize"].(bool)
				fm.RestartNodesInDigitalTwin(ctx, digitalTwinId, reinitialize)
			case "delete":
				fm.DeletePipelineInDigitalTwin(ctx, digitalTwinId)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		default:
			fm.log.Errorf("Unknown component: %s", adminMsg.Component)
			return
		}

		msg.Ack()
		fm.log.Infof("Message in pipeline admin => component: %s, action: %s, id: %d processed successfully",
			adminMsg.Component, adminMsg.Action, adminMsg.Id)
	})

	if err != nil {
		fm.log.Errorf("Failed to start consumer: %v", err)
		return
	}

	go func() {
		<-ctx.Done()
		consumeCtx.Stop()
		fm.log.Info("JetStream consumer stopped")
	}()
}
