import * as THREE from 'three';
import React, { FC, useRef, useState, useLayoutEffect, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { ISensorObject } from './Model';
import { defaultOpacity, defaultVisibility, ObjectVisibilityState, SensorState } from './ViewerUtils';
import { changeMaterialPropRecursively } from '../../../tools/tools';
import { sensorDisplay } from '../../../tools/sensorDisplay';
import { IThreeMesh } from './threeInterfaces';
import { Html } from "@react-three/drei";
import styled from 'styled-components';

const SensorLabel = styled.div`
    position: relative;
    display: inline-block;
    border-bottom: 1px dotted black;
    
    span {
        width: 150px;
        background-color: #ffeb99;
        font-size: 12px;
        font-weight: 700;
        color: black;
        text-align: center;
        border-radius: 6px;
        padding: 5px 0;
        position: absolute;
        z-index: 1;
        bottom: 150%;
        left: 50%;
        margin-left: -75px;
        margin-bottom: 25px;

        ::after {
            content: "";
            position: absolute;
            top: 100%;
            left: 50%;
            margin-left: -5px;
            border-width: 5px;
            border-style: solid;
            border-color: #ffeb99 transparent transparent transparent;
        }
    }
`;

interface SensorProps {
    obj: IThreeMesh;
    blinking: boolean;
    opacity: number;
    sensorState: SensorState;
    sensorsStateString: string;
    updateSensorStateString: (state: string) => void;
    visible: boolean;
}

const sensorOnColor = new THREE.Color(0x00ff00);
const sensorOffColor = new THREE.Color(0xff0000);
const noEmitColor = new THREE.Color(0, 0, 0);

const SensorBase: FC<SensorProps> = ({
    obj,
    blinking,
    opacity = 1,
    sensorState,
    sensorsStateString,
    updateSensorStateString,
    visible
}) => {
    const camera = useThree((state) => state.camera);
    const [lastTimestamp, setLastTimestamp] = useState<Date | null>(null);
    const meshRef = useRef<IThreeMesh>(null);
    const material = Object.assign(obj.material);
    const defOpacity = defaultOpacity(obj);
    const recursiveTransparency = obj.userData.recursiveTransparency;
    if (recursiveTransparency === undefined || recursiveTransparency === "true") {
        changeMaterialPropRecursively(obj, 'transparent', (defOpacity * opacity) === 1 ? false : true);
    }
    const timeout = obj.userData.timeout as number || 60;
    let lastIntervalTime = 0;
    const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);
	const [clipsDuration, setClipsDuration] = useState(0);

    useEffect(() => {
        if (obj.animations.length !== 0 && !(obj.animations as any).includes(undefined) && meshRef.current) {
            if (obj.userData.clipName) {
                const mixer = new THREE.AnimationMixer(meshRef.current as any);
                const clip = obj.animations[0];
                const action = mixer.clipAction(clip);
                action.play();
                const clipsDuration = obj.animations[0].duration - 0.00001;
                setClipsDuration(clipsDuration);
                setMixer(mixer);
            }
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
        if (
            obj.userData.sensorObjectType === "display" &&
            (sensorState.sensorValue !== null)
        ) {
            sensorDisplay(obj, sensorState.sensorValue);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sensorState.sensorValue]);

    useFrame(({ clock }, delta) => {
        if (obj.userData.animationType &&
            obj.userData.animationType === "blenderEndless"
        ) {
            let newDelta = delta;
            if (sensorState.clipValue !== null) {
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
                if (deltaInterval <= 0.30) {
                    if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                    changeMaterialPropRecursively(obj, 'emissive', noEmitColor);
                    changeMaterialPropRecursively(obj, 'opacity', defOpacity * opacity);
                } else if (deltaInterval > 0.30 && deltaInterval <= 0.60) {
                    if (meshRef.current) meshRef.current.visible = true;
                    changeMaterialPropRecursively(obj, 'opacity', 1.0);
                    if (sensorState?.stateString === "on") {
                        changeMaterialPropRecursively(obj, 'emissive', sensorOnColor);
                    } else {
                        changeMaterialPropRecursively(obj, 'emissive', sensorOffColor);
                    }
                } else if (deltaInterval > 0.60) {
                    lastIntervalTime = clock.elapsedTime;
                }
            } else {
                if (sensorState.highlight) {
                    if (meshRef.current) meshRef.current.visible = true;
                    material.opacity = 1;
                    if (sensorState?.stateString === "on") {
                        changeMaterialPropRecursively(obj, 'emissive', sensorOnColor);
                    } else {
                        changeMaterialPropRecursively(obj, 'emissive', sensorOffColor);
                    }
                } else {
                    if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                    changeMaterialPropRecursively(obj, 'emissive', noEmitColor);
                    changeMaterialPropRecursively(obj, 'opacity', defOpacity * opacity);
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
    })

    useLayoutEffect(() => {
        if (sensorState.stateString === "on") {
            const newDate = new Date();
            setLastTimestamp(newDate);
        } else if (sensorState.stateString === "off") {
            setLastTimestamp(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sensorState.stateString])

    useLayoutEffect(() => {
        camera.updateProjectionMatrix();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opacity])


    return (
        (
            obj.type === "Group" ||
            obj.animations.length !== 0 ||
            obj.customAnimationObjectNames.length !== 0 ||
            obj.children.length !== 0
        ) ?
            <group>
                <mesh
                    ref={meshRef as React.MutableRefObject<IThreeMesh>}
                    castShadow
                    receiveShadow
                    material={material}
                >
                    <primitive
                        object={obj}
                    />
                </mesh>
                <Html
                    castShadow // Make HTML cast a shadow
                    receiveShadow // Make HTML receive shadows
                >
                    <SensorLabel >
                        <span>{obj.name}</span>
                    </SensorLabel>
                </Html>
            </group>
            :
            <group
                position={obj.position}
                quaternion={obj.quaternion}
                scale={obj.scale}
            >
                <mesh
                    ref={meshRef as React.MutableRefObject<IThreeMesh>}
                    castShadow
                    receiveShadow
                    geometry={obj.geometry}
                    material={material}
                    position={[0, 0, 0]}
                    scale={[1.0, 1.0, 1.0]}
                    rotation={[0, 0, 0]}
                />
                <Html
                    occlude={"blending"}
                    castShadow
                    receiveShadow
                >
                    <SensorLabel >
                        <span>{obj.name}</span>
                    </SensorLabel>
                </Html>
            </group>
    )
}

const areEqual = (prevProps: SensorProps, nextProps: SensorProps) => {
    return (prevProps.sensorState.highlight === nextProps.sensorState.highlight || nextProps.blinking) &&
        prevProps.sensorState.stateString === nextProps.sensorState.stateString &&
        (prevProps.sensorsStateString === nextProps.sensorsStateString && nextProps.blinking) &&
        prevProps.sensorState.sensorValue === nextProps.sensorState.sensorValue &&
        prevProps.sensorState.clipValue === nextProps.sensorState.clipValue &&
        prevProps.blinking === nextProps.blinking &&
        prevProps.opacity === nextProps.opacity &&
        prevProps.visible === nextProps.visible;
}
const Sensor = React.memo(SensorBase, areEqual);

interface SensorsProps {
    sensorObjects: ISensorObject[];
    sensorsOpacity: number;
    highlightAllSensors: boolean;
    hideAllSensors: boolean;
    sensorsState: Record<string, SensorState>;
    sensorsVisibilityState: Record<string, ObjectVisibilityState>;
    updateSensorStateString: (objName: string, state: string) => void;
}


const Sensors: FC<SensorsProps> = ({
    sensorObjects,
    sensorsOpacity,
    highlightAllSensors,
    hideAllSensors,
    sensorsState,
    sensorsVisibilityState,
    updateSensorStateString,
}) => {
    const sensorsStateString = Object.values(sensorsState).map(state => state.stateString === "off" ? "1" : "0").join("");

    return (
        <>
            {
                sensorObjects.map((obj, index) => {
                    return <Sensor
                        key={obj.node.uuid}
                        obj={obj.node}
                        opacity={sensorsOpacity * sensorsVisibilityState[obj.collectionName].opacity}
                        blinking={highlightAllSensors || sensorsVisibilityState[obj.collectionName].highlight}
                        sensorState={sensorsState[obj.node.name]}
                        sensorsStateString={sensorsStateString}
                        updateSensorStateString={(state) => updateSensorStateString(obj.node.name, state)}
                        visible={!(sensorsVisibilityState[obj.collectionName].hide || hideAllSensors)}
                    />
                })
            }
        </>
    )
}

export default Sensors;