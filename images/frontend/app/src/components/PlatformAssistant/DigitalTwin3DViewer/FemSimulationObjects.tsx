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
    hideMesh: boolean;
    femSimulationResult: string;
}

const highlightColor = new THREE.Color(0x00ff00);
const noEmitColor = new THREE.Color(0, 0, 0);

const FemSimulationObjectBase: FC<FemSimulationObjectProps> = ({
    femSimulationObject,
    femSimulationObjectState,
    femSimulationStateString,
    blinking,
    hideMesh,
    femSimulationResult
}) => {
    const meshRef = useRef<THREE.Mesh>();
    const material = Object.assign(femSimulationObject.node.material);
    let lastIntervalTime = 0;

    useFrame(({ clock }) => {
        if (hideMesh) {
            if (meshRef.current) meshRef.current.visible = false;
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
                if (meshRef.current) meshRef.current.visible = defaultVisibility(femSimulationObject.node);
                material.emissive = noEmitColor;
            }
        }
    })
    
    useLayoutEffect(() => {
        let color: THREE.Color;
        let resultColors: Float32Array;
        if (femSimulationResult === "None result") {
            resultColors = femSimulationObject.noneResultColor;
        } else {
            let lutColors = [];
            const numberOfModes = femSimulationObject.numberOfModes;
            const resultFieldPath = femSimulationObject.resultFieldPaths[femSimulationResult];
            let resultpath = resultFieldPath;
            const resultValues = femSimulationObject.node.geometry.attributes[resultpath];
            for (var i = 0; i < resultValues.array.length; i++) {
                let totalcolorValue = 0;
                for (let imode = 1; imode <= numberOfModes; imode++) {
                    if (numberOfModes !== 1) {
                        resultpath = `${resultFieldPath}__${imode}`
                    }
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
        femSimulationObject.node.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(resultColors), 3));

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [femSimulationResult, femSimulationObjectState]);

    return (
        <mesh
            ref={meshRef}
            castShadow
            receiveShadow
            geometry={femSimulationObject.node.geometry}
            material={femSimulationObject.node.material}
            position={[femSimulationObject.node.position.x, femSimulationObject.node.position.y, femSimulationObject.node.position.z]}
            rotation={[femSimulationObject.node.rotation.x, femSimulationObject.node.rotation.y, femSimulationObject.node.rotation.z]}
            scale={[femSimulationObject.node.scale.x, femSimulationObject.node.scale.y, femSimulationObject.node.scale.z]}
        />
    )
}

const areEqual = (prevProps: FemSimulationObjectProps, nextProps: FemSimulationObjectProps) => {
    return (prevProps.femSimulationObjectState.highlight === nextProps.femSimulationObjectState.highlight || nextProps.blinking) &&
        prevProps.blinking === nextProps.blinking &&
        prevProps.hideMesh === nextProps.hideMesh &&
        prevProps.femSimulationResult === nextProps.femSimulationResult &&
        prevProps.femSimulationStateString === nextProps.femSimulationStateString;
}

const FemSimulationObject = React.memo(FemSimulationObjectBase, areEqual);


export default FemSimulationObject;