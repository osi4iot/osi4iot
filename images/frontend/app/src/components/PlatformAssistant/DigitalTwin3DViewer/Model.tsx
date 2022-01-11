import * as THREE from 'three'
import React, { FC, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { useMqttState, useSubscription } from 'mqtt-react-hooks';
import Sensors from './Sensors';
import GenericObjects from './GenericObjects';
import Assets from './Assets';
import useInterval from '../../../tools/useInterval';
import { useThree } from '@react-three/fiber';
import {
	AnimatedObjectState,
	AssetState,
	FemSimulationObjectState,
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
import AnimatedObjects from './AnimatedObjects';
import FemSimulationObject from './FemSimulationObjects';
import Lut from './Lut';


export interface ISensorObject {
	node: THREE.Mesh;
	topicIndex: number;
	collectionName: string;
}

export interface IAssetObject {
	node: THREE.Mesh;
	topicIndex: number;
	collectionName: string;
}

export interface IAnimatedObject {
	node: THREE.Mesh;
	topicIndex: number;
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
	topicIndex: number;
	resultsRenderInfo: Record<string, IResultRenderInfo>;
	resultFieldPaths: Record<string, string>;
	deformationFields: string[];
	defaultModalValues: Record<string, number[]>;
	numberOfModes: number;
	noneResultColor: Float32Array;
	originalGeometry: Float32Array;
	wireFrameMesh: THREE.LineSegments;
}

interface ModelProps {
	sensorObjects: ISensorObject[];
	initialSensorsState: Record<string, SensorState>
	sensorsVisibilityState: Record<string, ObjectVisibilityState>;
	assetObjects: IAssetObject[];
	initialAssetsState: Record<string, AssetState>;
	assetsVisibilityState: Record<string, ObjectVisibilityState>;
	animatedObjects: IAnimatedObject[];
	initialAnimatedObjectsState: Record<string, AnimatedObjectState>;
	animatedObjectsVisibilityState: Record<string, ObjectVisibilityState>;
	femSimulationObject: IFemSimulationObject;
	initialFemSimulationObjectState: FemSimulationObjectState;
	genericObjects: IGenericObject[];
	genericObjectsVisibilityState: Record<string, ObjectVisibilityState>;
	mqttTopics: string[];
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
	hideFemSimulationObject: boolean;
	highlightFemSimulationObject: boolean;
	showFemSimulationMesh: boolean;
	genericObjectsOpacity: number;
	highlightAllGenericObjects: boolean;
	hideAllGenericObjects: boolean;
	setIsMqttConnected: (isMqttConnected: boolean) => void;
	canvasRef: React.MutableRefObject<null>;
	selectedObjTypeRef: React.MutableRefObject<null>;
	selectedObjNameRef: React.MutableRefObject<null>;
	selectedObjTopicIdRef: React.MutableRefObject<null>;
	femSimulationResult: string;
	showFemSimulationDeformation: boolean;
	femSimulationDefScale: number;
}


const Model: FC<ModelProps> = (
	{
		sensorObjects,
		initialSensorsState,
		sensorsVisibilityState,
		assetObjects,
		initialAssetsState,
		assetsVisibilityState,
		animatedObjects,
		initialAnimatedObjectsState,
		animatedObjectsVisibilityState,
		femSimulationObject,
		initialFemSimulationObjectState,
		genericObjects,
		genericObjectsVisibilityState,
		mqttTopics,
		dashboardUrl,
		sensorsOpacity,
		highlightAllSensors,
		hideAllSensors,
		assetsOpacity,
		highlightAllAssets,
		hideAllAssets,
		animatedObjectsOpacity,
		highlightAllAnimatedObjects,
		hideAllAnimatedObjects,
		hideFemSimulationObject,
		highlightFemSimulationObject,
		showFemSimulationMesh,
		genericObjectsOpacity,
		highlightAllGenericObjects,
		hideAllGenericObjects,
		setIsMqttConnected,
		canvasRef,
		selectedObjTypeRef,
		selectedObjNameRef,
		selectedObjTopicIdRef,
		femSimulationResult,
		showFemSimulationDeformation,
		femSimulationDefScale
	}) => {
	const camera = useThree((state) => state.camera);
	const container = canvasRef.current as HTMLCanvasElement | null;
	const group = useRef<THREE.Group>();
	const [sensorsState, setSensorsState] = useState<Record<string, SensorState>>(initialSensorsState);
	const [assetsState, setAssetsState] = useState<Record<string, AssetState>>(initialAssetsState);
	const [animatedObjectsState, setAnimatedObjectsState] = useState<Record<string, AnimatedObjectState>>(initialAnimatedObjectsState);
	const [femSimulationObjectState, setFemSimulationObjectState] = useState<FemSimulationObjectState>(initialFemSimulationObjectState);
	const { client } = useMqttState();
	const { message } = useSubscription(mqttTopics);

	useLayoutEffect(() => {
		const changeObjectHighlight = (objType: string, objName: string, highlighted: boolean) => {
			let highlightSensor = false;
			let highlightAsset = false;
			let highlightAnimatedObject = false;
			if (objType === "sensor" && highlighted) highlightSensor = true;
			else if (objType === "asset" && highlighted) highlightAsset = true;
			else if (objType === "animated" && highlighted) highlightAnimatedObject = true;

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

			setAnimatedObjectsState((prevAnimatedObjectsState) => {
				const newAnimatedObjectsState = { ...prevAnimatedObjectsState };
				for (const objLabel in newAnimatedObjectsState) {
					if (objType === "animated" && objLabel === objName) {
						newAnimatedObjectsState[objLabel] = { ...newAnimatedObjectsState[objLabel], highlight: highlightAnimatedObject }
					} else {
						newAnimatedObjectsState[objLabel] = { ...newAnimatedObjectsState[objLabel], highlight: false }
					}
				};
				return newAnimatedObjectsState;
			});

		}

		setParameters(
			camera,
			container,
			selectedObjTypeRef.current as HTMLDivElement | null,
			selectedObjNameRef.current as HTMLDivElement | null,
			selectedObjTopicIdRef.current as HTMLDivElement | null,
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
	}, [camera, container, setSensorsState, setAssetsState, setAnimatedObjectsState])

	const updateSensorStateString = useCallback((objName: string, state: string) => {
		setSensorsState((prevState) => { return { ...prevState, [objName]: { ...prevState[objName], stateString: state } } });
	}, []);

	useLayoutEffect(() => {
		if (message) {
			const mqttTopicIndex = mqttTopics.findIndex(topic => topic === message.topic);
			let mqttMessage: any;
			try {
				mqttMessage = JSON.parse(message.message as string);
				const sensorsNewState = { ...sensorsState };
				let isSensorStateChanged = false;
				sensorObjects.forEach((obj) => {
					const objName = obj.node.name;
					if (obj.topicIndex === mqttTopicIndex && sensorsState[objName].stateString === "off") {
						if (mqttMessage) {
							const fieldName = obj.node.userData.fieldName;
							const payloadKeys = Object.keys(mqttMessage);
							if (payloadKeys.indexOf(fieldName) !== -1) {
								const value = mqttMessage[fieldName];
								if (typeof value === 'number' || (typeof value === 'object' && value.findIndex((elem: any) => elem === null) !== -1)) {
									sensorsNewState[objName] = { ...sensorsNewState[objName], stateString: "on" };
									isSensorStateChanged = true;
								}
							}
						}
					}
				});
				if (isSensorStateChanged) setSensorsState(sensorsNewState);

				const assestsNewState = { ...assetsState };
				assetObjects.forEach((obj) => {
					if (obj.topicIndex === mqttTopicIndex) {
						if (mqttMessage) {
							const objName = obj.node.name;
							const assetPartIndex = obj.node.userData.assetPartIndex;
							const stateNumber = parseInt(mqttMessage.assetPartsState[assetPartIndex], 10);
							if (stateNumber === 1) {
								assestsNewState[objName] = { ...assestsNewState[objName], stateString: "alerting" };
							} else if (stateNumber === 0) {
								assestsNewState[objName] = { ...assestsNewState[objName], stateString: "ok" };
							}
						}
					}
				});
				setAssetsState(assestsNewState);

				const animatedObjectsNewState = { ...animatedObjectsState };
				let isAnimatedObjectsStateChanged = false;
				animatedObjects.forEach((obj) => {
					if (obj.topicIndex === mqttTopicIndex) {
						if (mqttMessage) {
							const objName = obj.node.name;
							const fieldName = obj.node.userData.fieldName;
							const payloadKeys = Object.keys(mqttMessage);
							if (payloadKeys.indexOf(fieldName) !== -1) {
								const value = mqttMessage[fieldName];
								if (typeof value === 'number') {
									animatedObjectsNewState[objName] = { ...animatedObjectsNewState[objName], value };
									isAnimatedObjectsStateChanged = true;
								}
							}
						}
					}
				});
				if (isAnimatedObjectsStateChanged) setAnimatedObjectsState(animatedObjectsNewState);

				const femSimulationObjectNewState = { ...femSimulationObjectState };
				let isfemSimulationObjectStateChanged = false;
				if (femSimulationObject.topicIndex === mqttTopicIndex) {
					if (mqttMessage) {
						const resultFieldNames = Object.keys(femSimulationObject.resultFieldPaths);
						resultFieldNames.forEach((resultFieldName, index) => {
							femSimulationObjectNewState.resultFieldModalValues[resultFieldName] = mqttMessage.femSimulationModalValues[index];
							isfemSimulationObjectStateChanged = true
						});
					}
				}
				if (isfemSimulationObjectStateChanged) setFemSimulationObjectState(femSimulationObjectNewState);


			} catch (error) {
				console.log("Error reading Mqtt message");
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [message])

	useInterval(() => {
		if (client) {
			if (client.connected) setIsMqttConnected(true);
			else setIsMqttConnected(false);
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
				animatedObjects.length &&
				<AnimatedObjects
					animatedObjects={animatedObjects}
					animatedObjectsOpacity={animatedObjectsOpacity}
					highlightAllAnimatedObjects={highlightAllAnimatedObjects}
					hideAllAnimatedObjects={hideAllAnimatedObjects}
					animatedObjectsState={animatedObjectsState}
					animatedObjectsVisibilityState={animatedObjectsVisibilityState}
				/>
			}
			{
				(femSimulationObject && femSimulationObjectState) &&
				<FemSimulationObject
					femSimulationObject={femSimulationObject}
					femSimulationObjectState={femSimulationObjectState}
					femSimulationStateString={JSON.stringify(femSimulationObjectState.resultFieldModalValues)}
					blinking={highlightFemSimulationObject}
					hideObject={hideFemSimulationObject}
					showFemMesh={showFemSimulationMesh}
					femSimulationResult={femSimulationResult}
					showFemSimulationDeformation={showFemSimulationDeformation}
					femSimulationDefScale={femSimulationDefScale}
				/>
			}
			{
				(genericObjects.length && genericObjectsVisibilityState) &&
				<GenericObjects
					genericObjects={genericObjects}
					genericObjectsOpacity={genericObjectsOpacity}
					highlightAllGenericObjects={highlightAllGenericObjects}
					hideAllGenericObjects={hideAllGenericObjects}
					genericObjectsVisibilityState={genericObjectsVisibilityState}
				/>
			}
		</group>
	)
}

export default Model;
