import * as THREE from 'three'
import React, { FC, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber';
import { defaultVisibility, FemSimulationObjectState } from './ViewerUtils';
import { IFemSimulationObject } from './Model';

interface FemSimulationObjectProps {
    femSimulationObject: IFemSimulationObject;
    femSimulationObjectState: FemSimulationObjectState;
    femSimulationStateString: string;
    blinking: boolean;
    hideObject: boolean;
    showFemMesh: boolean;
    femSimulationResult: string;
    showFemSimulationDeformation: boolean;
    femSimulationDefScale: number;
}

const highlightColor = new THREE.Color(0x00ff00);
const noEmitColor = new THREE.Color(0, 0, 0);

const FemSimulationObjectBase: FC<FemSimulationObjectProps> = ({
    femSimulationObject,
    femSimulationObjectState,
    femSimulationStateString,
    blinking,
    hideObject,
    showFemMesh,
    femSimulationResult,
    showFemSimulationDeformation,
    femSimulationDefScale
}) => {
    const objectRef = useRef<THREE.Group>();
    const meshRef = useRef<THREE.LineSegments>();
    const geometryRef = useRef<THREE.Mesh>();
    const material = Object.assign(femSimulationObject.node.material);
    let lastIntervalTime = 0;

    useFrame(({ clock }) => {
        if (hideObject) {
            if (objectRef.current) objectRef.current.visible = false;
        } else {
            material.opacity = 1;
            if (blinking) {
                if (lastIntervalTime === 0) {
                    lastIntervalTime = clock.elapsedTime;
                }
                const deltaInterval = clock.elapsedTime - lastIntervalTime;
                if (deltaInterval <= 0.30) {
                    material.emissive = noEmitColor;
                } else if (deltaInterval > 0.30 && deltaInterval <= 0.60) {
                    material.emissive = highlightColor;
                } else if (deltaInterval > 0.60) {
                    lastIntervalTime = clock.elapsedTime;
                }
            } else {
                if (objectRef.current) objectRef.current.visible = defaultVisibility(femSimulationObject.node);
                material.emissive = noEmitColor;
            }
        }
    })

    useLayoutEffect(() => {
        let color: THREE.Color;
        let resultColors: Float32Array;
        let currentPositions: Float32Array;
        const numberOfModes = femSimulationObject.numberOfModes;
        if (femSimulationResult === "None result") {
            resultColors = femSimulationObject.noneResultColor;
            currentPositions = femSimulationObject.originalGeometry;
        } else {
            let lutColors = [];
            const resultFieldPath = femSimulationObject.resultFieldPaths[femSimulationResult];
            let resultpath = resultFieldPath;
            for (let i = 0; i < femSimulationObject.node.geometry.attributes.position.count; i++) {
                let totalcolorValue = 0;
                for (let imode = 1; imode <= numberOfModes; imode++) {
                    resultpath = `${resultFieldPath}__${imode}`
                    if (numberOfModes === 1 && femSimulationObject.node.geometry.attributes[resultpath] === undefined) {
                        resultpath = resultFieldPath;
                    }
                    const resultValues = femSimulationObject.node.geometry.attributes[resultpath];
                    const modalValue = femSimulationObjectState.resultFieldModalValues[femSimulationResult][imode - 1]
                    totalcolorValue += resultValues.array[i] * modalValue;
                }

                color = femSimulationObject.resultsRenderInfo[femSimulationResult].resultLut.getColor(totalcolorValue);
                if (color === undefined) {
                    console.log("ERROR: " + totalcolorValue);
                } else {
                    lutColors[3 * i] = color.r;
                    lutColors[3 * i + 1] = color.g;
                    lutColors[3 * i + 2] = color.b;
                }
            }
            resultColors = new Float32Array(lutColors);
        }

        if (showFemSimulationDeformation) {
            const currentPositionArray = [];
            const deformationScale = Math.pow(10.0, femSimulationDefScale);
            for (let i = 0; i < femSimulationObject.node.geometry.attributes.position.count; i++) {
                let currentCoordX = femSimulationObject.originalGeometry[i * 3];
                let currentCoordY = femSimulationObject.originalGeometry[i * 3 + 1];
                let currentCoordZ = femSimulationObject.originalGeometry[i * 3 + 2];
                for (let imode = 1; imode <= numberOfModes; imode++) {
                    let dispXPath = `${femSimulationObject.deformationFields[0]}__${imode}`;
                    let dispYPath = `${femSimulationObject.deformationFields[1]}__${imode}`;
                    let dispZPath = `${femSimulationObject.deformationFields[2]}__${imode}`;
                    if (numberOfModes === 1) {
                        if (femSimulationObject.node.geometry.attributes[dispXPath] === undefined) {
                            dispXPath = femSimulationObject.deformationFields[0];
                        }
                        if (femSimulationObject.node.geometry.attributes[dispYPath] === undefined) {
                            dispYPath = femSimulationObject.deformationFields[1];
                        }
                        if (femSimulationObject.node.geometry.attributes[dispZPath] === undefined) {
                            dispZPath = femSimulationObject.deformationFields[2];
                        }
                    }
                    const modalDispX = femSimulationObject.node.geometry.attributes[dispXPath];
                    const deformationFields = femSimulationObject.deformationFields;
                    const modalValueX = femSimulationObjectState.resultFieldModalValues[deformationFields[0]][imode - 1];
                    currentCoordX += modalDispX.array[i] * modalValueX * deformationScale;
                    const modalDispY = femSimulationObject.node.geometry.attributes[dispYPath];
                    const modalValueY = femSimulationObjectState.resultFieldModalValues[deformationFields[1]][imode - 1];
                    currentCoordY += modalDispY.array[i] * modalValueY * deformationScale;
                    const modalDispZ = femSimulationObject.node.geometry.attributes[dispZPath];
                    const modalValueZ = femSimulationObjectState.resultFieldModalValues[deformationFields[2]][imode - 1];
                    currentCoordZ += modalDispZ.array[i] * modalValueZ * deformationScale;
                }
                currentPositionArray.push(currentCoordX, currentCoordY, currentCoordZ);
            }
            currentPositions = new Float32Array(currentPositionArray);
        } else {
            currentPositions = femSimulationObject.originalGeometry;
        }

        femSimulationObject.node.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(currentPositions), 3));
        femSimulationObject.node.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(resultColors), 3));

        if (meshRef.current) {
            if (showFemMesh) {
                const wireframeGeometry = new THREE.WireframeGeometry(femSimulationObject.node.geometry);
                meshRef.current.geometry = wireframeGeometry;
                meshRef.current.visible = true;
            } else meshRef.current.visible = false;
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [femSimulationResult, femSimulationObjectState, showFemSimulationDeformation, femSimulationDefScale, showFemMesh]);

    return (
        <group ref={objectRef}>
            <mesh
                ref={geometryRef}
                castShadow
                receiveShadow
                geometry={femSimulationObject.node.geometry}
                material={femSimulationObject.node.material}
                position={[femSimulationObject.node.position.x, femSimulationObject.node.position.y, femSimulationObject.node.position.z]}
                rotation={[femSimulationObject.node.rotation.x, femSimulationObject.node.rotation.y, femSimulationObject.node.rotation.z]}
                scale={[femSimulationObject.node.scale.x, femSimulationObject.node.scale.y, femSimulationObject.node.scale.z]}
            />
            <primitive ref={meshRef} object={femSimulationObject.wireFrameMesh} />
        </group>
    )
}

const areEqual = (prevProps: FemSimulationObjectProps, nextProps: FemSimulationObjectProps) => {
    return (prevProps.femSimulationObjectState.highlight === nextProps.femSimulationObjectState.highlight || nextProps.blinking) &&
        prevProps.blinking === nextProps.blinking &&
        prevProps.hideObject === nextProps.hideObject &&
        prevProps.showFemMesh === nextProps.showFemMesh &&
        prevProps.femSimulationResult === nextProps.femSimulationResult &&
        prevProps.femSimulationStateString === nextProps.femSimulationStateString &&
        prevProps.showFemSimulationDeformation === nextProps.showFemSimulationDeformation &&
        prevProps.femSimulationDefScale === nextProps.femSimulationDefScale;
}

const FemSimulationObject = React.memo(FemSimulationObjectBase, areEqual);


export default FemSimulationObject;