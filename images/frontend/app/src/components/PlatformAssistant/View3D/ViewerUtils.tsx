import { GLTFLoader } from "three-stdlib";
import * as THREE from 'three'
import { Camera } from '@react-three/fiber';
import { SensorObject, AssetObject } from './Model';
import { SelectedObjectInfo } from "./Viewer3D";

export const loader = new GLTFLoader();

export interface SensorState {
	stateString: string;
	highlight: boolean;
}

export interface AssetState {
	stateString: string;
	highlight: boolean;
}


export const generateDefaultSensorsState = (sensorObjects: SensorObject[]) => {
	const defaultSensorsState: Record<string, SensorState> = {}
	sensorObjects.forEach(obj => {
		const objName = obj.node.name;
		defaultSensorsState[objName] = { stateString: "off", highlight: false };
	})
	return defaultSensorsState;
}

export const generateDefaultAssetsState = (assetObjects: AssetObject[]) => {
	const defaultAssetsState: Record<string, AssetState> = {}
	assetObjects.forEach(obj => {
		const objName = obj.node.name;
		defaultAssetsState[objName] = { stateString: "ok", highlight: false };
	})
	return defaultAssetsState;
}

var camera: Camera;
var container: HTMLCanvasElement | null;
const sensorObjects: SensorObject[] = [];
const assetObjects: AssetObject[] = [];
const genericObjects: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>[] = [];
const topicsId: number[] = []; //Must match with mqttTopics vector
const dashboardsId: number[] = []; //Must match with DasboardsUrl vector
var dashboardsUrl: string[] = [];
const objNameToTopicIdMap: Record<string, number> = {};
const objNameToDashboardIdMap: Record<string, number> = {};

var setIsCursorInsideObject: (isCursorInsideObjec: boolean) => void;
var setSelectedObjectInfo: (selectedObjectInfo: SelectedObjectInfo) => void;
var changeObjectHighlight: (objType: string, objName: string, highlighted: boolean) => void;
var updateSensorsState: (objName: string, field: string, newValue: string | boolean) => void;
var updateAssestsState: (objName: string, field: string, newValue: string | boolean) => void;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const meshList: THREE.Mesh[] = [];
var mouse = {
	isInsideObject: false,
	objName: "",
	type: ""
};

export const setMeshList = (scene: THREE.Scene) => {
	scene.traverse((obj: any) => {
		if (obj.type === "Mesh") {
			meshList.push(obj);
		}
	})
}

function getSceneBox(scene: THREE.Scene) {
	let first = true;
	var box: any;
	scene.traverse(obj => {
		if (obj.type === "Mesh") {
			if (first) {
				box = new THREE.Box3().setFromObject(obj);
				first = false;
			} else {
				(box as THREE.Box3).expandByObject(obj)
			}
		}
	});
	return box;
}

export const centerScene = (scene: THREE.Scene) => {
	var box = getSceneBox(scene);
	const center_x = (box.max.x + box.min.x) / 2;
	const center_y = (box.max.y + box.min.y) / 2;
	scene.traverse(obj => {
		//though only meshes are taken as input, here everything is shifted as lights shall shift too
		//hierarchical structure does move end leaves multiple times, so selection of meshes only moved as workaround
		if (obj.type === "Mesh") {
			obj.position.set(obj.position.x - center_x, obj.position.y - center_y, obj.position.z);
			const objBox = new THREE.Box3().setFromObject(obj);
			objBox.min.sub(obj.position);
			objBox.max.sub(obj.position);
		}
	});
	setMeshList(scene);
}

export const setParameters = (
	l_camera: Camera,
	l_container: HTMLCanvasElement | null,
	l_setIsCursorInsideObject: (isCursorInsideObject: boolean) => void,
	l_setSelectedObjectInfo: (selectedObjectInfo: SelectedObjectInfo) => void,
	l_changeObjectHighlight: (objType: string, objName: string, highlighted: boolean) => void,
	l_updateSensorsState: (objName: string, field: string, newValue: string | boolean) => void,
	l_updateAssestsState: (objName: string, field: string, newValue: string | boolean) => void,
	l_dashboardsUrl: string[],

) => {
	camera = l_camera;
	container = l_container;
	setIsCursorInsideObject = l_setIsCursorInsideObject;
	setSelectedObjectInfo = l_setSelectedObjectInfo;
	changeObjectHighlight = l_changeObjectHighlight
	updateSensorsState = l_updateSensorsState;
	updateAssestsState = l_updateAssestsState;
	dashboardsUrl = l_dashboardsUrl;
}

export const sortObjects: (scene: any) => {
	sensorObjects: SensorObject[],
	assetObjects: AssetObject[],
	genericObjects: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>[]
	topicsId: number[], //Must match with mqttTopics vector
	dashboardsId: number[] //Must match with DasboardsUrl vector
} = function (scene: any) {
	scene.traverse((obj: any) => {
		if (obj.type === "Mesh") {
			const topicId = obj.userData.topicId;
			objNameToTopicIdMap[obj.name] = topicId;
			if (topicId && topicsId.findIndex(id => id === topicId) === -1) {
				topicsId.push(topicId)
			}
			const dashboardId = obj.userData.dashboardId;
			objNameToDashboardIdMap[obj.name] = dashboardId;
			if (dashboardsId && dashboardsId.findIndex(id => id === dashboardId) === -1) {
				dashboardsId.push(dashboardId)
			}
			switch (obj.userData.type) {
				case "sensor":
					{
						const sensorObject: SensorObject = {
							node: obj,
							topicIndex: -1,
							dasboardIndex: -1,
						}
						sensorObjects.push(sensorObject);
						break;
					}
				case "asset":
					{
						const assestObject: AssetObject = {
							node: obj,
							topicIndex: -1,
							dasboardIndex: -1,
						}
						assetObjects.push(assestObject);
						break;
					}
				default:
					genericObjects.push(obj);
			}
		}
	})

	sensorObjects.forEach((obj: SensorObject) => {
		const topicId = obj.node.userData.topicId;
		obj.topicIndex = topicsId.findIndex(id => id === topicId);
		const dashboardId = obj.node.userData.dashboardId;
		obj.dasboardIndex = dashboardsId.findIndex(id => id === dashboardId);
	})

	assetObjects.forEach((obj: AssetObject) => {
		const topicId = obj.node.userData.topicId;
		obj.topicIndex = topicsId.findIndex(id => id === topicId);
		const dashboardId = obj.node.userData.dashboardId;
		obj.dasboardIndex = dashboardsId.findIndex(id => id === dashboardId);
	})

	return { sensorObjects, assetObjects, genericObjects, topicsId, dashboardsId }
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

export const updateObjectState = (type: string, objName: string, field: string, newValue: string | boolean) => {
	switch (type) {
		case "sensor":
			updateSensorsState(objName, field, newValue);
			break;
		case "asset":
			updateAssestsState(objName, field, newValue);
			break;
		default:
		// code block
	}
}

export const onMouseDown = (event: MouseEvent) => {
	processMouseEvent("mesh_mouse_down", event)
}

export const onMouseClick = (event: any) => {
	processMouseEvent("mesh_mouse_down", event);
	if (event.ctrlKey) {
		if (mouse.type !== "" && mouse.objName !== "") {
			let dashboardUrlIndex = -1;
			if (mouse.type === "sensor") {
				const sensorObj = sensorObjects.filter(obj => obj.node.name === mouse.objName)[0];
				if(sensorObj) dashboardUrlIndex = sensorObj.dasboardIndex;
			} else if (mouse.type === "asset") {
				const assetObj = assetObjects.filter(obj => obj.node.name === mouse.objName)[0];
				if(assetObj) dashboardUrlIndex = assetObj.dasboardIndex;			
			}
			if (dashboardUrlIndex !== -1) {
				const url = dashboardsUrl[dashboardUrlIndex];
				window.open(url, "_blank");
			}
		}
	}
}



export const onMouseMove = (event: MouseEvent) => {
	processMouseEvent("mesh_mouse_move", event)
}

export const onMeshMouseEnter = (e: any) => {
	setIsCursorInsideObject(true);
	const objName = e.detail.name;
	const type = e.detail.type;
	changeObjectHighlight(type, objName, true);
	const topicId = objNameToTopicIdMap[objName].toString();
	const dashboardId = objNameToDashboardIdMap[objName].toString();
	setSelectedObjectInfo({type: toFirstLetterUpperCase(type), name: objName, topicId, dashboardId})
}

export const onMeshMouseExit = (e: any) => {
	setIsCursorInsideObject(false);
	const objName = e.detail.name;
	const type = e.detail.type;
	changeObjectHighlight(type, objName, false);
	setSelectedObjectInfo({type: "-", name: "-", topicId: "-", dashboardId: "-"})
}

// function swap_light_state(name){
// 	if(typeof rooms_light_state[name] == "undefined"){
// 		rooms_light_state[name] = true;
// 	}
// 	else{
// 		rooms_light_state[name] = ! rooms_light_state[name];
// 	}
// 	return rooms_light_state[name];
// }

// function onMeshMouseDown(e){
// 	console.log(`Mesh Mouse Down on ${e.detail.name}`);
// 	const switch_to_state = swap_light_state(e.detail.name);
// 	three.setBulbState(interactive_meshes[e.detail.name],"switch",switch_to_state);
// }

// function onMeshTouchStart(e){
// 	console.log(`Mesh Touch Start on ${e.detail.name}`)
// 	const switch_to_state = swap_light_state(e.detail.name);
// 	three.setBulbState(interactive_meshes[e.detail.name],"switch",switch_to_state);
// }

const toFirstLetterUpperCase = (text: string) => {
	const textModified = text.charAt(0).toLocaleUpperCase() + text.slice(1);
	return textModified;
}
