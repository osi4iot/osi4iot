import * as THREE from 'three'
import React, { FC, useRef } from 'react'
import { useFrame } from '@react-three/fiber';
import { defaultOpacity, defaultVisibility, DynamicObjectState, ObjectVisibilityState } from './ViewerUtils';
import { IDynamicObject } from './Model';

interface DynamicObjectProps {
    obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
    blinking: boolean;
    opacity: number;
    visible: boolean;
    dynamicObjectState: DynamicObjectState;
    dynamicObjectStateString: string;
}

const highlightColor = new THREE.Color(0x00ff00);
const noEmitColor = new THREE.Color(0, 0, 0);

const DynamicObjectBase: FC<DynamicObjectProps> = ({
    obj,
    blinking,
    opacity = 1,
    visible = true,
    dynamicObjectState,
    dynamicObjectStateString
}) => {
    const meshRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>>(null);
    const material = Object.assign(obj.material);
    const defOpacity = defaultOpacity(obj);
    material.transparent = (defOpacity * opacity) === 1 ? false : true;
    let lastIntervalTime = 0;
    const position = dynamicObjectState.position;
    const scale = dynamicObjectState.scale;
    const quaternion = dynamicObjectState.quaternion;

    useFrame(({ clock }, delta) => {
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
                if (dynamicObjectState.highlight) {
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
        obj.type === "Group" ?
            <mesh
                ref={meshRef as React.MutableRefObject<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>>}
                castShadow
                receiveShadow
                material={material}
                position={position}
                quaternion={quaternion}
                scale={scale}
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
                position={position}
                quaternion={quaternion}
                scale={scale}
            />

    )
}

const areEqual = (prevProps: DynamicObjectProps, nextProps: DynamicObjectProps) => {
    return (prevProps.blinking === nextProps.blinking &&
        prevProps.opacity === nextProps.opacity &&
        prevProps.visible === nextProps.visible) &&
        prevProps.dynamicObjectStateString === nextProps.dynamicObjectStateString;
}

const DynamicObject = React.memo(DynamicObjectBase, areEqual);

interface DynamicObjectsProps {
    dynamicObjects: IDynamicObject[];
    dynamicObjectsOpacity: number;
    highlightAllDynamicObjects: boolean;
    hideAllDynamicObjects: boolean;
    dynamicObjectsState: Record<string, DynamicObjectState>;
    dynamicObjectsVisibilityState: Record<string, ObjectVisibilityState>;
}


const DynamicObjects: FC<DynamicObjectsProps> = ({
    dynamicObjects,
    dynamicObjectsOpacity = 1,
    highlightAllDynamicObjects,
    hideAllDynamicObjects,
    dynamicObjectsState,
    dynamicObjectsVisibilityState,
}) => {

    return (
        <>
            {
                dynamicObjects.map((obj, index) => {
                    return <DynamicObject
                        key={obj.node.uuid}
                        obj={obj.node}
                        blinking={highlightAllDynamicObjects || dynamicObjectsVisibilityState[obj.collectionName].highlight}
                        opacity={dynamicObjectsOpacity * dynamicObjectsVisibilityState[obj.collectionName].opacity}
                        visible={!(dynamicObjectsVisibilityState[obj.collectionName].hide || hideAllDynamicObjects)}
                        dynamicObjectState={dynamicObjectsState[obj.node.name]}
                        dynamicObjectStateString={JSON.stringify(dynamicObjectsState[obj.node.name])}
                    />
                })
            }
        </>
    )
}

export default DynamicObjects;