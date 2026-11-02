import * as THREE from "three";
import React, { FC, useRef, useState, useLayoutEffect, useEffect, useMemo } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { toast } from "react-toastify";
import { ISensorObject } from "../Main/Model";
import IDigitalTwinSensorDashboard, {
    defaultOpacity,
    defaultVisibility,
    ObjectVisibilityState,
    SensorState,
} from "../ViewerTools/ViewerUtils";
import { changeMaterialPropRecursively } from "../../../../tools/tools";
import { sensorDisplay } from "../../../../tools/sensorDisplay";
import { IThreeMesh } from "../Types/threeInterfaces";
import { Measurements } from "../../../../tools/measurements";
import SensorMarker, { SensorMarkerStatus } from "./SensorMarker";

// What the platform knows of a sensor (by its sensorRef): its name and what it measures, shown by its marker
export interface SensorInfo {
    description: string;
    sensorType?: string;
    measurements: Measurements;
}

// Is the point (world coordinates) hidden from the camera by another object? It returns that object (null
// when nothing hides it). Only visible, opaque enough meshes count: not the sensor's own object (its marker is
// inside it), nor lines, helpers, shadow catchers or objects the user made transparent to see through them.
//
// A sensor may be inside another object (a gauge inside a column, everything inside a large enclosing mesh or
// under a sea volume): the ray from the camera then crosses that object's surface before the point, but the
// object does not hide it. So an object hit before the point hides it only when the point is outside that
// object: a ray from the point onwards (away from the camera) crosses its surface an even number of times
// (counting both sides of every face). Hits closer to the point than the size of the sensor's own object do
// not count either (the surface the sensor is mounted on).
const OCCLUDER_MIN_OPACITY = 0.5;
const occlusionRaycaster = new THREE.Raycaster();
const insideRaycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const projected = new THREE.Vector3();
const box = new THREE.Box3();
const ownSize = new WeakMap<THREE.Object3D, number>();

const isShownChain = (object: THREE.Object3D | null) => {
    for (let o = object; o; o = o.parent) if (!o.visible) return false;
    return true;
};
const materialsOf = (object: THREE.Object3D): THREE.Material[] => {
    const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    return Array.isArray(material) ? material : material ? [material] : [];
};
const isOpaqueEnough = (object: THREE.Object3D) =>
    materialsOf(object).some(
        (m) =>
            m.visible !== false &&
            m.colorWrite !== false &&
            m.type !== "ShadowMaterial" &&
            (!m.transparent || m.opacity >= OCCLUDER_MIN_OPACITY),
    );
const isInside = (object: THREE.Object3D, ancestor: THREE.Object3D) => {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === ancestor) return true;
    return false;
};
// radius of the sensor's own object (world units), computed once
const ownRadius = (own: THREE.Object3D) => {
    let r = ownSize.get(own);
    if (r === undefined) {
        box.setFromObject(own);
        r = box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length() / 2;
        ownSize.set(own, r);
    }
    return r;
};

// Is the point inside the (closed) mesh? A ray from it crosses the surface an odd number of times. The faces
// are counted from both sides (the materials are made double sided just for this ray).
const isPointInsideMesh = (point: THREE.Vector3, direction: THREE.Vector3, mesh: THREE.Mesh) => {
    const materials = materialsOf(mesh);
    const sides = materials.map((m) => m.side);
    materials.forEach((m) => (m.side = THREE.DoubleSide));
    try {
        insideRaycaster.set(point, direction);
        const hits = insideRaycaster.intersectObject(mesh, false);
        let crossings = 0;
        let last = -Infinity;
        for (const hit of hits) {
            if (hit.distance - last > 1e-6) crossings++; // a ray through an edge hits two faces
            last = hit.distance;
        }
        return crossings % 2 === 1;
    } finally {
        materials.forEach((m, i) => (m.side = sides[i]));
    }
};

export const findOccluder = (
    point: THREE.Vector3,
    camera: THREE.Camera,
    scene: THREE.Object3D,
    ownObject: THREE.Object3D,
): THREE.Object3D | null => {
    projected.copy(point).project(camera);
    if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return null; // off screen: nothing to hide
    ndc.set(projected.x, projected.y);
    occlusionRaycaster.setFromCamera(ndc, camera);
    const reach = occlusionRaycaster.ray.origin.distanceTo(point) - ownRadius(ownObject) - 1e-6;
    const checked = new Set<THREE.Object3D>();
    for (const hit of occlusionRaycaster.intersectObject(scene, true)) {
        if (hit.distance >= reach) break;
        const object = hit.object;
        if (checked.has(object)) continue;
        checked.add(object);
        if (!(object as THREE.Mesh).isMesh || isInside(object, ownObject)) continue;
        if (!isShownChain(object) || !isOpaqueEnough(object)) continue;
        if (isPointInsideMesh(point, occlusionRaycaster.ray.direction, object as THREE.Mesh)) continue;
        return object;
    }
    return null;
};

export const isPointOccluded = (
    point: THREE.Vector3,
    camera: THREE.Camera,
    scene: THREE.Object3D,
    ownObject: THREE.Object3D,
): boolean => findOccluder(point, camera, scene, ownObject) !== null;

// z-index of the markers (drei Html orders them by distance within the range) and of the one with its card
// open, which must be above all of them
const MARKER_Z: [number, number] = [60, 0];
const ACTIVE_MARKER_Z = "1000";

// How often a marker checks whether it is hidden, while the camera or the objects move (s)
const OCCLUSION_CHECK_EVERY = 0.15;

interface SensorProps {
    info?: SensorInfo;
    // hide the marker when other objects are between it and the camera
    hideOccludedMarker: boolean;
    obj: IThreeMesh;
    blinking: boolean;
    marker: boolean;
    opacity: number;
    sensorState: SensorState;
    sensorsStateString: string;
    updateSensorStateString: (state: string) => void;
    visible: boolean;
    sensorDashboardUrl: string;
    openDashboardTab: (url: string) => void;
}

const sensorOnColor = new THREE.Color(0x00ff00);
const sensorOffColor = new THREE.Color(0xff0000);
const noEmitColor = new THREE.Color(0, 0, 0);

const SensorBase: FC<SensorProps> = ({
    info,
    hideOccludedMarker,
    obj,
    blinking,
    marker,
    opacity = 1,
    sensorState,
    sensorsStateString,
    updateSensorStateString,
    visible,
    sensorDashboardUrl,
    openDashboardTab,
}) => {
    const camera = useThree((state) => state.camera);
    const scene = useThree((state) => state.scene);
    const markerGroupRef = useRef<THREE.Group>(null);
    const [markerOccluded, setMarkerOccluded] = useState(false);
    // the marker whose card is open is drawn above all the other markers
    const [markerActive, setMarkerActive] = useState(false);
    const markerHtmlRef = useRef<HTMLDivElement>(null);
    // drei Html sets the z-index of its element (the parent of the ref) only when the camera moves
    useEffect(() => {
        const el = markerHtmlRef.current?.parentElement;
        if (el) el.style.zIndex = markerActive ? ACTIVE_MARKER_Z : String(MARKER_Z[0]);
    }, [markerActive]);
    const nextOcclusionCheck = useRef(0);
    const markerPoint = useMemo(() => new THREE.Vector3(), []);
    const [lastTimestamp, setLastTimestamp] = useState<Date | null>(null);
    const meshRef = useRef<IThreeMesh>(null);
    const material = obj.material;

    const defOpacity = defaultOpacity(obj);
    const recursiveTransparency = obj.userData.recursiveTransparency;
    const hasEndlessAnimations =
        obj.blenderAnimationTypes?.includes("blenderEndless") || obj.userData.animationType === "blenderEndless";
    if (recursiveTransparency === undefined || recursiveTransparency === "true") {
        // La transparencia propia de los materiales glTF (BLEND) se conserva en changeMaterialPropRecursively;
        // aquí solo se activa cuando el usuario baja la opacidad.
        const isTransparent = defOpacity * opacity < 1;
        changeMaterialPropRecursively(obj, "transparent", isTransparent);
    }
    const timeout = (obj.userData.timeout as number) || 60;
    let lastIntervalTime = 0;
    const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);
    const [clipsDuration, setClipsDuration] = useState(0);

    const markerClickHandler = () => {
        if (sensorDashboardUrl === "") {
            toast.warning("Sensor dashboard url not defined");
        } else {
            openDashboardTab(sensorDashboardUrl);
        }
    };

    useEffect(() => {
        if (obj.animations.length !== 0 && !(obj.animations as any).includes(undefined) && meshRef.current) {
            // Todos los clips del sensor y de sus descendientes (antes solo el primero y solo con clipName).
            const mixer = new THREE.AnimationMixer(meshRef.current as any);
            obj.animations.forEach((clip) => mixer.clipAction(clip).play());
            const clipsDuration = obj.animations[0].duration - 0.00001;
            setClipsDuration(clipsDuration);
            setMixer(mixer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [obj.animations, meshRef]);

    useEffect(() => {
        if (
            mixer &&
            clipsDuration &&
            sensorState.clipValue !== null &&
            obj.userData.animationType &&
            obj.userData.animationType === "blenderTemporary"
        ) {
            const maxValue = obj.userData.clipMaxValue;
            const minValue = obj.userData.clipMinValue;
            let weigth = (sensorState.clipValue - minValue) / (maxValue - minValue);
            const clipsDuration = obj.animations[0].duration - 0.00001;
            mixer.setTime(weigth * clipsDuration);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mixer, sensorState.clipValue]);

    useEffect(() => {
        if (obj.userData.sensorObjectType === "display" && sensorState.sensorValue !== null) {
            sensorDisplay(obj, sensorState.sensorValue);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sensorState.sensorValue]);

    useFrame(({ clock }, delta) => {
        // la tarjeta abierta, por encima de los demás marcadores aunque se mueva la cámara (Html, hijo de este
        // componente, actualiza su z-index antes en cada fotograma)
        if (markerActive && markerHtmlRef.current?.parentElement) {
            markerHtmlRef.current.parentElement.style.zIndex = ACTIVE_MARKER_Z;
        }
        // ¿Hay otro objeto entre el marcador y la cámara? (solo si el usuario no quiere ver los ocultos)
        if (marker && hideOccludedMarker && markerGroupRef.current) {
            if (clock.elapsedTime >= nextOcclusionCheck.current) {
                nextOcclusionCheck.current = clock.elapsedTime + OCCLUSION_CHECK_EVERY;
                markerGroupRef.current.getWorldPosition(markerPoint);
                const occluder = findOccluder(markerPoint, camera, scene, obj);
                const occluded = occluder !== null;
                if (occluded !== markerOccluded) {
                    // en la consola (nivel "Verbose"): qué objeto tapa cada marcador
                    if (occluder) console.debug(`Sensor marker ${obj.name} hidden by ${occluder.name || occluder.type}`);
                    setMarkerOccluded(occluded);
                }
            }
        } else if (markerOccluded) {
            setMarkerOccluded(false);
        }
        if (hasEndlessAnimations) {
            let newDelta = delta;
            if (sensorState.clipValue !== null) {
                // Se mantiene el comportamiento original de los sensores (clipValue como avance por fotograma),
                // distinto del de activos y objetos genéricos (delta × clipValue), para no alterar modelos existentes.
                newDelta = sensorState.clipValue;
            }
            mixer?.update(newDelta);
        }
        if (visible) {
            if (blinking) {
                if (lastIntervalTime === 0) {
                    lastIntervalTime = clock.elapsedTime;
                }
                const deltaInterval = clock.elapsedTime - lastIntervalTime;
                if (deltaInterval <= 0.3) {
                    if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                    changeMaterialPropRecursively(obj, "emissive", noEmitColor);
                    changeMaterialPropRecursively(obj, "opacity", defOpacity * opacity);
                } else if (deltaInterval > 0.3 && deltaInterval <= 0.6) {
                    if (meshRef.current) meshRef.current.visible = true;
                    changeMaterialPropRecursively(obj, "opacity", 1.0);
                    if (sensorState?.stateString === "on") {
                        changeMaterialPropRecursively(obj, "emissive", sensorOnColor);
                    } else {
                        changeMaterialPropRecursively(obj, "emissive", sensorOffColor);
                    }
                } else if (deltaInterval > 0.6) {
                    lastIntervalTime = clock.elapsedTime;
                }
            } else {
                if (sensorState.highlight) {
                    if (meshRef.current) meshRef.current.visible = true;
                    changeMaterialPropRecursively(obj, "opacity", 1.0);
                    if (sensorState?.stateString === "on") {
                        changeMaterialPropRecursively(obj, "emissive", sensorOnColor);
                    } else {
                        changeMaterialPropRecursively(obj, "emissive", sensorOffColor);
                    }
                } else {
                    if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                    changeMaterialPropRecursively(obj, "emissive", noEmitColor);
                    changeMaterialPropRecursively(obj, "opacity", defOpacity * opacity);
                }
            }
        } else {
            if (meshRef.current) meshRef.current.visible = false;
        }
        if (lastTimestamp) {
            const newDate = new Date();
            const dif = Math.round((newDate.getTime() - lastTimestamp.getTime()) / 1000);
            if (dif > timeout) {
                updateSensorStateString("off");
                setLastTimestamp(null);
            }
        }
    });

    useLayoutEffect(() => {
        if (sensorState.stateString === "on") {
            const newDate = new Date();
            setLastTimestamp(newDate);
        } else if (sensorState.stateString === "off") {
            setLastTimestamp(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sensorState.stateString]);

    useLayoutEffect(() => {
        camera.updateProjectionMatrix();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opacity]);

    // Marcador HTML en la posición del sensor: su estado y, al pasar el ratón, su nombre y su valor actual
    const fieldName: string = obj.userData.fieldName ?? "";
    const markerStatus: SensorMarkerStatus =
        sensorState?.stateString === "on" ? "live" : sensorState?.sensorValue != null ? "stale" : "none";
    const markerElement = marker ? (
        <group ref={markerGroupRef} position={obj.position} quaternion={obj.quaternion} scale={obj.scale}>
            <Html ref={markerHtmlRef} zIndexRange={MARKER_Z}>
                <SensorMarker
                    occluded={markerOccluded}
                    onActiveChange={setMarkerActive}
                    title={info?.description || obj.userData.sensorRef || obj.name}
                    subtitle={[info?.sensorType, obj.userData.sensorRef].filter(Boolean).join(" · ")}
                    measurement={info?.measurements?.[fieldName]}
                    fieldName={fieldName}
                    value={sensorState?.sensorValue}
                    status={markerStatus}
                    lastValueAt={sensorState?.valueTimestamp ?? null}
                    hasDashboard={sensorDashboardUrl !== ""}
                    onOpen={markerClickHandler}
                />
            </Html>
        </group>
    ) : null;

    return obj.type === "Group" ||
        obj.animations.length !== 0 ||
        obj.customAnimationObjectNames.length !== 0 ||
        obj.children.length !== 0 ? (
        <group>
            <mesh
                ref={meshRef as React.MutableRefObject<IThreeMesh>}
                castShadow
                receiveShadow
                material={material}
            >
                <primitive object={obj} />
            </mesh>
            {markerElement}
        </group>
    ) : (
        <group>
            {/* Se dibuja el objeto original del glTF (conserva morph targets, esqueleto y nombre) */}
            <primitive ref={meshRef as React.MutableRefObject<IThreeMesh>} object={obj} castShadow receiveShadow />
            {markerElement}
        </group>
    );
};

const areEqual = (prevProps: SensorProps, nextProps: SensorProps) => {
    return (
        prevProps.sensorState.highlight === nextProps.sensorState.highlight &&
        prevProps.sensorState.stateString === nextProps.sensorState.stateString &&
        prevProps.sensorsStateString === nextProps.sensorsStateString &&
        prevProps.sensorState.sensorValue === nextProps.sensorState.sensorValue &&
        prevProps.sensorState.clipValue === nextProps.sensorState.clipValue &&
        prevProps.blinking === nextProps.blinking &&
        prevProps.opacity === nextProps.opacity &&
        prevProps.marker === nextProps.marker &&
        prevProps.visible === nextProps.visible &&
        prevProps.info === nextProps.info &&
        prevProps.hideOccludedMarker === nextProps.hideOccludedMarker &&
        prevProps.sensorDashboardUrl === nextProps.sensorDashboardUrl
    );
};

const Sensor = React.memo(SensorBase, areEqual);

interface SensorsProps {
    sensorObjects: ISensorObject[];
    sensorsOpacity: number;
    highlightAllSensors: boolean;
    showAllSensorsMarker: boolean;
    // false: the markers that other objects hide are not drawn
    showOccludedSensorMarkers?: boolean;
    hideAllSensors: boolean;
    sensorsState: Record<string, SensorState>;
    sensorsVisibilityState: Record<string, ObjectVisibilityState>;
    updateSensorStateString: (objName: string, state: string) => void;
    sensorsDashboards: IDigitalTwinSensorDashboard[];
    openDashboardTab: (url: string) => void;
    sensorsInfo?: Record<string, SensorInfo>;
}

const Sensors: FC<SensorsProps> = ({
    sensorObjects,
    sensorsOpacity,
    highlightAllSensors,
    showAllSensorsMarker,
    showOccludedSensorMarkers = true,
    hideAllSensors,
    sensorsState,
    sensorsVisibilityState,
    updateSensorStateString,
    sensorsDashboards,
    openDashboardTab,
    sensorsInfo,
}) => {
    const sensorsStateString = Object.values(sensorsState)
        .map((state) => (state.stateString === "off" ? "1" : "0"))
        .join("");

    return (
        <>
            {sensorObjects.map((obj, index) => {
                const sensorRef = obj.node.userData.sensorRef;
                let sensorDashboardUrl = "";
                if (sensorRef && sensorsDashboards.length !== 0) {
                    const sensorDashboard = sensorsDashboards.find((sensor) => sensor.sensorRef === sensorRef);
                    sensorDashboardUrl = sensorDashboard?.dashboardUrl ?? "";
                }
                return (
                    <Sensor
                        key={obj.node.uuid}
                        info={sensorRef ? sensorsInfo?.[sensorRef] : undefined}
                        hideOccludedMarker={!showOccludedSensorMarkers}
                        obj={obj.node}
                        opacity={sensorsOpacity * sensorsVisibilityState[obj.collectionName].opacity}
                        blinking={highlightAllSensors || sensorsVisibilityState[obj.collectionName].highlight}
                        sensorState={sensorsState[obj.node.name]}
                        sensorsStateString={sensorsStateString}
                        updateSensorStateString={(state) => updateSensorStateString(obj.node.name, state)}
                        marker={sensorsVisibilityState[obj.collectionName].showSensorMarker || showAllSensorsMarker}
                        visible={!(sensorsVisibilityState[obj.collectionName].hide || hideAllSensors)}
                        sensorDashboardUrl={sensorDashboardUrl}
                        openDashboardTab={openDashboardTab}
                    />
                );
            })}
        </>
    );
};

export default Sensors;