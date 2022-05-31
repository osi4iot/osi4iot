import * as THREE from 'three'
import React, { FC, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { useMqttState, useSubscription } from 'mqtt-react-hooks';
import Sensors from './Sensors';
import GenericObjects from './GenericObjects';
import Assets from './Assets';
import useInterval from '../../../tools/useInterval';
import { useThree } from '@react-three/fiber';
import {
	AssetState,
	FemSimObjectVisibilityState,
	FemSimulationObjectState,
	GenericObjectState,
	IDigitalTwinGltfData,
	ObjectVisibilityState,
	onMeshMouseEnter,
	onMeshMouseExit,
	onMouseClick,
	onMouseDown,
	onMouseMove,
	onTouch,
	SensorState,
	setParameters,
} from './ViewerUtils';
import Lut from './Lut';
import FemSimulationObjects from './FemSimulationObjects';
import { toast } from 'react-toastify';


export interface ISensorObject {
	node: THREE.Mesh;
	collectionName: string;
}

export interface IAssetObject {
	node: THREE.Mesh;
	collectionName: string;
}

export interface IGenericObject {
	node: THREE.Mesh;
	collectionName: string;
}

export interface IResultRenderInfo {
	resultLut: Lut;
	legendCamera: THREE.PerspectiveCamera;
	legendScene: THREE.Scene;
	legendRenderer: THREE.WebGLRenderer;
}


export interface IFemSimulationObject {
	node: THREE.Mesh;
	originalGeometry: Float32Array;
	wireFrameMesh: THREE.LineSegments;
	collectionName: string;
	femResultMaterial: THREE.MeshLambertMaterial;
}

export interface IMeasurement {
	timestamp: number;
	topic: string;
	payload: string;
	totalRows?: number;
}

export interface IMqttTopicData {
	topicId: number;
	topicType: string;
	mqttTopic: string;
	lastMeasurement: IMeasurement | null;
}

interface ModelProps {
	digitalTwinGltfData: IDigitalTwinGltfData;
	sensorObjects: ISensorObject[];
	initialSensorsState: Record<string, SensorState>
	sensorsVisibilityState: Record<string, ObjectVisibilityState>;
	assetObjects: IAssetObject[];
	initialAssetsState: Record<string, AssetState>;
	assetsVisibilityState: Record<string, ObjectVisibilityState>;
	animatedObjectsVisibilityState: Record<string, ObjectVisibilityState>;
	femSimulationObjects: IFemSimulationObject[];
	femSimulationGeneralInfo: Record<string, IResultRenderInfo>;
	initialFemSimObjectsState: FemSimulationObjectState[];
	femSimulationObjectsVisibilityState: Record<string, FemSimObjectVisibilityState>;
	genericObjects: IGenericObject[];
	initialGenericObjectsState: Record<string, GenericObjectState>;
	genericObjectsVisibilityState: Record<string, ObjectVisibilityState>;
	mqttTopicsData: IMqttTopicData[];
	dashboardUrl: string;
	sensorsOpacity: number;
	highlightAllSensors: boolean;
	hideAllSensors: boolean;
	assetsOpacity: number;
	highlightAllAssets: boolean;
	hideAllAssets: boolean;
	animatedObjectsOpacity: number;
	highlightAllAnimatedObjects: boolean;
	hideAllAnimatedObjects: boolean;
	femSimulationObjectsOpacity: number;
	hideAllFemSimulationObjects: boolean;
	highlightAllFemSimulationObjects: boolean;
	showAllFemSimulationMeshes: boolean;
	genericObjectsOpacity: number;
	highlightAllGenericObjects: boolean;
	hideAllGenericObjects: boolean;
	setIsMqttConnected: (isMqttConnected: boolean) => void;
	canvasRef: React.MutableRefObject<null>;
	selectedObjTypeRef: React.MutableRefObject<null>;
	selectedObjNameRef: React.MutableRefObject<null>;
	selectedObjCollectionNameRef: React.MutableRefObject<null>;
	femSimulationResult: string;
	showFemSimulationDeformation: boolean;
	femSimulationDefScale: number;
	digitalTwinSimulatorState: Record<string, number>;
	digitalTwinSimulatorSendData: boolean;
	setFemMinValues: React.Dispatch<React.SetStateAction<number[]>>;
	setFemMaxValues: React.Dispatch<React.SetStateAction<number[]>>;
	initialDigitalTwinSimulatorState: Record<string, number>;
}


const Model: FC<ModelProps> = (
	{
		digitalTwinGltfData,
		sensorObjects,
		initialSensorsState,
		sensorsVisibilityState,
		assetObjects,
		initialAssetsState,
		assetsVisibilityState,
		femSimulationObjects,
		femSimulationGeneralInfo,
		initialFemSimObjectsState,
		femSimulationObjectsVisibilityState,
		genericObjects,
		initialGenericObjectsState,
		genericObjectsVisibilityState,
		mqttTopicsData,
		dashboardUrl,
		sensorsOpacity,
		highlightAllSensors,
		hideAllSensors,
		assetsOpacity,
		highlightAllAssets,
		hideAllAssets,
		femSimulationObjectsOpacity,
		hideAllFemSimulationObjects,
		highlightAllFemSimulationObjects,
		showAllFemSimulationMeshes,
		genericObjectsOpacity,
		highlightAllGenericObjects,
		hideAllGenericObjects,
		setIsMqttConnected,
		canvasRef,
		selectedObjTypeRef,
		selectedObjNameRef,
		selectedObjCollectionNameRef,
		femSimulationResult,
		showFemSimulationDeformation,
		femSimulationDefScale,
		digitalTwinSimulatorState,
		digitalTwinSimulatorSendData,
		setFemMinValues,
		setFemMaxValues,
		initialDigitalTwinSimulatorState
	}) => {
	const camera = useThree((state) => state.camera);
	const container = canvasRef.current as HTMLCanvasElement | null;
	const group = useRef<THREE.Group>();
	const [sensorsState, setSensorsState] = useState<Record<string, SensorState>>(initialSensorsState);
	const [assetsState, setAssetsState] = useState<Record<string, AssetState>>(initialAssetsState);
	const [genericObjectsState, setGenericObjectsState] = useState<Record<string, GenericObjectState>>(initialGenericObjectsState);
	const [femSimulationObjectsState, setFemSimulationObjectsState] = useState<FemSimulationObjectState[]>(initialFemSimObjectsState);
	const { client } = useMqttState();
	const clipSimulationTopicId = mqttTopicsData.filter(topic => topic.topicType === "dev_sim_2dtm")[0].topicId;
	const mqttTopics = mqttTopicsData.map(topicData => topicData.mqttTopic).filter(topic => topic !== "");
	const digitalTwinModelMqttTopic = mqttTopicsData.filter(topic => topic.topicType === "dev_sim_2dtm")[0] || null;
	const { message } = useSubscription(mqttTopics);
	const [lastMqttMessageSended, setLastMqttMessageSended] = useState("");

	const updateSensorStateString = useCallback((objName: string, state: string) => {
		setSensorsState((prevState) => { return { ...prevState, [objName]: { ...prevState[objName], stateString: state } } });
	}, []);

	useLayoutEffect(() => {
		setFemSimulationObjectsState(initialFemSimObjectsState);
	}, [initialFemSimObjectsState, femSimulationObjects]);

	let femResultNames: string[] = [];
	if (femSimulationObjects.length && femSimulationGeneralInfo) {
		femResultNames = digitalTwinGltfData.femSimulationData.metadata.resultFields.map(
			(resultField: { resultName: string; }) => resultField.resultName
		);
	}

	useLayoutEffect(() => {
		const changeObjectHighlight = (objType: string, objName: string, highlighted: boolean) => {
			let highlightSensor = false;
			let highlightAsset = false;
			let highlightGenericObject = false;
			let highlightFemSimulationObject = false;
			if (objType === "sensor" && highlighted) highlightSensor = true;
			else if (objType === "asset" && highlighted) highlightAsset = true;
			else if (objType === "generic" && highlighted) highlightGenericObject = true;
			else if (objType === "femObject" && highlighted) highlightFemSimulationObject = true;


			setSensorsState((prevSensorsState) => {
				const newSensorState = { ...prevSensorsState };
				for (const objLabel in newSensorState) {
					if (objType === "sensor" && objLabel === objName) {
						newSensorState[objLabel] = { ...newSensorState[objLabel], highlight: highlightSensor }
					} else {
						newSensorState[objLabel] = { ...newSensorState[objLabel], highlight: false }
					}
				}
				return newSensorState;
			});

			setAssetsState((prevAssetsState) => {
				const newAssetsState = { ...prevAssetsState };
				for (const objLabel in newAssetsState) {
					if (objType === "asset" && objLabel === objName) {
						newAssetsState[objLabel] = { ...newAssetsState[objLabel], highlight: highlightAsset }
					} else {
						newAssetsState[objLabel] = { ...newAssetsState[objLabel], highlight: false }
					}
				};
				return newAssetsState;
			});

			setGenericObjectsState((prevGenericObjectState) => {
				const newGenericObjectsState = { ...prevGenericObjectState };
				for (const objLabel in newGenericObjectsState) {
					if (objType === "generic" && objLabel === objName) {
						newGenericObjectsState[objLabel] = { ...newGenericObjectsState[objLabel], highlight: highlightGenericObject }
					} else {
						newGenericObjectsState[objLabel] = { ...newGenericObjectsState[objLabel], highlight: false }
					}
				};
				return newGenericObjectsState;
			});

			setFemSimulationObjectsState((prevFemSimulationObjectState) => {
				const newFemSimulationObjectsState = [...prevFemSimulationObjectState];
				for (let imesh = 0; imesh < newFemSimulationObjectsState.length; imesh++) {
					if (objType === "femObject" && femSimulationObjects[imesh].node.name === objName) {
						newFemSimulationObjectsState[imesh] = { ...newFemSimulationObjectsState[imesh], highlight: highlightFemSimulationObject }
					} else {
						newFemSimulationObjectsState[imesh] = { ...newFemSimulationObjectsState[imesh], highlight: false }
					}
				};
				return newFemSimulationObjectsState;
			});
		}

		setParameters(
			camera,
			container,
			selectedObjTypeRef.current as HTMLDivElement | null,
			selectedObjNameRef.current as HTMLDivElement | null,
			selectedObjCollectionNameRef.current as HTMLDivElement | null,
			changeObjectHighlight,
			dashboardUrl
		);
		window.addEventListener('mesh_mouse_enter', onMeshMouseEnter, false);
		window.addEventListener('mesh_mouse_exit', onMeshMouseExit, false);
		container?.addEventListener('click', onMouseClick, false);
		container?.addEventListener('mousemove', onMouseMove, false);
		container?.addEventListener('mousedown', onMouseDown, false);
		container?.addEventListener('touchstart', onTouch, false);

		return () => {
			container?.removeEventListener('mesh_mouse_enter', onMeshMouseEnter);
			container?.removeEventListener('mesh_mouse_exit', onMeshMouseExit);
			container?.removeEventListener('mousemove', onMouseMove);
			container?.removeEventListener('mousedown', onMouseDown);
			container?.removeEventListener('touchstart', onTouch);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [camera, container, setSensorsState, setAssetsState])

	useLayoutEffect(() => {
		if (message) {
			const mqttTopicIndex = mqttTopics.findIndex(topic => topic === message.topic);
			const messageTopicId = mqttTopicsData[mqttTopicIndex].topicId;
			const messageTopicType = mqttTopicsData[mqttTopicIndex].topicType;
			let mqttMessage: any;
			try {
				mqttMessage = JSON.parse(message.message as string);
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
				}

			} catch (error) {
				console.log("Error reading Mqtt message: ", error);
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [message])

	useLayoutEffect(() => {
		if (client && client.connected && digitalTwinSimulatorState !== undefined) {
			if (digitalTwinModelMqttTopic && Object.keys(digitalTwinSimulatorState).length !== 0) {
				if (digitalTwinSimulatorSendData) {
					const mqttTopic = digitalTwinModelMqttTopic.mqttTopic;
					const message = JSON.stringify(digitalTwinSimulatorState);
					if (lastMqttMessageSended !== message) {
						client.publish(mqttTopic, message)
						setLastMqttMessageSended(message);
					}
				} else {
					const dtSimStateString = JSON.stringify(digitalTwinSimulatorState);
					const initialDTSimStateString = JSON.stringify(initialDigitalTwinSimulatorState);
					if (dtSimStateString !== lastMqttMessageSended && dtSimStateString !== initialDTSimStateString) {
						const warningMessage = "Warning: To use the digital twin simulator, reading the measurements from the sensors must be locked.";
						toast.warning(warningMessage);
					}
				}
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [client, digitalTwinSimulatorState, digitalTwinSimulatorSendData]);


	useInterval(() => {
		if (client) {
			if (client.connected) {
				setIsMqttConnected(true);
			} else setIsMqttConnected(false);
		}
	}, 500)

	return (
		<group ref={group} dispose={null}>
			{(sensorObjects.length && sensorsVisibilityState) &&
				<Sensors
					sensorObjects={sensorObjects}
					sensorsOpacity={sensorsOpacity}
					highlightAllSensors={highlightAllSensors}
					hideAllSensors={hideAllSensors}
					sensorsState={sensorsState}
					sensorsVisibilityState={sensorsVisibilityState}
					updateSensorStateString={updateSensorStateString}

				/>
			}
			{
				assetObjects.length &&
				<Assets
					assetObjects={assetObjects}
					assetsOpacity={assetsOpacity}
					highlightAllAssets={highlightAllAssets}
					hideAllAssets={hideAllAssets}
					assetsState={assetsState}
					assetsVisibilityState={assetsVisibilityState}
				/>
			}
			{
				(genericObjects.length && genericObjectsVisibilityState) &&
				<GenericObjects
					genericObjects={genericObjects}
					genericObjectsOpacity={genericObjectsOpacity}
					highlightAllGenericObjects={highlightAllGenericObjects}
					hideAllGenericObjects={hideAllGenericObjects}
					genericObjectsState={genericObjectsState}
					genericObjectsVisibilityState={genericObjectsVisibilityState}
				/>
			}
			{
				(femSimulationObjects.length && femSimulationObjectsState.length) &&
				<FemSimulationObjects
					femSimulationGeneralInfo={femSimulationGeneralInfo}
					digitalTwinGltfData={digitalTwinGltfData}
					femSimulationObjects={femSimulationObjects}
					femSimulationObjectsOpacity={femSimulationObjectsOpacity}
					highlightAllFemSimulationObjects={highlightAllFemSimulationObjects}
					hideAllFemSimulationObjects={hideAllFemSimulationObjects}
					femSimulationObjectsState={femSimulationObjectsState}
					femSimulationResult={femSimulationResult}
					showFemAllMeshes={showAllFemSimulationMeshes}
					showFemSimulationDeformation={showFemSimulationDeformation}
					femSimulationDefScale={femSimulationDefScale}
					femSimulationObjectsVisibilityState={femSimulationObjectsVisibilityState}
					setFemMaxValues={setFemMaxValues}
					setFemMinValues={setFemMinValues}
				/>
			}
		</group>
	)
}

export default Model;
