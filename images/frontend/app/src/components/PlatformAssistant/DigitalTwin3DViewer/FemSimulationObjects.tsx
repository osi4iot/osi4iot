import * as THREE from 'three'
import React, { FC, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber';
import {
    defaultOpacity,
    defaultVisibility,
    FemSimObjectVisibilityState,
    FemSimulationObjectState,
    IDigitalTwinGltfData
} from './ViewerUtils';
import { IResultRenderInfo, IFemSimulationObject } from './Model';
import createSharedArrayBuffersForFemResults from '../../../webWorkers/createSharedArrayBuffersForFemResults';
import calFemResultwithSABCode from '../../../webWorkers/calFemResultwithSABCode';
import femResultCalcWorkersManager from '../../../webWorkers/femResultCalcWorkersManager';
import { toast } from 'react-toastify';

interface FemSimulationObjectProps {
    femSimulationGeneralInfo: Record<string, IResultRenderInfo>;
    femResultData: any;
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
    setFemResultLoaded: (femResultLoaded: boolean) => void;
    femResultNames: string[];
    enableWebWorkes: boolean;
    numWebWorkers: number;
	logElapsedTime: boolean;
    onlyFemObjects: boolean;
}

const highlightColor = new THREE.Color(0x00ff00);
const noEmitColor = new THREE.Color(0, 0, 0);

const FemSimulationObjectBase: FC<FemSimulationObjectProps> = ({
    femSimulationGeneralInfo,
    femResultData,
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
    setFemMaxValues,
    setFemResultLoaded,
    femResultNames,
    enableWebWorkes,
    numWebWorkers,
	logElapsedTime,
    onlyFemObjects
}) => {
    const [paramsSABMap, setParamsSABMap] = useState<Map<string, SharedArrayBuffer> | null>(null);
    const [originaGeometrySAB, setOriginaGeometrySAB] = useState<SharedArrayBuffer | null>(null);
    const [elemConnectivitiesSAB, setElemConnectivitiesSAB] = useState<SharedArrayBuffer | null>(null);
    const [lutRgbArraySABMap, setLutRgbArraySABMap] = useState<Map<string, SharedArrayBuffer> | null>(null);
    const [femResultModalValueSABMap, setFemResultModalValueSABMap] = useState<Map<string, SharedArrayBuffer> | null>(null);
    const [femResultNodalValueSABMap, setFemResultNodalValueSABMap] = useState<Map<string, SharedArrayBuffer> | null>(null);
    const [workers, setWorkers] = useState<Worker[]>([]);

    const objectRef = useRef<THREE.Group>();
    const meshRef = useRef<THREE.LineSegments>();
    const geometryRef = useRef<THREE.Mesh>();
    const defOpacity = defaultOpacity(femSimulationObject.node);
    const material = femSimulationResult === "None result" ?
        Object.assign(femSimulationObject.originalMaterial) :
        Object.assign(femSimulationObject.femResultMaterial);

    material.transparent = (defOpacity * opacity) === 1 ? false : true;
    let lastIntervalTime = 0;
    let meshResult: any = null;
    const isThereFemResData = femResultData && Object.keys(femResultData).length !== 0;
    if (isThereFemResData) {
        meshResult = femResultData.meshResults[meshIndex];
    }
    let deformationFields: string[] = [];
    if (isThereFemResData && femResultData.metadata.deformationFields) {
        deformationFields = femResultData.metadata.deformationFields;
    }
    const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);
    const [clipsDuration, setClipsDuration] = useState(0);
    const currentJobIdRef = useRef(0);

    useEffect(() => {
        if (meshResult && femResultNames.length !== 0) {
            try {
                createSharedArrayBuffersForFemResults(
                    femResultNames,
                    meshResult,
                    femSimulationObject,
                    femSimulationGeneralInfo,
                    femSimulationObjectState,
                    setParamsSABMap,
                    setOriginaGeometrySAB,
                    setElemConnectivitiesSAB,
                    setLutRgbArraySABMap,
                    setFemResultModalValueSABMap,
                    setFemResultNodalValueSABMap,
                );
            } catch (e: any) {
                toast.error("Error setting SharedArrayBuffer for FEM results. Check results bounds.");
            }
        }
    }, [
        femResultNames,
        femSimulationGeneralInfo,
        femSimulationObject,
        femSimulationObjectState,
        meshResult
    ]);

    useEffect(() => {
        const workers: Worker[] = [];
        const maxNumWebWorkers = window.navigator.hardwareConcurrency || 1;
        for (let iworker = 0; iworker < maxNumWebWorkers; ++iworker) {
            workers[iworker] = new Worker(calFemResultwithSABCode);
        }
        setWorkers(workers)

        return () => {
            for (let iworker = 0; iworker < maxNumWebWorkers; ++iworker) {
                workers[iworker].terminate();
            }
        }
    }, [])


    useEffect(() => {
        if (femSimulationObject.node.animations.length !== 0 &&
            !(femSimulationObject.node.animations as any).includes(undefined) && objectRef.current
        ) {
            if (femSimulationObject.node.userData.clipName) {
                const mixer = new THREE.AnimationMixer(meshRef.current as any);
                const clip = femSimulationObject.node.animations[0];
                const action = mixer.clipAction(clip);
                action.play();
                const clipsDuration = femSimulationObject.node.animations[0].duration - 0.00001;
                setClipsDuration(clipsDuration);
                setMixer(mixer);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [femSimulationObject.node.animations, objectRef]);

    useEffect(() => {
        if (meshRef.current) {
            meshRef.current.visible = false;
        };
        const size = femSimulationObject.node.geometry.attributes.position.count * 3;
        const resultColors = new Float32Array(size).fill(255);
        femSimulationObject.node.geometry.setAttribute('color', new THREE.BufferAttribute(resultColors, 3));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (mixer &&
            clipsDuration &&
            femSimulationObjectState !== undefined &&
            femSimulationObjectState.clipValue !== null
        ) {
            const maxValue = femSimulationObject.node.userData.clipMaxValue;
            const minValue = femSimulationObject.node.userData.clipMinValue;
            const weigth = (femSimulationObjectState.clipValue - minValue) / (maxValue - minValue);
            const clipsDuration = femSimulationObject.node.animations[0].duration - 0.00001;
            mixer.setTime(weigth * clipsDuration);
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

    // useLayoutEffect(() => {
    useEffect(() => {
        if (window.Worker && enableWebWorkes) {
            const times: number[] = [];
            times[0] = performance.now();
            if (onlyFemObjects && meshResult) {
                setFemResultLoaded(true);
            }
            if ((femSimulationResult === "None result" || meshResult === null) && !showFemSimulationDeformation) {
                const currentPositions = new Float32Array(femSimulationObject.originalGeometry);
                femSimulationObject.node.geometry.setAttribute('position', new THREE.BufferAttribute(currentPositions, 3));

                if (meshRef.current) {
                    if (showFemMesh) {
                        const wireframeGeometry = new THREE.WireframeGeometry(femSimulationObject.node.geometry);
                        meshRef.current.geometry = wireframeGeometry;
                        meshRef.current.visible = true;
                    } else meshRef.current.visible = false;
                }
            } else {
                if (
                    workers.length !== 0 &&
                    paramsSABMap &&
                    originaGeometrySAB &&
                    elemConnectivitiesSAB &&
                    lutRgbArraySABMap &&
                    femResultModalValueSABMap &&
                    femResultNodalValueSABMap
                ) {
                    try {                   
                        femResultCalcWorkersManager(
                            numWebWorkers,
                            logElapsedTime,
                            workers,
                            femSimulationResult,
                            deformationFields,
                            showFemSimulationDeformation,
                            femSimulationDefScale,
                            showFemMesh,
                            paramsSABMap as Map<string, SharedArrayBuffer>,
                            originaGeometrySAB as SharedArrayBuffer,
                            elemConnectivitiesSAB as SharedArrayBuffer,
                            lutRgbArraySABMap as Map<string, SharedArrayBuffer>,
                            femResultModalValueSABMap as Map<string, SharedArrayBuffer>,
                            femResultNodalValueSABMap as Map<string, SharedArrayBuffer>,
                            setFemMinValues,
                            setFemMaxValues,
                            femSimulationObject,
                            femSimulationObjectState,
                            meshIndex,
                            meshRef.current,
                            meshResult,
                            currentJobIdRef
                        )
                        currentJobIdRef.current++;
                    } catch (e: any) {
                        toast.error("Error calculating FEM results in web workers")
                    }
                }
            }
        } else {
            let startTime = 0;
            if (logElapsedTime) {
                startTime = Date.now();
            }
            let color: THREE.Color;
            let resultColors: Float32Array;
            let currentPositions: Float32Array;
            if (onlyFemObjects && meshResult) {
                setFemResultLoaded(true);
            }
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
                        let resultpath = `${femSimulationResult}__${imode}`;
                        let modalValue = 0.0;
                        if (
                            femSimulationObjectState.resultFieldModalValues[femSimulationResult] !== undefined &&
                            femSimulationObjectState.resultFieldModalValues[femSimulationResult][imode - 1] !== undefined
                        ) {
                            modalValue = femSimulationObjectState.resultFieldModalValues[femSimulationResult][imode - 1];
                        }
                        if (modalValue === 0.0) continue;
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

            if (logElapsedTime) {
                const endTime = Date.now();
                console.log(`Elapsed time using main thread: ${(endTime - startTime)}ms`);
            }
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        meshResult,
        femSimulationResult,
        femSimulationStateString,
        femSimulationObjectState,
        showFemSimulationDeformation,
        femSimulationDefScale,
        showFemMesh,
        workers,
        paramsSABMap,
        originaGeometrySAB,
        elemConnectivitiesSAB,
        lutRgbArraySABMap,
        femResultModalValueSABMap,
        femResultNodalValueSABMap,
        enableWebWorkes,
        numWebWorkers,
        logElapsedTime,
    ]);

    return (
        <group ref={objectRef as React.MutableRefObject<THREE.Group>} >
            <mesh
                ref={geometryRef as React.MutableRefObject<THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>>}
                castShadow
                receiveShadow
                material={material}
            >
                <primitive
                    material={material}
                    object={femSimulationObject.node}
                />
            </mesh>
            <primitive ref={meshRef} object={femSimulationObject.wireFrameMesh} />
        </group>
    )
}

const areEqual = (prevProps: FemSimulationObjectProps, nextProps: FemSimulationObjectProps) => {
    return (prevProps.femSimulationObjectState !== undefined &&
        (prevProps.femSimulationObjectState.highlight === nextProps.femSimulationObjectState.highlight || nextProps.blinking)) &&
        prevProps.femSimulationObjectState.clipValue === nextProps.femSimulationObjectState.clipValue &&
        prevProps.femSimulationObjectState.resultFieldModalValues === nextProps.femSimulationObjectState.resultFieldModalValues &&
        prevProps.blinking === nextProps.blinking &&
        prevProps.opacity === nextProps.opacity &&
        prevProps.hideObject === nextProps.hideObject &&
        prevProps.showFemMesh === nextProps.showFemMesh &&
        prevProps.femSimulationResult === nextProps.femSimulationResult &&
        prevProps.femSimulationStateString === nextProps.femSimulationStateString &&
        prevProps.showFemSimulationDeformation === nextProps.showFemSimulationDeformation &&
        prevProps.femSimulationDefScale === nextProps.femSimulationDefScale &&
        prevProps.femResultData === nextProps.femResultData;
}

const FemSimulationObject = React.memo(FemSimulationObjectBase, areEqual);

interface FemSimulationObjectsProps {
    digitalTwinGltfData: IDigitalTwinGltfData;
    femResultData: any;
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
    setFemResultLoaded: (femResultLoaded: boolean) => void;
    femResultNames: string[];
    enableWebWorkes: boolean;
    numWebWorkers: number;
	logElapsedTime: boolean;
    onlyFemObjects: boolean;
}


const FemSimulationObjects: FC<FemSimulationObjectsProps> = ({
    digitalTwinGltfData,
    femResultData,
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
    setFemMaxValues,
    setFemResultLoaded,
    femResultNames,
    enableWebWorkes,
    numWebWorkers,
	logElapsedTime,
    onlyFemObjects = false,
}) => {

    return (
        <>
            {
                femSimulationObjects.map((obj, index) => {
                    return <FemSimulationObject
                        key={obj.node.uuid}
                        femSimulationGeneralInfo={femSimulationGeneralInfo}
                        femResultData={femResultData}
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
                        setFemResultLoaded={setFemResultLoaded}
                        femResultNames={femResultNames}
                        enableWebWorkes={enableWebWorkes}
                        numWebWorkers={numWebWorkers}
                        logElapsedTime={logElapsedTime}
                        onlyFemObjects={onlyFemObjects}
                    />
                })
            }
        </>
    )
}


export default FemSimulationObjects;