import * as THREE from 'three';
import { toast } from "react-toastify";
import { IFemSimulationObject } from "../components/PlatformAssistant/DigitalTwin3DViewer/Model";
import { FemSimulationObjectState } from '../components/PlatformAssistant/DigitalTwin3DViewer/ViewerUtils';

const femResultCalcWorkersManager = (
    numWorkers: number,
    logElapsedTime: boolean,
    workers: Worker[],
    femSimulationResult: string,
    deformationFields: string[],
    showFemSimulationDeformation: boolean,
    femSimulationDefScale: number,
    showFemMesh: boolean,
    paramsSABMap: Map<string, SharedArrayBuffer>,
    originaGeometrySAB: SharedArrayBuffer,
    elemConnectivitiesSAB: SharedArrayBuffer,
    lutRgbArraySABMap: Map<string, SharedArrayBuffer>,
    femResultModalValueSABMap: Map<string, SharedArrayBuffer>,
    femResultNodalValueSABMap: Map<string, SharedArrayBuffer>,
    setFemMinValues: React.Dispatch<React.SetStateAction<number[]>>,
    setFemMaxValues: React.Dispatch<React.SetStateAction<number[]>>,
    femSimulationObject: IFemSimulationObject,
    femSimulationObjectState: FemSimulationObjectState,
    meshIndex: number,
    meshRefCurrent: any,
    meshResult: any,
) => {
    let startTime: number;
    if(logElapsedTime) startTime = Date.now();
    const paramsBuffer = paramsSABMap.get(femSimulationResult);
    const lutRgbBuffer = lutRgbArraySABMap.get(femSimulationResult);
    const originalGeometryBuffer = originaGeometrySAB;
    const elemConnectivitiesBuffer = elemConnectivitiesSAB;
    const resultFieldModalValuesBuffer = femResultModalValueSABMap.get(femSimulationResult);
    const dispXModalValuesBuffer = femResultModalValueSABMap.get(deformationFields[0]);
    const dispYModalValuesBuffer = femResultModalValueSABMap.get(deformationFields[1]);
    const dispZModalValuesBuffer = femResultModalValueSABMap.get(deformationFields[2]);
    const resultNodalValuesBuffer = femResultNodalValueSABMap.get(femSimulationResult);
    const dispXNodalValuesBuffer = femResultNodalValueSABMap.get(deformationFields[0]);
    const dispYNodalValuesBuffer = femResultNodalValueSABMap.get(deformationFields[1]);
    const dispZNodalValuesBuffer = femResultNodalValueSABMap.get(deformationFields[2]);

    const count = femSimulationObject.node.geometry.attributes.position.count;
    const interval = Math.round(count / numWorkers);
    const MinValuesArray: number[] = [];
    const MaxValuesArray: number[] = [];
    const resultColors = new Float32Array(count * 3);
    const originalGeometry = new Float32Array(originalGeometryBuffer);
    const currentPositions = new Float32Array(originalGeometry);
    let resultType = 1;
    if (femSimulationResult !== "None result" && meshResult) {
        resultType = 1;
        if (showFemSimulationDeformation) resultType = 3;
    } else {
        if (showFemSimulationDeformation) resultType = 2;
    }


    if (resultType === 1 || resultType === 3) {
        const resultFieldModalValuesAB = new Float32Array(resultFieldModalValuesBuffer as SharedArrayBuffer);
        resultFieldModalValuesAB.set(femSimulationObjectState.resultFieldModalValues[femSimulationResult])
    }
    
    if (resultType === 2 || resultType === 3) {
        const dispXModalValuesAB = new Float32Array(dispXModalValuesBuffer as SharedArrayBuffer);
        dispXModalValuesAB.set(femSimulationObjectState.resultFieldModalValues[deformationFields[0]]);
        const dispYModalValuesAB = new Float32Array(dispYModalValuesBuffer as SharedArrayBuffer);
        dispYModalValuesAB.set(femSimulationObjectState.resultFieldModalValues[deformationFields[1]]);
        const dispZModalValuesAB = new Float32Array(dispZModalValuesBuffer as SharedArrayBuffer);
        dispZModalValuesAB.set(femSimulationObjectState.resultFieldModalValues[deformationFields[2]]);
    }

    let numWorkerCompleted = 0;
    for (let iworker = 1; iworker <= numWorkers; ++iworker) {
        const initialIndex = (iworker - 1) * interval;
        let finalIndex = iworker * interval;
        if (iworker === numWorkers) finalIndex = count;

        const generalData = {
            initialIndex,
            finalIndex,
            femSimulationDefScale,
            resultType,
            count
        };

        const message = {
            generalData,
            paramsBuffer,
            lutRgbBuffer,
            originalGeometryBuffer,
            elemConnectivitiesBuffer,
            resultFieldModalValuesBuffer,
            dispXModalValuesBuffer,
            dispYModalValuesBuffer,
            dispZModalValuesBuffer,
            resultNodalValuesBuffer,
            dispXNodalValuesBuffer,
            dispYNodalValuesBuffer,
            dispZNodalValuesBuffer
        }

        workers[iworker - 1].postMessage(message);

        // eslint-disable-next-line no-loop-func
        workers[iworker - 1].onmessage = (e: MessageEvent<string>) => {
            const { buffer1, buffer2, buffer3 } = (e.data as any);
            numWorkerCompleted++;

            if (resultType === 1 || resultType === 3) {
                const MinMaxValues = new Float32Array(buffer1);
                MinValuesArray.push(MinMaxValues[0]);
                MaxValuesArray.push(MinMaxValues[1]);
                const resultColors_i = new Float32Array(buffer2);
                resultColors.set(resultColors_i, initialIndex * 3);
                if (numWorkerCompleted === numWorkers) {
                    let minValue = MinValuesArray[0];
                    let maxValue = MaxValuesArray[0];
                    for (let i = 1; i < numWorkers; ++i) {
                        if (MinValuesArray[i] < minValue) minValue = MinValuesArray[i];
                        if (MaxValuesArray[i] > maxValue) maxValue = MaxValuesArray[i];
                    }
                    setFemMinValues((prevFemMinValues: number[]) => {
                        const newFemMinValues = [...prevFemMinValues];
                        newFemMinValues[meshIndex] = minValue;
                        return newFemMinValues;
                    });
    
                    setFemMaxValues((prevFemMaxValues: number[]) => {
                        const newFemMaxValues = [...prevFemMaxValues];
                        newFemMaxValues[meshIndex] = maxValue;
                        return newFemMaxValues;
                    });
                    femSimulationObject.node.geometry.setAttribute('color', new THREE.BufferAttribute(resultColors, 3));
                }
            }

            if (resultType === 2 || resultType === 3) {
                const currentPositions_i = new Float32Array(buffer3);
                currentPositions.set(currentPositions_i, initialIndex * 3);
                if (numWorkerCompleted === numWorkers) {
                    femSimulationObject.node.geometry.setAttribute('position', new THREE.BufferAttribute(currentPositions, 3));
                    if (meshRefCurrent) {
                        if (showFemMesh) {
                            const wireframeGeometry = new THREE.WireframeGeometry(femSimulationObject.node.geometry);
                            meshRefCurrent.geometry = wireframeGeometry;
                            meshRefCurrent.visible = true;
                        } else meshRefCurrent.visible = false;
                    }
                }
            }

            if (logElapsedTime && numWorkerCompleted === numWorkers) {
                const endTime = Date.now();
                console.log(`Elapsed time: ${endTime - startTime}ms`)
            }

        };
        workers[iworker - 1].onerror = (event: ErrorEvent) => {
            const errorMessage = `Error in fem result calculation for worker ${iworker}`;
            toast.warning(errorMessage);
        }
    }
}

export default femResultCalcWorkersManager;