import * as THREE from 'three'
import React, { FC, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber';
import { AnimatedObjectState, defaultOpacity, defaultVisibility, ObjectVisibilityState } from './ViewerUtils';
import { IAnimatedObject } from './Model';

interface AnimatedObjectProps {
    obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>;
    blinking: boolean;
    opacity: number;
    animatedObjectState: AnimatedObjectState;
    visible: boolean;
}

const highlightColor = new THREE.Color(0x00ff00);
const noEmitColor = new THREE.Color(0, 0, 0);

const AnimatedObjectBase: FC<AnimatedObjectProps> = ({
    obj,
    blinking,
    opacity = 1,
    animatedObjectState,
    visible = true,
}) => {
    const meshRef = useRef<THREE.Mesh>();
    const material = Object.assign(obj.material);
    const defOpacity = defaultOpacity(obj);
    material.transparent = (opacity * defOpacity) === 1 ? false : true;
    let lastIntervalTime = 0;
    const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null)
    const [objAnimationClip, setObjectAnimationClip] = useState<THREE.AnimationClip | null>(null);

    useEffect(() => {
        if (obj.animations.length && meshRef.current) {
            if (obj.userData.clipName) {
                const mixer = new THREE.AnimationMixer(meshRef.current);
                const action = mixer.clipAction(obj.animations[0]);
                action.play();
                setMixer(mixer);
                setObjectAnimationClip(objAnimationClip)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [obj.animations, meshRef])

    useEffect(() => {
        if (mixer && animatedObjectState.value) {
            const valueMax = obj.userData.valueMax;
            const valueMin = obj.userData.valueMin;
            const clipDuration = obj.animations[0].duration;
            let time = (animatedObjectState.value - valueMin) / (valueMax - valueMin) * clipDuration;
            if (time >= clipDuration) time = clipDuration - 0.00001;
            if (time < 0.0) time = 0.0;
            mixer.setTime(time);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mixer, animatedObjectState.value])

    useFrame(({ clock }, delta) => {
        if (!obj.userData.topicId) mixer?.update(delta);
        if (blinking) {
            if (lastIntervalTime === 0) {
                lastIntervalTime = clock.elapsedTime;
            }
            const deltaInterval = clock.elapsedTime - lastIntervalTime;
            if (deltaInterval <= 0.30) {
                material.emissive = noEmitColor;
                material.opacity = defOpacity*opacity;
            } else if (deltaInterval > 0.30 && deltaInterval <= 0.60) {
                material.opacity = 1;
                material.emissive = highlightColor;
            } else if (deltaInterval > 0.60) {
                lastIntervalTime = clock.elapsedTime;
            }
        } else {
            if (animatedObjectState.highlight) {
                if (meshRef.current) meshRef.current.visible = true;
                material.opacity = 1;
                material.emissive = highlightColor;
            } else {
                if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                material.opacity = defOpacity*opacity;
                material.emissive = noEmitColor;
            }
        }
        if (meshRef.current) meshRef.current.visible = visible;
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

const areEqual = (prevProps: AnimatedObjectProps, nextProps: AnimatedObjectProps) => {
    return (prevProps.animatedObjectState.highlight === nextProps.animatedObjectState.highlight || nextProps.blinking) &&
        prevProps.blinking === nextProps.blinking &&
        prevProps.opacity === nextProps.opacity &&
        prevProps.animatedObjectState.value === nextProps.animatedObjectState.value &&
        prevProps.visible === nextProps.visible;
}

const AnimatedObject = React.memo(AnimatedObjectBase, areEqual);

interface AnimatedObjectsProps {
    animatedObjects: IAnimatedObject[];
    animatedObjectsOpacity: number;
    highlightAllAnimatedObjects: boolean;
    hideAllAnimatedObjects: boolean;
    animatedObjectsState: Record<string, AnimatedObjectState>;
    animatedObjectsVisibilityState: Record<string, ObjectVisibilityState>;
}


const AnimatedObjects: FC<AnimatedObjectsProps> = ({
    animatedObjects,
    animatedObjectsOpacity = 1,
    highlightAllAnimatedObjects,
    hideAllAnimatedObjects,
    animatedObjectsState,
    animatedObjectsVisibilityState,
}) => {

    return (
        <>
            {
                animatedObjects.map((obj, index) => {
                    return <AnimatedObject
                        key={obj.node.uuid}
                        obj={obj.node}
                        blinking={highlightAllAnimatedObjects || animatedObjectsVisibilityState[obj.collectionName].highlight}
                        opacity={animatedObjectsOpacity*animatedObjectsVisibilityState[obj.collectionName].opacity}
                        animatedObjectState={animatedObjectsState[obj.node.name]}
                        visible={!(animatedObjectsVisibilityState[obj.collectionName].hide || hideAllAnimatedObjects)}
                    />
                })
            }
        </>
    )
}

export default AnimatedObjects;