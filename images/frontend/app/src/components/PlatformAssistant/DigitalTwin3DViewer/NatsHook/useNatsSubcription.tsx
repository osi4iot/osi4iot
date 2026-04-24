import { useEffect, useRef } from "react";
import { NatsConnection, StringCodec } from "nats.ws";
import * as THREE from "three";
import { matches, mqttTopicToNatsSubject } from "./tools";
import { IAssetObject, IFemSimulationObject, IGenericObject, IMqttTopicData, INatsSubjectData, ISensorObject } from "../Main/Model";
import { AssetState, FemSimulationObjectState, GenericObjectState, SensorState } from "../ViewerTools/ViewerUtils";
import { IThreeMesh } from "../Types/threeInterfaces";
import formatDateString from "../../../../tools/formatDate";
import { ChatMessage, LlmMessage } from "../ChatAssitant/ChatAssistant";
import { PipelineLog } from "../Pipeline/PipelineLogs";
import { IMessage } from "./interfaces";

const sc = StringCodec();

const useNatsSubscription = (
    natsClient: NatsConnection | null,
    natsSubjects: string | string[],
    natsSubjectsData: INatsSubjectData[],
    topicIdBySensorRef: Record<string, number>,
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
    isGroupDTDemo: boolean,
    setDigitalTwinState: React.Dispatch<React.SetStateAction<string>>,
    handleImageUrlChange: (imageBytes: Uint8Array, mimeType: string) => void,
    handleUpdateChatAssistantMessages: (newMessage: LlmMessage) => void,
    handleUpdateLogMessages: (newLogMessage: PipelineLog) => void,
    handlePipelineStatusChange: (pipelineStatus: string) => void,
    handlePipelineLeaderReplicaIndexChange: (index: number) => void,
    handleSetChatMessages: (messages: ChatMessage[]) => void,
) => {
    let femResultNames: string[] = [];
    if (femSimulationObjects.length && femResultData && Object.keys(femResultData).length !== 0) {
        femResultNames = femResultData.metadata.resultFields.map(
            (resultField: { resultName: string }) => resultField.resultName,
        );
    }

    const stateRef = useRef({
        sensorsState,
        assetsState,
        genericObjectsState,
        femSimulationObjectsState,
        digitalTwinSimulatorSendData,
        femResultNames,
    });

    useEffect(() => {
        stateRef.current = {
            sensorsState,
            assetsState,
            genericObjectsState,
            femSimulationObjectsState,
            digitalTwinSimulatorSendData,
            femResultNames,
        };
    });

    useEffect(() => {
        if (!natsClient) return;
        const subjects = [natsSubjects].flat().map(mqttTopicToNatsSubject);
        const subscriptions = subjects.map((subject) => natsClient.subscribe(subject));
        const abortController = new AbortController();

        for (const sub of subscriptions) {
            (async () => {
                for await (const msg of sub) {
                    if (abortController.signal.aborted) break;

                    const subject = mqttTopicToNatsSubject(msg.subject);
                    if (!subjects.some((pattern) => matches(pattern, subject))) continue;

                    // Check Content-Type header to decide how to process the payload
                    const contentType = msg.headers?.get("Content-Type") ?? "";

                    if (contentType.startsWith("image/")) {
                        // Binary image payload — pass bytes and mime type directly,
                        // no JSON parsing needed
                        handleImageUrlChange(msg.data, contentType);
                        continue;
                    }

                    // JSON payload — decode and pass to state update logic
                    const receivedMessage: IMessage = {
                        topic: subject,
                        message: sc.decode(msg.data),
                    };

                    const s = stateRef.current;
                    updateObjectsState(
                        receivedMessage,
                        natsSubjectsData,
                        topicIdBySensorRef,
                        s.sensorsState,
                        s.assetsState,
                        s.genericObjectsState,
                        s.femSimulationObjectsState,
                        s.digitalTwinSimulatorSendData,
                        sensorObjects,
                        assetObjects,
                        genericObjects,
                        femSimulationObjects,
                        setAssetsState,
                        setSensorsState,
                        setGenericObjectsState,
                        setFemSimulationObjectsState,
                        s.femResultNames,
                        setFemResFilesLastUpdate,
                        isGroupDTDemo,
                        setDigitalTwinState,
                        handleUpdateChatAssistantMessages,
                        handleUpdateLogMessages,
                        handlePipelineStatusChange,
                        handlePipelineLeaderReplicaIndexChange,
                        handleSetChatMessages,
                    );
                }
            })();
        }

        return () => {
            abortController.abort();
            for (const sub of subscriptions) {
                sub.unsubscribe();
            }
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [natsClient]);
};

const updateObjectsState = (
    recievedMessage: IMessage,
    natsSubjectsData: INatsSubjectData[],
    topicIdBySensorRef: Record<string, number>,
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
    isGroupDTDemo: boolean,
    setDigitalTwinState: React.Dispatch<React.SetStateAction<string>>,
    // Note: handleImageUrlChange is no longer a parameter here — image messages
    // are intercepted before reaching this function (see Content-Type check above)
    handleUpdateChatAssistantMessages: (newMessage: LlmMessage) => void,
    handleUpdateLogMessages: (newLogMessage: PipelineLog) => void,
    handlePipelineStatusChange: (pipelineStatus: string) => void,
    handlePipelineLeaderReplicaIndexChange: (index: number) => void,
    handleSetChatMessages: (messages: ChatMessage[]) => void,
) => {
    const natsSubjects = natsSubjectsData
        .map((subjectData) => subjectData.natsSubject)
        .filter((subject) => subject !== "");
    const sim2dtmTopicId = natsSubjectsData.filter((subjectData) => subjectData.topicRef === "sim2dtm")[0].topicId;
    const dev2simTopicId = natsSubjectsData.filter((subjectData) => subjectData.topicRef === "dev2sim")[0].topicId;
    const natsSubjectIndex = natsSubjects.findIndex(
        (subject) => subject === mqttTopicToNatsSubject(recievedMessage.topic),
    );
    const messageTopicId = natsSubjectsData[natsSubjectIndex].topicId;
    const messageTopicRef = natsSubjectsData[natsSubjectIndex].topicRef;
    let natsMessage: any;
    try {
        natsMessage = JSON.parse(recievedMessage.message as string);
        if (natsMessage) {
            const messagePayloadKeys = Object.keys(natsMessage);
            const sensorsNewState = { ...sensorsState };
            let isSensorStateChanged = false;
            const assestsNewState = { ...assetsState };
            let isAssetStateChanged = false;
            const genericObjectNewState = { ...genericObjectsState };
            let isGenericObjectsStateChanged = false;
            let isfemSimulationObjectsStateChanged = false;

            const femSimulationObjectsNewState = femSimulationObjectsState.map((obj) => ({
                ...obj,
                resultFieldModalValues: Object.fromEntries(
                    Object.entries(obj.resultFieldModalValues).map(([key, value]) => [key, [...value]]),
                ),
            }));

            let digitalTwinState = "OK";

            if (isGroupDTDemo && messageTopicRef === "dev2pdb_3") {
                genericObjects.forEach((obj) => {
                    const objName = obj.node.name;
                    if (objName === "EMPTY_CONTROL_POINTER") {
                        setOrientationForGroupDemoDT(obj.node, natsMessage);
                    }
                });
            }

            if (messageTopicRef === "llm2sim") {
                const newMessage: LlmMessage = {
                    message: natsMessage.message,
                    uiOpts: natsMessage.uiOpts,
                    mcpToolCalls: natsMessage.mcpToolCalls,
                    sender: "assistant",
                };
                handleUpdateChatAssistantMessages(newMessage);
            }

            if (messageTopicRef === "dtmlog") {
                const newLogMessage: PipelineLog = {
                    level: natsMessage.level,
                    component: natsMessage.component,
                    name: natsMessage.name,
                    uid: natsMessage.uid,
                    message: natsMessage.message,
                    description: natsMessage.description,
                    outputIndex: natsMessage.outputIndex || 0,
                    payload: natsMessage.payload || {},
                    state: natsMessage.state || {},
                    date: formatDateString(new Date().toISOString()),
                };
                handleUpdateLogMessages(newLogMessage);
            }

            if (messageTopicRef === "state2sim") {
                if (natsMessage.pipelineStatus !== undefined) {
                    handlePipelineStatusChange(natsMessage.pipelineStatus);
                }
                if (natsMessage.replicaIndexLeader !== undefined) {
                    handlePipelineLeaderReplicaIndexChange(natsMessage.replicaIndexLeader);
                }
                if (natsMessage.chatMessages !== undefined) {
                    handleSetChatMessages(natsMessage.chatMessages);
                }
            }

            if (
                ((messageTopicRef.slice(0, 7) === "dev2pdb" || messageTopicRef === "dev2sim") &&
                    !digitalTwinSimulatorSendData) ||
                (messageTopicRef === "sim2dtm" && digitalTwinSimulatorSendData)
            ) {
                sensorObjects.forEach((obj) => {
                    const objName = obj.node.name;
                    const sensorRef = obj.node.userData.sensorRef;
                    const sensorTopicId = topicIdBySensorRef[sensorRef];
                    if (
                        sensorTopicId === messageTopicId ||
                        sim2dtmTopicId === messageTopicId ||
                        dev2simTopicId === messageTopicId
                    ) {
                        const fieldName = obj.node.userData.fieldName;
                        if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                            const value = natsMessage[fieldName];
                            let stateString = sensorsNewState[objName].stateString;
                            if (
                                typeof value === "number" ||
                                (Array.isArray(value) && value.findIndex((elem: any) => elem === null) !== -1)
                            ) {
                                if (sensorTopicId === messageTopicId) stateString = "on";
                                sensorsNewState[objName] = {
                                    ...sensorsNewState[objName],
                                    stateString,
                                    sensorValue: value,
                                };
                                isSensorStateChanged = true;
                            }
                        }
                    }
                    const animationType = obj.node.userData.animationType;
                    if (animationType === "blenderTemporary") {
                        const clipSensorRef = obj.node.userData.clipSensorRef;
                        const clipTopicId = topicIdBySensorRef[clipSensorRef];
                        if (
                            (clipTopicId !== undefined && clipTopicId === messageTopicId) ||
                            sim2dtmTopicId === messageTopicId ||
                            dev2simTopicId === messageTopicId
                        ) {
                            let clipValue = sensorsNewState[objName].clipValue;
                            const fieldName = obj.node.userData.clipFieldName;
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                const value = natsMessage[fieldName];
                                if (typeof value === "number") {
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
                        const clipSensorRef = obj.node.userData.clipSensorRef;
                        const clipTopicId = topicIdBySensorRef[clipSensorRef];
                        if (
                            (clipTopicId !== undefined && clipTopicId === messageTopicId) ||
                            sim2dtmTopicId === messageTopicId ||
                            dev2simTopicId === messageTopicId
                        ) {
                            let clipValue = assestsNewState[objName].clipValue;
                            const fieldName = obj.node.userData.clipFieldName;
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                const value = natsMessage[fieldName];
                                if (typeof value === "number") {
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
                        const clipSensorRef = obj.node.userData.clipSensorRef;
                        const clipTopicId = topicIdBySensorRef[clipSensorRef];
                        if (
                            (clipTopicId !== undefined && clipTopicId === messageTopicId) ||
                            sim2dtmTopicId === messageTopicId ||
                            dev2simTopicId === messageTopicId
                        ) {
                            let clipValue = genericObjectNewState[objName].clipValue;
                            const fieldName = obj.node.userData.clipFieldName;
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                const value = natsMessage[fieldName];
                                if (typeof value === "number") {
                                    clipValue = value;
                                    isGenericObjectsStateChanged = true;
                                }
                            }
                            genericObjectNewState[objName] = { ...genericObjectNewState[objName], clipValue };
                        }
                    }
                });

                femSimulationObjects.forEach((obj, index) => {
                    const clipSensorRef = obj.node.userData.clipSensorRef;
                    const clipTopicId = topicIdBySensorRef[clipSensorRef];
                    if (
                        (clipTopicId !== undefined && clipTopicId === messageTopicId) ||
                        sim2dtmTopicId === messageTopicId ||
                        dev2simTopicId === messageTopicId
                    ) {
                        if (
                            femSimulationObjectsNewState[index] !== undefined &&
                            femSimulationObjectsNewState[index].clipValue !== null
                        ) {
                            let clipValue = femSimulationObjectsNewState[index].clipValue;
                            const fieldName = obj.node.userData.clipFieldName;
                            if (fieldName !== undefined) {
                                if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                    const value = natsMessage[fieldName];
                                    if (typeof value === "number") {
                                        clipValue = value;
                                        isfemSimulationObjectsStateChanged = true;
                                    }
                                }
                                femSimulationObjectsNewState[index] = {
                                    ...femSimulationObjectsNewState[index],
                                    clipValue,
                                };
                            }
                        }
                    }
                });
            }

            if (messageTopicRef === "dtm2sim" || messageTopicRef === "llm2sim") {
                let eventTriggerTopicType = "dev2pdb";
                if (messagePayloadKeys.includes("eventTriggerTopicType")) {
                    eventTriggerTopicType = natsMessage["eventTriggerTopicType"];
                }
                if (
                    (digitalTwinSimulatorSendData && eventTriggerTopicType === "sim2dtm") ||
                    (!digitalTwinSimulatorSendData &&
                        (eventTriggerTopicType === "dev2pdb" ||
                            eventTriggerTopicType === "dev2pdb_wt" ||
                            eventTriggerTopicType === "dev2sim" ||
                            eventTriggerTopicType === "llm2sim"))
                ) {
                    sensorObjects.forEach((obj) => {
                        const objName = obj.node.name;
                        const fieldName = obj.node.userData.fieldName;
                        let llmResponseValue: null | number = null;
                        if (eventTriggerTopicType === "llm2sim" && messagePayloadKeys.includes("uiOpts")) {
                            const dtSimState = natsMessage.uiOpts?.digitalTwinSimulatorState;
                            if (dtSimState != null && dtSimState[fieldName] != null) {
                                llmResponseValue = natsMessage.uiOpts.digitalTwinSimulatorState[fieldName];
                            }
                        }
                        if (messagePayloadKeys.indexOf(fieldName) !== -1 || llmResponseValue !== null) {
                            const value = llmResponseValue === null ? natsMessage[fieldName] : llmResponseValue;
                            if (
                                typeof value === "number" ||
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
                                const value = natsMessage[fieldName][objName];
                                if (typeof value === "number") {
                                    clipValue = value;
                                    isSensorStateChanged = true;
                                }
                            }
                            sensorsNewState[objName] = { ...sensorsNewState[objName], clipValue };
                        }

                        if (obj.node.customAnimationObjectNames.length !== 0) {
                            const fieldName = "customAnimation";
                            if (messagePayloadKeys.includes(fieldName)) {
                                updateCustomAnimationState(obj.node, natsMessage);
                            }
                        }

                        if (obj.node.onOffObjectNames.length !== 0) {
                            const fieldName = "objectOnOff";
                            if (messagePayloadKeys.includes(fieldName)) {
                                setObjectsOnOff(obj.node, natsMessage[fieldName]);
                            }
                        }
                    });

                    assetObjects.forEach((obj) => {
                        const objName = obj.node.name;
                        if (obj.node.blenderAnimationTypes.includes("blenderEndless")) {
                            let clipValue = assestsNewState[objName].clipValue;
                            const fieldName = "endlessTimeFactor";
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                const value = natsMessage[fieldName][objName];
                                if (typeof value === "number") {
                                    clipValue = value;
                                    isAssetStateChanged = true;
                                }
                            }
                            assestsNewState[objName] = { ...assestsNewState[objName], clipValue };
                        }

                        if (obj.node.customAnimationObjectNames.length !== 0) {
                            const fieldName = "customAnimation";
                            if (messagePayloadKeys.includes(fieldName)) {
                                updateCustomAnimationState(obj.node, natsMessage);
                            }
                        }

                        if (obj.node.onOffObjectNames.length !== 0) {
                            const fieldName = "objectOnOff";
                            if (messagePayloadKeys.includes(fieldName)) {
                                setObjectsOnOff(obj.node, natsMessage[fieldName]);
                            }
                        }

                        if (natsMessage.assetPartsState !== undefined) {
                            const assetPartIndex = obj.node.userData.assetPartIndex;
                            const stateNumber = parseInt(natsMessage.assetPartsState[assetPartIndex - 1], 10);
                            if (stateNumber === 1) {
                                assestsNewState[objName] = { ...assestsNewState[objName], stateString: "alerting" };
                                digitalTwinState = "Alerting";
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
                                const value = natsMessage[fieldName][objName];
                                if (typeof value === "number") {
                                    clipValue = value;
                                    isGenericObjectsStateChanged = true;
                                }
                            }
                            genericObjectNewState[objName] = { ...genericObjectNewState[objName], clipValue };
                        }

                        if (obj.node.customAnimationObjectNames.length !== 0) {
                            const fieldName = "customAnimation";
                            if (messagePayloadKeys.includes(fieldName)) {
                                updateCustomAnimationState(obj.node, natsMessage);
                            }
                        }

                        if (obj.node.onOffObjectNames.length !== 0) {
                            const fieldName = "objectOnOff";
                            if (messagePayloadKeys.includes(fieldName)) {
                                setObjectsOnOff(obj.node, natsMessage[fieldName]);
                            }
                        }
                    });

                    femSimulationObjects.forEach((obj, index) => {
                        const objName = obj.node.name;
                        if (obj.node.blenderAnimationTypes.includes("blenderEndless")) {
                            let clipValue = genericObjectNewState[objName].clipValue;
                            const fieldName = "endlessTimeFactor";
                            if (messagePayloadKeys.indexOf(fieldName) !== -1) {
                                const value = natsMessage[fieldName][objName];
                                if (typeof value === "number") {
                                    clipValue = value;
                                    isfemSimulationObjectsStateChanged = true;
                                }
                            }
                            femSimulationObjectsNewState[index] = { ...femSimulationObjectsNewState[index], clipValue };
                        }

                        if (obj.node.customAnimationObjectNames.length !== 0) {
                            const fieldName = "customAnimation";
                            if (messagePayloadKeys.includes(fieldName)) {
                                updateCustomAnimationState(obj.node, natsMessage);
                                const customAnimationPayloadKeys = Object.keys(natsMessage.customAnimation[objName]);
                                if (customAnimationPayloadKeys.indexOf("position") !== -1) {
                                    const wirePos = obj.node.position;
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
                                setObjectsOnOff(obj.node, natsMessage[fieldName]);
                            }
                        }

                        if (natsMessage.femResultsModalValues !== undefined) {
                            for (let imesh = 0; imesh < femSimulationObjectsState.length; imesh++) {
                                for (let ires = 0; ires < femResultNames.length; ires++) {
                                    const resultName = femResultNames[ires];
                                    let femResultsModalValue = natsMessage.femResultsModalValues[imesh][ires];
                                    if (femResultsModalValue === undefined) femResultsModalValue = 0;
                                    femSimulationObjectsNewState[imesh].resultFieldModalValues[resultName] =
                                        femResultsModalValue;
                                    isfemSimulationObjectsStateChanged = true;
                                }
                            }
                        }
                    });

                    if (natsMessage.newFemResFile !== undefined) {
                        const femResFilesLastUpdate = new Date();
                        setFemResFilesLastUpdate(femResFilesLastUpdate);
                    }
                }
            }

            if (isSensorStateChanged) setSensorsState(sensorsNewState);
            if (isAssetStateChanged) {
                setAssetsState(assestsNewState);
                setDigitalTwinState(digitalTwinState);
            }
            if (isGenericObjectsStateChanged) setGenericObjectsState(genericObjectNewState);
            if (isfemSimulationObjectsStateChanged) setFemSimulationObjectsState(femSimulationObjectsNewState);
        }
    } catch (error) {
        console.log("Error reading NATS message: ", error);
    }
};

const updateCustomAnimationState = (node: IThreeMesh, natsMessage: any) => {
    if (natsMessage.customAnimation !== undefined) {
        const msgObjNames = Object.keys(natsMessage.customAnimation);
        const objNamesFiltered = node.customAnimationObjectNames.filter((objName) => msgObjNames.includes(objName));
        for (const objName of objNamesFiltered) {
            const messagePayloadKeys = Object.keys(natsMessage.customAnimation[objName]);
            const msgData = natsMessage.customAnimation[objName];
            findObjectAndSetCustomProperties(node, objName, messagePayloadKeys, msgData);
        }
    }
};

const findObjectAndSetCustomProperties = (
    node: IThreeMesh,
    objName: string,
    messagePayloadKeys: string[],
    msgData: any,
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
};

const setOrientationForGroupDemoDT = (node: IThreeMesh, natsMessage: any) => {
    if (natsMessage.mobile_quaternion) {
        const mobile_quaternion = natsMessage.mobile_quaternion;
        const quaternion = [mobile_quaternion[0], mobile_quaternion[2], -mobile_quaternion[1], mobile_quaternion[3]];
        const qr = new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
        const qres = new THREE.Quaternion().multiplyQuaternions(qr, node.quaternionIni);
        node.quaternion.set(qres.x, qres.y, qres.z, qres.w);
    }
};

const setObjectsOnOff = (node: IThreeMesh, natsMessage: any) => {
    const msgObjNames = Object.keys(natsMessage);
    const objNamesFiltered = node.onOffObjectNames.filter((objName) => msgObjNames.includes(objName));
    for (const objName of objNamesFiltered) {
        const onOff = natsMessage[objName];
        findOnOffObjectAndSetProperty(node, objName, onOff);
    }
};

const findOnOffObjectAndSetProperty = (node: IThreeMesh, objName: string, onOff: string) => {
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
};

export default useNatsSubscription;