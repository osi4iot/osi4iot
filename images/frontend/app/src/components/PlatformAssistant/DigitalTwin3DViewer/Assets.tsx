import * as THREE from 'three'
import React, { FC, useRef, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { IAssetObject } from './Model';
import { AssetState, defaultOpacity, defaultVisibility, ObjectVisibilityState } from './ViewerUtils';

const assetOkColor = new THREE.Color(0x00ff00);
const assetAlertingColor = new THREE.Color(0xff0000);
const noEmitColor = new THREE.Color(0, 0, 0);

interface AssetProps {
    obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>;
    blinking: boolean;
    opacity: number;
    assetState: AssetState;
    visible: boolean;
    assetsStateString: string;
}

const AssetBase: FC<AssetProps> = ({
    obj,
    blinking,
    opacity = 1,
    assetState,
    visible = true,
    assetsStateString
}) => {
    const camera = useThree((state) => state.camera);
    const meshRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>>();
    const material = Object.assign(obj.material);
    const defOpacity = defaultOpacity(obj);
    material.transparent = (defOpacity*opacity) === 1 ? false : true;
    
    let lastIntervalTime = 0;

    useFrame(({ clock }) => {
        if (visible) {
            if (blinking) {
                if (lastIntervalTime === 0) {
                    lastIntervalTime = clock.elapsedTime;
                }
                const deltaInterval = clock.elapsedTime - lastIntervalTime;
                if (deltaInterval <= 0.30) {
                    if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                    material.emissive = noEmitColor;
                    material.opacity = defOpacity*opacity;
                } else if (deltaInterval > 0.30 && deltaInterval <= 0.60) {
                    material.opacity = defOpacity*opacity;
                    if (meshRef.current) meshRef.current.visible = true;
                    if (assetState?.stateString === "ok") {
                        material.emissive = assetOkColor;
                    } else if (assetState?.stateString === "alerting") {
                        material.emissive = assetAlertingColor;
                    }
                } else if (deltaInterval > 0.60) {
                    lastIntervalTime = clock.elapsedTime;
                }
            } else {
                if (assetState.highlight) {
                    if (meshRef.current) meshRef.current.visible = true;
                    material.opacity = 1;
                    if (assetState.stateString === "ok") {
                        material.emissive = assetOkColor;
                    } else if (assetState?.stateString === "alerting") {
                        material.emissive = assetAlertingColor;
                    }
                } else {
                    if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                    material.opacity = defOpacity*opacity;
                    if (assetState.stateString === "ok") {
                        material.emissive = noEmitColor;
                    } else if (assetState.stateString === "alerting") {
                        material.emissive = assetAlertingColor;
                    }
                }
            }
        } else {
            if (meshRef.current) meshRef.current.visible = visible;
        }
    })


    useLayoutEffect(() => {
        camera.updateProjectionMatrix();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opacity]);

    return (
        <mesh
            ref={meshRef}
            castShadow
            receiveShadow
            geometry={obj.geometry}
            material={material}
            position={[obj.position.x, obj.position.y, obj.position.z]}
            rotation={[obj.rotation.x, obj.rotation.y, obj.rotation.z]}
            scale={[obj.scale.x, obj.scale.y, obj.scale.z]}
        />
    )
}

const areEqual = (prevProps: AssetProps, nextProps: AssetProps) => {
    return (prevProps.assetState.highlight === nextProps.assetState.highlight || nextProps.blinking) &&
        prevProps.assetState.stateString === nextProps.assetState.stateString &&
        (prevProps.assetsStateString === nextProps.assetsStateString && nextProps.blinking) &&
        prevProps.blinking === nextProps.blinking &&
        prevProps.opacity === nextProps.opacity &&
        prevProps.visible === nextProps.visible;
}
const Asset = React.memo(AssetBase, areEqual);

interface AssetsProps {
    assetObjects: IAssetObject[]
    assetsOpacity: number;
    highlightAllAssets: boolean;
    hideAllAssets: boolean;
    assetsState: Record<string, AssetState>;
    assetsVisibilityState: Record<string, ObjectVisibilityState>;
}


const Assets: FC<AssetsProps> = ({
    assetObjects,
    assetsOpacity,
    highlightAllAssets,
    hideAllAssets,
    assetsState,
    assetsVisibilityState
}) => {
    const assetsStateString = Object.values(assetsState).map(state => state.stateString === "alerting" ? "1" : "0").join("");

    return (
        <>
            {
                assetObjects.map((obj, index) => {
                    return <Asset
                        key={obj.node.uuid}
                        obj={obj.node}
                        opacity={assetsOpacity*assetsVisibilityState[obj.collectionName].opacity}
                        blinking={
                            highlightAllAssets ||
                            assetsState[obj.node.name].stateString === "alerting" ||
                            assetsVisibilityState[obj.collectionName].highlight
                        }
                        assetState={assetsState[obj.node.name]}
                        visible={!(assetsVisibilityState[obj.collectionName].hide || hideAllAssets)}
                        assetsStateString={assetsStateString}
                    />
                })
            }
        </>
    )
}

export default Assets;
