import { useContext, useEffect } from 'react';
import { SubscribeOptions } from "paho-mqtt";
import MqttContext from './MqttContext';
import { IMqttContext as Context, IMessage } from './interfaces';
import matches from './matches';
import {
    IAssetObject,
    IFemSimulationObject,
    IGenericObject,
    IMqttTopicData,
    ISensorObject
} from '../Model';
import {
    AssetState,
    FemSimulationObjectState,
    GenericObjectState,
    SensorState
} from '../ViewerUtils';

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
    }, [client, femSimulationObjectsState, digitalTwinSimulatorSendData]);
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
                    const sensorTopicId = obj.node.userData.sensorTopicId;
                    //if (sensorTopicId === messageTopicId && sensorsState[objName].stateString === "off") {
                    if (sensorTopicId === messageTopicId || clipSimulationTopicId === messageTopicId) {
                        const fieldName = obj.node.userData.fieldName;
                        if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                            const value = mqttMessage[fieldName];
                            let stateString = sensorsNewState[objName].stateString;
                            if (typeof value === 'number' ||
                                (Array.isArray(value) && value.findIndex((elem: any) => elem === null) !== -1)
                            ) {
                                if (sensorTopicId === messageTopicId) stateString = "on";
                                sensorsNewState[objName] = { ...sensorsNewState[objName], stateString, sensorValue: value };
                                isSensorStateChanged = true;
                            }
                        }
                    }
                    const animationType = obj.node.userData.animationType;
                    if (animationType === "custom") {
                        isSensorStateChanged = updateCustomAnimationState(
                            obj.node,
                            sensorsNewState,
                            messageTopicId,
                            mqttMessage,
                            isSensorStateChanged
                        )
                    } else if (
                        animationType === "blenderTemporary"
                    ) {
                        const clipTopicId = obj.node.userData.clipTopicId;
                        if (clipTopicId !== undefined) {
                            let clipValue = sensorsNewState[objName].clipValue;
                            if (clipTopicId === messageTopicId) {
                                const fieldName = obj.node.userData.clipFieldName;
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValue = value;
                                        isSensorStateChanged = true;
                                    }
                                }
                            }
                            sensorsNewState[objName] = { ...sensorsNewState[objName], clipValue };
                        }

                        if (clipSimulationTopicId === messageTopicId) {
                            let clipValue = sensorsNewState[objName].clipValue;
                            const fieldName = obj.node.userData.clipFieldName;
                            if (fieldName !== undefined) {
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValue = value;
                                        isSensorStateChanged = true;
                                    }
                                }
                                sensorsNewState[objName] = { ...sensorsNewState[objName], clipValue };
                            }
                        }
                    } else if (
                        animationType === "blenderEndless"
                    ) {
                        const clipTopicId = obj.node.userData.clipTopicId;
                        if (clipTopicId !== undefined) {
                            let clipValue = sensorsNewState[objName].clipValue;
                            if (clipTopicId === messageTopicId) {
                                const fieldName = "endlessTimeFactor";
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName][objName];
                                    if (typeof value === 'number') {
                                        clipValue = value;
                                        isSensorStateChanged = true;
                                    }
                                }
                            }
                            sensorsNewState[objName] = { ...sensorsNewState[objName], clipValue };
                        }
                    }

                    const objectOnOffTopicId = obj.node.userData.objectOnOffTopicId;
                    if (objectOnOffTopicId !== undefined) {
                        let onOff = sensorsNewState[objName].onOff;
                        if (objectOnOffTopicId === messageTopicId) {
                            const fieldName = "objectOnOff";
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                if (mqttMessage[fieldName][objName] === "on") {
                                    onOff = "on";
                                    isSensorStateChanged = true;
                                } else if (mqttMessage[fieldName][objName] === "off") {
                                    onOff = "off";
                                    isSensorStateChanged = true;
                                }
                            }
                        }
                        sensorsNewState[objName] = { ...sensorsNewState[objName], onOff };
                    }
                });

                assetObjects.forEach((obj) => {
                    const objName = obj.node.name;
                    const animationType = obj.node.userData.animationType;
                    if (animationType === "custom") {
                        isAssetStateChanged = updateCustomAnimationState(
                            obj.node,
                            assestsNewState,
                            messageTopicId,
                            mqttMessage,
                            isAssetStateChanged
                        )
                    } else if (
                        animationType === "blenderTemporary" 
                    ) {
                        const clipTopicId = obj.node.userData.clipTopicId;
                        if (clipTopicId !== undefined && clipTopicId.length !== 0) {
                            let clipValue = assestsNewState[objName].clipValue;
                            if (clipTopicId === messageTopicId) {
                                const fieldName = obj.node.userData.clipFieldName;
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValue = value;
                                        isAssetStateChanged = true;
                                    }
                                }
                            }
                            assestsNewState[objName] = { ...assestsNewState[objName], clipValue };
                        }

                        if (clipSimulationTopicId === messageTopicId) {
                            let clipValue = assestsNewState[objName].clipValue;
                            const fieldName = obj.node.userData.clipFieldName;
                            if (fieldName !== undefined) {
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValue = value;
                                        isAssetStateChanged = true;
                                    }
                                }
                                assestsNewState[objName] = { ...assestsNewState[objName], clipValue };
                            }
                        }
                    } else if (
                        animationType === "blenderEndless"
                    ) {
                        const clipTopicId = obj.node.userData.clipTopicId;
                        if (clipTopicId !== undefined && clipTopicId.length !== 0) {
                            let clipValue = assestsNewState[objName].clipValue;
                            if (clipTopicId === messageTopicId) {
                                const fieldName = "endlessTimeFactor";
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName][objName];
                                    if (typeof value === 'number') {
                                        clipValue = value;
                                        isAssetStateChanged = true;
                                    }
                                }
                            }
                            assestsNewState[objName] = { ...assestsNewState[objName], clipValue };
                        }
                    }

                    const objectOnOffTopicId = obj.node.userData.objectOnOffTopicId;
                    if (objectOnOffTopicId !== undefined) {
                        let onOff = assestsNewState[objName].onOff;
                        if (objectOnOffTopicId === messageTopicId) {
                            const fieldName = "objectOnOff";
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                if (mqttMessage[fieldName][objName] === "on") {
                                    onOff = "on";
                                    isAssetStateChanged = true;
                                } else if (mqttMessage[fieldName][objName] === "off") {
                                    onOff = "off";
                                    isAssetStateChanged = true;
                                }
                            }
                        }
                        assestsNewState[objName] = { ...assestsNewState[objName], onOff };
                    }
                });

                genericObjects.forEach((obj) => {
                    const objName = obj.node.name;
                    const animationType = obj.node.userData.animationType;
                    if (animationType === "custom") {
                        isGenericObjectsStateChanged = updateCustomAnimationState(
                            obj.node,
                            genericObjectNewState,
                            messageTopicId,
                            mqttMessage,
                            isGenericObjectsStateChanged
                        )
                    } else if (
                        animationType === "blenderTemporary"
                    ) {
                        const clipTopicId = obj.node.userData.clipTopicId;
                        if (clipTopicId !== undefined) {
                            let clipValue = genericObjectNewState[objName].clipValue;
                            if (clipTopicId === messageTopicId) {
                                const fieldName = obj.node.userData.clipFieldName;
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValue = value;
                                        isGenericObjectsStateChanged = true;
                                    }
                                }
                            }
                            genericObjectNewState[objName] = { ...genericObjectNewState[objName], clipValue };
                        }

                        if (clipSimulationTopicId === messageTopicId) {
                            let clipValue = genericObjectNewState[objName].clipValue;
                            const fieldName = obj.node.userData.clipFieldName;
                            if (fieldName !== undefined ) {
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValue = value;
                                        isGenericObjectsStateChanged = true;
                                    }
                                }
                                genericObjectNewState[objName] = { ...genericObjectNewState[objName], clipValue };
                            }
                        }
                    } else if (
                        animationType === "blenderEndless"
                    ) {
                        const clipTopicId = obj.node.userData.clipTopicId;
                        if (clipTopicId !== undefined) {
                            let clipValue = genericObjectNewState[objName].clipValue;
                            if (clipTopicId === messageTopicId) {
                                const fieldName = "endlessTimeFactor";
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName][objName];
                                    if (typeof value === 'number') {
                                        clipValue = value;
                                        isGenericObjectsStateChanged = true;
                                    }
                                }
                            }
                            genericObjectNewState[objName] = { ...genericObjectNewState[objName], clipValue };
                        }
                    }

                    const objectOnOffTopicId = obj.node.userData.objectOnOffTopicId;
                    if (objectOnOffTopicId !== undefined) {
                        let onOff = genericObjectNewState[objName].onOff;
                        if (objectOnOffTopicId === messageTopicId) {
                            const fieldName = "objectOnOff";
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                if (mqttMessage[fieldName][objName] === "on") {
                                    onOff = "on";
                                    isGenericObjectsStateChanged = true;
                                } else if (mqttMessage[fieldName][objName] === "off") {
                                    onOff = "off";
                                    isGenericObjectsStateChanged = true;
                                }
                            }
                        }
                        genericObjectNewState[objName] = { ...genericObjectNewState[objName], onOff };
                    }

                });

                femSimulationObjects.forEach((obj, index) => {
                    const objName = obj.node.name;
                    const clipTopicId = obj.node.userData.clipTopicId;
                    if (clipTopicId !== undefined) {
                        let clipValue = femSimulationObjectsNewState[index].clipValue;
                        clipTopicId.forEach((clipTopicId: number, index: number) => {
                            const fieldName = obj.node.userData.clipFieldName;
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                const value = mqttMessage[fieldName];
                                if (typeof value === 'number') {
                                    clipValue = value;
                                    isfemSimulationObjectsStateChanged = true;
                                }
                            }
                        });
                        femSimulationObjectsNewState[index] = { ...femSimulationObjectsNewState[index], clipValue };
                    }

                    if (clipSimulationTopicId === messageTopicId) {
                        if (femSimulationObjectsNewState[index] !== undefined &&
                            femSimulationObjectsNewState[index].clipValue !== null
                        ) {
                            let clipValue = femSimulationObjectsNewState[index].clipValue;
                            const fieldName = obj.node.userData.clipFieldName;
                            if (fieldName !== undefined) {
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = mqttMessage[fieldName];
                                    if (typeof value === 'number') {
                                        clipValue = value;
                                        isfemSimulationObjectsStateChanged = true;
                                    }
                                }
                                femSimulationObjectsNewState[index] = { ...femSimulationObjectsNewState[index], clipValue };
                            }
                        }
                    }

                    const objectOnOffTopicId = obj.node.userData.objectOnOffTopicId;
                    if (objectOnOffTopicId !== undefined) {
                        let onOff = femSimulationObjectsNewState[index].onOff;
                        if (objectOnOffTopicId === messageTopicId) {
                            const fieldName = "objectOnOff";
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                if (mqttMessage[fieldName][objName] === "on") {
                                    onOff = "on";
                                    isfemSimulationObjectsStateChanged = true;
                                } else if (mqttMessage[fieldName][objName] === "off") {
                                    isfemSimulationObjectsStateChanged = true;
                                }
                            }
                        }
                        femSimulationObjectsNewState[index] = { ...femSimulationObjectsNewState[index], onOff };
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
                            femSimulationObjectsNewState[imesh].resultFieldModalValues[resultName] = femResultsModalValue;
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

const updateCustomAnimationState = (
    node: THREE.Mesh,
    newObjectState: Record<string, SensorState> | Record<string, AssetState> | Record<string, GenericObjectState>,
    messageTopicId: number,
    mqttMessage: any,
    hasStateChangeIni: boolean
) => {
    const objName = node.name;
    const customTopicId = node.userData.customTopicId as number;
    let isCustomStateChanged = false;
    if (customTopicId !== undefined) {
        const position = newObjectState[objName].position.clone();
        const scale = newObjectState[objName].scale.clone();
        const quaternion = newObjectState[objName].quaternion.clone();
        if (customTopicId === messageTopicId &&
            mqttMessage.customAnimation !== undefined &&
            mqttMessage.customAnimation[objName] !== undefined
        ) {
            const messagePayloadKeys = Object.keys(mqttMessage.customAnimation[objName]);
            if (messagePayloadKeys.indexOf("position") !== -1) {
                const values = mqttMessage.customAnimation[objName]["position"];
                if (Array.isArray(values) && values.length === 3) {
                    position.set(values[0], values[1], values[2]);
                    isCustomStateChanged = true;
                }
            }
            if (messagePayloadKeys.indexOf("scale") !== -1) {
                const values = mqttMessage.customAnimation[objName]["scale"];
                if (Array.isArray(values) && values.length === 3) {
                    scale.set(values[0], values[1], values[2]);
                    isCustomStateChanged = true;
                }
            }
            if (messagePayloadKeys.indexOf("quaternion") !== -1) {
                const values = mqttMessage.customAnimation[objName]["quaternion"];
                if (Array.isArray(values) && values.length === 4) {
                    quaternion.set(values[0], values[1], values[2], values[3]);
                    isCustomStateChanged = true;
                }
            }
        }
        newObjectState[objName] = {
            ...newObjectState[objName],
            position,
            scale,
            quaternion
        };
    }

    return (hasStateChangeIni || isCustomStateChanged);
}

export default useSubscription;