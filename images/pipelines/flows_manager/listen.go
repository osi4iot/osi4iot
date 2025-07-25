package flows_manager

import (
	"encoding/json"
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

		switch adminMsg.Component {
		case "org":
			switch adminMsg.Action {
			case "create":
				org := fm.Admin.GetOrg(adminMsg.Id)
				fm.AddOrg(org)
			case "update":
				org := fm.Admin.GetOrg(adminMsg.Id)
				fm.UpdateOrg(org)
			case "delete":
				fm.DeleteOrg(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "group":
			switch adminMsg.Action {
			case "delete":
				fm.DeleteGroup(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "asset":
			switch adminMsg.Action {
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
				fm.AddTopic(topic)
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				topic := fm.Admin.GetTopic(groupId, adminMsg.Id)
				fm.UpdateTopic(topic)
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
				fm.AddMlModel(mlModel)
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				mlModel := fm.Admin.GetMlModel(groupId, adminMsg.Id)
				fm.UpdateMlModel(mlModel)
			case "delete":
				fm.DeleteMlModel(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "digitalTwin":
			switch adminMsg.Action {
			case "create":
				groupId := int(adminMsg.Context["groupId"].(float64))
				digitalTwin := fm.Admin.GetDigitalTwin(groupId, adminMsg.Id)
				fm.AddDigitalTwin(digitalTwin)
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				digitalTwin := fm.Admin.GetDigitalTwin(groupId, adminMsg.Id)
				fm.UpdateDigitalTwin(digitalTwin)
			case "delete":
				fm.DeleteDigitalTwin(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "node":
			switch adminMsg.Action {
			case "create":
				groupId := int(adminMsg.Context["groupId"].(float64))
				node := fm.Admin.GetNode(groupId, adminMsg.Id)
				err := fm.AddNode(node)
				if err != nil {
					fm.handleNodeError(node, err)
				}
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				digitalTwinId := int(adminMsg.Context["digitalTwinId"].(float64))
				node := fm.Admin.GetNode(groupId, adminMsg.Id)
				err := fm.UpdateNode(node)
				if err != nil {
					if err == common.ErrNotFound {
						digitalTwin := fm.Admin.GetDigitalTwin(groupId, digitalTwinId)
						exist := fm.CheckIfNodeExistInPipelineFile(digitalTwin, node)
						if exist {
							err := fm.AddNode(node)
							if err != nil {
								fm.handleNodeError(node, err)
							}
						} else {
							fm.handleNodeError(node, err)
						}
					} else {
						fm.handleNodeError(node, err)
					}
				}
			case "delete":
				fm.DeleteNode(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "wire":
			switch adminMsg.Action {
			case "create":
				groupId := int(adminMsg.Context["groupId"].(float64))
				wire := fm.Admin.GetWire(groupId, adminMsg.Id)
				fm.AddWire(wire)
			case "update":
				groupId := int(adminMsg.Context["groupId"].(float64))
				wire := fm.Admin.GetWire(groupId, adminMsg.Id)
				fm.UpdateWire(wire)
			case "delete":
				fm.DeleteWire(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "pipeline_action":
			digitalTwinId := adminMsg.Id
			reinitialize := adminMsg.Context["reinitialize"].(bool)
			switch adminMsg.Action {
			case "stop":
				fm.StopNodesInDigitalTwin(digitalTwinId)
			case "start":
				fm.StartNodesInDigitalTwin(digitalTwinId, reinitialize)
			case "restart":
				fm.RestartNodesInDigitalTwin(digitalTwinId, reinitialize)
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
