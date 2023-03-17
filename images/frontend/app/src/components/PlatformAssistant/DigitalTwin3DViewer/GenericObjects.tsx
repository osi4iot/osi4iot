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
    const meshRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>>(null);
    const material = Object.assign(obj.material);
    const defOpacity = defaultOpacity(obj);
    material.transparent = (defOpacity * opacity) === 1 ? false : true;
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
        if (mixer &&
            clipsDuration &&
            genericObjectState.clipValues &&
            genericObjectState.clipValues.length !== 0 &&
            obj.userData.animationType &&
            obj.userData.animationType === "blenderTemporary"
        ) {
            genericObjectState.clipValues.forEach((clipValue, index) => {
                if (clipValue !== null) {
                    const maxValue = obj.userData.clipMaxValues[index];
                    const minValue = obj.userData.clipMinValues[index];
                    let weigth = (clipValue - minValue) / (maxValue - minValue) / genericObjectState.clipValues.length;
                    const action = mixer.existingAction(obj.animations[index]);
                    if (action) {
                        action.setEffectiveWeight(weigth);
                        action.setEffectiveTimeScale(1.0);
                    }
                }
            })
            mixer.setTime(clipsDuration);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mixer, genericObjectState.clipValues]);


    useFrame(({ clock }, delta) => {
        if (obj.userData.animationType &&
            obj.userData.animationType === "blenderEndless"
        ) {
            let newDelta = delta;
            if (genericObjectState.clipValues.length !== 0 &&
                genericObjectState.clipValues[0] !== null
            ) {
                newDelta = genericObjectState.clipValues[0];
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
                    material.emissive = noEmitColor;
                    material.opacity = defOpacity * opacity;
                } else if (deltaInterval > 0.30 && deltaInterval <= 0.60) {
                    material.emissive = highlightColor;
                    material.opacity = 1;
                } else if (deltaInterval > 0.60) {
                    lastIntervalTime = clock.elapsedTime;
                }
            } else {
                if (genericObjectState.highlight) {
                    if (meshRef.current) meshRef.current.visible = true;
                    material.opacity = 1;
                    material.emissive = highlightColor;
                } else {
                    if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                    material.emissive = noEmitColor;
                    material.opacity = defOpacity * opacity;
                }
            }
        } else {
            if (meshRef.current) meshRef.current.visible = visible;
        }
    })

    return (
        (obj.type === "Group" || obj.animations.length !== 0) ?
            <mesh
                ref={meshRef as React.MutableRefObject<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>>}
                castShadow
                receiveShadow
                material={material}
                position={genericObjectState.position}
                scale={genericObjectState.scale}
                quaternion={genericObjectState.quaternion}
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
                position={genericObjectState.position}
                scale={genericObjectState.scale}
                quaternion={genericObjectState.quaternion}
            />

    )
}

const areEqual = (prevProps: GenericObjectProps, nextProps: GenericObjectProps) => {
    return (prevProps.blinking === nextProps.blinking &&
        prevProps.opacity === nextProps.opacity &&
        prevProps.visible === nextProps.visible) &&
        prevProps.genericObjectStateString === nextProps.genericObjectStateString;
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
                        opacity={genericObjectsOpacity * genericObjectsVisibilityState[obj.collectionName].opacity}
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