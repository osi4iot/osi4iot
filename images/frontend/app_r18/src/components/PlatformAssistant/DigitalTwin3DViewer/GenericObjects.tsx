import * as THREE from 'three'
import React, { FC, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber';
import { defaultOpacity, defaultVisibility, GenericObjectState, ObjectVisibilityState } from './ViewerUtils';
import { IGenericObject } from './Model';
import { changeMaterialPropRecursively } from '../../../tools/tools';
import { IThreeMesh } from './threeInterfaces';


interface GenericObjectProps {
    obj: IThreeMesh;
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
    const recursiveTransparency = obj.userData.recursiveTransparency;
    if (recursiveTransparency === undefined || recursiveTransparency === "true") {
        changeMaterialPropRecursively(obj, 'transparent', (defOpacity * opacity) === 1 ? false : true);
    }

    let lastIntervalTime = 0;
    const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);
    const [clipsDuration, setClipsDuration] = useState(0);


    useEffect(() => {
        if (obj.animations.length !== 0 && !(obj.animations as any).includes(undefined) && meshRef.current) {
            const mixer = new THREE.AnimationMixer(meshRef.current as any);
            obj.animations.forEach(clip => mixer.clipAction(clip).play());
            const clipsDuration = obj.animations[0].duration - 0.00001;
            setClipsDuration(clipsDuration);
            setMixer(mixer);
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
        if (obj.blenderAnimationTypes.includes("blenderEndless")) {
            let newDelta = delta;
            if (genericObjectState.clipValue !== null) {
                newDelta = delta * genericObjectState.clipValue;
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
                    changeMaterialPropRecursively(obj, 'emissive', noEmitColor);
                    changeMaterialPropRecursively(obj, 'opacity', defOpacity * opacity);
                } else if (deltaInterval > 0.30 && deltaInterval <= 0.60) {
                    changeMaterialPropRecursively(obj, 'emissive', highlightColor);
                    changeMaterialPropRecursively(obj, 'opacity', 1.0);
                } else if (deltaInterval > 0.60) {
                    lastIntervalTime = clock.elapsedTime;
                }
            } else {
                if (genericObjectState.highlight) {
                    if (meshRef.current) meshRef.current.visible = true;
                    changeMaterialPropRecursively(obj, 'emissive', highlightColor);
                    changeMaterialPropRecursively(obj, 'opacity', 1.0);
                } else {
                    if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                    changeMaterialPropRecursively(obj, 'emissive', noEmitColor);
                    changeMaterialPropRecursively(obj, 'opacity', defOpacity * opacity);
                }
            }
        } else {
            if (meshRef.current) meshRef.current.visible = visible;
        }
    })


    return (
        (
            obj.type === "Group" ||
            obj.animations.length !== 0 ||
            obj.customAnimationObjectNames.length !== 0 ||
            obj.children.length !== 0
        ) ?
            <mesh
                ref={meshRef as React.MutableRefObject<IThreeMesh>}
                castShadow
                receiveShadow
                material={material}
            >
                <primitive
                    material={material}
                    object={obj}
                />
            </mesh>
            :
            <mesh
                ref={meshRef as React.MutableRefObject<IThreeMesh>}
                castShadow
                receiveShadow
                geometry={obj.geometry}
                material={material}
                position={obj.position}
                scale={obj.scale}
                quaternion={obj.quaternion}
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