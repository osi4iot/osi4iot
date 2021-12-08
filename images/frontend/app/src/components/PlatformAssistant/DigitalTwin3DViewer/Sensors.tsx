import * as THREE from 'three';
import React, { FC, useRef, useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { SensorObject } from './Model';
import { SensorState } from './ViewerUtils';
import useInterval from '../../../tools/useInterval';

interface SensorProps {
    obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>;
    blinking: boolean;
    color?: string;
    sensorState: SensorState;
    updateSensorStateString: (state: string) => void;
    emitSensors: boolean;
}

const sensorOnColor = new THREE.Color(0x00ff00);
const sensorOffColor = new THREE.Color(0xff0000);
const noEmitColor = new THREE.Color(0, 0, 0);

const Sensor: FC<SensorProps> = ({
    obj,
    blinking,
    color = "#23272F",
    sensorState,
    updateSensorStateString,
    emitSensors
}) => {
    const camera = useThree((state) => state.camera);
    const [lastTimestamp, setLastTimestamp] = useState<Date | null>(null);
    const meshRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>>();
    const mColor = (obj.material as THREE.MeshLambertMaterial).color;
    const materialColor = (mColor.r === 1 && mColor.g === 1 && mColor.b === 1) ? new THREE.Color(color) : new THREE.Color(mColor);
    var newMaterial = new THREE.MeshLambertMaterial({ color: materialColor, emissive: noEmitColor });
    obj.material = newMaterial;
    const timeout = obj.userData.timeout as number || 60;

    useEffect(() => {
        if (sensorState?.stateString === "on") {
            const newDate = new Date();
            setLastTimestamp(newDate);
        } else if (sensorState?.stateString === "off") {
            setLastTimestamp(null);
        }
        if (sensorState?.highlight && !blinking) {
            if (sensorState?.stateString === "on") {
                (meshRef.current?.material as THREE.MeshPhongMaterial).emissive = sensorOnColor
            } else if (sensorState?.stateString === "off") {
                (meshRef.current?.material as THREE.MeshPhongMaterial).emissive = sensorOffColor
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sensorState, blinking])

    useLayoutEffect(() => {
        camera.updateProjectionMatrix();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [color])

    useLayoutEffect(() => {
        if (blinking) {
            if (sensorState?.stateString === "on") {
                if (emitSensors) (meshRef.current?.material as THREE.MeshPhongMaterial).emissive = sensorOnColor
                else (meshRef.current?.material as THREE.MeshPhongMaterial).emissive = noEmitColor;
            } else if (sensorState?.stateString === "off") {
                if (emitSensors) (meshRef.current?.material as THREE.MeshPhongMaterial).emissive = sensorOffColor
                else (meshRef.current?.material as THREE.MeshPhongMaterial).emissive = noEmitColor;
            }
        }
        if (lastTimestamp) {
            const newDate = new Date();
            const dif = Math.round((newDate.getTime() - lastTimestamp.getTime()) / 1000);
            if (dif > timeout) updateSensorStateString("off");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [emitSensors, blinking])

    return (
        <mesh
            ref={meshRef}
            castShadow
            receiveShadow
            geometry={obj.geometry}
            material={obj.material}
            position={[obj.position.x, obj.position.y, obj.position.z]}
            rotation={[obj.rotation.x, obj.rotation.y, obj.rotation.z]}
            scale={[obj.scale.x, obj.scale.y, obj.scale.z]}
        />
    )
}

interface SensorsProps {
    sensorObjects: SensorObject[];
    sensorsColor: string;
    highlightAllSensors: boolean;
    sensorsState: Record<string, SensorState>;
    updateSensorStateString: (objName: string, state: string) => void;
}


const Sensors: FC<SensorsProps> = ({
    sensorObjects,
    sensorsColor,
    highlightAllSensors,
    sensorsState,
    updateSensorStateString,
}) => {
    const [emitSensors, setEmitSensors] = useState(false);


    const updateEmit = useCallback(() => {
        if (highlightAllSensors) {
            setEmitSensors(emitSensors => !emitSensors);
        }
    }, [highlightAllSensors]);

    useInterval(updateEmit, 250);

    return (
        <>
            {
                sensorObjects.map((obj, index) => {
                    return <Sensor
                        key={obj.node.uuid}
                        obj={obj.node}
                        color={sensorsColor}
                        blinking={highlightAllSensors}
                        sensorState={sensorsState[obj.node.name]}
                        updateSensorStateString={(state) => updateSensorStateString(obj.node.name, state)}
                        emitSensors={emitSensors}
                    />
                })
            }
        </>
    )
}

export default Sensors;
