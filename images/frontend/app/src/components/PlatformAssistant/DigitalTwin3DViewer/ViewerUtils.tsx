import * as THREE from 'three';
import { Camera } from '@react-three/fiber';
import {
	ISensorObject,
	IAssetObject,
	IFemSimulationObject,
	IResultRenderInfo,
	IGenericObject,
	IMqttTopicData
} from './Model';
import { toast } from "react-toastify";
import { IMeasurement } from "../TableColumns/measurementsColumns";
import Lut, { ILegendLabels } from "./Lut";
import { IThreeMesh } from './threeInterfaces';

export interface SensorState {
	stateString: string;
	highlight: boolean;
	showSensorMarker: boolean;
	sensorValue: (number | number[] | null);
	clipValue: (number | null);
}

export interface AssetState {
	stateString: string;
	highlight: boolean;
	clipValue: (number | null);
}

export interface GenericObjectState {
	highlight: boolean;
	clipValue: (number | null);
}

export interface ObjectVisibilityState {
	hide: boolean;
	highlight: boolean;
	showSensorMarker?: boolean;
	opacity: number;
}

export interface FemSimObjectVisibilityState {
	hide: boolean;
	showMesh: boolean;
	showDeformation: boolean;
	highlight: boolean;
	opacity: number;
	femSimulationResult: string;
}

export interface FemSimulationObjectState {
	resultFieldModalValues: Record<string, number[]>;
	highlight: boolean;
	clipValue: (number | null);
}

export interface DigitalTwinSimulationParameter {
	minValue: number;
	maxValue: number;
	defaultValue: number;
	step: number;
	label: string;
	units: string;
	topicId: number;
}

export interface IBucketFileInfoList {
	fileName: string;
	lastModified: string
}

export default interface IDigitalTwinSensorDashboard {
	sensorRef: string;
	sensorId: number;
	dashboardId: number;
	dashboardUrl: string;
}

export interface IDigitalTwinGltfData {
	id: number;
	gltfData: any;
	digitalTwinGltfUrl: string | null;
	femResFileInfoList: IBucketFileInfoList[];
	mqttTopicsData: IMqttTopicData[];
	sensorsDashboards: IDigitalTwinSensorDashboard[];
	digitalTwinSimulationFormat: Record<string, DigitalTwinSimulationParameter>;
	isGroupDTDemo: boolean;
}


const findLastMeasurement = (topicId: number, digitalTwinGltfData: IDigitalTwinGltfData): (IMeasurement | null) => {
	let lastMeasurement = null;
	const mqttTopicDataFiltered = digitalTwinGltfData.mqttTopicsData.filter(topicData => topicData.topicId === topicId);
	if (mqttTopicDataFiltered.length !== 0) {
		const mqttTopicData = mqttTopicDataFiltered[0];
		const mqttTopic = mqttTopicData.mqttTopic;
		const topicRef = mqttTopicData.topicRef;
		if (mqttTopic &&
			mqttTopic.slice(0, 7) !== "Warning" &&
			(topicRef.slice(0, 7) === "dev2pdb" || topicRef === "dtm2pdb")
		) {
			lastMeasurement = mqttTopicData.lastMeasurement;
		}
	}
	return lastMeasurement;
}

const findLastDtm2pdbMessage = (digitalTwinGltfData: IDigitalTwinGltfData): (IMeasurement | null) => {
	let lastMeasurement = null;
	const mqttTopicDataFiltered = digitalTwinGltfData.mqttTopicsData.filter(topicData => topicData.topicRef === "dtm2pdb");
	if (mqttTopicDataFiltered.length !== 0) {
		const mqttTopicData = mqttTopicDataFiltered[0];
		const mqttTopic = mqttTopicData.mqttTopic;
		if (mqttTopic && mqttTopic.slice(0, 7) !== "Warning") {
			lastMeasurement = mqttTopicData.lastMeasurement;
		}
	}
	return lastMeasurement;
}

const getCustomAnimationObjNames = (lastDtm2pdbMessage: IMeasurement | null) => {
	let custonAnimationObjNames: string[] = [];
	if (lastDtm2pdbMessage) {
		const payload = lastDtm2pdbMessage.payload;
		if (payload.customAnimation) {
			custonAnimationObjNames = Object.keys(payload.customAnimation);
		}
	}
	return custonAnimationObjNames;
}

const getObjectOnOffObjNames = (lastDtm2pdbMessage: IMeasurement | null) => {
	let objectOnOffObjNames: string[] = [];
	if (lastDtm2pdbMessage) {
		const payload = lastDtm2pdbMessage.payload;
		if (payload.objectOnOff) {
			objectOnOffObjNames = Object.keys(payload.objectOnOff);
		}
	}
	return objectOnOffObjNames;
}

const getElapsedTimeInSeconds = (timestamp: number) => {
	const datetime = new Date(timestamp).getTime();
	const now = new Date().getTime();
	const elapsedTime = (now - datetime) / 1000;
	return elapsedTime;
}

export const generateInitialSensorsState = (
	sensorObjects: ISensorObject[],
	digitalTwinGltfData: IDigitalTwinGltfData,
) => {
	const initialSensorsState: Record<string, SensorState> = {};
	const lastDtm2pdbMessage = findLastDtm2pdbMessage(digitalTwinGltfData);
	const customAnimationObjNamesDtm2pdb = getCustomAnimationObjNames(lastDtm2pdbMessage);
	const objectOnOffObjNamesDtm2pdb = getObjectOnOffObjNames(lastDtm2pdbMessage);
	sensorObjects.forEach(obj => {
		const objName = obj.node.name;
		const sensorTopicId = obj.node.userData.sensorTopicId;
		const sensorsState: SensorState = {
			stateString: "off",
			showSensorMarker: false,
			highlight: false,
			sensorValue: null,
			clipValue: null
		};
		if (sensorTopicId !== undefined) {
			const lastMeasurement = findLastMeasurement(sensorTopicId, digitalTwinGltfData);
			if (lastMeasurement) {
				const fieldName = obj.node.userData.fieldName;
				const timeout = obj.node.userData.timeout;
				const payloadObject = lastMeasurement.payload as any;
				const payloadKeys = Object.keys(lastMeasurement.payload);
				const elpasedTimeInSeconds = getElapsedTimeInSeconds(lastMeasurement.timestamp);
				let timeoutAction = "switchOff";
				if (obj.node.userData.sensorObjectType !== undefined &&
					obj.node.userData.sensorObjectType === "display"
				) {
					if (obj.node.userData.timeoutAction !== undefined) {
						timeoutAction = obj.node.userData.timeoutAction;
						if (elpasedTimeInSeconds < timeout) timeoutAction = "keepLastValue";
					}
				} else {
					if (elpasedTimeInSeconds < timeout) timeoutAction = "keepLastValue";
				}

				if (timeoutAction === "keepLastValue") {
					if (payloadKeys.indexOf(fieldName) !== -1) {
						const value = payloadObject[fieldName];
						if (typeof value === 'number' || (Array.isArray(value) && value.findIndex((elem: any) => elem === null) !== -1)) {
							sensorsState.stateString = "on";
							sensorsState.highlight = false;
							sensorsState.sensorValue = value;
						};
					}
				} else if (timeoutAction === "defaultValue") {
					let value = 0.0;
					if (obj.node.userData.displayDefaultValue !== undefined) {
						value = parseFloat(obj.node.userData.displayDefaultValue);
					}
					sensorsState.sensorValue = value;
				}
			} else {
				if (obj.node.userData.timeoutAction === "defaultValue") {
					let value = 0.0;
					if (obj.node.userData.displayDefaultValue !== undefined) {
						value = parseFloat(obj.node.userData.displayDefaultValue);
					}
					sensorsState.sensorValue = value;
				}
			}
		}

		let clipValue: (number | null) = null;
		const clipTopicId = obj.node.userData.clipTopicId;
		if (clipTopicId !== undefined) {
			const mqttTopicsDataFiltered = digitalTwinGltfData.mqttTopicsData.filter(topicData => topicData.topicId === clipTopicId);
			if (mqttTopicsDataFiltered.length !== 0) {
				const lastMeasurement = mqttTopicsDataFiltered[0].lastMeasurement;
				if (lastMeasurement) {
					const fieldName = obj.node.userData.clipFieldName;
					const payloadObject = lastMeasurement.payload as any;
					const payloadKeys = Object.keys(lastMeasurement.payload);
					if (payloadKeys.indexOf(fieldName) !== -1) {
						const value = payloadObject[fieldName];
						if (typeof value === 'number') {
							clipValue = value;
						}
					}
				} else {
					if (obj.node.userData.clipMinValue !== undefined) {
						clipValue = obj.node.userData.clipMinValue;
					}
				}
			}
			sensorsState.clipValue = clipValue;
		}
		initialSensorsState[objName] = sensorsState;

		if (obj.node.onOffObjectNames.length !== 0) {
			const objNames = obj.node.onOffObjectNames;
			const objNamesDtm2pdb = objNames.filter(objName => objectOnOffObjNamesDtm2pdb.includes(objName));
			setDefaultOnOffObjectProperty(obj.node, objNamesDtm2pdb, lastDtm2pdbMessage as IMeasurement);
		}

		if (obj.node.customAnimationObjectNames.length !== 0 && lastDtm2pdbMessage) {
			const objNames = obj.node.customAnimationObjectNames;
			const objNamesFiltered = objNames.filter(objName => customAnimationObjNamesDtm2pdb.includes(objName));
			if (objNamesFiltered.length !== 0) {
				setCustomAnimationObjectProperty(obj.node, objNamesFiltered, lastDtm2pdbMessage);
			}
		}
	})
	return initialSensorsState;
}

export const generateInitialAssetsState = (
	assetObjects: IAssetObject[],
	digitalTwinGltfData: IDigitalTwinGltfData,
) => {
	const initialAssetsState: Record<string, AssetState> = {};
	const lastDtm2pdbMessage = findLastDtm2pdbMessage(digitalTwinGltfData);
	const customAnimationObjNamesDtm2pdb = getCustomAnimationObjNames(lastDtm2pdbMessage);
	const objectOnOffObjNamesDtm2pdb = getObjectOnOffObjNames(lastDtm2pdbMessage);
	assetObjects.forEach(obj => {
		const objName = obj.node.name;
		const assetState: AssetState = {
			stateString: "ok",
			highlight: false,
			clipValue: null
		};
		if (lastDtm2pdbMessage) {
			const assetPartIndex = obj.node.userData.assetPartIndex;
			const payloadObject = lastDtm2pdbMessage.payload as any;
			let stateNumber = 0;
			if (payloadObject.assetPartsState && payloadObject.assetPartsState[assetPartIndex - 1]) {
				stateNumber = parseInt(payloadObject.assetPartsState[assetPartIndex - 1], 10);
			}
			if (stateNumber === 1) {
				assetState.stateString = "alerting";
				assetState.highlight = false;
			} else if (stateNumber === 0) {
				assetState.stateString = "ok";
				assetState.highlight = false;
			}
		}

		let clipValue: (number | null) = null;
		const clipTopicId = obj.node.userData.clipTopicId;
		if (clipTopicId !== undefined) {
			const mqttTopicsDataFiltered = digitalTwinGltfData.mqttTopicsData.filter(topicData => topicData.topicId === clipTopicId);
			if (mqttTopicsDataFiltered.length !== 0) {
				const lastMeasurement = mqttTopicsDataFiltered[0].lastMeasurement;
				if (lastMeasurement) {
					const fieldName = obj.node.userData.clipFieldName;
					const payloadObject = lastMeasurement.payload as any;
					const payloadKeys = Object.keys(lastMeasurement.payload);
					if (payloadKeys.indexOf(fieldName) !== -1) {
						const value = payloadObject[fieldName];
						if (typeof value === 'number') {
							clipValue = value;
						}
					}
				} else {
					if (obj.node.userData.clipMinValue !== undefined) {
						clipValue = obj.node.userData.clipMinValue;
					}
				}
			}
			assetState.clipValue = clipValue;
		}

		initialAssetsState[objName] = assetState;

		if (obj.node.onOffObjectNames.length !== 0) {
			const objNames = obj.node.onOffObjectNames;
			const objNamesDtm2pdb = objNames.filter(objName => objectOnOffObjNamesDtm2pdb.includes(objName));
			setDefaultOnOffObjectProperty(obj.node, objNamesDtm2pdb, lastDtm2pdbMessage as IMeasurement);
		}

		if (obj.node.customAnimationObjectNames.length !== 0 && lastDtm2pdbMessage) {
			const objNames = obj.node.customAnimationObjectNames;
			const objNamesFiltered = objNames.filter(objName => customAnimationObjNamesDtm2pdb.includes(objName));
			if (objNamesFiltered.length !== 0) {
				setCustomAnimationObjectProperty(obj.node, objNamesFiltered, lastDtm2pdbMessage);
			}
		}
	})
	return initialAssetsState;
}

export const generateInitialGenericObjectsState = (
	genericObjects: IGenericObject[],
	digitalTwinGltfData: IDigitalTwinGltfData,
) => {
	const initialGenericObjectsState: Record<string, GenericObjectState> = {};
	const lastDtm2pdbMessage = findLastDtm2pdbMessage(digitalTwinGltfData);
	const customAnimationObjNamesDtm2pdb = getCustomAnimationObjNames(lastDtm2pdbMessage);
	const objectOnOffObjNamesDtm2pdb = getObjectOnOffObjNames(lastDtm2pdbMessage);
	genericObjects.forEach(obj => {
		const objName = obj.node.name;
		const genericObjectState: GenericObjectState = {
			highlight: false,
			clipValue: null,
		};

		let clipValue: (number | null) = null;
		const clipTopicId = obj.node.userData.clipTopicId;
		if (clipTopicId !== undefined) {
			const mqttTopicsDataFiltered = digitalTwinGltfData.mqttTopicsData.filter(topicData => topicData.topicId === clipTopicId);
			if (mqttTopicsDataFiltered.length !== 0) {
				const lastMeasurement = mqttTopicsDataFiltered[0].lastMeasurement;
				if (lastMeasurement) {
					const fieldName = obj.node.userData.clipFieldName;
					const payloadObject = lastMeasurement.payload as any;
					const payloadKeys = Object.keys(lastMeasurement.payload);
					if (payloadKeys.indexOf(fieldName) !== -1) {
						const value = payloadObject[fieldName];
						if (typeof value === 'number') {
							clipValue = value;
						}
					}
				} else {
					if (obj.node.userData.clipMinValue !== undefined) {
						clipValue = obj.node.userData.clipMinValue;
					}
				}
			}
			genericObjectState.clipValue = clipValue;
		}

		initialGenericObjectsState[objName] = genericObjectState;

		if (obj.node.onOffObjectNames.length !== 0) {
			const objNames = obj.node.onOffObjectNames;
			const objNamesDtm2pdb = objNames.filter(objName => objectOnOffObjNamesDtm2pdb.includes(objName));
			setDefaultOnOffObjectProperty(obj.node, objNamesDtm2pdb, lastDtm2pdbMessage as IMeasurement);
		}

		if (obj.node.customAnimationObjectNames.length !== 0 && lastDtm2pdbMessage) {
			const objNames = obj.node.customAnimationObjectNames;
			const objNamesFiltered = objNames.filter(objName => customAnimationObjNamesDtm2pdb.includes(objName));
			if (objNamesFiltered.length !== 0) {
				setCustomAnimationObjectProperty(obj.node, objNamesFiltered, lastDtm2pdbMessage);
			}
		}
	})
	return initialGenericObjectsState;
}

export const generateInitialFemSimObjectsState = (
	femSimulationObjects: IFemSimulationObject[],
	digitalTwinGltfData: IDigitalTwinGltfData,
	femResultData: any
) => {
	const highlight = false;
	const initialFemSimObjectsState: FemSimulationObjectState[] = [];
	const femResultModalValuesTopic = digitalTwinGltfData.mqttTopicsData.filter(topic => topic.topicRef === "dtm2sim")[0].topicId;
	const lastMeasurement = findLastMeasurement(femResultModalValuesTopic, digitalTwinGltfData);
	const lastDtm2pdbMessage = findLastDtm2pdbMessage(digitalTwinGltfData);
	const customAnimationObjNamesDtm2pdb = getCustomAnimationObjNames(lastDtm2pdbMessage);
	const objectOnOffObjNamesDtm2pdb = getObjectOnOffObjNames(lastDtm2pdbMessage);
	const payloadObject = lastMeasurement?.payload as any;
	let resultFields = [];
	if (femResultData && Object.keys(femResultData).length !== 0) {
		resultFields = femResultData.metadata.resultFields;
	}
	for (let imesh = 0; imesh < femSimulationObjects.length; imesh++) {
		const obj = femSimulationObjects[imesh];
		const resultFieldModalValues: Record<string, number[]> = {};
		for (let ires = 0; ires < resultFields.length; ires++) {
			const resultName = resultFields[ires].resultName;
			if (lastMeasurement) {
				resultFieldModalValues[resultName] = payloadObject.femResultsModalValues[imesh][ires];
			} else {
				const meshResult = femResultData.meshResults[imesh];
				const defaultValues = meshResult.resultFields[resultName].defaultModalValues;
				resultFieldModalValues[resultName] = defaultValues;
			}
		}

		let clipValue: (number | null) = null;
		const clipTopicId = obj.node.userData.clipTopicId;
		if (clipTopicId !== undefined) {
			const mqttTopicsDataFiltered = digitalTwinGltfData.mqttTopicsData.filter(topicData => topicData.topicId === clipTopicId);
			if (mqttTopicsDataFiltered.length !== 0) {
				const lastMeasurement = mqttTopicsDataFiltered[0].lastMeasurement;
				if (lastMeasurement) {
					const fieldName = obj.node.userData.clipFieldName;
					const payloadObject = lastMeasurement.payload as any;
					const payloadKeys = Object.keys(lastMeasurement.payload);
					if (payloadKeys.indexOf(fieldName) !== -1) {
						const value = payloadObject[fieldName];
						if (typeof value === 'number') {
							clipValue = value;
						}
					}
				} else {
					if (obj.node.userData.clipMinValue !== undefined) {
						clipValue = obj.node.userData.clipMinValue;
					}
				}
			}
		}

		initialFemSimObjectsState[imesh] = { highlight, clipValue, resultFieldModalValues };

		if (obj.node.onOffObjectNames.length !== 0) {
			const objNames = obj.node.onOffObjectNames;
			const objNamesDtm2pdb = objNames.filter(objName => objectOnOffObjNamesDtm2pdb.includes(objName));
			setDefaultOnOffObjectProperty(obj.node, objNamesDtm2pdb, lastDtm2pdbMessage as IMeasurement);
		}

		if (obj.node.customAnimationObjectNames.length !== 0 && lastDtm2pdbMessage) {
			const objNames = obj.node.customAnimationObjectNames;
			const objNamesFiltered = objNames.filter(objName => customAnimationObjNamesDtm2pdb.includes(objName));
			if (objNamesFiltered.length !== 0) {
				setCustomAnimationObjectProperty(obj.node, objNamesFiltered, lastDtm2pdbMessage);
			}
		}
	}
	return initialFemSimObjectsState;
}

const setDefaultOnOffObjectProperty = (
	node: IThreeMesh,
	objNamesDtm2pdb: string[],
	lastDtm2pdbMessage: IMeasurement
) => {
	if (node.userData.objectOnOff === "yes") {
		let onOff = "on";
		const objName = node.name;
		if (objNamesDtm2pdb.includes(objName)) {
			const payload = lastDtm2pdbMessage.payload;
			if (payload.objectOnOff[objName]) {
				onOff = payload.objectOnOff[objName]
			}
		} else {
			if (node.userData.defaultObjectOnOff === "off") {
				onOff = "off";
			}
		}
		if (onOff === "on") {
			node.visible = true;
		} else if (onOff === "off") {
			node.visible = false;
		}
		return;
	} else {
		for (const childNode of node.children) {
			setDefaultOnOffObjectProperty(childNode as IThreeMesh, objNamesDtm2pdb, lastDtm2pdbMessage);
		}
	}
}

const setCustomAnimationObjectProperty = (
	node: IThreeMesh,
	objNamesFiltered: string[],
	lastDtm2pdbMessage: IMeasurement
) => {
	const objName = node.name;
	if (objNamesFiltered.includes(objName)) {
		const payload = lastDtm2pdbMessage.payload;
		if (payload.customAnimation[objName]) {
			const msgData = payload.customAnimation[objName]
			if (msgData["position"]) {
				const values = msgData["position"];
				if (Array.isArray(values) && values.length === 3) {
					node.position.set(values[0], values[1], values[2]);
				}
			}
			if (msgData["scale"]) {
				const values = msgData["scale"];
				if (Array.isArray(values) && values.length === 3) {
					node.scale.set(values[0], values[1], values[2]);
				}
			}
			if (msgData["quaternion"]) {
				const values = msgData["quaternion"];
				if (Array.isArray(values) && values.length === 4) {
					const qr = new THREE.Quaternion(values[0], values[1], values[2], values[3]);
					const qres = new THREE.Quaternion().multiplyQuaternions(qr, node.quaternionIni);
					node.quaternion.set(qres.x, qres.y, qres.z, qres.w);
				}
			}
		}
	} else {
		for (const childNode of node.children) {
			setCustomAnimationObjectProperty(childNode as IThreeMesh, objNamesFiltered, lastDtm2pdbMessage);
		}
	}
}

let camera: Camera;
let container: HTMLCanvasElement | null;
let selectedObjTypeRef: HTMLDivElement | null;
let selectedObjNameRef: HTMLDivElement | null;
let selectedObjCollectionNameRef: HTMLDivElement | null;
let openDashboardTab: (url: string) => void;

var sensorsDashboards: IDigitalTwinSensorDashboard[] = [];
var changeObjectHighlight: (objType: string, objName: string, highlighted: boolean) => void;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let meshList: THREE.Mesh[];
var mouse = {
	isInsideObject: false,
	objSelectable: true,
	objName: "",
	type: "",
	collectionName: "",
	sensorDashboardUrl: ""
};

export const setMeshList = (nodes: any) => {
	meshList = [];
	for (const prop in nodes) {
		const obj = nodes[prop];
		if (obj.type === "Mesh") {
			const objBox = new THREE.Box3().setFromObject(obj);
			objBox.min.sub(obj.position);
			objBox.max.sub(obj.position);
			meshList.push(obj);
		} else if (obj.type === "Group" && obj.children.length !== 0) {
			for (const groupObj of obj.children) {
				const objBox = new THREE.Box3().setFromObject(groupObj);
				objBox.min.sub(groupObj.position);
				objBox.max.sub(groupObj.position);
				meshList.push(groupObj);
			}
		}
	};
}


const getSceneBox = (
	sensorObjects: ISensorObject[],
	assetObjects: IAssetObject[],
	genericObjects: IThreeMesh[],
	femSimulationObject: IFemSimulationObject | null
) => {
	let first = true;
	var box: any;

	sensorObjects.forEach((obj: ISensorObject) => {
		if (first) {
			box = new THREE.Box3().setFromObject(obj.node);
			first = false;
		} else {
			(box as THREE.Box3).expandByObject(obj.node)
		}
	})

	assetObjects.forEach((obj: IAssetObject) => {
		if (first) {
			box = new THREE.Box3().setFromObject(obj.node);
			first = false;
		} else {
			(box as THREE.Box3).expandByObject(obj.node)
		}
	})

	genericObjects.forEach((obj: IThreeMesh) => {
		if (first) {
			box = new THREE.Box3().setFromObject(obj);
			first = false;
		} else {
			(box as THREE.Box3).expandByObject(obj)
		}
	})

	if (femSimulationObject) {
		if (first) {
			box = new THREE.Box3().setFromObject(femSimulationObject.node);
			first = false;
		} else {
			(box as THREE.Box3).expandByObject(femSimulationObject.node)
		}
	}

	return box;
}


export const giveSceneCenter = (
	sensorObjects: ISensorObject[],
	assetObjects: IAssetObject[],
	genericObjects: IThreeMesh[],
	femSimulationObject: IFemSimulationObject | null
) => {
	var box = getSceneBox(sensorObjects, assetObjects, genericObjects, femSimulationObject);
	const center_x = (box.max.x + box.min.x) / 2;
	const center_y = (box.max.y + box.min.y) / 2;
	return [center_x, center_y];
}

export const setParameters = (
	l_camera: Camera,
	l_container: HTMLCanvasElement | null,
	l_selectedObjTypeRef: HTMLDivElement | null,
	l_selectedObjNameRef: HTMLDivElement | null,
	l_selectedObjCollectionNameRef: HTMLDivElement | null,
	l_changeObjectHighlight: (objType: string, objName: string, highlighted: boolean) => void,
	l_sensorsDashboards: IDigitalTwinSensorDashboard[],
	l_openDashboardTab: (url: string) => void,
) => {
	camera = l_camera;
	container = l_container;
	selectedObjTypeRef = l_selectedObjTypeRef;
	selectedObjNameRef = l_selectedObjNameRef;
	selectedObjCollectionNameRef = l_selectedObjCollectionNameRef;
	changeObjectHighlight = l_changeObjectHighlight;
	sensorsDashboards = l_sensorsDashboards;
	openDashboardTab = l_openDashboardTab;
}

const giveDefaultObjectMaterialColor = (obj: any) => {
	let materialColor = new THREE.Color("#7a5270");
	if (obj.userData.type === "sensor") {
		materialColor = new THREE.Color("#23272F");
	} else if (obj.userData.type === "asset") {
		materialColor = new THREE.Color("#828282");
	} else if (obj.userData.type === "femObject") {
		materialColor = new THREE.Color("#F5F5F5");
	} else if (obj.userData.type === "generic") {
		materialColor = new THREE.Color("#7a5270");
	}
	return materialColor;
}

const noEmitColor = new THREE.Color(0, 0, 0);
export const findMaterial = (obj: any, materials: Record<string, THREE.MeshStandardMaterial>) => {
	let objMaterial = null;
	if (obj.type === "Mesh") {
		for (const materialName in materials) {
			if (materials[materialName].uuid === obj.material.uuid) {
				objMaterial = materials[materialName].clone();
				objMaterial.transparent = true;
				objMaterial.opacity = 1;
				objMaterial.side = 2;
				if (objMaterial.name === "") {
					objMaterial.name = `${obj.name}_material`;
				}
				break;
			}
		}
	}

	if (!objMaterial) {
		const materialColor = giveDefaultObjectMaterialColor(obj);
		objMaterial = new THREE.MeshLambertMaterial({
			color: materialColor,
			emissive: noEmitColor,
			transparent: true,
			opacity: 1,
			side: 2
		});
	}

	return objMaterial;
}

const setQuaternionIniRecursively = (obj: IThreeMesh) => {
	obj.quaternionIni = new THREE.Quaternion().copy(obj.quaternion);
	for (let node of obj.children) {
		if (node.userData.animationType === "custom")
			setQuaternionIniRecursively(node as IThreeMesh)
	}
}

export const sortObjects: (
	nodes: any,
	materials: Record<string, THREE.MeshStandardMaterial>,
	animations: THREE.AnimationClip[]
) => {
	sensorObjects: ISensorObject[],
	assetObjects: IAssetObject[],
	genericObjects: IGenericObject[],
	femSimulationObjects: IFemSimulationObject[],
	sensorsCollectionNames: string[],
	assetsCollectionNames: string[],
	genericObjectsCollectionNames: string[],
	femSimObjectCollectionNames: string[],

} = function (nodes: any, materials: Record<string, THREE.MeshStandardMaterial>, animations: THREE.AnimationClip[]) {
	setMeshList(nodes);
	const sensorObjects: ISensorObject[] = [];
	const assetObjects: IAssetObject[] = [];
	const genericObjects: IGenericObject[] = [];
	const femSimulationObjects: IFemSimulationObject[] = [];
	const genericObjectsCollectionNames: string[] = [];
	const sensorsCollectionNames: string[] = [];
	const assetsCollectionNames: string[] = [];
	const femSimObjectCollectionNames: string[] = [];

	let sceneName = "Scene";
	for (const prop in nodes) {
		const obj = nodes[prop];
		if (obj.parent === null) {
			sceneName = obj.name;
			break;
		}
	}
	const objectList = nodes[sceneName].children;
	for (let imesh = 0; imesh < objectList.length; imesh++) {
		const obj = objectList[imesh];
		obj.material = findMaterial(obj, materials);
		setQuaternionIniRecursively(obj);
		switch (obj.userData.type) {
			case "sensor":
				{
					let collectionName = "General";
					if (obj.userData.collectionName) {
						collectionName = obj.userData.collectionName;
					}
					const sensorObject: ISensorObject = {
						node: obj,
						collectionName,
					}
					sensorObjects.push(sensorObject);
					break;
				}
			case "asset":
				{
					let collectionName = "General";
					if (obj.userData.collectionName) {
						collectionName = obj.userData.collectionName;
					}
					const assestObject: IAssetObject = {
						node: obj,
						collectionName,
					}
					assetObjects.push(assestObject);
					break;
				}
			case "femObject":
				{
					const collectionName = obj.name;
					const originalGeometryArray = [];
					for (let i = 0, n = obj.geometry.attributes.position.count; i < n; ++i) {
						const coordX = obj.geometry.attributes.position.array[i * 3];
						const coordY = obj.geometry.attributes.position.array[i * 3 + 1];
						const coordZ = obj.geometry.attributes.position.array[i * 3 + 2];
						originalGeometryArray.push(coordX, coordY, coordZ);
					}
					const originalGeometry = new Float32Array(originalGeometryArray);

					const wireFrameMaterial = new THREE.LineBasicMaterial({
						color: 0xffffff,
						linewidth: 1.5,
					});
					const wireframeGeometry = new THREE.WireframeGeometry(obj.geometry);
					const wireFrameMesh = new THREE.LineSegments(wireframeGeometry, wireFrameMaterial);
					wireFrameMesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
					wireFrameMesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
					wireFrameMesh.position.set(obj.position.x, obj.position.y, obj.position.z);
					const materialColor = new THREE.Color("#F5F5F5");
					const femResultMaterial = new THREE.MeshLambertMaterial({
						side: THREE.DoubleSide,
						color: materialColor,
						vertexColors: true,
						transparent: true,
						opacity: 1.0
					});
					const femSimulationObject: IFemSimulationObject = {
						node: obj,
						originalGeometry,
						wireFrameMesh,
						collectionName,
						femResultMaterial
					}
					femSimulationObjects.push(femSimulationObject);
					break;
				}
			default:
				{
					let collectionName = "General";
					if (obj.userData.collectionName) {
						collectionName = obj.userData.collectionName;
					}
					const genericObject: IGenericObject = {
						node: obj,
						collectionName,
					}
					genericObjects.push(genericObject);
				}
		}
	}

	sensorObjects.forEach((obj: ISensorObject) => {
		const collectionName = obj.collectionName
		if (sensorsCollectionNames.findIndex(name => name === collectionName) === -1) {
			sensorsCollectionNames.push(collectionName);
		}
		nodeAnimations(obj.node, animations);
	})

	assetObjects.forEach((obj: IAssetObject) => {
		const collectionName = obj.collectionName
		if (assetsCollectionNames.findIndex(name => name === collectionName) === -1) {
			assetsCollectionNames.push(collectionName);
		}
		nodeAnimations(obj.node, animations);
	})

	genericObjects.forEach((obj: IGenericObject) => {
		const collectionName = obj.collectionName
		if (genericObjectsCollectionNames.findIndex(name => name === collectionName) === -1) {
			genericObjectsCollectionNames.push(collectionName);
		}
		nodeAnimations(obj.node, animations);
	})

	femSimulationObjects.forEach((obj: IFemSimulationObject) => {
		const collectionName = obj.collectionName
		if (femSimObjectCollectionNames.findIndex(name => name === collectionName) === -1) {
			femSimObjectCollectionNames.push(collectionName);
		}
		nodeAnimations(obj.node, animations);
	})

	return {
		sensorObjects,
		assetObjects,
		genericObjects,
		femSimulationObjects,
		sensorsCollectionNames,
		assetsCollectionNames,
		genericObjectsCollectionNames,
		femSimObjectCollectionNames
	}
}

const nodeAnimations = (node: any, animations: THREE.AnimationClip[]) => {
	const nodeAnimations: THREE.AnimationClip[] = [];
	const blenderAnimationTypes: string[] = [];
	const customAnimationObjectNames: string[] = [];
	const onOffObjectNames: string[] = [];
	setNodeAnimationRecursively(
		node,
		0, //Level
		nodeAnimations,
		blenderAnimationTypes,
		customAnimationObjectNames,
		onOffObjectNames,
		animations
	);
	node.animations = nodeAnimations;
	node.blenderAnimationTypes = blenderAnimationTypes;
	node.customAnimationObjectNames = customAnimationObjectNames;
	node.onOffObjectNames = onOffObjectNames;
}

const setNodeAnimationRecursively = (
	node: any,
	level: number,
	nodeAnimations: THREE.AnimationClip[],
	blenderAnimationTypes: string[],
	customAnimationObjectNames: string[],
	onOffObjectNames: string[],
	animations: THREE.AnimationClip[]
) => {
	if (node.userData !== undefined) {
		if (node.userData.animationType !== undefined) {
			if (node.userData.clipName !== undefined) {
				const objAnimation = animations.filter(clip => clip.name === node.userData.clipName)[0];
				if (objAnimation) {
					nodeAnimations.push(objAnimation);
					if (node.userData.animationType === "blenderTemporary") {
						if (level === 0) blenderAnimationTypes.push("blenderTemporary")
					} else if (node.userData.animationType === "blenderEndless") {
						if (!blenderAnimationTypes.includes("blenderEndless")) {
							blenderAnimationTypes.push("blenderEndless");
						}
					}
				}
			}
			if (node.userData.animationType === "custom") {
				customAnimationObjectNames.push(node.name);
			}
		}
		if (node.userData.objectOnOff === "yes") {
			onOffObjectNames.push(node.name);
		}
	}

	for (const node_child of node.children) {
		setNodeAnimationRecursively(
			node_child,
			level + 1,
			nodeAnimations,
			blenderAnimationTypes,
			customAnimationObjectNames,
			onOffObjectNames,
			animations
		);
	}
}

function sendCustomEvent(eventName: string, data: any) {
	var event = new CustomEvent(eventName, { detail: data });
	window.dispatchEvent(event);
}

export const get_mesh_intersect = (lx: number, ly: number) => {
	let objName = "";
	let type = "";
	let collectionName = "";
	let selectable = true;
	let sensorDashboardUrl = "";

	if (container && meshList && meshList.length) {
		const rect = container.getBoundingClientRect();
		pointer.x = ((lx - rect.left) / rect.width) * 2 - 1;
		pointer.y = - ((ly - rect.top) / rect.height) * 2 + 1;
		camera.projectionMatrixInverse = new THREE.Matrix4();
		camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
		raycaster.setFromCamera(pointer, camera);
		const intersects = raycaster.intersectObjects(meshList);
		if (intersects.length > 0) {
			objName = intersects[0].object.name;
			if (intersects[0].object.userData.type) {
				type = intersects[0].object.userData.type;
			} else {
				type = "generic";
			}
			if (type === "femObject") collectionName = objName;
			else {
				if (intersects[0].object.userData.collectionName) {
					collectionName = intersects[0].object.userData.collectionName;
				} else collectionName = "General";
			}

			const isSelectable = intersects[0].object.userData.selectable;
			if (isSelectable !== undefined && isSelectable === "false") {
				selectable = false;
			}
			if (type === "sensor") {
				const sensorRef = intersects[0].object.userData.sensorRef;
				if (sensorRef && sensorsDashboards.length !== 0) {
					const sensorDashboard = sensorsDashboards.filter(sensor => sensor.sensorRef === sensorRef)[0];
					sensorDashboardUrl = sensorDashboard.dashboardUrl;
				}
			}
		}
	}
	return [objName, type, collectionName, selectable, sensorDashboardUrl];
}

const processMouseEvent = (
	event_name: string,
	event: MouseEvent
) => {
	event.preventDefault();

	const [
		objName,
		type,
		collectionName,
		selectable,
		sensorDashboardUrl
	] = get_mesh_intersect(event.clientX, event.clientY);

	if (selectable) {
		if (objName !== "" && type) {
			if ((mouse.objName !== "") && (mouse.objName !== objName)) {
				//jump from object to object, exist last one
				mouse.isInsideObject = false;
				mouse.type = "";
				mouse.collectionName = "";
			}
			mouse.objName = objName as string;
			mouse.collectionName = collectionName as string;
			if (!mouse.isInsideObject) {
				sendCustomEvent("mesh_mouse_enter", { type, name: mouse.objName, collectionName: mouse.collectionName });
			}
			mouse.isInsideObject = true;
			mouse.type = type as string;
			mouse.objSelectable = true;
			if (type === "sensor" && sensorDashboardUrl !== "") {
				mouse.sensorDashboardUrl = sensorDashboardUrl as string;
			}

			sendCustomEvent(event_name, { type, name: mouse.objName, collectionName: mouse.collectionName });
		}
		else {
			if (mouse.isInsideObject) {
				sendCustomEvent("mesh_mouse_exit", { type: mouse.type, name: mouse.objName });
				mouse.isInsideObject = false;
				mouse.type = "";
				mouse.objSelectable = false;
			}
		}
	} else {
		if (mouse.isInsideObject) {
			sendCustomEvent("mesh_mouse_exit", { type: mouse.type, name: mouse.objName });
			mouse.isInsideObject = false;
			mouse.type = "";
		}
		mouse.collectionName = "";
		mouse.objSelectable = false;
	}
}

export const onTouch = (event: TouchEvent) => {
	event.preventDefault();
	if (event.type === "touchstart") {
		const [objName, type] = get_mesh_intersect(event.targetTouches[0].clientX, event.targetTouches[0].clientY);
		if (objName !== "") {
			sendCustomEvent("mesh_touch_start", { type, name: objName });
		}
	}
}

export const onMouseDown = (event: MouseEvent) => {
	processMouseEvent("mesh_mouse_down", event)
}


export const onMouseClick = (event: any) => {
	processMouseEvent("mesh_mouse_down", event);
	if (mouse.type === "sensor" && mouse.objName !== "" && mouse.objSelectable) {
		if (mouse.sensorDashboardUrl === "") {
			toast.warning("Sensor dashboard url not defined");
		} else {;
			openDashboardTab(mouse.sensorDashboardUrl);
		}
	}
}

export const onMouseMove = (event: MouseEvent) => {
	processMouseEvent("mesh_mouse_move", event)
}

export const onMeshMouseEnter = (e: any) => {
	if (container) container.style.cursor = "pointer";
	const objName = e.detail.name;
	const type = e.detail.type;
	const collectionName = e.detail.collectionName;
	changeObjectHighlight(type, objName, true);
	if (selectedObjNameRef) selectedObjNameRef.innerHTML = `Name: ${objName}`;
	if (selectedObjTypeRef) selectedObjTypeRef.innerHTML = `Type: ${type}`;
	if (selectedObjCollectionNameRef) selectedObjCollectionNameRef.innerHTML = `Collection: ${collectionName}`;
}

export const onMeshMouseExit = (e: any) => {
	if (container) container.style.cursor = "default";
	const objName = e.detail.name;
	const type = e.detail.type;
	changeObjectHighlight(type, objName, false);
	if (selectedObjNameRef) selectedObjNameRef.innerHTML = "Name: -";
	if (selectedObjTypeRef) selectedObjTypeRef.innerHTML = "Type: -";
	if (selectedObjCollectionNameRef) selectedObjCollectionNameRef.innerHTML = "Collection: -";
}


export const createUrl = (gltfData: string) => {
	const binaryDataGltf = [];
	binaryDataGltf.push(gltfData);
	const gltfUrl = URL.createObjectURL(new Blob(binaryDataGltf));
	return gltfUrl;
}

export const defaultVisibility = (
	obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>
) => {
	let defVisibility = true;
	if (obj.userData.visible !== undefined && obj.userData.visible === "false") defVisibility = false;
	return defVisibility;
}

export const defaultOpacity = (
	obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>
) => {
	let defOpacity = 1;
	if (obj.userData.opacity !== undefined) defOpacity = obj.userData.opacity;
	return defOpacity;
}


export const readFemSimulationInfo = (
	femResultData: any,
	setFemSimulationGeneralInfo: (femSimulationGeneralInfo: Record<string, IResultRenderInfo>) => void,
) => {
	const colorMap = 'rainbow';
	const numberOfColors = 256; //512;
	let legendLayout = 'vertical';

	const femSimulationGeneralInfo: Record<string, IResultRenderInfo> = {};
	let resultFields = [];
	if (femResultData && Object.keys(femResultData).length !== 0) {
		resultFields = femResultData.metadata.resultFields;
	}

	for (let ires = 0; ires < resultFields.length; ires++) {
		const legendCamera = new THREE.PerspectiveCamera(20, 0.5, 1, 10000);
		legendCamera.position.set(11, 9.5, 40);
		const legendScene = new THREE.Scene();
		legendScene.background = new THREE.Color("#141619");

		const resultLut = new Lut(colorMap, numberOfColors);
		let maxValue = resultFields[ires].maxValue;
		if (resultFields[ires].maxValue === resultFields[ires].minValue) maxValue += 1.0e-5;
		resultLut.setMax(maxValue);
		resultLut.setMin(resultFields[ires].minValue);

		if (legendLayout) {
			let legend: THREE.Mesh;

			if (legendLayout === 'horizontal') {
				legend = resultLut.setLegendOn({ 'layout': 'horizontal', 'position': { 'x': 21, 'y': 6, 'z': 5 } });
			}
			else {
				legend = resultLut.setLegendOn();
			}
			legendScene.add(legend);
			const title = resultFields[ires].resultName;
			const um = resultFields[ires].units;
			var labels = resultLut.setLegendLabels({ title, um, ticks: 5 }) as ILegendLabels;
			if (labels) {
				legendScene.add(labels.title);
				for (var ilabel = 0; ilabel < Object.keys(labels['ticks']).length; ilabel++) {
					legendScene.add(labels['ticks'][ilabel]);
					legendScene.add(labels['lines'][ilabel]);
				}
			}
		}

		const legendRenderer = new THREE.WebGLRenderer({ antialias: true });
		legendRenderer.autoClear = false;
		legendRenderer.setPixelRatio(window.devicePixelRatio);
		legendRenderer.setSize(180, 360);
		legendRenderer.render(legendScene, legendCamera);

		const resultRenderInfo = { resultLut, legendCamera, legendScene, legendRenderer };
		femSimulationGeneralInfo[resultFields[ires].resultName] = resultRenderInfo;
	}

	setFemSimulationGeneralInfo(femSimulationGeneralInfo);
}


export const setAnimationMixerRecursively = (
	obj: IThreeMesh,
	meshRef: any,
	mixer: THREE.AnimationMixer | null = null,
	setMixer: (value: React.SetStateAction<THREE.AnimationMixer | null>) => void,
	clipsDuration: number | null = null,
	setClipsDuration: (value: React.SetStateAction<number>) => void
) => {
	if (obj.animations.length !== 0 && !(obj.animations as any).includes(undefined)) {
		if (obj.userData.clipName) {
			const clip = obj.animations[0];
			if (!mixer) mixer = new THREE.AnimationMixer(meshRef);
			const action = mixer.clipAction(clip);
			action.play();
			if (!clipsDuration) {
				clipsDuration = obj.animations[0].duration - 0.00001;
				setClipsDuration(clipsDuration);
			}
			setMixer(mixer);
		}
	}
	for (const node_child of obj.children) {
		setAnimationMixerRecursively(node_child as any, meshRef, mixer, setMixer, clipsDuration, setClipsDuration)
	}
}


