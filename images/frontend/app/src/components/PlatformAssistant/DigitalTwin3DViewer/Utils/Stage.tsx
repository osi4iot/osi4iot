import React, { useState, useLayoutEffect, useRef, useMemo, useEffect } from "react";
import * as THREE from 'three';
import { useThree, useFrame, ThreeElements } from "@react-three/fiber";
import { useHelper, ContactShadows } from "@react-three/drei";
import { SceneEffects, SceneEnvironment } from "./SceneLighting";
import type { CameraView } from "../../../../state/viewerMemoryStore";


const dirX = new THREE.Vector3(1, 0, 0);
const redColor = new THREE.Color("#FF0000");
const dirY = new THREE.Vector3(0, 1, 0);
const greenColor = new THREE.Color("#00FF00");
const dirZ = new THREE.Vector3(0, 0, 1);
const blueColor = new THREE.Color("#0000FF");
const origin = new THREE.Vector3(0, 0, 0);

type ControlsProto = { update(): void; target: THREE.Vector3 };

type Props = ThreeElements["group"] & {
    environment?: string;
    environmentIntensity?: number;
    environmentRotation?: number;
    environmentBackground?: boolean;
    backgroundBlur?: number;
    keyLight?: boolean;
    keyLightIntensity?: number;
    keyLightFollowsCamera?: boolean;
    contactShadows?: boolean;
    ambientOcclusion?: boolean;
    bloom?: boolean;
    bloomIntensity?: number;
    toneMapping?: string;
    shadows?: boolean;
    ambientLight?: boolean;
    ambientLightIntensity?: number;
    spotLight?: boolean;
    spotLightPower?: number;
    showSpotLightHelper?: boolean;
    pointLight?: boolean;
    pointLightPower?: number;
    showPointLightHelper?: boolean;
    showAxes?: boolean;
    axesScale?: number;
    ambience?: number;
    controls?: React.MutableRefObject<ControlsProto>;
    shadowBias?: number;
    femResultLoaded: boolean;
    // the camera the user left (viewer memory): used the first time instead of framing the model
    initialView?: CameraView;
    // the model's centre and bounding radius, each time they are measured (camera views)
    onBounds?: (center: THREE.Vector3, radius: number) => void;
};

export function Stage({
    children,
    controls,
    environment = "neutral",
    environmentIntensity = 1,
    environmentRotation = 0,
    environmentBackground = false,
    backgroundBlur = 0.5,
    keyLight = false,
    keyLightIntensity = 2,
    keyLightFollowsCamera = false,
    contactShadows = false,
    ambientOcclusion = false,
    bloom = false,
    bloomIntensity = 0.6,
    toneMapping = "neutral",
    shadows = true,
    ambientLight = true,
    ambientLightIntensity = 1.0,
    spotLight = true,
    spotLightPower = 5.0,
    showSpotLightHelper = false,
    pointLight = true,
    pointLightPower = 5.0,
    showPointLightHelper = false,
    showAxes = false,
    axesScale = 1,
    shadowBias = 0,
    femResultLoaded,
    initialView,
    onBounds,
    ...props
}: Props) {
    const camera = useThree((state) => state.camera);
    const sceneWidth = useThree((state) => state.size.width);
    const sceneHeigth = useThree((state) => state.size.height);
    const defaultControls = useThree(
        (state) => state.controls
    ) as unknown as ControlsProto | null;
    const childrenGroup = React.useRef<THREE.Group>(null!);
    const [{ radius, width, height, minY }, set] = useState({
        radius: 0,
        width: 0,
        height: 0,
        deep: 0,
        minY: 0,
    });
    const [sceneCenter, setSceneCenter] = useState(
        new THREE.Vector3(0.0, 0.0, 0.0)
    );
    const spotLightRefBase = useRef<THREE.SpotLight | null>(null);
    const spotLightRefNull = useRef(undefined);
    const spotLightRef = showSpotLightHelper
        ? spotLightRefBase
        : spotLightRefNull;
    useHelper(
        spotLightRef as React.MutableRefObject<any>,
        THREE.SpotLightHelper,
        "teal"
    );
    const pointLightRefBase = useRef(null);
    const pointLightRefNull = useRef(undefined);
    const pointLightRef = showPointLightHelper
        ? pointLightRefBase
        : pointLightRefNull;
    useHelper(
        pointLightRef as React.MutableRefObject<any>,
        THREE.PointLightHelper,
        0.2,
        "cyan"
    );
    const [axisLength, setAxisLength] = useState(1);

    // The model is framed once (and again when a FEM result is loaded). After that the user's zoom is
    // kept: a resize of the canvas scales it, so the same part of the model stays in view, and a hidden
    // canvas (the pipeline or image tab is shown, size 0) changes nothing. With initialView the first
    // framing is the camera the user left.
    const savedViewRef = useRef(initialView);
    const zoomFramedRef = useRef(false);
    const positionedRef = useRef(false);
    const lastMinSizeRef = useRef(0);
    const lastFemResultLoadedRef = useRef(femResultLoaded);

    useLayoutEffect(() => {
        const box3 = new THREE.Box3().setFromObject(childrenGroup.current);
        const center = new THREE.Vector3();
        const sphere = new THREE.Sphere();
        const width = box3.max.x - box3.min.x;
        const height = box3.max.y - box3.min.y;
        const deep = box3.max.z - box3.min.z;
        box3.getCenter(center);
        box3.getBoundingSphere(sphere);
        set({ radius: sphere.radius, width, height, deep, minY: box3.min.y });
        setSceneCenter(sphere.center);
        onBounds?.(sphere.center.clone(), sphere.radius);
        // the zoom frames the model only with the orthographic camera (with the perspective one, the zoom
        // would narrow the field of view): the camera controller frames the perspective camera
        if (!(camera as THREE.OrthographicCamera).isOrthographicCamera) return;

        const zoom_fact_x = (0.6 * Math.min(sceneWidth, sceneHeigth)) / width;
        const zoom_fact_y = (0.6 * Math.min(sceneWidth, sceneHeigth)) / height;
        const zoom_fact_z = (1.25 * Math.min(sceneWidth, sceneHeigth)) / deep;
        const zoom_fact = Math.min(zoom_fact_x, zoom_fact_y, zoom_fact_z);

        const minSize = Math.min(sceneWidth, sceneHeigth);
        if (minSize <= 0) return; // hidden canvas: keep the camera as it is
        const femResultChanged = lastFemResultLoadedRef.current !== femResultLoaded;
        lastFemResultLoadedRef.current = femResultLoaded;
        const saved = savedViewRef.current;
        if (!zoomFramedRef.current && saved && saved.viewSize > 0 && Number.isFinite(saved.zoom)) {
            camera.zoom = (saved.zoom * minSize) / saved.viewSize;
        } else if (!zoomFramedRef.current || femResultChanged) {
            if (Number.isFinite(zoom_fact) && zoom_fact > 0) camera.zoom = zoom_fact;
        } else if (lastMinSizeRef.current > 0 && minSize !== lastMinSizeRef.current) {
            camera.zoom *= minSize / lastMinSizeRef.current;
        }
        zoomFramedRef.current = true;
        lastMinSizeRef.current = minSize;
        camera.updateProjectionMatrix();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [femResultLoaded, sceneWidth, sceneHeigth]);

    useLayoutEffect(() => {
        setAxisLength(radius / 3.0);
    }, [radius]);

    // Ejes: la escala solo alarga o acorta las líneas; las puntas conservan el tamaño de la longitud automática
    const axes = useMemo(() => {
        const headLength = 0.2 * axisLength;
        const headWidth = 0.2 * headLength;
        const length = Math.max(axisLength * axesScale, headLength * 1.05);
        return [
            new THREE.ArrowHelper(dirX, origin, length, redColor, headLength, headWidth),
            new THREE.ArrowHelper(dirY, origin, length, greenColor, headLength, headWidth),
            new THREE.ArrowHelper(dirZ, origin, length, blueColor, headLength, headWidth),
        ];
    }, [axisLength, axesScale]);

    useEffect(() => () => axes.forEach((arrow) => arrow.dispose()), [axes]);

    useLayoutEffect(() => {
        const saved = savedViewRef.current;
        if (saved && !positionedRef.current && radius > 0) {
            // the camera the user left, once the model is measured
            positionedRef.current = true;
            camera.position.set(...saved.position);
            if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
                camera.near = 0.1;
                camera.far = Math.max(5000, radius * 4);
            }
            const ctrl = defaultControls || controls?.current;
            if (ctrl) {
                ctrl.target.set(...saved.target);
                ctrl.update();
            } else {
                camera.lookAt(new THREE.Vector3(...saved.target));
            }
            camera.updateProjectionMatrix();
            return;
        }
        if (saved && positionedRef.current) return; // the model is the same: keep the user's camera
        camera.position.set(
            sceneCenter.x + radius * 1.0,
            sceneCenter.y + radius * 1.0,
            sceneCenter.z + radius * 2.5
        );
        if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
            camera.near = 0.1;
            camera.far = Math.max(5000, radius * 4);
        }
        // camera.lookAt(center_x, center_y, 0);
        camera.lookAt(sceneCenter);
        const ctrl = defaultControls || controls?.current;
        if (ctrl) {
            // ctrl.target.set(center_x, center_y, 0);
            ctrl.target.set(sceneCenter.x, sceneCenter.y, sceneCenter.z);
            ctrl.update();
        }
        camera.updateProjectionMatrix();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultControls, radius, height, width]);

    return (
        <group {...props}>
            <SceneEnvironment
                environment={environment}
                intensity={environmentIntensity}
                rotation={environmentRotation}
                background={environmentBackground}
                backgroundBlur={backgroundBlur}
            />
            <group ref={childrenGroup}>{children}</group>
            {ambientLight && <ambientLight intensity={ambientLightIntensity} />}
            {spotLight && (
                <>
                    <spotLight
                        ref={spotLightRefBase as React.MutableRefObject<any>}
                        penumbra={0.5}
                        position={[
                            sceneCenter.x + radius * 1.0,
                            sceneCenter.y + radius * 2.0,
                            sceneCenter.z + radius * 1.0,
                        ]}
                        power={spotLightPower}
                        castShadow={shadows}
                        // the shadow camera fits the model (three's default, 0.5-500, leaves a model of a few
                        // centimetres almost without depth precision: rings of shadow acne)
                        shadow-camera-near={Math.max(radius * 0.5, 1e-3)}
                        shadow-camera-far={Math.max(radius * 6, 1)}
                        shadow-bias={shadowBias || -0.0005}
                        shadow-normalBias={radius * 0.01}
                        shadow-mapSize-height={2048}
                        shadow-mapSize-width={2048}
                    />
                </>
            )}

            {pointLight && (
                <pointLight
                    ref={pointLightRefBase as React.MutableRefObject<any>}
                    // position={[-2.0 * radius, -0.5 * radius, -1.8 * radius]}
                    position={[
                        sceneCenter.x - radius * 1.0,
                        sceneCenter.y - radius * 2.0,
                        sceneCenter.z - radius * 1.0,
                    ]}
                    power={pointLightPower}
                />
            )}
            {keyLight && radius > 0 && (
                <KeyLight
                    intensity={keyLightIntensity}
                    followsCamera={keyLightFollowsCamera}
                    castShadow={shadows}
                    center={sceneCenter}
                    radius={radius}
                />
            )}
            {contactShadows && radius > 0 && (
                <ContactShadows
                    position={[sceneCenter.x, minY + radius * 0.002, sceneCenter.z]}
                    scale={radius * 4}
                    far={radius * 1.2}
                    blur={2.5}
                    opacity={0.55}
                    resolution={512}
                    color="#000000"
                />
            )}
            <SceneEffects
                ambientOcclusion={ambientOcclusion}
                bloom={bloom}
                bloomIntensity={bloomIntensity}
                toneMapping={toneMapping}
                radius={radius}
            />
            {showAxes && axes.map((arrow, index) => <primitive key={index} object={arrow} />)}
        </group>
    );
}

// Main (key) light: a directional light that lights the model from above, in front and a little to the side.
// With followsCamera it keeps that place with respect to the camera, so the side the user looks at is always
// lit (as in product viewers); otherwise it stays fixed in the scene. Its shadow camera fits the model.
const KeyLight = ({
    intensity,
    followsCamera,
    castShadow,
    center,
    radius,
}: {
    intensity: number;
    followsCamera: boolean;
    castShadow: boolean;
    center: THREE.Vector3;
    radius: number;
}) => {
    const lightRef = useRef<THREE.DirectionalLight>(null);
    const target = useMemo(() => new THREE.Object3D(), []);
    const offset = useMemo(() => new THREE.Vector3(), []);
    const right = useMemo(() => new THREE.Vector3(), []);
    const up = useMemo(() => new THREE.Vector3(), []);
    const back = useMemo(() => new THREE.Vector3(), []);
    const distance = radius * 4;

    useLayoutEffect(() => {
        target.position.copy(center);
        target.updateMatrixWorld();
        const light = lightRef.current;
        if (!light) return;
        light.position.copy(center).add(new THREE.Vector3(0.6, 1.3, 0.9).normalize().multiplyScalar(distance));
        const cam = light.shadow.camera as THREE.OrthographicCamera;
        cam.left = cam.bottom = -radius * 1.2;
        cam.right = cam.top = radius * 1.2;
        cam.near = Math.max(radius * 0.5, 1e-3);
        cam.far = distance + radius * 2;
        cam.updateProjectionMatrix();
    }, [center, radius, distance, target]);

    useFrame(({ camera }) => {
        const light = lightRef.current;
        if (!light || !followsCamera) return;
        camera.matrixWorld.extractBasis(right, up, back);
        offset.set(0, 0, 0).addScaledVector(right, 0.45).addScaledVector(up, 0.75).addScaledVector(back, 0.9);
        light.position.copy(center).addScaledVector(offset.normalize(), distance);
    });

    return (
        <>
            <primitive object={target} />
            <directionalLight
                ref={lightRef}
                target={target}
                intensity={intensity}
                castShadow={castShadow}
                shadow-bias={-0.0005}
                shadow-normalBias={radius * 0.01}
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
            />
        </>
    );
};
