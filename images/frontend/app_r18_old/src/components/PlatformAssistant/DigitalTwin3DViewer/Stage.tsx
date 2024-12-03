import React, { useState, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useHelper, Environment } from '@react-three/drei';

const dirX = new THREE.Vector3(1, 0, 0);
const redColor = new THREE.Color("#FF0000");
const dirY = new THREE.Vector3(0, 1, 0);
const greenColor = new THREE.Color("#00FF00");
const dirZ = new THREE.Vector3(0, 0, 1);
const blueColor = new THREE.Color("#0000FF");
const origin = new THREE.Vector3(0, 0, 0);

type ControlsProto = { update(): void; target: THREE.Vector3 }

type Props = JSX.IntrinsicElements['group'] & {
    environment?: string
    shadows?: boolean
    ambientLight?: boolean
    ambientLightIntensity?: number
    spotLight?: boolean
    spotLightPower?: number
    showSpotLightHelper?: boolean
    pointLight?: boolean
    pointLightPower?: number
    showPointLightHelper?: boolean
    showAxes?: boolean
    ambience?: number
    controls?: React.MutableRefObject<ControlsProto>
    shadowBias?: number
}


export function Stage({
    children,
    controls,
    environment = "sunset",
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
    shadowBias = 0,
    ...props
}: Props) {
    const camera = useThree((state) => state.camera);
    const sceneWidth = useThree((state) => state.size.width);
    const sceneHeigth = useThree((state) => state.size.height);
    // @ts-expect-error new in @react-three/fiber@7.0.5
    const defaultControls = useThree((state) => state.controls) as ControlsProto
    const childrenGroup = React.useRef<THREE.Group>(null!)
    const [{ radius, width, height }, set] = useState({ radius: 0, width: 0, height: 0, deep: 0 })
    const [sceneCenter, setSceneCenter] = useState(new THREE.Vector3(0.0, 0.0, 0.0));
    const spotLightRefBase = useRef();
    const spotLightRefNull = useRef(undefined);
    const spotLightRef = showSpotLightHelper ? spotLightRefBase : spotLightRefNull;
    useHelper(spotLightRef as React.MutableRefObject<any>, THREE.SpotLightHelper, "teal");
    const pointLightRefBase = useRef();
    const pointLightRefNull = useRef(undefined);
    const pointLightRef = showPointLightHelper ? pointLightRefBase : pointLightRefNull;
    useHelper(pointLightRef  as React.MutableRefObject<any>, THREE.PointLightHelper, 0.2, 'cyan');
    const [axisLength, setAxisLength] = useState(1);

    useLayoutEffect(() => {
        const box3 = new THREE.Box3().setFromObject(childrenGroup.current);
        const center = new THREE.Vector3();
        const sphere = new THREE.Sphere();
        const width = box3.max.x - box3.min.x;
        const height = box3.max.y - box3.min.y;
        const deep = box3.max.z - box3.min.z;
        box3.getCenter(center);
        box3.getBoundingSphere(sphere);
        set({ radius: sphere.radius, width, height, deep });
        setSceneCenter(sphere.center);

        const zoom_fact_x = 0.6 * Math.min(sceneWidth, sceneHeigth) / width;
        const zoom_fact_y = 0.6 * Math.min(sceneWidth, sceneHeigth) / height;
        const zoom_fact_z = 1.25 * Math.min(sceneWidth, sceneHeigth) / deep;
        const zoom_fact = Math.min(zoom_fact_x, zoom_fact_y, zoom_fact_z);
        camera.zoom = zoom_fact;
        camera.updateProjectionMatrix();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sceneWidth, sceneHeigth])

    useLayoutEffect(() => {
        setAxisLength(radius / 3.0);
    }, [radius])



    useLayoutEffect(() => {
        camera.position.set(sceneCenter.x + radius * 1.0, sceneCenter.y + radius * 1.0, sceneCenter.z + radius * 2.5);
        camera.near = 0.1;
        camera.far = Math.max(5000, radius * 4);
        // camera.lookAt(center_x, center_y, 0);
        camera.lookAt(sceneCenter)
        const ctrl = defaultControls || controls?.current;
        if (ctrl) {
            // ctrl.target.set(center_x, center_y, 0);
            ctrl.target.set(sceneCenter.x, sceneCenter.y, sceneCenter.z);
            ctrl.update();
        }
        camera.updateProjectionMatrix();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultControls, radius, height, width])

    return (
        <group {...props}>
            {environment !== "none" && <Environment preset={environment as any}/>}
            <group ref={childrenGroup}>{children}</group>
            {ambientLight && <ambientLight intensity={ambientLightIntensity} />}
            {spotLight &&
                <>
                    <spotLight
                        ref={spotLightRefBase as React.MutableRefObject<any>}
                        penumbra={0.5}
                        position={[sceneCenter.x + radius * 1.0, sceneCenter.y + radius * 2.0, sceneCenter.z + radius * 1.0]}
                        power={spotLightPower}
                        castShadow={shadows}
                        shadow-bias={shadowBias}
                        shadow-mapSize-height={2048}
                        shadow-mapSize-width={2048}
                    />
                </>
            }

            {pointLight &&
                <pointLight
                    ref={pointLightRefBase as React.MutableRefObject<any>}
                    // position={[-2.0 * radius, -0.5 * radius, -1.8 * radius]}
                    position={[sceneCenter.x - radius * 1.0, sceneCenter.y - radius * 2.0, sceneCenter.z - radius * 1.0]}
                    power={pointLightPower}
                />
            }
            {
                showAxes &&
                <>
                    <primitive object={new THREE.ArrowHelper(dirX, origin, axisLength, redColor)} />
                    <primitive object={new THREE.ArrowHelper(dirY, origin, axisLength, greenColor)} />
                    <primitive object={new THREE.ArrowHelper(dirZ, origin, axisLength, blueColor)} />
                </>
            }
        </group>
    )
}