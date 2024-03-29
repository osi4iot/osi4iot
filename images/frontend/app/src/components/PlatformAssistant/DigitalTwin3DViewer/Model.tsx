import * as THREE from 'three'
import React, { FC, useRef, useState, useLayoutEffect, useCallback } from 'react';
import Paho from "paho-mqtt";
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
import useMqttState from './MqttHook/useMqttState';
import useSubscription from './MqttHook/useSubscription';
import { IThreeMesh } from './threeInterfaces';

export interface ISensorObject {
	node: IThreeMesh;
	collectionName: string;
}

export interface IAssetObject {
	node: IThreeMesh;
	collectionName: string;
}

export interface IGenericObject {
	node: IThreeMesh;
	collectionName: string;
}

export interface IResultRenderInfo {
	resultLut: Lut;
	legendCamera: THREE.PerspectiveCamera;
	legendScene: THREE.Scene;
	legendRenderer: THREE.WebGLRenderer;
}


export interface IFemSimulationObject {
	node: IThreeMesh;
	originalGeometry: Float32Array;
	wireFrameMesh: THREE.LineSegments;
	collectionName: string;
	femResultMaterial: THREE.MeshLambertMaterial;
	originalMaterial: THREE.MeshStandardMaterial;
}

export interface IMeasurement {
	timestamp: number;
	topic: string;
	payload: string;
	totalRows?: number;
}

export interface IMqttTopicData {
	topicId: number;
	topicRef: string;
	mqttTopic: string;
	lastMeasurement: IMeasurement | null;
}

interface ModelProps {
	digitalTwinGltfData: IDigitalTwinGltfData;
	femResultData: any;
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
	topicIdBySensorRef: Record<string, number>;
	dashboardUrl: string;
	sensorsOpacity: number;
	highlightAllSensors: boolean;
	showAllSensorsMarker: boolean;
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
	setFemResFilesLastUpdate: (femResFilesLastUpdate: Date) => void;
	initialDigitalTwinSimulatorState: Record<string, number>;
	openDashboardTab: (url: string) => void;
	setFemResultLoaded: (femResultLoaded: boolean) => void;
	femResultNames: string[];
	enableWebWorkes: boolean;
	numWebWorkers: number;
	logElapsedTime: boolean;
}


const Model: FC<ModelProps> = (
	{
		digitalTwinGltfData,
		femResultData,
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
		topicIdBySensorRef,
		dashboardUrl,
		sensorsOpacity,
		highlightAllSensors,
		showAllSensorsMarker,
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
		setFemResFilesLastUpdate,
		initialDigitalTwinSimulatorState,
		openDashboardTab,
		setFemResultLoaded,
		femResultNames,
		enableWebWorkes,
		numWebWorkers,
		logElapsedTime,
	}) => {
	const camera = useThree((state) => state.camera);
	const container = canvasRef.current as HTMLCanvasElement | null;
	const group = useRef<THREE.Group>();
	const [sensorsState, setSensorsState] = useState<Record<string, SensorState>>(initialSensorsState);
	const [assetsState, setAssetsState] = useState<Record<string, AssetState>>(initialAssetsState);
	const [genericObjectsState, setGenericObjectsState] = useState<Record<string, GenericObjectState>>(initialGenericObjectsState);
	const [femSimulationObjectsState, setFemSimulationObjectsState] = useState<FemSimulationObjectState[]>(initialFemSimObjectsState);
	const { client } = useMqttState();
	const mqttTopics = mqttTopicsData.map(topicData => topicData.mqttTopic).filter(topic => topic !== "");
	const digitalTwinModelMqttTopic = mqttTopicsData.filter(topic => topic.topicRef === "sim2dtm")[0] || null;
	const [lastMqttMessageSended, setLastMqttMessageSended] = useState("");

	const updateSensorStateString = useCallback((objName: string, state: string) => {
		setSensorsState((prevState) => { return { ...prevState, [objName]: { ...prevState[objName], stateString: state } } });
	}, []);

	useLayoutEffect(() => {
		setFemSimulationObjectsState(initialFemSimObjectsState);
	}, [initialFemSimObjectsState, femSimulationObjects]);

	useLayoutEffect(() => {
		setSensorsState(initialSensorsState);
	}, [initialSensorsState]);

	useLayoutEffect(() => {
		setAssetsState(initialAssetsState);
	}, [initialAssetsState]);

	useLayoutEffect(() => {
		setGenericObjectsState(initialGenericObjectsState);
	}, [initialGenericObjectsState]);

	useSubscription(
		mqttTopics,
		mqttTopicsData,
		topicIdBySensorRef,
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
		femResultData,
		setFemResFilesLastUpdate,
		digitalTwinGltfData.isGroupDTDemo
	)

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
			digitalTwinGltfData.sensorsDashboards,
			openDashboardTab,
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
		if (client && client.isConnected() && digitalTwinSimulatorState !== undefined) {
			if (digitalTwinModelMqttTopic && Object.keys(digitalTwinSimulatorState).length !== 0) {
				if (digitalTwinSimulatorSendData) {
					const mqttTopic = digitalTwinModelMqttTopic.mqttTopic;
					const messageToSend = JSON.stringify(digitalTwinSimulatorState);
					if (lastMqttMessageSended !== messageToSend) {
						const message = new Paho.Message(messageToSend);
						message.destinationName = mqttTopic;
						client.send(message);
						setLastMqttMessageSended(messageToSend);
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
			if (client.isConnected()) {
				setIsMqttConnected(true);
			} else setIsMqttConnected(false);
		}
	}, 500)

	return (
		<group ref={group as React.MutableRefObject<THREE.Group>} dispose={null}>
			{(sensorObjects.length !== 0 && sensorsState && sensorsVisibilityState) &&
				<Sensors
					sensorObjects={sensorObjects}
					sensorsOpacity={sensorsOpacity}
					highlightAllSensors={highlightAllSensors}
					showAllSensorsMarker={showAllSensorsMarker}
					hideAllSensors={hideAllSensors}
					sensorsState={sensorsState}
					sensorsVisibilityState={sensorsVisibilityState}
					updateSensorStateString={updateSensorStateString}
					sensorsDashboards={digitalTwinGltfData.sensorsDashboards}
					openDashboardTab={openDashboardTab}

				/>
			}
			{
				(assetObjects.length !== 0 && assetsState) &&
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
				(genericObjects.length !== 0 && genericObjectsState && genericObjectsVisibilityState) &&
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
				(femSimulationObjects.length !== 0 && femSimulationObjectsState.length !== 0 && femResultData) &&
				<FemSimulationObjects
					femSimulationGeneralInfo={femSimulationGeneralInfo}
					digitalTwinGltfData={digitalTwinGltfData}
					femResultData={femResultData}
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
					setFemResultLoaded={setFemResultLoaded}
					femResultNames={femResultNames}
					enableWebWorkes={enableWebWorkes}
					numWebWorkers={numWebWorkers}
					logElapsedTime={logElapsedTime}
					onlyFemObjects={sensorObjects.length === 0 && assetObjects.length === 0 && genericObjects.length === 0}
				/>
			}
		</group>
	)
}

export default Model;
