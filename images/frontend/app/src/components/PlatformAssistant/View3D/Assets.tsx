import * as THREE from 'three'
import React, { FC, useRef, useLayoutEffect, useEffect, useCallback, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { AssetObject } from './Model';
import { AssetState } from './ViewerUtils';
import useInterval from '../../../tools/useInterval';

const assetOkColor = new THREE.Color(0x00ff00);
const assetAlertingColor = new THREE.Color(0xff0000);
const noEmitColor = new THREE.Color(0, 0, 0);

interface AssetProps {
    obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>;
    blinking: boolean;
    color?: string;
    assetState: AssetState;
    emitAssets: boolean;
}


const Asset: FC<AssetProps> = ({
    obj,
    blinking,
    color = "#828282",
    assetState,
    emitAssets,
}) => {
    const camera = useThree((state) => state.camera);
    const meshRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]>>()
    const mColor = (obj.material as THREE.MeshLambertMaterial).color;
    const materialColor = (mColor.r === 1 && mColor.g === 1 && mColor.b === 1) ? new THREE.Color(color) : new THREE.Color(mColor);
    var newMaterial = new THREE.MeshLambertMaterial({ color: materialColor, emissive: noEmitColor });
    obj.material = newMaterial;

    useLayoutEffect(() => {
        camera.updateProjectionMatrix();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [color]);

    useLayoutEffect(() => {
        if (assetState?.highlight && !blinking) {
            if (assetState?.stateString === "ok") {
                (meshRef.current?.material as THREE.MeshPhongMaterial).emissive = assetOkColor;
            } else if (assetState.stateString === "alerting") {
                (meshRef.current?.material as THREE.MeshPhongMaterial).emissive = assetAlertingColor;
            }
        }
    }, [assetState, blinking])

    useEffect(() => {
        if (blinking) {
            if (assetState?.stateString === "ok") {
                if (emitAssets) (meshRef.current?.material as THREE.MeshPhongMaterial).emissive = assetOkColor;
                else (meshRef.current?.material as THREE.MeshPhongMaterial).emissive = noEmitColor;
            }
        }
        if (assetState?.stateString === "alerting") {
            if (emitAssets) (meshRef.current?.material as THREE.MeshPhongMaterial).emissive = assetAlertingColor;
            else (meshRef.current?.material as THREE.MeshPhongMaterial).emissive = noEmitColor;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [emitAssets])

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

interface AssetsProps {
    assetObjects: AssetObject[]
    assetsColor: string;
    highlightAllAssets: boolean;
    assetsState: Record<string, AssetState>;
}


const Assets: FC<AssetsProps> = ({
    assetObjects,
    assetsColor,
    highlightAllAssets,
    assetsState
}) => {
    const [emitAssets, setEmitAssets] = useState(false);
    const isBlinkingNecesary = Object.values(assetsState).findIndex(state => state.stateString === "alerting") !== -1;

    const updateEmit = useCallback(() => {
        if (highlightAllAssets || isBlinkingNecesary) {
            setEmitAssets(emitAssets => !emitAssets);
        }
    }, [highlightAllAssets, isBlinkingNecesary]);

    useInterval(updateEmit, 250);

    return (
        <>
            {
                assetObjects.map((obj, index) => {
                    return <Asset
                        key={obj.node.uuid}
                        obj={obj.node}
                        color={assetsColor}
                        blinking={highlightAllAssets}
                        assetState={assetsState[obj.node.name]}
                        emitAssets={emitAssets}
                    />
                })
            }
        </>
    )
}


export default Assets;
