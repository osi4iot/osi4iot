import * as THREE from 'three'
import React, { FC, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber';
import { defaultOpacity, defaultVisibility, FemSimObjectVisibilityState, FemSimulationObjectState, IDigitalTwinGltfData } from './ViewerUtils';
import { IResultRenderInfo, IFemSimulationObject } from './Model';

interface FemSimulationObjectProps {
    femSimulationGeneralInfo: Record<string, IResultRenderInfo>;
    digitalTwinGltfData: IDigitalTwinGltfData;
    meshIndex: number;
    femSimulationObject: IFemSimulationObject;
    femSimulationObjectState: FemSimulationObjectState;
    femSimulationStateString: string;
    blinking: boolean;
    opacity: number;
    hideObject: boolean;
    showFemMesh: boolean;
    femSimulationResult: string;
    showFemSimulationDeformation: boolean;
    femSimulationDefScale: number;
    setFemMinValues: React.Dispatch<React.SetStateAction<number[]>>;
    setFemMaxValues: React.Dispatch<React.SetStateAction<number[]>>;
}

const highlightColor = new THREE.Color(0x00ff00);
const noEmitColor = new THREE.Color(0, 0, 0);

const FemSimulationObjectBase: FC<FemSimulationObjectProps> = ({
    femSimulationGeneralInfo,
    digitalTwinGltfData,
    meshIndex,
    femSimulationObject,
    femSimulationObjectState,
    femSimulationStateString,
    blinking,
    opacity,
    hideObject,
    showFemMesh,
    femSimulationResult,
    showFemSimulationDeformation,
    femSimulationDefScale,
    setFemMinValues,
    setFemMaxValues
}) => {
    const objectRef = useRef<THREE.Group>();
    const meshRef = useRef<THREE.LineSegments>();
    const geometryRef = useRef<THREE.Mesh>();
    const defOpacity = defaultOpacity(femSimulationObject.node);
    const material = femSimulationResult === "None result" ?
        Object.assign(femSimulationObject.node.material) :
        Object.assign(femSimulationObject.femResultMaterial);

    material.transparent = (defOpacity * opacity) === 1 ? false : true;
    let lastIntervalTime = 0;
    let meshResult: any = null;
    const isThereFemResData = Object.keys(digitalTwinGltfData.femResData).length !== 0;
    if (isThereFemResData) {
        meshResult = digitalTwinGltfData.femResData.meshResults[meshIndex];
    }
    let deformationFields: string[] = [];
    if (isThereFemResData && digitalTwinGltfData.femResData.metadata.deformationFields) {
        deformationFields = digitalTwinGltfData.femResData.metadata.deformationFields;
    }
    const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);
    const [clipsDuration, setClipsDuration] = useState(0);

    useEffect(() => {
        if (femSimulationObject.node.animations.length !== 0 && !(femSimulationObject.node.animations as any).includes(undefined) && objectRef.current) {
            if (femSimulationObject.node.userData.clipNames) {
                const mixer = new THREE.AnimationMixer(objectRef.current as any);
                femSimulationObject.node.animations.forEach(clip => {
                    const action = mixer.clipAction(clip);
                    action.play();
                });
                const clipsDuration = femSimulationObject.node.animations[0].duration - 0.00001; //All clips must have the same duration
                setClipsDuration(clipsDuration);
                setMixer(mixer);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [femSimulationObject.node.animations, objectRef]);

    useEffect(() => {
        if (mixer &&
            clipsDuration &&
            femSimulationObjectState !== undefined &&
            femSimulationObjectState.clipValues &&
            femSimulationObjectState.clipValues.length !== 0
        ) {
            femSimulationObjectState.clipValues.forEach((clipValue, index) => {
                if (clipValue !== null) {
                    const maxValue = femSimulationObject.node.userData.clipMaxValues[index];
                    const minValue = femSimulationObject.node.userData.clipMinValues[index];
                    let weigth = (clipValue - minValue) / (maxValue - minValue) / femSimulationObjectState.clipValues.length;
                    const action = mixer.existingAction(femSimulationObject.node.animations[index]);
                    if (action) {
                        action.setEffectiveWeight(weigth);
                        action.setEffectiveTimeScale(1.0);
                    }
                }
            })
            mixer.setTime(clipsDuration);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mixer, femSimulationObjectState]);


    useFrame(({ clock }) => {
        if (hideObject) {
            if (objectRef.current) objectRef.current.visible = false;
        } else {
            material.opacity = 1.0;
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
                if (femSimulationObjectState !== undefined && femSimulationObjectState.highlight) {
                    if (objectRef.current) objectRef.current.visible = true;
                    material.opacity = 1;
                    material.emissive = highlightColor;
                } else {
                    if (objectRef.current) objectRef.current.visible = defaultVisibility(femSimulationObject.node);
                    material.emissive = noEmitColor;
                    material.opacity = defOpacity * opacity;
                }
            }
        }
    })

    useLayoutEffect(() => {
        let color: THREE.Color;
        let resultColors: Float32Array;
        let currentPositions: Float32Array;
        if (femSimulationResult === "None result" || meshResult === null) {
            currentPositions = femSimulationObject.originalGeometry;
        } else {
            const numberOfModes = meshResult.resultFields[femSimulationResult].numberOfModes;
            let lutColors = [];
            let femMinValue: any;
            let femMaxValue: any;
            for (let i = 0; i < femSimulationObject.node.geometry.attributes.position.count; i++) {
                let totalcolorValue = 0;
                for (let imode = 1; imode <= numberOfModes; imode++) {
                    let resultpath = `${femSimulationResult}__${imode}`
                    const modalValue = femSimulationObjectState.resultFieldModalValues[femSimulationResult][imode - 1];
                    if (meshResult.resultFields[femSimulationResult].resultLocation === "OnNodes") {
                        const resultValues = meshResult.resultFields[femSimulationResult].modalValues[resultpath];
                        const inode = meshResult.elemConnectivities.array[i] - 1;
                        totalcolorValue += resultValues.array[inode] * modalValue;
                    } else if (meshResult.resultFields[femSimulationResult].resultLocation === "OnGaussPoints") {
                        const resultValues = meshResult.resultFields[femSimulationResult].modalValues[resultpath];
                        totalcolorValue += resultValues.array[i] * modalValue;
                    }
                }

                if (femMinValue === undefined) femMinValue = totalcolorValue;
                if (totalcolorValue < femMinValue) femMinValue = totalcolorValue;
                if (femMaxValue === undefined) femMaxValue = totalcolorValue;
                if (totalcolorValue > femMaxValue) femMaxValue = totalcolorValue;

                color = femSimulationGeneralInfo[femSimulationResult].resultLut.getColor(totalcolorValue);
                if (color === undefined) {
                    console.log("ERROR: " + totalcolorValue);
                } else {
                    lutColors[3 * i] = color.r;
                    lutColors[3 * i + 1] = color.g;
                    lutColors[3 * i + 2] = color.b;
                }
            }

            setFemMinValues((prevFemMinValues: number[]) => {
                const newFemMinValues = [...prevFemMinValues];
                newFemMinValues[meshIndex] = femMinValue;
                return newFemMinValues;
            });

            setFemMaxValues((prevFemMaxValues: number[]) => {
                const newFemMaxValues = [...prevFemMaxValues];
                newFemMaxValues[meshIndex] = femMaxValue;
                return newFemMaxValues;
            });

            resultColors = new Float32Array(lutColors);
            femSimulationObject.node.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(resultColors), 3));
        }

        if (showFemSimulationDeformation && deformationFields.length === 3) {
            const currentPositionArray = [];
            const deformationScale = Math.pow(10.0, femSimulationDefScale);
            for (let i = 0; i < femSimulationObject.node.geometry.attributes.position.count; i++) {
                let currentCoordX = femSimulationObject.originalGeometry[i * 3];
                let currentCoordY = femSimulationObject.originalGeometry[i * 3 + 1];
                let currentCoordZ = femSimulationObject.originalGeometry[i * 3 + 2];
                const inode = meshResult.elemConnectivities.array[i] - 1;

                const numberOfModesDispX = meshResult.resultFields[deformationFields[0]].numberOfModes;
                for (let imode = 1; imode <= numberOfModesDispX; imode++) {
                    let dispXPath = `${deformationFields[0]}__${imode}`;
                    const modalDispX = meshResult.resultFields[deformationFields[0]].modalValues[dispXPath];
                    const modalValueX = femSimulationObjectState.resultFieldModalValues[deformationFields[0]][imode - 1];
                    currentCoordX += modalDispX.array[inode] * modalValueX * deformationScale;
                }

                const numberOfModesDispY = meshResult.resultFields[deformationFields[1]].numberOfModes;
                for (let imode = 1; imode <= numberOfModesDispY; imode++) {
                    let dispYPath = `${deformationFields[1]}__${imode}`;
                    const modalDispY = meshResult.resultFields[deformationFields[1]].modalValues[dispYPath];
                    const modalValueY = femSimulationObjectState.resultFieldModalValues[deformationFields[1]][imode - 1];
                    currentCoordZ += modalDispY.array[inode] * modalValueY * deformationScale;
                }

                const numberOfModesDispZ = meshResult.resultFields[deformationFields[2]].numberOfModes;
                for (let imode = 1; imode <= numberOfModesDispZ; imode++) {
                    let dispZPath = `${deformationFields[2]}__${imode}`;
                    const modalDispZ = meshResult.resultFields[deformationFields[2]].modalValues[dispZPath];
                    const modalValueZ = femSimulationObjectState.resultFieldModalValues[deformationFields[2]][imode - 1];
                    currentCoordY += modalDispZ.array[inode] * modalValueZ * deformationScale;
                }

                currentPositionArray.push(currentCoordX, currentCoordY, currentCoordZ);
            }
            currentPositions = new Float32Array(currentPositionArray);
        } else {
            currentPositions = femSimulationObject.originalGeometry;
        }

        femSimulationObject.node.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(currentPositions), 3));

        if (meshRef.current) {
            if (showFemMesh) {
                const wireframeGeometry = new THREE.WireframeGeometry(femSimulationObject.node.geometry);
                meshRef.current.geometry = wireframeGeometry;
                meshRef.current.visible = true;
            } else meshRef.current.visible = false;
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [femSimulationResult, femSimulationStateString, showFemSimulationDeformation, femSimulationDefScale, showFemMesh]);

    return (
        <group ref={objectRef} >
            <mesh
                ref={geometryRef}
                castShadow
                receiveShadow
                geometry={femSimulationObject.node.geometry}
                material={material}
                position={[
                    femSimulationObject.node.position.x,
                    femSimulationObject.node.position.y,
                    femSimulationObject.node.position.z
                ]}
                rotation={[
                    femSimulationObject.node.rotation.x,
                    femSimulationObject.node.rotation.y,
                    femSimulationObject.node.rotation.z]}
                scale={[
                    femSimulationObject.node.scale.x,
                    femSimulationObject.node.scale.y,
                    femSimulationObject.node.scale.z
                ]}
            />
            {/* <primitive ref={meshRef} object={femSimulationObject.wireFrameMesh} /> */}
            <lineSegments
                ref={meshRef}
                castShadow
                receiveShadow
                geometry={femSimulationObject.wireFrameMesh.geometry}
                material={femSimulationObject.wireFrameMesh.material}
                position={[
                    femSimulationObject.wireFrameMesh.position.x,
                    femSimulationObject.wireFrameMesh.position.y,
                    femSimulationObject.wireFrameMesh.position.z
                ]}
                rotation={[
                    femSimulationObject.wireFrameMesh.rotation.x,
                    femSimulationObject.wireFrameMesh.rotation.y,
                    femSimulationObject.wireFrameMesh.rotation.z
                ]}
                scale={[
                    femSimulationObject.wireFrameMesh.scale.x,
                    femSimulationObject.wireFrameMesh.scale.y,
                    femSimulationObject.wireFrameMesh.scale.z
                ]}
            />
        </group>
    )
}

const areEqual = (prevProps: FemSimulationObjectProps, nextProps: FemSimulationObjectProps) => {
    return (prevProps.femSimulationObjectState !== undefined &&
        (prevProps.femSimulationObjectState.highlight === nextProps.femSimulationObjectState.highlight || nextProps.blinking)) &&
        prevProps.blinking === nextProps.blinking &&
        prevProps.opacity === nextProps.opacity &&
        prevProps.hideObject === nextProps.hideObject &&
        prevProps.showFemMesh === nextProps.showFemMesh &&
        prevProps.femSimulationResult === nextProps.femSimulationResult &&
        prevProps.femSimulationStateString === nextProps.femSimulationStateString &&
        prevProps.showFemSimulationDeformation === nextProps.showFemSimulationDeformation &&
        prevProps.femSimulationDefScale === nextProps.femSimulationDefScale;
}

const FemSimulationObject = React.memo(FemSimulationObjectBase, areEqual);



interface FemSimulationObjectsProps {
    digitalTwinGltfData: IDigitalTwinGltfData;
    femSimulationGeneralInfo: Record<string, IResultRenderInfo>;
    femSimulationObjects: IFemSimulationObject[];
    femSimulationObjectsOpacity: number;
    highlightAllFemSimulationObjects: boolean;
    hideAllFemSimulationObjects: boolean;
    femSimulationObjectsState: FemSimulationObjectState[];
    femSimulationResult: string;
    showFemAllMeshes: boolean;
    showFemSimulationDeformation: boolean;
    femSimulationDefScale: number;
    femSimulationObjectsVisibilityState: Record<string, FemSimObjectVisibilityState>;
    setFemMinValues: React.Dispatch<React.SetStateAction<number[]>>;
    setFemMaxValues: React.Dispatch<React.SetStateAction<number[]>>;
}


const FemSimulationObjects: FC<FemSimulationObjectsProps> = ({
    digitalTwinGltfData,
    femSimulationGeneralInfo,
    femSimulationObjects,
    femSimulationObjectsOpacity,
    highlightAllFemSimulationObjects,
    hideAllFemSimulationObjects,
    femSimulationObjectsState,
    femSimulationResult,
    showFemAllMeshes,
    showFemSimulationDeformation,
    femSimulationDefScale,
    femSimulationObjectsVisibilityState,
    setFemMinValues,
    setFemMaxValues
}) => {

    return (
        <>
            {
                femSimulationObjects.map((obj, index) => {
                    return <FemSimulationObject
                        key={obj.node.uuid}
                        femSimulationGeneralInfo={femSimulationGeneralInfo}
                        digitalTwinGltfData={digitalTwinGltfData}
                        meshIndex={index}
                        femSimulationObject={obj}
                        femSimulationObjectState={femSimulationObjectsState[index]}
                        femSimulationStateString={JSON.stringify(femSimulationObjectsState[index])}
                        blinking={highlightAllFemSimulationObjects || femSimulationObjectsVisibilityState[obj.collectionName].highlight}
                        opacity={femSimulationObjectsOpacity * femSimulationObjectsVisibilityState[obj.collectionName].opacity}
                        hideObject={hideAllFemSimulationObjects || femSimulationObjectsVisibilityState[obj.collectionName].hide}
                        showFemMesh={showFemAllMeshes || femSimulationObjectsVisibilityState[obj.collectionName].showMesh}
                        femSimulationResult={
                            femSimulationResult === "None result" ?
                                femSimulationObjectsVisibilityState[obj.collectionName].femSimulationResult :
                                femSimulationResult
                        }
                        showFemSimulationDeformation={
                            showFemSimulationDeformation ||
                            femSimulationObjectsVisibilityState[obj.collectionName].showDeformation
                        }
                        femSimulationDefScale={femSimulationDefScale}
                        setFemMinValues={setFemMinValues}
                        setFemMaxValues={setFemMaxValues}
                    />
                })
            }
        </>
    )
}


export default FemSimulationObjects;