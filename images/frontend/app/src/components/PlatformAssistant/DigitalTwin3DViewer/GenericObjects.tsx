import * as THREE from 'three'
import React, { FC, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber';
import { defaultOpacity, defaultVisibility, GenericObjectState, ObjectVisibilityState } from './ViewerUtils';
import { IGenericObject } from './Model';
import { changeMaterialPropRecursively } from '../../../tools/tools';
import { IThreeMesh } from './threeInterfaces';
import { toast } from 'react-toastify';


interface GenericObjectProps {
    obj: IThreeMesh;
    blinking: boolean;
    opacity: number;
    showDeepObjects: boolean;
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
    showDeepObjects = false,
    genericObjectState,
    genericObjectStateString
}) => {
    const meshRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>>(null);
    const material = Object.assign(obj.material);
    const defOpacity = defaultOpacity(obj);
    const recursiveTransparency = obj.userData.recursiveTransparency;
    if (recursiveTransparency === undefined || recursiveTransparency === "true") {
        changeMaterialPropRecursively(obj, 'transparent', (defOpacity * opacity) === 1 ? false : true);
        changeMaterialPropRecursively(obj, 'depthWrite', !showDeepObjects);
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
        if (obj.userData.animationType && obj.userData.animationType === "customEndless") {
            try {
                const mixer = new THREE.AnimationMixer(obj);
                const time = obj.userData.clipTime;
                const lastIndex = obj.userData.clipTime.length - 1;
                const clipDuration = obj.userData.clipTime[lastIndex];
                const properties = Object.keys(obj.userData.clipValues);
                for (const key of properties) {
                    const trackName = `.${key}`;
                    const clipName = `Action_${obj.name}_${key}`;
                    const values = obj.userData.clipValues[key];
                    const customTrack = new THREE.NumberKeyframeTrack(trackName, time, values);
                    var customClip = new THREE.AnimationClip(clipName, clipDuration, [customTrack]);
                    mixer.clipAction(customClip).play()
                }
                setClipsDuration(clipDuration);
                setMixer(mixer);
            } catch (error: any) {
                toast.error("Error in custom endless animation: ", error.message);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [obj]);

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
        if (
            obj.blenderAnimationTypes.includes("blenderEndless") ||
            (obj.userData.animationType && obj.userData.animationType === "customEndless")
        ) {
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

                    changeMaterialPropRecursively(obj, 'transparent', (defOpacity * opacity) === 1 ? false : true);
                    changeMaterialPropRecursively(obj, 'depthWrite', !showDeepObjects);
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
        prevProps.showDeepObjects === nextProps.showDeepObjects &&
        prevProps.visible === nextProps.visible) &&
        prevProps.genericObjectState.clipValue === nextProps.genericObjectState.clipValue &&
        prevProps.genericObjectStateString === nextProps.genericObjectStateString;
}

const GenericObject = React.memo(GenericObjectBase, areEqual);

interface GenericObjectsProps {
    genericObjects: IGenericObject[];
    genericObjectsOpacity: number;
    genericObjectsShowDeepObjects: boolean;
    highlightAllGenericObjects: boolean;
    hideAllGenericObjects: boolean;
    genericObjectsState: Record<string, GenericObjectState>;
    genericObjectsVisibilityState: Record<string, ObjectVisibilityState>;
}


const GenericObjects: FC<GenericObjectsProps> = ({
    genericObjects,
    genericObjectsOpacity = 1,
    genericObjectsShowDeepObjects = false,
    highlightAllGenericObjects,
    hideAllGenericObjects,
    genericObjectsState,
    genericObjectsVisibilityState,
}) => {

    return (
        <>
            {
                genericObjects.map((obj, index) => {
                    let showDeepObjects = false;
                    if(genericObjectsShowDeepObjects) {
                        showDeepObjects = true;
                    } else {
                        if(genericObjectsVisibilityState[obj.collectionName].showDeepObjects ?? false) {
                            showDeepObjects= true;
                        }
                    }
                    return <GenericObject
                        key={obj.node.uuid}
                        obj={obj.node}
                        blinking={highlightAllGenericObjects || genericObjectsVisibilityState[obj.collectionName].highlight}
                        opacity={genericObjectsOpacity * genericObjectsVisibilityState[obj.collectionName].opacity}
                        visible={!(genericObjectsVisibilityState[obj.collectionName].hide || hideAllGenericObjects)}
                        showDeepObjects={showDeepObjects}
                        genericObjectState={genericObjectsState[obj.node.name]}
                        genericObjectStateString={JSON.stringify(genericObjectsState[obj.node.name])}
                    />
                })
            }
        </>
    )
}

export default GenericObjects;