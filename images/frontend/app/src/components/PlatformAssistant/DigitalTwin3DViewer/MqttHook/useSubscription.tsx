import { useContext, useEffect } from 'react';
import { SubscribeOptions } from "paho-mqtt";
import MqttContext from './MqttContext';
import { IMqttContext as Context, IMessage } from './interfaces';
import matches from './matches';
import { IAssetObject, IFemSimulationObject, IGenericObject, IMqttTopicData,  ISensorObject } from '../Model';
import { AssetState, FemSimulationObjectState, GenericObjectState, SensorState } from '../ViewerUtils';

const useSubscription = (
    mqttTopics: string | string[],
    mqttTopicsData: IMqttTopicData[],
    sensorsState: Record<string, SensorState>,
    assetsState: Record<string, AssetState>,
    genericObjectsState: Record<string, GenericObjectState>,
    femSimulationObjectsState: FemSimulationObjectState[],
    digitalTwinSimulatorSendData: boolean,
    sensorObjects: ISensorObject[],
    assetObjects: IAssetObject[],
    genericObjects: IGenericObject[],
    femSimulationObjects: IFemSimulationObject[],
    setAssetsState: React.Dispatch<React.SetStateAction<Record<string, AssetState>>>,
    setSensorsState: React.Dispatch<React.SetStateAction<Record<string, SensorState>>>,
    setGenericObjectsState: React.Dispatch<React.SetStateAction<Record<string, GenericObjectState>>>,
    setFemSimulationObjectsState: React.Dispatch<React.SetStateAction<FemSimulationObjectState[]>>,
    femResultData: any,
    setFemResFilesLastUpdate: (femResFilesLastUpdate: Date) => void,
    options: SubscribeOptions = {} as SubscribeOptions,
) => {
    const { client } = useContext<Context>(MqttContext);

    let femResultNames: string[] = [];
	if (femSimulationObjects.length && femResultData && Object.keys(femResultData).length !== 0) {
		femResultNames = femResultData.metadata.resultFields.map(
			(resultField: { resultName: string; }) => resultField.resultName
		);
    }
    
    useEffect(() => {
        if (client?.isConnected) {
            // subscribe();
            if (typeof mqttTopics === "string") {
                client?.subscribe(mqttTopics, options);
            } else {
                for (const topic_i of mqttTopics as string[]) {
                    client?.subscribe(topic_i, options);
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client]);

    useEffect(() => {
        if (client?.isConnected) {
            client.onMessageArrived = (message: any) => {
                if ([mqttTopics].flat().some(rTopic => matches(rTopic, message.destinationName))) {
                    const recievedMessage = {
                        topic: message.destinationName,
                        message: message.payloadString.toString(),
                    }
                    updateObjectsState(
                        recievedMessage,
                        mqttTopicsData,
                        sensorsState,
                        assetsState,
                        genericObjectsState,
                        femSimulationObjectsState,
                        digitalTwinSimulatorSendData,
                        sensorObjects,
                        assetObjects,
                        genericObjects,
                        femSimulationObjects,
                        setAssetsState,
                        setSensorsState,
                        setGenericObjectsState,
                        setFemSimulationObjectsState,
                        femResultNames,
                        setFemResFilesLastUpdate,
                    )

                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client]);
}

const updateObjectsState = (
    recievedMessage: IMessage,
    mqttTopicsData: IMqttTopicData[],
    sensorsState: Record<string, SensorState>,
    assetsState: Record<string, AssetState>,
    genericObjectsState: Record<string, GenericObjectState>,
    femSimulationObjectsState: FemSimulationObjectState[],
    digitalTwinSimulatorSendData: boolean,
    sensorObjects: ISensorObject[],
    assetObjects: IAssetObject[],
    genericObjects: IGenericObject[],
    femSimulationObjects: IFemSimulationObject[],
    setAssetsState: React.Dispatch<React.SetStateAction<Record<string, AssetState>>>,
    setSensorsState: React.Dispatch<React.SetStateAction<Record<string, SensorState>>>,
    setGenericObjectsState: React.Dispatch<React.SetStateAction<Record<string, GenericObjectState>>>,
    setFemSimulationObjectsState: React.Dispatch<React.SetStateAction<FemSimulationObjectState[]>>,
    femResultNames: string[],
    setFemResFilesLastUpdate: (femResFilesLastUpdate: Date) => void,
) => {
    const mqttTopics = mqttTopicsData.map(topicData => topicData.mqttTopic).filter(topic => topic !== "");
    const clipSimulationTopicId = mqttTopicsData.filter(topic => topic.topicType === "dev_sim_2dtm")[0].topicId;
    const mqttTopicIndex = mqttTopics.findIndex(topic => topic === recievedMessage.topic);
    const messageTopicId = mqttTopicsData[mqttTopicIndex].topicId;
    const messageTopicType = mqttTopicsData[mqttTopicIndex].topicType;
    let mqttMessage: any;
    try {
        mqttMessage = JSON.parse(recievedMessage.message as string);
        if (mqttMessage) {
            const messagePayloadKeys = Object.keys(mqttMessage);
            const sensorsNewState = { ...sensorsState };
            let isSensorStateChanged = false;
            const assestsNewState = { ...assetsState };
            let isAssetStateChanged = false;
            const genericObjectNewState = { ...genericObjectsState };
            let isGenericObjectsStateChanged = false;
            let isfemSimulationObjectsStateChanged = false;
            const femSimulationObjectsNewState = [...femSimulationObjectsState];

            if ((messageTopicType === "dev2pdb" && !digitalTwinSimulatorSendData) || messageTopicType === "dev_sim_2dtm") {
                sensorObjects.forEach((obj) => {
                    const objName = obj.node.name;
                    const sensorTopicId = obj.node.userData.topicId;
                    if (sensorTopicId === messageTopicId && sensorsState[objName].stateString === "off") {
                        const fieldName = obj.node.userData.fieldName;
                        if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                            const value = mqttMessage[fieldName];
                            if (typeof value === 'number' || (typeof value === 'object' && value.findIndex((elem: any) => elem === null) !== -1)) {
                                sensorsNewState[objName] = { ...sensorsNewState[objName], stateString: "on" };
                                isSensorStateChanged = true;
                            }
                        }
                    }
                    const clipTopicIds = obj.node.userData.clipTopicIds;
                    if (clipTopicIds && clipTopicIds.length !== 0) {
                        const clipValues = [...sensorsNewState[objName].clipValues];
                        clipTopicIds.forEach((clipTopicId: number, index: number) => {
                            if (clipTopicId === messageTopicId) {
                                const fieldName = obj.node.userData.clipFieldNames[index];
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValues[index] = value;
                                        isSensorStateChanged = true;
                                    }
                                }
                            }
                        });
                        sensorsNewState[objName] = { ...sensorsNewState[objName], clipValues };
                    }

                    if (clipSimulationTopicId === messageTopicId) {
                        const clipValues = [...sensorsNewState[objName].clipValues];
                        const fieldNames: string[] = obj.node.userData.clipFieldNames;
                        if (fieldNames !== undefined && fieldNames.length !== 0) {
                            fieldNames.forEach((fieldName, index) => {
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValues[index] = value;
                                        isSensorStateChanged = true;
                                    }
                                }
                            });
                            sensorsNewState[objName] = { ...sensorsNewState[objName], clipValues };
                        }
                    }
                });

                assetObjects.forEach((obj) => {
                    const objName = obj.node.name;
                    const clipTopicIds = obj.node.userData.clipTopicIds;
                    if (clipTopicIds && clipTopicIds.length !== 0) {
                        const clipValues = [...assestsNewState[objName].clipValues];
                        clipTopicIds.forEach((clipTopicId: number, index: number) => {
                            if (clipTopicId === messageTopicId) {
                                const fieldName = obj.node.userData.clipFieldNames[index];
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValues[index] = value;
                                        isAssetStateChanged = true;
                                    }
                                }
                            }
                        });
                        assestsNewState[objName] = { ...assestsNewState[objName], clipValues };
                    }

                    if (clipSimulationTopicId === messageTopicId) {
                        const clipValues = [...assestsNewState[objName].clipValues];
                        const fieldNames: string[] = obj.node.userData.clipFieldNames;
                        if (fieldNames !== undefined && fieldNames.length !== 0) {
                            fieldNames.forEach((fieldName, index) => {
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValues[index] = value;
                                        isAssetStateChanged = true;
                                    }
                                }
                            });
                            assestsNewState[objName] = { ...assestsNewState[objName], clipValues };
                        }
                    }

                });

                genericObjects.forEach((obj) => {
                    const objName = obj.node.name;
                    const clipTopicIds = obj.node.userData.clipTopicIds;
                    if (clipTopicIds && clipTopicIds.length !== 0) {
                        const clipValues = [...genericObjectNewState[objName].clipValues];
                        clipTopicIds.forEach((clipTopicId: number, index: number) => {
                            if (clipTopicId === messageTopicId) {
                                const fieldName = obj.node.userData.clipFieldNames[index];
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValues[index] = value;
                                        isGenericObjectsStateChanged = true;
                                    }
                                }
                            }
                        });
                        genericObjectNewState[objName] = { ...genericObjectNewState[objName], clipValues };
                    }

                    if (clipSimulationTopicId === messageTopicId) {
                        const clipValues = [...genericObjectNewState[objName].clipValues];
                        const fieldNames: string[] = obj.node.userData.clipFieldNames;
                        if (fieldNames !== undefined && fieldNames.length !== 0) {
                            fieldNames.forEach((fieldName, index) => {
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValues[index] = value;
                                        isGenericObjectsStateChanged = true;
                                    }
                                }
                            });
                            genericObjectNewState[objName] = { ...genericObjectNewState[objName], clipValues };
                        }
                    }
                });

                femSimulationObjects.forEach((obj, index) => {
                    const clipTopicIds = obj.node.userData.clipTopicIds;
                    if (clipTopicIds && clipTopicIds.length !== 0) {
                        const clipValues = [...femSimulationObjectsNewState[index].clipValues];
                        clipTopicIds.forEach((clipTopicId: number, index: number) => {
                            if (clipTopicId === messageTopicId) {
                                const fieldName = obj.node.userData.clipFieldNames[index];
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValues[index] = value;
                                        isfemSimulationObjectsStateChanged = true;
                                    }
                                }
                            }
                        });
                        femSimulationObjectsNewState[index] = { ...femSimulationObjectsNewState[index], clipValues };
                    }

                    if (clipSimulationTopicId === messageTopicId) {
                        const clipValues = [...femSimulationObjectsNewState[index].clipValues];
                        const fieldNames: string[] = obj.node.userData.clipFieldNames;
                        if (fieldNames !== undefined && fieldNames.length !== 0) {
                            fieldNames.forEach((fieldName, index) => {
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValues[index] = value;
                                        isfemSimulationObjectsStateChanged = true;
                                    }
                                }
                            });
                            femSimulationObjectsNewState[index] = { ...femSimulationObjectsNewState[index], clipValues };
                        }
                    }

                });
            }

            if ((messageTopicType === "dtm_as2pdb" && !digitalTwinSimulatorSendData) || messageTopicType === "dtm_sim_as2dts") {
                const assestsNewState = { ...assetsState };
                assetObjects.forEach((obj) => {
                    const objName = obj.node.name;
                    const assetPartIndex = obj.node.userData.assetPartIndex;
                    const stateNumber = parseInt(mqttMessage.assetPartsState[assetPartIndex - 1], 10);
                    if (stateNumber === 1) {
                        assestsNewState[objName] = { ...assestsNewState[objName], stateString: "alerting" };
                    } else if (stateNumber === 0) {
                        assestsNewState[objName] = { ...assestsNewState[objName], stateString: "ok" };
                    }
                });
                setAssetsState(assestsNewState);
            }


            if (femSimulationObjectsState.length) {
                if ((messageTopicType === "dtm_fmv2pdb" && !digitalTwinSimulatorSendData) || messageTopicType === "dtm_sim_fmv2dts") {
                    for (let imesh = 0; imesh < femSimulationObjectsState.length; imesh++) {
                        for (let ires = 0; ires < femResultNames.length; ires++) {
                            const resultName = femResultNames[ires];
                            const femResultsModalValue = mqttMessage.femResultsModalValues[imesh][ires];
                            femSimulationObjectsNewState[imesh].resultFieldModalValues[resultName] = femResultsModalValue
                            isfemSimulationObjectsStateChanged = true
                        }
                    }
                }
            }

            if (isSensorStateChanged) setSensorsState(sensorsNewState);
            if (isAssetStateChanged) setAssetsState(assestsNewState);
            if (isGenericObjectsStateChanged) setGenericObjectsState(genericObjectNewState);
            if (isfemSimulationObjectsStateChanged) setFemSimulationObjectsState(femSimulationObjectsNewState);

            if (messageTopicType === "new_fem_res_file") {
                const femResFilesLastUpdate = new Date();
                setFemResFilesLastUpdate(femResFilesLastUpdate);
            }
        }

    } catch (error) {
        console.log("Error reading Mqtt message: ", error);
    }
}

export default useSubscription;