import * as THREE from 'three'
import React, { FC, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber';
import { defaultOpacity, defaultVisibility, GenericObjectState, ObjectVisibilityState } from './ViewerUtils';
import { IGenericObject } from './Model';

interface GenericObjectProps {
    obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
    blinking: boolean;
    opacity: number;
    visible: boolean;
    genericObjectState: GenericObjectState;
    genericObjectStateString: string;
}

const highlightColor = new THREE.Color(0x00ff00);
const noEmitColor = new THREE.Color(0, 0, 0);


const GenericObjectBase: FC<GenericObjectProps> = ({
    obj,
    blinking,
    opacity = 1,
    visible = true,
    genericObjectState,
    genericObjectStateString
}) => {
    const meshRef = useRef<THREE.Mesh>();
    const material = Object.assign(obj.material);
    const defOpacity = defaultOpacity(obj);
    material.transparent = (defOpacity*opacity) === 1 ? false : true;
    let lastIntervalTime = 0;
    const [mixers, setMixers] = useState<THREE.AnimationMixer[]>([]);

    useEffect(() => {
        if (obj.animations.length && meshRef.current) {
            if (obj.userData.clipNames) {
                const mixers: THREE.AnimationMixer[] = []
                obj.animations.forEach(clip => {
                    const mixer = new THREE.AnimationMixer(meshRef.current as any);
                    const action = mixer.clipAction(clip);
                    action.play();
                    mixers.push(mixer);
                });
                setMixers(mixers);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [obj.animations, meshRef]);

    useEffect(() => {
        if (mixers.length && genericObjectState.clipValues && genericObjectState.clipValues.length !== 0) {
            genericObjectState.clipValues.forEach((clipValue, index) => {
                if (clipValue) {
                    const maxValue = obj.userData.clipMaxValues[index];
                    const minValue = obj.userData.clipMinValues[index];
                    const clipDuration = obj.animations[index].duration;
                    let time = (clipValue - minValue) / (maxValue - minValue) * clipDuration;
                    if (time >= clipDuration) time = clipDuration - 0.00001;
                    if (time < 0.0) time = 0.0;
                    mixers[index].setTime(time);
                }
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mixers, genericObjectState.clipValues]);

    useFrame(({ clock }) => {
        if (visible) {
            if (blinking) {
                if (lastIntervalTime === 0) {
                    lastIntervalTime = clock.elapsedTime;
                }
                const deltaInterval = clock.elapsedTime - lastIntervalTime;
                if (deltaInterval <= 0.30) {
                    material.emissive = noEmitColor;
                    material.opacity = defOpacity*opacity;
                } else if (deltaInterval > 0.30 && deltaInterval <= 0.60) {
                    material.emissive = highlightColor;
                    material.opacity = 1;
                } else if (deltaInterval > 0.60) {
                    lastIntervalTime = clock.elapsedTime;
                }
            } else {
                if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                material.emissive = noEmitColor;
                material.opacity = defOpacity*opacity;
            }
        } else {
            if (meshRef.current) meshRef.current.visible = visible;
        }
    })

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

const areEqual = (prevProps: GenericObjectProps, nextProps: GenericObjectProps) => {
    return (prevProps.blinking === nextProps.blinking &&
        prevProps.opacity === nextProps.opacity &&
        prevProps.visible === nextProps.visible) &&
        prevProps.genericObjectStateString ===  nextProps.genericObjectStateString;
}

const GenericObject = React.memo(GenericObjectBase, areEqual);

interface GenericObjectsProps {
    genericObjects: IGenericObject[];
    genericObjectsOpacity: number;
    highlightAllGenericObjects: boolean;
    hideAllGenericObjects: boolean;
    genericObjectsState: Record<string, GenericObjectState>;
    genericObjectsVisibilityState: Record<string, ObjectVisibilityState>;
}


const GenericObjects: FC<GenericObjectsProps> = ({
    genericObjects,
    genericObjectsOpacity = 1,
    highlightAllGenericObjects,
    hideAllGenericObjects,
    genericObjectsState,
    genericObjectsVisibilityState,
}) => {

    return (
        <>
            {
                genericObjects.map((obj, index) => {
                    return <GenericObject
                        key={obj.node.uuid}
                        obj={obj.node}
                        blinking={highlightAllGenericObjects || genericObjectsVisibilityState[obj.collectionName].highlight}
                        opacity={genericObjectsOpacity*genericObjectsVisibilityState[obj.collectionName].opacity}
                        visible={!(genericObjectsVisibilityState[obj.collectionName].hide || hideAllGenericObjects)}
                        genericObjectState={genericObjectsState[obj.node.name]}
                        genericObjectStateString={JSON.stringify(genericObjectsState[obj.node.name])}
                    />
                })
            }
        </>
    )
}

export default GenericObjects;