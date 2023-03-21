import * as THREE from 'three';
import React, { FC, useRef, useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { ISensorObject } from './Model';
import { defaultOpacity, defaultVisibility, ObjectVisibilityState, SensorState } from './ViewerUtils';
import { changeMaterialPropRecursively } from '../../../tools/tools';

interface SensorProps {
    obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>;
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
    const meshRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>>(null);
    const material = Object.assign(obj.material);
    const changeMatPropRecursively = useCallback((obj, prop, propValue) => {
        changeMaterialPropRecursively(obj, prop, propValue);
    }, []);
    const defOpacity = defaultOpacity(obj);
    changeMatPropRecursively(obj, 'transparent', (defOpacity * opacity) === 1 ? false : true);
    const timeout = obj.userData.timeout as number || 60;
    let lastIntervalTime = 0;
    const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);
    const [clipsDuration, setClipsDuration] = useState(0);

    useEffect(() => {
        if (obj.animations.length !== 0 && !(obj.animations as any).includes(undefined) && meshRef.current) {
            if (obj.userData.clipNames) {
                const mixer = new THREE.AnimationMixer(meshRef.current as any);
                obj.animations.forEach(clip => {
                    const action = mixer.clipAction(clip);
                    action.play();
                });
                const clipsDuration = obj.animations[0].duration - 0.00001; //All clips must have the same duration
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
            sensorState.clipValues &&
            sensorState.clipValues.length !== 0 &&
            obj.userData.animationType &&
            obj.userData.animationType === "blenderTemporary"
        ) {
            sensorState.clipValues.forEach((clipValue, index) => {
                if (clipValue !== null) {
                    const maxValue = obj.userData.clipMaxValues[index];
                    const minValue = obj.userData.clipMinValues[index];
                    let weigth = (clipValue - minValue) / (maxValue - minValue) / sensorState.clipValues.length;
                    // const action = mixer.existingAction(obj.animations[index]);
                    // if (action) {
                    //     action.setEffectiveWeight(weigth);
                    //     action.setEffectiveTimeScale(1.0);
                    // }
                    const clipsDuration = obj.animations[0].duration - 0.00001;
                    mixer.setTime(weigth*clipsDuration)
                }
            })
            //mixer.setTime(clipsDuration);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mixer, sensorState.clipValues]);

    useFrame(({ clock }, delta) => {
        if (obj.userData.animationType &&
            obj.userData.animationType === "blenderEndless"
        ) {
            let newDelta = delta;
            if (sensorState.clipValues[0] !== null) {
                newDelta = sensorState.clipValues[0];
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
                    changeMatPropRecursively(obj, 'emissive', noEmitColor);
                    changeMatPropRecursively(obj, 'opacity', defOpacity * opacity);
                } else if (deltaInterval > 0.30 && deltaInterval <= 0.60) {
                    if (meshRef.current) meshRef.current.visible = true;
                    changeMatPropRecursively(obj, 'opacity', 1.0);
                    if (sensorState?.stateString === "on") {
                        changeMatPropRecursively(obj, 'emissive', sensorOnColor);
                    } else {
                        changeMatPropRecursively(obj, 'emissive', sensorOffColor);
                    }
                } else if (deltaInterval > 0.60) {
                    lastIntervalTime = clock.elapsedTime;
                }
            } else {
                if (sensorState.highlight) {
                    if (meshRef.current) meshRef.current.visible = true;
                    material.opacity = 1;
                    if (sensorState?.stateString === "on") {
                        changeMatPropRecursively(obj, 'emissive', sensorOnColor);
                    } else {
                        changeMatPropRecursively(obj, 'emissive', sensorOffColor);
                    }
                } else {
                    if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                    changeMatPropRecursively(obj, 'emissive', noEmitColor);
                    changeMatPropRecursively(obj, 'opacity', defOpacity * opacity);
                }
            }
        } else {
            if (meshRef.current) meshRef.current.visible = visible;
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
        (obj.type === "Group" || obj.animations.length !== 0) ?
            <mesh
                ref={meshRef as React.MutableRefObject<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>>}
                castShadow
                receiveShadow
                material={material}
                position={sensorState.position}
                scale={sensorState.scale}
                quaternion={sensorState.quaternion}
            >
                <primitive
                    object={obj}
                />
            </mesh>
            :
            <mesh
                ref={meshRef as React.MutableRefObject<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>>}
                castShadow
                receiveShadow
                geometry={obj.geometry}
                material={material}
                position={sensorState.position}
                scale={sensorState.scale}
                quaternion={sensorState.quaternion}
            />
    )
}

const areEqual = (prevProps: SensorProps, nextProps: SensorProps) => {
    return (prevProps.sensorState.highlight === nextProps.sensorState.highlight || nextProps.blinking) &&
        prevProps.sensorState.stateString === nextProps.sensorState.stateString &&
        (prevProps.sensorsStateString === nextProps.sensorsStateString && nextProps.blinking) &&
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