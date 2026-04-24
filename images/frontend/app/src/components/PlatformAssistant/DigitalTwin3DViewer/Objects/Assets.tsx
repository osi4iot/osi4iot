import * as THREE from "three";
import React, { FC, useRef, useLayoutEffect, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { IAssetObject } from "../Main/Model";
import { AssetState, defaultOpacity, defaultVisibility, ObjectVisibilityState } from "../ViewerTools/ViewerUtils";
import { changeMaterialPropRecursively } from "../../../../tools/tools";
import { IThreeMesh } from "../Types/threeInterfaces";

const MeshComponent = "mesh" as any;
const PrimitivesComponent = "primitive" as any;

const assetOkColor = new THREE.Color(0x00ff00);
const assetAlertingColor = new THREE.Color(0xff0000);
const noEmitColor = new THREE.Color(0, 0, 0);

interface AssetProps {
    obj: IThreeMesh;
    blinking: boolean;
    opacity: number;
    assetState: AssetState;
    visible: boolean;
    assetsStateString: string;
}

const AssetBase: FC<AssetProps> = ({ obj, blinking, opacity = 1, assetState, visible = true, assetsStateString }) => {
    const camera = useThree((state) => state.camera);
    const meshRef = useRef<
        THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.MeshLambertMaterial | THREE.Material[]> | undefined
    >(undefined);

    const material = obj.material;
    const defOpacity = defaultOpacity(obj);
    const recursiveTransparency = obj.userData.recursiveTransparency;
    const hasEndlessAnimations = obj.blenderAnimationTypes?.includes("blenderEndless");
    if (recursiveTransparency === undefined || recursiveTransparency === "true") {
        const isTransparent = hasEndlessAnimations ? true : defOpacity * opacity < 1;
        changeMaterialPropRecursively(obj, "transparent", isTransparent);
    }

    let lastIntervalTime = 0;
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);

    useEffect(() => {
        if (obj.animations.length !== 0 && !(obj.animations as any).includes(undefined)) {
            if (obj.userData.clipName) {
                const mixer = new THREE.AnimationMixer(obj as any);
                obj.animations.forEach((clip) => {
                    const action = mixer.clipAction(clip);
                    action.play();
                });
                mixerRef.current = mixer;
            }
        }
        return () => {
            mixerRef.current?.stopAllAction();
            mixerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [obj.animations]);

    useEffect(() => {
        if (
            mixerRef.current &&
            assetState.clipValue !== null &&
            obj.userData.animationType &&
            obj.userData.animationType === "blenderTemporary"
        ) {
            const maxValue = obj.userData.clipMaxValue;
            const minValue = obj.userData.clipMinValue;
            const weight = (assetState.clipValue - minValue) / (maxValue - minValue);
            const clipsDuration = obj.animations[0].duration - 0.00001;
            mixerRef.current.setTime(weight * clipsDuration);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assetState.clipValue]);

    useFrame(({ clock }, delta) => {
        if (obj.userData.animationType && obj.userData.animationType === "blenderEndless") {
            let newDelta = delta;
            if (assetState.clipValue !== null) {
                newDelta = delta * assetState.clipValue;
            }
            mixerRef.current?.update(newDelta);
        }
        if (visible) {
            if (blinking) {
                if (lastIntervalTime === 0) {
                    lastIntervalTime = clock.elapsedTime;
                }
                const deltaInterval = clock.elapsedTime - lastIntervalTime;
                if (deltaInterval <= 0.3) {
                    if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                    changeMaterialPropRecursively(obj, "emissive", noEmitColor);
                    changeMaterialPropRecursively(obj, "opacity", defOpacity * opacity);
                } else if (deltaInterval > 0.3 && deltaInterval <= 0.6) {
                    changeMaterialPropRecursively(obj, "opacity", defOpacity * opacity);
                    if (meshRef.current) meshRef.current.visible = true;
                    if (assetState?.stateString === "ok") {
                        changeMaterialPropRecursively(obj, "emissive", assetOkColor);
                    } else if (assetState?.stateString === "alerting") {
                        changeMaterialPropRecursively(obj, "emissive", assetAlertingColor);
                    }
                } else if (deltaInterval > 0.6) {
                    lastIntervalTime = clock.elapsedTime;
                }
            } else {
                if (assetState.highlight) {
                    if (meshRef.current) meshRef.current.visible = true;
                    changeMaterialPropRecursively(obj, "opacity", 1.0);
                    if (assetState.stateString === "ok") {
                        changeMaterialPropRecursively(obj, "emissive", assetOkColor);
                    } else if (assetState?.stateString === "alerting") {
                        changeMaterialPropRecursively(obj, "emissive", assetAlertingColor);
                    }
                } else {
                    if (meshRef.current) meshRef.current.visible = defaultVisibility(obj);
                    changeMaterialPropRecursively(obj, "opacity", defOpacity * opacity);
                    if (assetState.stateString === "ok") {
                        changeMaterialPropRecursively(obj, "emissive", noEmitColor);
                    } else if (assetState.stateString === "alerting") {
                        changeMaterialPropRecursively(obj, "emissive", assetAlertingColor);
                    }
                }
            }
        } else {
            if (meshRef.current) meshRef.current.visible = visible;
        }
    });

    useLayoutEffect(() => {
        camera.updateProjectionMatrix();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opacity]);

    return obj.type === "Group" ||
        obj.animations.length !== 0 ||
        obj.customAnimationObjectNames.length !== 0 ||
        obj.children.length !== 0 ? (
        obj.userData.animationType === "blenderEndless" ? (
            <PrimitivesComponent ref={meshRef as React.MutableRefObject<IThreeMesh>} object={obj} />
        ) : (
            <MeshComponent
                ref={meshRef as React.MutableRefObject<IThreeMesh>}
                castShadow
                receiveShadow
                material={material}
            >
                <PrimitivesComponent object={obj} />
            </MeshComponent>
        )
    ) : (
        <MeshComponent
            ref={meshRef as React.MutableRefObject<IThreeMesh>}
            castShadow
            receiveShadow
            geometry={obj.geometry}
            material={material}
            position={obj.position}
            scale={obj.scale}
            quaternion={obj.quaternion}
        />
    );
};

const areEqual = (prevProps: AssetProps, nextProps: AssetProps) => {
    return (
        prevProps.assetState.highlight === nextProps.assetState.highlight &&
        prevProps.assetState.stateString === nextProps.assetState.stateString &&
        prevProps.assetsStateString === nextProps.assetsStateString &&
        prevProps.assetState.clipValue === nextProps.assetState.clipValue &&
        prevProps.blinking === nextProps.blinking &&
        prevProps.opacity === nextProps.opacity &&
        prevProps.visible === nextProps.visible
    );
};

const Asset = React.memo(AssetBase, areEqual);

interface AssetsProps {
    assetObjects: IAssetObject[];
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
    assetsVisibilityState,
}) => {
    const assetsStateString = Object.values(assetsState)
        .map((state) => (state.stateString === "alerting" ? "1" : "0"))
        .join("");

    return (
        <>
            {assetObjects.map((obj, index) => {
                return (
                    <Asset
                        key={obj.node.uuid}
                        obj={obj.node}
                        opacity={assetsOpacity * assetsVisibilityState[obj.collectionName].opacity}
                        blinking={
                            highlightAllAssets ||
                            assetsState[obj.node.name].stateString === "alerting" ||
                            assetsVisibilityState[obj.collectionName].highlight
                        }
                        assetState={assetsState[obj.node.name]}
                        visible={!(assetsVisibilityState[obj.collectionName].hide || hideAllAssets)}
                        assetsStateString={assetsStateString}
                    />
                );
            })}
        </>
    );
};

export default Assets;
