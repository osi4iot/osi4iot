import { useContext, useEffect } from 'react';
import { SubscribeOptions } from "paho-mqtt";
import * as THREE from 'three';
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
import { IThreeMesh } from '../threeInterfaces';

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
    }, [client,
        sensorsState,
        assetsState,
        genericObjectsState,
        femSimulationObjectsState,
        digitalTwinSimulatorSendData
    ]);
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
    const sim2dtmTopicId = mqttTopicsData.filter(topic => topic.topicType === "sim2dtm")[0].topicId;
    const dev2simTopicId = mqttTopicsData.filter(topic => topic.topicType === "dev2sim")[0].topicId;
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

            if ((messageTopicType === "dev2pdb" && !digitalTwinSimulatorSendData) ||
                messageTopicType === "dev2sim" || messageTopicType === "sim2dtm"
            ) {
                sensorObjects.forEach((obj) => {
                    const objName = obj.node.name;
                    const sensorTopicId = obj.node.userData.sensorTopicId;
                    if (
                        sensorTopicId === messageTopicId ||
                        sim2dtmTopicId === messageTopicId ||
                        dev2simTopicId === messageTopicId
                    ) {
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
                    if (animationType === "blenderTemporary") {
                        const clipTopicId = obj.node.userData.clipTopicId;
                        if ((clipTopicId !== undefined && clipTopicId === messageTopicId) ||
                            sim2dtmTopicId === messageTopicId
                        ) {
                            let clipValue = sensorsNewState[objName].clipValue;
                            const fieldName = obj.node.userData.clipFieldName;
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
                });

                assetObjects.forEach((obj) => {
                    const objName = obj.node.name;
                    const animationType = obj.node.userData.animationType;
                    if (animationType === "blenderTemporary") {
                        const clipTopicId = obj.node.userData.clipTopicId;
                        if ((clipTopicId !== undefined && clipTopicId === messageTopicId) ||
                            sim2dtmTopicId === messageTopicId
                        ) {
                            let clipValue = assestsNewState[objName].clipValue;
                            const fieldName = obj.node.userData.clipFieldName;
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
                });

                genericObjects.forEach((obj) => {
                    const objName = obj.node.name;
                    const animationType = obj.node.userData.animationType;
                    if (animationType === "blenderTemporary") {
                        const clipTopicId = obj.node.userData.clipTopicId;
                        if ((clipTopicId !== undefined && clipTopicId === messageTopicId) ||
                            sim2dtmTopicId === messageTopicId
                        ) {
                            let clipValue = genericObjectNewState[objName].clipValue;
                            const fieldName = obj.node.userData.clipFieldName;
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
                });

                femSimulationObjects.forEach((obj, index) => {
                    const clipTopicId = obj.node.userData.clipTopicId;
                    if ((clipTopicId !== undefined && clipTopicId === messageTopicId) ||
                        sim2dtmTopicId === messageTopicId
                    ) {
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

                });
            }

            if (messageTopicType === "dtm2sim") {
                let eventTriggerTopicType = "dev2pdb";
                if (messagePayloadKeys.includes("eventTriggerTopicType")) {
                    eventTriggerTopicType = mqttMessage["eventTriggerTopicType"];
                }
                if (
                    (digitalTwinSimulatorSendData && eventTriggerTopicType === "sim2dtm") ||
                    (!digitalTwinSimulatorSendData &&
                        (
                            eventTriggerTopicType === "dev2pdb" ||
                            eventTriggerTopicType === "dev2pdb_wt" ||
                            eventTriggerTopicType === "dev2sim"
                        )
                    )
                ) {
                    sensorObjects.forEach((obj) => {
                        const objName = obj.node.name;
                        const fieldName = obj.node.userData.fieldName;
                        if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                            const value = mqttMessage[fieldName];
                            if (typeof value === 'number' ||
                                (Array.isArray(value) && value.findIndex((elem: any) => elem === null) !== -1)
                            ) {
                                sensorsNewState[objName] = { ...sensorsNewState[objName], sensorValue: value };
                                isSensorStateChanged = true;
                            }
                        }
                        if (obj.node.blenderAnimationTypes.includes("blenderEndless")) {
                            let clipValue = genericObjectNewState[objName].clipValue;
                            const fieldName = "endlessTimeFactor";
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                const value = mqttMessage[fieldName][objName];
                                if (typeof value === 'number') {
                                    clipValue = value;
                                    isSensorStateChanged = true;
                                }
                            }
                            sensorsNewState[objName] = { ...sensorsNewState[objName], clipValue };
                        }

                        if (obj.node.customAnimationObjectNames.length !== 0) {
                            const fieldName = "customAnimation";
                            if (messagePayloadKeys.includes(fieldName)) {
                                updateCustomAnimationState(obj.node, mqttMessage)
                            }
                        }

                        if (obj.node.onOffObjectNames.length !== 0) {
                            const fieldName = "objectOnOff";
                            if (messagePayloadKeys.includes(fieldName)) {
                                setObjectsOnOff(obj.node, mqttMessage[fieldName]);
                            }
                        }

                    });

                    assetObjects.forEach((obj) => {
                        const objName = obj.node.name;
                        if (obj.node.blenderAnimationTypes.includes("blenderEndless")) {
                            let clipValue = assestsNewState[objName].clipValue;
                            const fieldName = "endlessTimeFactor";
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                const value = mqttMessage[fieldName][objName];
                                if (typeof value === 'number') {
                                    clipValue = value;
                                    isAssetStateChanged = true;
                                }
                            }
                            assestsNewState[objName] = { ...assestsNewState[objName], clipValue };
                        }

                        if (obj.node.customAnimationObjectNames.length !== 0) {
                            const fieldName = "customAnimation";
                            if (messagePayloadKeys.includes(fieldName)) {
                                updateCustomAnimationState(obj.node, mqttMessage)
                            }
                        }

                        if (obj.node.onOffObjectNames.length !== 0) {
                            const fieldName = "objectOnOff";
                            if (messagePayloadKeys.includes(fieldName)) {
                                setObjectsOnOff(obj.node, mqttMessage[fieldName]);
                            }
                        }

                        if (mqttMessage.assetPartsState !== undefined) {
                            const assetPartIndex = obj.node.userData.assetPartIndex;
                            const stateNumber = parseInt(mqttMessage.assetPartsState[assetPartIndex - 1], 10);
                            if (stateNumber === 1) {
                                assestsNewState[objName] = { ...assestsNewState[objName], stateString: "alerting" };
                            } else if (stateNumber === 0) {
                                assestsNewState[objName] = { ...assestsNewState[objName], stateString: "ok" };
                            }
                            isAssetStateChanged = true;
                        }
                    });

                    genericObjects.forEach((obj) => {
                        const objName = obj.node.name;
                        if (obj.node.blenderAnimationTypes.includes("blenderEndless")) {
                            let clipValue = genericObjectNewState[objName].clipValue;
                            const fieldName = "endlessTimeFactor";
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                const value = mqttMessage[fieldName][objName];
                                if (typeof value === 'number') {
                                    clipValue = value;
                                    isGenericObjectsStateChanged = true;
                                }
                            }
                            genericObjectNewState[objName] = { ...genericObjectNewState[objName], clipValue };
                        }

                        if (obj.node.customAnimationObjectNames.length !== 0) {
                            const fieldName = "customAnimation";
                            if (messagePayloadKeys.includes(fieldName)) {
                                updateCustomAnimationState(obj.node, mqttMessage)
                            }
                        }

                        if (obj.node.onOffObjectNames.length !== 0) {
                            const fieldName = "objectOnOff";
                            if (messagePayloadKeys.includes(fieldName)) {
                                setObjectsOnOff(obj.node, mqttMessage[fieldName]);
                            }
                        }
                    });

                    femSimulationObjects.forEach((obj, index) => {
                        const objName = obj.node.name;
                        if (obj.node.blenderAnimationTypes.includes("blenderEndless")) {
                            let clipValue = genericObjectNewState[objName].clipValue;
                            const fieldName = "endlessTimeFactor";
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                const value = mqttMessage[fieldName][objName];
                                if (typeof value === 'number') {
                                    clipValue = value;
                                    isfemSimulationObjectsStateChanged = true;
                                }
                            }
                            femSimulationObjectsNewState[index] = { ...femSimulationObjectsNewState[index], clipValue };
                        }

                        if (obj.node.customAnimationObjectNames.length !== 0) {
                            const fieldName = "customAnimation";
                            if (messagePayloadKeys.includes(fieldName)) {
                                updateCustomAnimationState(obj.node, mqttMessage);
                                const customAnimationPayloadKeys = Object.keys(mqttMessage.customAnimation[objName]);
                                if (customAnimationPayloadKeys.indexOf("position") !== -1) {
                                    const wirePos = obj.node.scale;
                                    obj.wireFrameMesh.position.set(wirePos.x, wirePos.y, wirePos.z);
                                }
                                if (customAnimationPayloadKeys.indexOf("scale") !== -1) {
                                    const wireScale = obj.node.scale;
                                    obj.wireFrameMesh.scale.set(wireScale.x, wireScale.y, wireScale.z);
                                }
                                if (customAnimationPayloadKeys.indexOf("quaternion") !== -1) {
                                    const qres = obj.node.quaternion;
                                    obj.wireFrameMesh.quaternion.set(qres.x, qres.y, qres.z, qres.w);
                                }
                            }
                        }

                        if (obj.node.onOffObjectNames.length !== 0) {
                            const fieldName = "objectOnOff";
                            if (messagePayloadKeys.includes(fieldName)) {
                                setObjectsOnOff(obj.node, mqttMessage[fieldName]);
                            }
                        }

                        if (mqttMessage.femResultsModalValues !== undefined) {
                            for (let imesh = 0; imesh < femSimulationObjectsState.length; imesh++) {
                                for (let ires = 0; ires < femResultNames.length; ires++) {
                                    const resultName = femResultNames[ires];
                                    const femResultsModalValue = mqttMessage.femResultsModalValues[imesh][ires];
                                    femSimulationObjectsNewState[imesh].resultFieldModalValues[resultName] = femResultsModalValue;
                                    isfemSimulationObjectsStateChanged = true
                                }
                            }
                        }

                    });

                    if (mqttMessage.newFemResFile !== undefined) {
                        const femResFilesLastUpdate = new Date();
                        setFemResFilesLastUpdate(femResFilesLastUpdate);
                    }
                }
            }

            if (isSensorStateChanged) setSensorsState(sensorsNewState);
            if (isAssetStateChanged) setAssetsState(assestsNewState);
            if (isGenericObjectsStateChanged) setGenericObjectsState(genericObjectNewState);
            if (isfemSimulationObjectsStateChanged) setFemSimulationObjectsState(femSimulationObjectsNewState);
        }

    } catch (error) {
        console.log("Error reading Mqtt message: ", error);
    }
}


const updateCustomAnimationState = (
    node: IThreeMesh,
    mqttMessage: any,
) => {

    if (mqttMessage.customAnimation !== undefined) {
        const msgObjNames = Object.keys(mqttMessage.customAnimation);
        const objNamesFiltered = node.customAnimationObjectNames.filter(objName => msgObjNames.includes(objName));
        for (const objName of objNamesFiltered) {
            const messagePayloadKeys = Object.keys(mqttMessage.customAnimation[objName]);
            const msgData = mqttMessage.customAnimation[objName];
            findObjectAndSetCustomProperties(node, objName, messagePayloadKeys, msgData);
        }
    }
}

const findObjectAndSetCustomProperties = (
    node: IThreeMesh,
    objName: string,
    messagePayloadKeys: string[],
    msgData: any
) => {
    if (node.name === objName) {
        if (messagePayloadKeys.indexOf("position") !== -1) {
            const values = msgData["position"];
            if (Array.isArray(values) && values.length === 3) {
                node.position.set(values[0], values[1], values[2]);
            }
        }
        if (messagePayloadKeys.indexOf("scale") !== -1) {
            const values = msgData["scale"];
            if (Array.isArray(values) && values.length === 3) {
                node.scale.set(values[0], values[1], values[2]);
            }
        }
        if (messagePayloadKeys.indexOf("quaternion") !== -1) {
            const values = msgData["quaternion"];
            if (Array.isArray(values) && values.length === 4) {
                const qr = new THREE.Quaternion(values[0], values[1], values[2], values[3]);
                const qres = new THREE.Quaternion().multiplyQuaternions(qr, node.quaternionIni);
                node.quaternion.set(qres.x, qres.y, qres.z, qres.w);
            }
        }
        return;
    } else {
        for (const childNode of node.children) {
            findObjectAndSetCustomProperties(childNode as IThreeMesh, objName, messagePayloadKeys, msgData);
        }
    }
}

const setObjectsOnOff = (
    node: IThreeMesh,
    mqttMessage: any,
) => {
    const msgObjNames = Object.keys(mqttMessage);
    const objNamesFiltered = node.onOffObjectNames.filter(objName => msgObjNames.includes(objName));
    for (const objName of objNamesFiltered) {
        const onOff = mqttMessage[objName];
        findOnOffObjectAndSetProperty(node, objName, onOff);
    }
}

const findOnOffObjectAndSetProperty = (
    node: IThreeMesh,
    objName: string,
    onOff: string
) => {
    if (node.name === objName) {
        if (onOff === "on") {
            node.visible = true;
        } else if (onOff === "off") {
            node.visible = false;
        }
        return;
    } else {
        for (const childNode of node.children) {
            findOnOffObjectAndSetProperty(childNode as IThreeMesh, objName, onOff);
        }
    }
}

export default useSubscription;