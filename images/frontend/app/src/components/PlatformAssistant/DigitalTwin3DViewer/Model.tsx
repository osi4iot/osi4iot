import * as THREE from 'three'
import React, { FC, useRef, useState, useLayoutEffect } from 'react';
import { useMqttState, useSubscription } from 'mqtt-react-hooks';
import Sensors from './Sensors';
import GenericObjects from './GenericObjects';
import Assets from './Assets';
import { useThree } from '@react-three/fiber';
import {
	AssetState,
	generateDefaultAssetsState,
	generateDefaultSensorsState,
	onMeshMouseEnter,
	onMeshMouseExit,
	onMouseClick,
	onMouseDown,
	onMouseMove,
	onTouch,
	SensorState,
	setParameters,
} from './ViewerUtils';
import { SelectedObjectInfo } from './DigitalTwin3DViewer';
import useInterval from '../../../tools/useInterval';


export interface SensorObject {
	node: THREE.Mesh;
	topicIndex: number;
	dasboardIndex: number;
}

export interface AssetObject {
	node: THREE.Mesh;
	topicIndex: number;
	dasboardIndex: number;
}


interface ModelProps {
	sensorObjects: SensorObject[];
	assetObjects: AssetObject[];
	genericObjects: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>[];
	mqttTopics: string[];
	dashboardsUrl: string[];
	setSelectedObjectInfo: (selectedObjectInfo: SelectedObjectInfo) => void;
	sensorsColor: string;
	highlightAllSensors: boolean;
	assetsColor: string;
	highlightAllAssets: boolean;
	setIsMqttConnected: (isMqttConnected: boolean) => void;
	setIsCursorInsideObject: (isCursorInsideObject: boolean) => void;
	canvasRef: React.MutableRefObject<null>;
}


const Model: FC<ModelProps> = (
	{
		sensorObjects,
		assetObjects,
		genericObjects,
		mqttTopics,
		dashboardsUrl,
		setSelectedObjectInfo,
		sensorsColor,
		highlightAllSensors,
		assetsColor,
		highlightAllAssets,
		setIsMqttConnected,
		setIsCursorInsideObject,
		canvasRef
	}) => {
	const camera = useThree((state) => state.camera);
	const container = canvasRef.current as HTMLCanvasElement | null;
	const group = useRef<THREE.Group>();
	const [sensorsState, setSensorsState] = useState<Record<string, SensorState>>(generateDefaultSensorsState(sensorObjects));
	const [assestsState, setAssestsState] = useState<Record<string, AssetState>>(generateDefaultAssetsState(assetObjects));
	const { client } = useMqttState();
	const { message } = useSubscription(mqttTopics);

	useLayoutEffect(() => {
		const changeObjectHighlight = (objType: string, objName: string, highlighted: boolean) => {
			let highlightSensor = false;
			let highlightAsset = false;
			if (objType === "sensor" && highlighted) highlightSensor = true;
			else if (objType === "asset" && highlighted) highlightAsset = true;

			const newSensorState = { ...sensorsState };
			for (const objLabel in newSensorState) {
				if (objType === "sensor" && objLabel === objName) {
					newSensorState[objLabel] = { ...newSensorState[objLabel], highlight: highlightSensor }
				} else {
					newSensorState[objLabel] = { ...newSensorState[objLabel], highlight: false }
				}
			}
			setSensorsState(newSensorState);

			const newAssetsState = { ...assestsState };
			for (const objLabel in newAssetsState) {
				if (objType === "asset" && objLabel === objName) {
					newAssetsState[objLabel] = { ...newAssetsState[objLabel], highlight: highlightAsset }
				} else {
					newAssetsState[objLabel] = { ...newAssetsState[objLabel], highlight: false }
				}
			}
			setAssestsState(newAssetsState);
		}
		const updateSensorsState = (objName: string, field: string, newValue: string | boolean) => {
			setSensorsState({ ...sensorsState, [objName]: { ...sensorsState[objName], [field]: newValue } });
		}
		const updateAssestsState = (objName: string, field: string, newValue: string | boolean) => {
			setAssestsState({ ...assestsState, [objName]: { ...assestsState[objName], [field]: newValue } });
		}
		setParameters(
			camera,
			container,
			setIsCursorInsideObject,
			setSelectedObjectInfo,
			changeObjectHighlight,
			updateSensorsState,
			updateAssestsState,
			dashboardsUrl
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
	}, [camera, container, setIsCursorInsideObject, setSensorsState, setAssestsState])

	const updateSensorStateString = (objName: string, state: string) => {
		setSensorsState({ ...sensorsState, [objName]: { ...sensorsState[objName], stateString: state } });
	}

	useLayoutEffect(() => {
		if (message) {
			const mqttTopicIndex = mqttTopics.findIndex(topic => topic === message.topic);
			const mqttMessage = JSON.parse(message.message as string);

			const sensorsNewState = { ...sensorsState };
			let isSensorStateChanged = false;
			sensorObjects.forEach((obj) => {
				const objName = obj.node.name;
				if (obj.topicIndex === mqttTopicIndex && sensorsState[objName].stateString === "off") {
					if (mqttMessage.payload) {
						const fieldName = obj.node.userData.fieldName;
						const payloadKeys = Object.keys(mqttMessage.payload);
						if (payloadKeys.indexOf(fieldName) !== -1) {
							const value = mqttMessage.payload[fieldName];
							if (typeof value === 'number' || (typeof value === 'object' && value.findIndex((elem: any) => elem === null) !== -1)) {
								sensorsNewState[objName] = { ...sensorsNewState[objName], stateString: "on" };
								isSensorStateChanged = true;
							}
						}
					}
				}
			});
			if(isSensorStateChanged) setSensorsState(sensorsNewState);

			const assestsNewState = { ...assestsState };
			assetObjects.forEach((obj) => {
				if (obj.topicIndex === mqttTopicIndex) {
					if (mqttMessage.payload) {
						const objName = obj.node.name;
						const assetPartIndex = obj.node.userData.assetPartIndex;
						const stateNumber = parseInt(mqttMessage.payload.assetPartsState[assetPartIndex], 10);
						if (stateNumber === 1) {
							assestsNewState[objName] = { ...assestsNewState[objName], stateString: "alerting" };
						} else if (stateNumber === 0) {
							assestsNewState[objName] = { ...assestsNewState[objName], stateString: "ok" };
						}
					}
				}
			});
			setAssestsState(assestsNewState);

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
			<Sensors
				sensorObjects={sensorObjects}
				sensorsColor={sensorsColor}
				highlightAllSensors={highlightAllSensors}
				sensorsState={sensorsState}
				updateSensorStateString={updateSensorStateString}
			/>
			<Assets
				assetObjects={assetObjects}
				assetsColor={assetsColor}
				highlightAllAssets={highlightAllAssets}
				assetsState={assestsState}
			/>
			<GenericObjects genericObjects={genericObjects} />
		</group>
	)
}

export default Model;
