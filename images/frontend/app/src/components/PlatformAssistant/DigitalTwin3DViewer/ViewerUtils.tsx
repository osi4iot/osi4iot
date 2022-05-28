import { GLTFLoader } from "three-stdlib";
import * as THREE from 'three'
import { Camera } from '@react-three/fiber';
import { ISensorObject, IAssetObject, IFemSimulationObject, IResultRenderInfo, IGenericObject, IMqttTopicData } from './Model';
import { toast } from "react-toastify";
import { IMeasurement } from "../TableColumns/measurementsColumns";
import Lut, { ILegendLabels } from "./Lut";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";

export const loader = new GLTFLoader();

export interface SensorState {
	stateString: string;
	highlight: boolean;
	clipValues: (number | null)[];
}

export interface AssetState {
	stateString: string;
	highlight: boolean;
	clipValues: (number | null)[];
}

export interface GenericObjectState {
	highlight: boolean;
	clipValues: (number | null)[];
}


export interface ObjectVisibilityState {
	hide: boolean;
	highlight: boolean;
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
	clipValues: (number | null)[];
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

export interface IDigitalTwinGltfData {
	id: number;
	gltfData: any;
	digitalTwinGltfUrl: string | null;
	femSimulationData: any;
	femSimulationUrl: string | null;
	mqttTopicsData: IMqttTopicData[];
	digitalTwinSimulationFormat: Record<string, DigitalTwinSimulationParameter>;
}


const findLastMeasurement = (topicId: number, digitalTwinGltfData: IDigitalTwinGltfData): (IMeasurement | null) => {
	let lastMeasurement = null;
	const mqttTopicDataFiltered = digitalTwinGltfData.mqttTopicsData.filter(topicData => topicData.topicId === topicId);
	if (mqttTopicDataFiltered.length !== 0) {
		const mqttTopicData = mqttTopicDataFiltered[0];
		const mqttTopic = mqttTopicData.mqttTopic;
		const topicType = mqttTopicData.topicType;
		if (mqttTopic &&
			mqttTopic.slice(0, 7) !== "Warning" &&
			(topicType === "dev2pdb" || topicType === "dtm_as2pdb" || topicType === "dtm_fmv2pdb")
		) {
			lastMeasurement = mqttTopicData.lastMeasurement;
		}
	}
	return lastMeasurement;
}

const getElapsedTimeInSeconds = (timestamp: number) => {
	const datetime = new Date(timestamp).getTime();
	const now = new Date().getTime();
	const elapsedTime = (now - datetime) * 1000;
	return elapsedTime;
}

export const generateInitialSensorsState = (
	sensorObjects: ISensorObject[],
	digitalTwinGltfData: IDigitalTwinGltfData,
) => {
	const initialSensorsState: Record<string, SensorState> = {}
	sensorObjects.forEach(obj => {
		const objName = obj.node.name;
		const sensorTopicId = obj.node.userData.topicId;
		const sensorsState: SensorState = { stateString: "off", highlight: false, clipValues: [] };
		if (sensorTopicId) {
			const lastMeasurement = findLastMeasurement(sensorTopicId, digitalTwinGltfData);
			if (lastMeasurement) {
				const fieldName = obj.node.userData.fieldName;
				const timeout = obj.node.userData.timeout;
				const payloadObject = lastMeasurement.payload as any;
				const payloadKeys = Object.keys(lastMeasurement.payload);
				const elpasedTimeInSeconds = getElapsedTimeInSeconds(lastMeasurement.timestamp);
				if (payloadKeys.indexOf(fieldName) !== -1 && elpasedTimeInSeconds < timeout) {
					const value = payloadObject[fieldName];
					if (typeof value === 'number' || (typeof value === 'object' && value.findIndex((elem: any) => elem === null) !== -1)) {
						sensorsState.stateString = "on";
						sensorsState.highlight = false;
					};
				}
			}
		}

		const clipValues: (number | null)[] = [];
		const clipTopicIds = obj.node.userData.clipTopicIds;
		if (clipTopicIds && clipTopicIds.length !== 0) {
			clipTopicIds.forEach((clipTopicId: number, index: string | number) => {
				const mqttTopicsDataFiltered = digitalTwinGltfData.mqttTopicsData.filter(topicData => topicData.topicId === clipTopicId);
				if (mqttTopicsDataFiltered.length !== 0) {
					const lastMeasurement = mqttTopicsDataFiltered[0].lastMeasurement;
					if (lastMeasurement) {
						const fieldName = obj.node.userData.clipFieldNames[index];
						const payloadObject = lastMeasurement.payload as any;
						const payloadKeys = Object.keys(lastMeasurement.payload);
						if (payloadKeys.indexOf(fieldName) !== -1) {
							const value = payloadObject[fieldName];
							if (typeof value === 'number') {
								clipValues.push(value);
							}
						} else {
							clipValues.push(null);
						}

					} else {
						if (obj.node.userData.clipMinValues && obj.node.userData.clipMinValues[index] !== undefined) {
							clipValues.push(obj.node.userData.clipMinValues[index]);
						} else clipValues.push(null);
					}
				}
			});
			sensorsState.clipValues = clipValues;
		}
		initialSensorsState[objName] = sensorsState;
	})
	return initialSensorsState;
}

export const generateInitialAssetsState = (
	assetObjects: IAssetObject[],
	digitalTwinGltfData: IDigitalTwinGltfData,
) => {
	const initialAssetsState: Record<string, AssetState> = {};
	const assetStateTopicId = digitalTwinGltfData.mqttTopicsData.filter(topic => topic.topicType === "dtm_as2pdb")[0].topicId;
	assetObjects.forEach(obj => {
		const objName = obj.node.name;
		const assetState: AssetState = { stateString: "ok", highlight: false, clipValues: [] };
		const lastMeasurement = findLastMeasurement(assetStateTopicId, digitalTwinGltfData);
		console.log("lastMeasurement=", lastMeasurement)
		if (lastMeasurement) {
			const assetPartIndex = obj.node.userData.assetPartIndex;
			const payloadObject = lastMeasurement.payload as any;
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

		const clipValues: (number | null)[] = [];
		const clipTopicIds = obj.node.userData.clipTopicIds;
		if (clipTopicIds && clipTopicIds.length !== 0) {
			clipTopicIds.forEach((clipTopicId: number, index: string | number) => {
				const mqttTopicsDataFiltered = digitalTwinGltfData.mqttTopicsData.filter(topicData => topicData.topicId === clipTopicId);
				if (mqttTopicsDataFiltered.length !== 0) {
					const lastMeasurement = mqttTopicsDataFiltered[0].lastMeasurement;
					if (lastMeasurement) {
						const fieldName = obj.node.userData.clipFieldNames[index];
						const payloadObject = lastMeasurement.payload as any;
						const payloadKeys = Object.keys(lastMeasurement.payload);
						if (payloadKeys.indexOf(fieldName) !== -1) {
							const value = payloadObject[fieldName];
							if (typeof value === 'number') {
								clipValues.push(value);
							}
						} else {
							clipValues.push(null);
						}

					} else {
						if (obj.node.userData.clipMinValues && obj.node.userData.clipMinValues[index] !== undefined) {
							clipValues.push(obj.node.userData.clipMinValues[index]);
						} else clipValues.push(null);
					}
				}
			});
			assetState.clipValues = clipValues;
		}

		initialAssetsState[objName] = assetState;
	})
	return initialAssetsState;
}

export const generateInitialGenericObjectsState = (
	genericObjects: IGenericObject[],
	digitalTwinGltfData: IDigitalTwinGltfData,
) => {
	const initialGenericObjectsState: Record<string, GenericObjectState> = {};
	genericObjects.forEach(obj => {
		const objName = obj.node.name;
		const genericObjectState: GenericObjectState = { highlight: false, clipValues: [] };

		const clipValues: (number | null)[] = [];
		const clipTopicIds = obj.node.userData.clipTopicIds;
		if (clipTopicIds && clipTopicIds.length !== 0) {
			clipTopicIds.forEach((clipTopicId: number, index: string | number) => {
				const mqttTopicsDataFiltered = digitalTwinGltfData.mqttTopicsData.filter(topicData => topicData.topicId === clipTopicId);
				if (mqttTopicsDataFiltered.length !== 0) {
					const lastMeasurement = mqttTopicsDataFiltered[0].lastMeasurement;
					if (lastMeasurement) {
						const fieldName = obj.node.userData.clipFieldNames[index];
						const payloadObject = lastMeasurement.payload as any;
						const payloadKeys = Object.keys(lastMeasurement.payload);
						if (payloadKeys.indexOf(fieldName) !== -1) {
							const value = payloadObject[fieldName];
							if (typeof value === 'number') {
								clipValues.push(value);
							}
						} else {
							clipValues.push(null);
						}

					} else {
						if (obj.node.userData.clipMinValues && obj.node.userData.clipMinValues[index] !== undefined) {
							clipValues.push(obj.node.userData.clipMinValues[index]);
						} else clipValues.push(null);
					}
				}
			});
			genericObjectState.clipValues = clipValues;
		}

		initialGenericObjectsState[objName] = genericObjectState;
	})
	return initialGenericObjectsState;
}

export const generateInitialFemSimObjectsState = (
	femSimulationObjects: IFemSimulationObject[],
	digitalTwinGltfData: IDigitalTwinGltfData,
) => {
	const highlight = false;
	const initialFemSimObjectsState: FemSimulationObjectState[] = [];
	const femResultModalValuesTopic = digitalTwinGltfData.mqttTopicsData.filter(topic => topic.topicType === "dtm_fmv2pdb")[0].topicId;
	const lastMeasurement = findLastMeasurement(femResultModalValuesTopic, digitalTwinGltfData);
	const payloadObject = lastMeasurement?.payload as any;
	const resultFields = digitalTwinGltfData.femSimulationData.metadata.resultFields;
	for (let imesh = 0; imesh < femSimulationObjects.length; imesh++) {
		const obj = femSimulationObjects[imesh];
		const resultFieldModalValues: Record<string, number[]> = {};
		for (let ires = 0; ires < resultFields.length; ires++) {
			const resultName = resultFields[ires].resultName;
			if (lastMeasurement) {
				resultFieldModalValues[resultName] = payloadObject.femResultsModalValues[imesh][ires];
			} else {
				const meshResult = digitalTwinGltfData.femSimulationData.meshResults[imesh];
				const defaultValues = meshResult.resultFields[resultName].defaultModalValues;
				resultFieldModalValues[resultName] = defaultValues;
			}
		}

		const clipValues: (number | null)[] = [];
		const clipTopicIds = obj.node.userData.clipTopicIds;
		if (clipTopicIds && clipTopicIds.length !== 0) {
			clipTopicIds.forEach((clipTopicId: number, index: string | number) => {
				const mqttTopicsDataFiltered = digitalTwinGltfData.mqttTopicsData.filter(topicData => topicData.topicId === clipTopicId);
				if (mqttTopicsDataFiltered.length !== 0) {
					const lastMeasurement = mqttTopicsDataFiltered[0].lastMeasurement;
					if (lastMeasurement) {
						const fieldName = obj.node.userData.clipFieldNames[index];
						const payloadObject = lastMeasurement.payload as any;
						const payloadKeys = Object.keys(lastMeasurement.payload);
						if (payloadKeys.indexOf(fieldName) !== -1) {
							const value = payloadObject[fieldName];
							if (typeof value === 'number') {
								clipValues.push(value);
							}
						} else {
							clipValues.push(null);
						}

					} else {
						if (obj.node.userData.clipMinValues && obj.node.userData.clipMinValues[index] !== undefined) {
							clipValues.push(obj.node.userData.clipMinValues[index]);
						} else clipValues.push(null);
					}
				}
			});
		}

		initialFemSimObjectsState[imesh] = { highlight, clipValues, resultFieldModalValues };
	}
	return initialFemSimObjectsState;
}

var camera: Camera;
var container: HTMLCanvasElement | null;
var selectedObjTypeRef: HTMLDivElement | null;
var selectedObjNameRef: HTMLDivElement | null;
var selectedObjCollectionNameRef: HTMLDivElement | null;

var dashboardUrl: string = "";
var changeObjectHighlight: (objType: string, objName: string, highlighted: boolean) => void;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let meshList: THREE.Mesh[];
var mouse = {
	isInsideObject: false,
	objName: "",
	type: "",
	collectionName: ""
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
		}
	};
}


const getSceneBox = (
	sensorObjects: ISensorObject[],
	assetObjects: IAssetObject[],
	genericObjects: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>[],
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

	genericObjects.forEach((obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>) => {
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
	genericObjects: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>[],
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
	l_dashboardUrl: string,

) => {
	camera = l_camera;
	container = l_container;
	selectedObjTypeRef = l_selectedObjTypeRef;
	selectedObjNameRef = l_selectedObjNameRef;
	selectedObjCollectionNameRef = l_selectedObjCollectionNameRef;
	changeObjectHighlight = l_changeObjectHighlight;
	dashboardUrl = l_dashboardUrl;
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
	for (const materialName in materials) {
		if (materials[materialName].uuid === obj.material.uuid) {
			objMaterial = materials[materialName].clone();
			objMaterial.transparent = true;
			objMaterial.opacity = 1;
			objMaterial.side = 2;
			if (objMaterial.name === "") {
				const materialColor = giveDefaultObjectMaterialColor(obj);
				objMaterial = new THREE.MeshLambertMaterial({
					color: materialColor,
					emissive: noEmitColor,
					transparent: true,
					opacity: 1,
					side: 2
				});
				objMaterial.name = `${obj.name}_material`;
			}
			break;
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
	femSimulationObjectsCollectionNames: string[],

} = function (nodes: any, materials: Record<string, THREE.MeshStandardMaterial>, animations: THREE.AnimationClip[]) {
	setMeshList(nodes);
	const sensorObjects: ISensorObject[] = [];
	const assetObjects: IAssetObject[] = [];
	const genericObjects: IGenericObject[] = [];
	const femSimulationObjects: IFemSimulationObject[] = [];
	const genericObjectsCollectionNames: string[] = [];
	const sensorsCollectionNames: string[] = [];
	const assetsCollectionNames: string[] = [];
	const femSimulationObjectsCollectionNames: string[] = [];

	for (const prop in nodes) {
		const obj = nodes[prop];
		if (obj.type === "Mesh") {
			obj.material = findMaterial(obj, materials)
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
	}

	sensorObjects.forEach((obj: ISensorObject) => {
		const collectionName = obj.collectionName
		if (sensorsCollectionNames.findIndex(name => name === collectionName) === -1) {
			sensorsCollectionNames.push(collectionName);
		}
		if (obj.node.userData.clipNames && obj.node.userData.clipNames.length !== 0) {
			const objAnimations: THREE.AnimationClip[] = [];
			obj.node.userData.clipNames.forEach((clipName: string) => {
				const objAnimation = animations.filter(clip => clip.name === clipName)[0];
				if (objAnimations) objAnimations.push(objAnimation);
			});
			obj.node.animations = objAnimations;
		}
	})

	assetObjects.forEach((obj: IAssetObject) => {
		const collectionName = obj.collectionName
		if (assetsCollectionNames.findIndex(name => name === collectionName) === -1) {
			assetsCollectionNames.push(collectionName);
		}
		if (obj.node.userData.clipNames && obj.node.userData.clipNames.length !== 0) {
			const objAnimations: THREE.AnimationClip[] = [];
			obj.node.userData.clipNames.forEach((clipName: string) => {
				const objAnimation = animations.filter(clip => clip.name === clipName)[0];
				if (objAnimations) objAnimations.push(objAnimation);
			});
			obj.node.animations = objAnimations;
		}
	})

	genericObjects.forEach((obj: IGenericObject) => {
		const collectionName = obj.collectionName
		if (genericObjectsCollectionNames.findIndex(name => name === collectionName) === -1) {
			genericObjectsCollectionNames.push(collectionName);
		}
		if (obj.node.userData.clipNames && obj.node.userData.clipNames.length !== 0) {
			const objAnimations: THREE.AnimationClip[] = [];
			obj.node.userData.clipNames.forEach((clipName: string) => {
				const objAnimation = animations.filter(clip => clip.name === clipName)[0];
				if (objAnimations) objAnimations.push(objAnimation);
			});
			obj.node.animations = objAnimations;
		}
	})

	femSimulationObjects.forEach((obj: IFemSimulationObject) => {
		const collectionName = obj.collectionName
		if (femSimulationObjectsCollectionNames.findIndex(name => name === collectionName) === -1) {
			femSimulationObjectsCollectionNames.push(collectionName);
		}
		if (obj.node.userData.clipNames && obj.node.userData.clipNames.length !== 0) {
			const objAnimations: THREE.AnimationClip[] = [];
			obj.node.userData.clipNames.forEach((clipName: string) => {
				const objAnimation = animations.filter(clip => clip.name === clipName)[0];
				if (objAnimations) objAnimations.push(objAnimation);
			});
			obj.node.animations = objAnimations;
		}
	})

	return {
		sensorObjects,
		assetObjects,
		genericObjects,
		femSimulationObjects,
		sensorsCollectionNames,
		assetsCollectionNames,
		genericObjectsCollectionNames,
		femSimulationObjectsCollectionNames
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

	if (container && meshList && meshList.length) {
		const rect = container.getBoundingClientRect();
		pointer.x = ((lx - rect.left) / rect.width) * 2 - 1;
		pointer.y = - ((ly - rect.top) / rect.height) * 2 + 1;
		camera.projectionMatrixInverse = new THREE.Matrix4();
		camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
		raycaster.setFromCamera(pointer, camera);
		var intersects = raycaster.intersectObjects(meshList);
		if (intersects.length > 0) {
			objName = intersects[0].object.name;
			type = intersects[0].object.userData.type;
			if (type === "femObject") collectionName = objName;
			else {
				if (intersects[0].object.userData.collectionName) {
					collectionName = intersects[0].object.userData.collectionName;
				} else collectionName = "General";
			}
		}
	}
	return [objName, type, collectionName];
}

const processMouseEvent = (
	event_name: string,
	event: MouseEvent
) => {
	event.preventDefault();

	const [objName, type, collectionName] = get_mesh_intersect(event.clientX, event.clientY);

	if (objName !== "" && type) {
		if ((mouse.objName !== "") && (mouse.objName !== objName)) {
			//jump from object to object, exist last one
			mouse.isInsideObject = false;
			mouse.type = "";
			mouse.collectionName = "";
		}
		mouse.objName = objName;
		mouse.collectionName = collectionName;
		if (!mouse.isInsideObject) {
			sendCustomEvent("mesh_mouse_enter", { type, name: mouse.objName, collectionName: mouse.collectionName });
		}
		mouse.isInsideObject = true;
		mouse.type = type;

		sendCustomEvent(event_name, { type, name: mouse.objName, collectionName: mouse.collectionName });
	}
	else {
		if (mouse.isInsideObject) {
			sendCustomEvent("mesh_mouse_exit", { type: mouse.type, name: mouse.objName });
			mouse.isInsideObject = false;
			mouse.type = "";
		}
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
	if (mouse.type !== "" && mouse.objName !== "") {
		if (dashboardUrl.slice(0, 7) === "Warning") {
			toast.warning(dashboardUrl);
		} else window.open(dashboardUrl, '_blank');
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
	digitalTwinSelected: IDigitalTwin,
	digitalTwinGltfData: IDigitalTwinGltfData,
	femSimulationObjects: IFemSimulationObject[],
	setInitialFemSimObjectsState: (initialFemSimObjectsState: FemSimulationObjectState[]) => void,
	setFemSimulationGeneralInfo: (femSimulationGeneralInfo: Record<string, IResultRenderInfo>) => void,
) => {
	const colorMap = 'rainbow';
	const numberOfColors = 256; //512;
	let legendLayout = 'vertical';

	const femSimulationGeneralInfo: Record<string, IResultRenderInfo> = {};
	const resultFields = digitalTwinGltfData.femSimulationData.metadata.resultFields;

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

	setInitialFemSimObjectsState(
		generateInitialFemSimObjectsState(
			femSimulationObjects,
			digitalTwinGltfData,
		)
	)

}



