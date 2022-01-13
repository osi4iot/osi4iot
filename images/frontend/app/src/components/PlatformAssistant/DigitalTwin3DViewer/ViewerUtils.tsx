import { GLTFLoader } from "three-stdlib";
import * as THREE from 'three'
import { Camera } from '@react-three/fiber';
import { ISensorObject, IAssetObject, IAnimatedObject, IFemSimulationObject, IResultRenderInfo, IGenericObject } from './Model';
import { toast } from "react-toastify";
import { IMeasurement } from "../TableColumns/measurementsColumns";
import Lut, { ILegendLabels } from "./Lut";

export const loader = new GLTFLoader();

export interface SensorState {
	stateString: string;
	highlight: boolean;
}

export interface AssetState {
	stateString: string;
	highlight: boolean;
}

export interface AnimatedObjectState {
	value: number | null;
	highlight: boolean;
}

export interface ObjectVisibilityState {
	hide: boolean;
	highlight: boolean;
	opacity: number;
}

export interface FemSimulationObjectState {
	resultFieldModalValues: Record<string, number[]>;
	highlight: boolean;
}

export interface IDigitalTwinGltfData {
	id: number;
	gltfData: any;
	digitalTwinGltfUrl: string | null;
	femSimulationData: any;
	femSimulationUrl: string | null;
	mqttTopics: string[];
	lastMeasurements: (IMeasurement | null)[];
}


const findLastMeasurement = (topicIndex: number, digitalTwinGltfData: IDigitalTwinGltfData): (IMeasurement | null) => {
	let lastMeasurement = null;
	const mqttTopic = digitalTwinGltfData.mqttTopics[topicIndex];
	if (mqttTopic && mqttTopic.slice(0, 7) !== "Warning") {
		const sqlTopicArray = mqttTopic.split("/");
		const sqlTopic = `${sqlTopicArray[2]}/${sqlTopicArray[3]}`;
		const lastMeasurementIndex = digitalTwinGltfData.lastMeasurements.findIndex(item => item?.topic === sqlTopic);
		if (lastMeasurementIndex !== -1) {
			lastMeasurement = digitalTwinGltfData.lastMeasurements[lastMeasurementIndex];
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

export const generateInitialSensorsState = (sensorObjects: ISensorObject[], digitalTwinGltfData: IDigitalTwinGltfData) => {
	const initialSensorsState: Record<string, SensorState> = {}
	sensorObjects.forEach(obj => {
		const objName = obj.node.name;
		const lastMeasurement = findLastMeasurement(obj.topicIndex, digitalTwinGltfData);
		if (lastMeasurement) {
			const fieldName = obj.node.userData.fieldName;
			const timeout = obj.node.userData.timeout;
			const payloadObject = lastMeasurement.payload as any;
			const payloadKeys = Object.keys(lastMeasurement.payload);
			const elpasedTimeInSeconds = getElapsedTimeInSeconds(lastMeasurement.timestamp);
			if (payloadKeys.indexOf(fieldName) !== -1 && elpasedTimeInSeconds < timeout) {
				const value = payloadObject[fieldName];
				if (typeof value === 'number' || (typeof value === 'object' && value.findIndex((elem: any) => elem === null) !== -1)) {
					initialSensorsState[objName] = { stateString: "on", highlight: false };
				}
			} else {
				initialSensorsState[objName] = { stateString: "off", highlight: false };
			}

		} else {
			initialSensorsState[objName] = { stateString: "off", highlight: false };
		}
	})
	return initialSensorsState;
}

export const generateInitialAssetsState = (assetObjects: IAssetObject[], digitalTwinGltfData: IDigitalTwinGltfData) => {
	const initialAssetsState: Record<string, AssetState> = {}
	assetObjects.forEach(obj => {
		const objName = obj.node.name;
		const lastMeasurement = findLastMeasurement(obj.topicIndex, digitalTwinGltfData);
		if (lastMeasurement) {
			const assetPartIndex = obj.node.userData.assetPartIndex;
			const payloadObject = lastMeasurement.payload as any;
			let stateNumber = 0;
			if (payloadObject.assetPartsState && payloadObject.assetPartsState[assetPartIndex]) {
				stateNumber = parseInt(payloadObject.assetPartsState[assetPartIndex], 10);
			}
			if (stateNumber === 1) {
				initialAssetsState[objName] = { stateString: "alerting", highlight: false };
			} else if (stateNumber === 0) {
				initialAssetsState[objName] = { stateString: "ok", highlight: false };
			}

		} else {
			initialAssetsState[objName] = { stateString: "ok", highlight: false };
		}
	})
	return initialAssetsState;
}

export const generateInitialAnimatedObjectsState = (
	animatedObjects: IAnimatedObject[],
	digitalTwinGltfData: IDigitalTwinGltfData
) => {
	const initialAnimatedObjectsState: Record<string, AnimatedObjectState> = {}
	animatedObjects.forEach(obj => {
		const objName = obj.node.name;
		let lastMeasurement = null;
		if (obj.topicIndex !== -1) {
			lastMeasurement = findLastMeasurement(obj.topicIndex, digitalTwinGltfData);
		}
		if (lastMeasurement) {
			const fieldName = obj.node.userData.fieldName;
			const payloadObject = lastMeasurement.payload as any;
			const payloadKeys = Object.keys(lastMeasurement.payload);
			if (payloadKeys.indexOf(fieldName) !== -1) {
				const value = payloadObject[fieldName];
				if (typeof value === 'number') {
					initialAnimatedObjectsState[objName] = { value, highlight: false };
				}
			} else {
				initialAnimatedObjectsState[objName] = { value: null, highlight: false };
			}

		} else {
			if (obj.topicIndex !== -1 && obj.node.userData.valueMin) {
				initialAnimatedObjectsState[objName] = { value: obj.node.userData.valueMin, highlight: false };
			} else initialAnimatedObjectsState[objName] = { value: null, highlight: false };
		}
	})
	return initialAnimatedObjectsState;
}

export const generateInitialFemSimulationObjectState = (femSimulationObject: IFemSimulationObject, digitalTwinGltfData: IDigitalTwinGltfData) => {
	const highlight = false;
	let resultFieldModalValues = femSimulationObject.defaultModalValues;
	const lastMeasurement = findLastMeasurement(femSimulationObject.topicIndex, digitalTwinGltfData);
	if (lastMeasurement) {
		const resultFieldNames = Object.keys(femSimulationObject.resultFieldPaths);
		const payloadObject = lastMeasurement.payload as any;
		resultFieldNames.forEach((resultFieldName, index) => {
			resultFieldModalValues[resultFieldName] = payloadObject.femSimulationModalValues[index];
		});

	}
	const initialFemSimulationObjectState = { highlight, resultFieldModalValues }
	return initialFemSimulationObjectState;
}

var camera: Camera;
var container: HTMLCanvasElement | null;
var selectedObjTypeRef: HTMLDivElement | null;
var selectedObjNameRef: HTMLDivElement | null;
var selectedObjTopicIdRef: HTMLDivElement | null;

var dashboardUrl: string = "";
const objNameToTopicIdMap: Record<string, number> = {};
var changeObjectHighlight: (objType: string, objName: string, highlighted: boolean) => void;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let meshList: THREE.Mesh[];
var mouse = {
	isInsideObject: false,
	objName: "",
	type: ""
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
	animatedObjects: IAnimatedObject[],
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

	animatedObjects.forEach((obj: IAnimatedObject) => {
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
	animatedObjects: IAnimatedObject[],
	genericObjects: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>[],
	femSimulationObject: IFemSimulationObject | null
) => {
	var box = getSceneBox(sensorObjects, assetObjects, animatedObjects, genericObjects, femSimulationObject);
	const center_x = (box.max.x + box.min.x) / 2;
	const center_y = (box.max.y + box.min.y) / 2;
	return [center_x, center_y];
}

export const setParameters = (
	l_camera: Camera,
	l_container: HTMLCanvasElement | null,
	l_selectedObjTypeRef: HTMLDivElement | null,
	l_selectedObjNameRef: HTMLDivElement | null,
	l_selectedObjTopicIdRef: HTMLDivElement | null,
	l_changeObjectHighlight: (objType: string, objName: string, highlighted: boolean) => void,
	l_dashboardUrl: string,

) => {
	camera = l_camera;
	container = l_container;
	selectedObjTypeRef = l_selectedObjTypeRef;
	selectedObjNameRef = l_selectedObjNameRef;
	selectedObjTopicIdRef = l_selectedObjTopicIdRef;
	changeObjectHighlight = l_changeObjectHighlight;
	dashboardUrl = l_dashboardUrl;
}

const noEmitColor = new THREE.Color(0, 0, 0);
export const findMaterial = (obj: any, materials: Record<string, THREE.MeshStandardMaterial>) => {
	let objMaterial = null;
	for (const materialName in materials) {
		if (materials[materialName].uuid === obj.material.uuid) {
			objMaterial = materials[materialName].clone();
			objMaterial.transparent = true;
			objMaterial.opacity = 1;
			break;
		}
	}
	if (!objMaterial) {
		if (obj.userData.type === "sensor") {
			const materialColor = new THREE.Color("#23272F");
			objMaterial = new THREE.MeshLambertMaterial({ color: materialColor, emissive: noEmitColor, transparent: true, opacity: 1 });
		} else if (obj.userData.type === "asset") {
			const materialColor = new THREE.Color("#828282");
			objMaterial = new THREE.MeshLambertMaterial({ color: materialColor, emissive: noEmitColor, transparent: true, opacity: 1 });
		} else {
			const materialColor = new THREE.Color("#7a5270");
			objMaterial = new THREE.MeshLambertMaterial({ color: materialColor, emissive: noEmitColor, transparent: true, opacity: 1 });
		}
	}
	return objMaterial;
}

export const sortObjects: (nodes: any, materials: Record<string, THREE.MeshStandardMaterial>, animations: THREE.AnimationClip[]) => {
	sensorObjects: ISensorObject[],
	assetObjects: IAssetObject[],
	animatedObjects: IAnimatedObject[],
	genericObjects: IGenericObject[],
	sensorsCollectionNames: string[],
	assetsCollectionNames: string[],
	animatedObjectsCollectionNames: string[],
	genericObjectsCollectionNames: string[],
} = function (nodes: any, materials: Record<string, THREE.MeshStandardMaterial>, animations: THREE.AnimationClip[]) {
	setMeshList(nodes);
	const sensorObjects: ISensorObject[] = [];
	const assetObjects: IAssetObject[] = [];
	const animatedObjects: IAnimatedObject[] = [];
	const genericObjects: IGenericObject[] = [];
	const topicsId: number[] = []; //Must match with mqttTopics vector
	const genericObjectsCollectionNames: string[] = [];
	const sensorsCollectionNames: string[] = [];
	const assetsCollectionNames: string[] = [];
	const animatedObjectsCollectionNames: string[] = [];

	for (const prop in nodes) {
		const obj = nodes[prop];
		if (obj.type === "Mesh") {
			obj.material = findMaterial(obj, materials)
			if (obj.userData.topicId) {
				const topicId = obj.userData.topicId;
				objNameToTopicIdMap[obj.name] = topicId;
				if (topicId && topicsId.findIndex(id => id === topicId) === -1) {
					topicsId.push(topicId)
				}
			}
			switch (obj.userData.type) {
				case "sensor":
					{
						let collectionName = "General";
						if (obj.userData.collectionName) {
							collectionName = obj.userData.collectionName;
						}
						const sensorObject: ISensorObject = {
							node: obj,
							topicIndex: -1,
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
							topicIndex: -1,
							collectionName,
						}
						assetObjects.push(assestObject);
						break;
					}
				case "animated":
					{
						let collectionName = "General";
						if (obj.userData.collectionName) {
							collectionName = obj.userData.collectionName;
						}
						const animatedObject: IAnimatedObject = {
							node: obj,
							topicIndex: -1,
							collectionName,
						}
						animatedObjects.push(animatedObject);
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

	topicsId.sort();

	sensorObjects.forEach((obj: ISensorObject) => {
		const collectionName = obj.collectionName
		if (sensorsCollectionNames.findIndex(name => name === collectionName) === -1) {
			sensorsCollectionNames.push(collectionName);
		}
		if (obj.node.userData.topicId) {
			const topicId = obj.node.userData.topicId;
			obj.topicIndex = topicsId.findIndex(id => id === topicId);
		}
	})

	assetObjects.forEach((obj: IAssetObject) => {
		const collectionName = obj.collectionName
		if (assetsCollectionNames.findIndex(name => name === collectionName) === -1) {
			assetsCollectionNames.push(collectionName);
		}
		if (obj.node.userData.topicId) {
			const topicId = obj.node.userData.topicId;
			obj.topicIndex = topicsId.findIndex(id => id === topicId);
		}
	})

	animatedObjects.forEach((obj: IAnimatedObject) => {
		const collectionName = obj.collectionName
		if (animatedObjectsCollectionNames.findIndex(name => name === collectionName) === -1) {
			animatedObjectsCollectionNames.push(collectionName);
		}
		if (obj.node.userData.topicId) {
			const topicId = obj.node.userData.topicId;
			obj.topicIndex = topicsId.findIndex(id => id === topicId);
		}
		if (obj.node.userData.clipName) {
			const objAnimation = animations.filter(clip => clip.name === obj.node.userData.clipName)[0]
			obj.node.animations = [objAnimation];
		}
	})

	genericObjects.forEach((obj: IGenericObject) => {
		const collectionName = obj.collectionName
		if (genericObjectsCollectionNames.findIndex(name => name === collectionName) === -1) {
			genericObjectsCollectionNames.push(collectionName);
		}
	})

	return {
		sensorObjects,
		assetObjects,
		animatedObjects,
		genericObjects,
		sensorsCollectionNames,
		assetsCollectionNames,
		animatedObjectsCollectionNames,
		genericObjectsCollectionNames
	}
}

function sendCustomEvent(eventName: string, data: any) {
	var event = new CustomEvent(eventName, { detail: data });
	window.dispatchEvent(event);
}

export const get_mesh_intersect = (lx: number, ly: number) => {
	let objName = "";
	let type = "";

	if (container) {
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
		}
	}
	return [objName, type];
}

const processMouseEvent = (
	event_name: string,
	event: MouseEvent
) => {
	event.preventDefault();

	const [objName, type] = get_mesh_intersect(event.clientX, event.clientY);

	if (objName !== "" && type) {
		if ((mouse.objName !== "") && (mouse.objName !== objName)) {
			//jump from object to object, exist last one
			mouse.isInsideObject = false;
			mouse.type = "";
		}
		mouse.objName = objName;
		if (!mouse.isInsideObject) {
			sendCustomEvent("mesh_mouse_enter", { type, name: mouse.objName });
		}
		mouse.isInsideObject = true;
		mouse.type = type;
		sendCustomEvent(event_name, { type, name: mouse.objName });
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
	changeObjectHighlight(type, objName, true);
	let topicId = "-";
	if (objNameToTopicIdMap[objName]) {
		topicId = objNameToTopicIdMap[objName].toString();
	}
	if (selectedObjTypeRef) selectedObjTypeRef.innerHTML = `Object type: ${type}`;
	if (selectedObjNameRef) selectedObjNameRef.innerHTML = `Object name: ${objName}`;
	if (selectedObjTopicIdRef) selectedObjTopicIdRef.innerHTML = `TopicId: ${topicId}`;
}

export const onMeshMouseExit = (e: any) => {
	if (container) container.style.cursor = "default";
	const objName = e.detail.name;
	const type = e.detail.type;
	changeObjectHighlight(type, objName, false);
	if (selectedObjTypeRef) selectedObjTypeRef.innerHTML = "Object type: -";
	if (selectedObjNameRef) selectedObjNameRef.innerHTML = "Object name: -";
	if (selectedObjTopicIdRef) selectedObjTopicIdRef.innerHTML = "TopicId: -";
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

export const loadJsonModel = (
	digitalTwinGltfData: IDigitalTwinGltfData,
	setFemSimulationObjects: (femSimulationObject: IFemSimulationObject) => void,
	setInitialFemSimulationObjectState: (initialFemSimulationObjectState: FemSimulationObjectState) => void
) => {
	const loader = new THREE.BufferGeometryLoader();
	const colorMap = 'rainbow';
	const numberOfColors = 256; //512;
	loader.load(digitalTwinGltfData.femSimulationUrl as string, function (geometry) {
		let legendLayout = 'vertical';
		geometry.computeVertexNormals();
		geometry.normalizeNormals();

		const material = new THREE.MeshLambertMaterial({
			side: THREE.DoubleSide,
			color: 0xF5F5F5,
			vertexColors: true
		});

		const wireFrameMaterial = new THREE.LineBasicMaterial({
			color: 0xffffff,
			linewidth: 1.5,
		});

		const lutColors = [];
		const originalGeometryArray = [];
		for (let i = 0, n = geometry.attributes.position.count; i < n; ++i) {
			lutColors.push(1, 1, 1);
			const coordX = geometry.attributes.position.array[i * 3];
			const coordY = geometry.attributes.position.array[i * 3 + 1];
			const coordZ = geometry.attributes.position.array[i * 3 + 2];
			originalGeometryArray.push(coordX, coordY, coordZ);
		}
		const noneResultColor = new Float32Array(lutColors);
		const originalGeometry = new Float32Array(originalGeometryArray);

		const mesh = new THREE.Mesh(geometry, material);
		const wireframeGeometry = new THREE.WireframeGeometry(mesh.geometry);
        const wireFrameMesh = new THREE.LineSegments(wireframeGeometry, wireFrameMaterial);
		const deformationFields: string[] = digitalTwinGltfData.femSimulationData.metadata.deformationFields;

		const resultsRenderInfo: Record<string, IResultRenderInfo> = {};
		const resultFields = digitalTwinGltfData.femSimulationData.metadata.resultFields;
		const numberOfModes = digitalTwinGltfData.femSimulationData.metadata.numberOfModes;
		const resultFieldPaths: Record<string, string> = {};
		const defaultModalValues: Record<string, number[]> = {};
		const topicIndex = digitalTwinGltfData.mqttTopics.length - 1;

		for (let ires = 0; ires < resultFields.length; ires++) {
			const legendCamera = new THREE.PerspectiveCamera(20, 0.5, 1, 10000);
			legendCamera.position.set(11, 9.5, 40);
			const legendScene = new THREE.Scene();
			legendScene.background = new THREE.Color("#141619");

			const resultLut = new Lut(colorMap, numberOfColors);
			resultLut.setMax(resultFields[ires].maxValue);
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
			resultsRenderInfo[resultFields[ires].resultName] = resultRenderInfo;
			resultFieldPaths[resultFields[ires].resultName] = resultFields[ires].resultPath;
			defaultModalValues[resultFields[ires].resultName] = resultFields[ires].defaultModalValues;
		}

		const femSimulationObject: IFemSimulationObject = {
			node: mesh,
			topicIndex: topicIndex,
			resultsRenderInfo,
			resultFieldPaths,
			defaultModalValues,
			deformationFields,
			numberOfModes,
			noneResultColor,
			originalGeometry,
			wireFrameMesh,
		}
		setFemSimulationObjects(femSimulationObject);
		setInitialFemSimulationObjectState(generateInitialFemSimulationObjectState(femSimulationObject, digitalTwinGltfData))

	});
}




