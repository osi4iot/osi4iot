import * as THREE from 'three'
import React, { FC, useRef } from 'react'
import { useFrame } from '@react-three/fiber';
import { defaultOpacity, defaultVisibility, ObjectVisibilityState } from './ViewerUtils';
import { IGenericObject } from './Model';

interface GenericObjectProps {
    obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
    blinking: boolean;
    opacity: number;
    visible: boolean;
}

const highlightColor = new THREE.Color(0x00ff00);
const noEmitColor = new THREE.Color(0, 0, 0);


const GenericObjectBase: FC<GenericObjectProps> = ({
    obj,
    blinking,
    opacity = 1,
    visible = true,
}) => {
    const meshRef = useRef<THREE.Mesh>();
    const material = Object.assign(obj.material);
    const defOpacity = defaultOpacity(obj);
    material.transparent = (defOpacity*opacity) === 1 ? false : true;;
    let lastIntervalTime = 0;

    useFrame(({ clock }) => {
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
            if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
            material.emissive = noEmitColor;
            material.opacity = defOpacity*opacity;
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

const areEqual = (prevProps: GenericObjectProps, nextProps: GenericObjectProps) => {
    return (prevProps.blinking === nextProps.blinking &&
        prevProps.opacity === nextProps.opacity &&
        prevProps.visible === nextProps.visible);
}

const GenericObject = React.memo(GenericObjectBase, areEqual);

interface GenericObjectsProps {
    genericObjects: IGenericObject[];
    genericObjectsOpacity: number;
    highlightAllGenericObjects: boolean;
    hideAllGenericObjects: boolean;
    genericObjectsVisibilityState: Record<string, ObjectVisibilityState>;
}


const GenericObjects: FC<GenericObjectsProps> = ({
    genericObjects,
    genericObjectsOpacity = 1,
    highlightAllGenericObjects,
    hideAllGenericObjects,
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
                    />
                })
            }
        </>
    )
}

export default GenericObjects;