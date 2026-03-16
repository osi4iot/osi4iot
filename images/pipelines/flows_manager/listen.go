package flows_manager

import (
	"encoding/json"
	"fmt"
	"pipelines/common"

	"github.com/nats-io/nats.go/jetstream"
)

func (fm *FlowsManager) Listen() {
	fm.JsConsumer.Consume(func(msg jetstream.Msg) {
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
				org := fm.Admin.GetOrg(adminMsg.Id, encryptionSecretKey)
				if org != nil {
					fm.AddOrg(org)
				}
			case "update":
				fmt.Printf("Updating org with ID: %d\n", adminMsg.Id)
				org := fm.Admin.GetOrg(adminMsg.Id, encryptionSecretKey)
				if org != nil {
					fm.UpdateOrg(org)
				}
			case "delete":
				fm.DeleteOrg(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "group":
			switch adminMsg.Action {
			case "create":
				group := fm.Admin.GetGroup(adminMsg.Id)
				if group != nil {
					fm.AddGroup(group)
				}
			case "update":
				group := fm.Admin.GetGroup(adminMsg.Id)
				if group != nil {
					fm.UpdateGroup(group)
				}
			case "delete":
				fm.DeleteGroup(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "notification_channel":
			switch adminMsg.Action {
			case "create":
				channel := fm.Admin.GetNotificationChannel(adminMsg.Id)
				if channel != nil {
					fm.AddNotificationChannel(channel)
				}
			case "update":
				channel := fm.Admin.GetNotificationChannel(adminMsg.Id)
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
				asset := fm.Admin.GetAsset(groupId, adminMsg.Id)
				if asset != nil {
					
					fm.AddAsset(asset)
				}
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				asset := fm.Admin.GetAsset(groupId, adminMsg.Id)
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
				topic := fm.Admin.GetTopic(groupId, adminMsg.Id)
				if topic != nil {
					fm.AddTopic(topic)
				}
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				topic := fm.Admin.GetTopic(groupId, adminMsg.Id)
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
				mlModel := fm.Admin.GetMlModel(groupId, adminMsg.Id)
				if mlModel != nil {
					fm.AddMlModel(mlModel)
				}
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				mlModel := fm.Admin.GetMlModel(groupId, adminMsg.Id)
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
				fm.GetMlModelFile(groupId, adminMsg.Id)

			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}			
		case "digitalTwin":
			switch adminMsg.Action {
			case "create":
				groupId := int(adminMsg.Context["groupId"].(float64))
				digitalTwin := fm.Admin.GetDigitalTwin(groupId, adminMsg.Id)
				if digitalTwin != nil {
					fm.AddDigitalTwin(digitalTwin, false)
				}
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				digitalTwin := fm.Admin.GetDigitalTwin(groupId, adminMsg.Id)
				if digitalTwin != nil {
					fm.UpdateDigitalTwin(digitalTwin)
				}
			case "delete":
				fm.DeleteDigitalTwin(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "femResults":
			switch adminMsg.Action {
			case "create":
				fm.AddFemResultsInDigitalTwin(adminMsg.Id)
			case "delete":
				fm.DeleteFemResultsInDigitalTwin(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "docInfoFile":
			switch adminMsg.Action {
			case "create":
				fm.AddDocInfoFileInDigitalTwin(adminMsg.Id)
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
				fm.CreatePipelineInDigitalTwin(digitalTwinId)
			case "update":
				fm.UpdatePipelineInDigitalTwin(digitalTwinId)
			case "stop":
				fm.StopNodesInDigitalTwin(digitalTwinId, "stop")
			case "start":
				reinitialize := adminMsg.Context["reinitialize"].(bool)
				fm.StartNodesInDigitalTwin(digitalTwinId, reinitialize)
			case "restart":
				reinitialize := adminMsg.Context["reinitialize"].(bool)
				fm.RestartNodesInDigitalTwin(digitalTwinId, reinitialize)
			case "delete":
				fm.DeletePipelineInDigitalTwin(digitalTwinId)
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
}
