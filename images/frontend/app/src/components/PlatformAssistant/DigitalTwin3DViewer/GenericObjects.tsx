import * as THREE from 'three'
import React, { FC, useCallback, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber';
import { defaultOpacity, defaultVisibility, GenericObjectState, ObjectVisibilityState } from './ViewerUtils';
import { IGenericObject } from './Model';
import { changeMaterialPropRecursively } from '../../../tools/tools';

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
    const changeMatPropRecursively = useCallback((obj, prop, propValue) => {
        changeMaterialPropRecursively(obj, prop, propValue);
    }, []);
    const defOpacity = defaultOpacity(obj);
    changeMatPropRecursively(obj, 'transparent', (defOpacity * opacity) === 1 ? false : true);

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
        if (mixer &&
            clipsDuration &&
            genericObjectState.clipValue !== null &&
            obj.userData.animationType &&
            obj.userData.animationType === "blenderTemporary"
        ) {
            const maxValue = obj.userData.clipMaxValue;
            const minValue = obj.userData.clipMinValue;
            let weigth = (genericObjectState.clipValue - minValue) / (maxValue - minValue);
            const clipsDuration = obj.animations[0].duration - 0.00001;
            mixer.setTime(weigth * clipsDuration);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mixer, genericObjectState.clipValue]);


    useFrame(({ clock }, delta) => {
        if (obj.userData.animationType &&
            obj.userData.animationType === "blenderEndless"
        ) {
            let newDelta = delta;
            if (genericObjectState.clipValue !== null) {
                newDelta = genericObjectState.clipValue;
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
                    changeMatPropRecursively(obj, 'emissive', noEmitColor);
                    changeMatPropRecursively(obj, 'opacity', defOpacity * opacity);
                } else if (deltaInterval > 0.30 && deltaInterval <= 0.60) {
                    changeMatPropRecursively(obj, 'emissive', highlightColor);
                    changeMatPropRecursively(obj, 'opacity', 1.0);
                } else if (deltaInterval > 0.60) {
                    lastIntervalTime = clock.elapsedTime;
                }
            } else {
                if (genericObjectState.highlight) {
                    if (meshRef.current) meshRef.current.visible = true;
                    changeMatPropRecursively(obj, 'emissive', highlightColor);
                    changeMatPropRecursively(obj, 'opacity', 1.0);
                } else {
                    if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                    changeMatPropRecursively(obj, 'emissive', noEmitColor);
                    changeMatPropRecursively(obj, 'opacity', defOpacity * opacity);
                }
            }
        } else {
            if (meshRef.current) meshRef.current.visible = visible;
        }
    })

    return (
        (obj.type === "Group" || obj.animations.length !== 0 || obj.children.length !== 0) ?
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
                    material={material}
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
        prevProps.genericObjectState.clipValue === nextProps.genericObjectState.clipValue &&
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