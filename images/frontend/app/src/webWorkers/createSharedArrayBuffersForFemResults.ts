import { IFemSimulationObject, IResultRenderInfo } from "../components/PlatformAssistant/DigitalTwin3DViewer/Model";
import { FemSimulationObjectState } from "../components/PlatformAssistant/DigitalTwin3DViewer/ViewerUtils";

const giveResultsLutParams = (
    femSimulationGeneralInfo: Record<string, IResultRenderInfo>,
    femSimulationResult: string,
    meshResult: any
) => {
    let minV = 0;
    let maxV = 0;
    let n = 0;
    if (femSimulationResult !== "None result" && meshResult) {
        const lutParams = femSimulationGeneralInfo[femSimulationResult].resultLut.giveLutParams();
        minV = lutParams[0];
        maxV = lutParams[1];
        n = lutParams[2];
    }
    return [minV, maxV, n];
}

const createSharedArrayBuffersForFemResults = (
    femResultNames: string[],
    meshResult: any,
    femSimulationObject: IFemSimulationObject,
    femSimulationGeneralInfo: Record<string, IResultRenderInfo>,
    femSimulationObjectState: FemSimulationObjectState,
    setParamsSABMap: React.Dispatch<React.SetStateAction<Map<string, SharedArrayBuffer> | null>>,
    setOriginaGeometrySAB: React.Dispatch<React.SetStateAction<SharedArrayBuffer | null>>,
    setElemConnectivitiesSAB: React.Dispatch<React.SetStateAction<SharedArrayBuffer | null>>,
    setLutRgbArraySABMap: React.Dispatch<React.SetStateAction<Map<string, SharedArrayBuffer> | null>>,
    setFemResultModalValueSABMap: React.Dispatch<React.SetStateAction<Map<string, SharedArrayBuffer> | null>>,
    setFemResultNodalValueSABMap: React.Dispatch<React.SetStateAction<Map<string, SharedArrayBuffer> | null>>,
) => {

    const count = femSimulationObject.node.geometry.attributes.position.count;
    const numberOfModes = meshResult.resultFields[femResultNames[0]].numberOfModes;
    const size = count * numberOfModes;
    const originaGeometrySAB = new SharedArrayBuffer(femSimulationObject.originalGeometry.length * 4);
    const originaGeometryAB = new Float32Array(originaGeometrySAB);
    originaGeometryAB.set(femSimulationObject.originalGeometry);

    const elemConnectivitiesSAB = new SharedArrayBuffer(meshResult.elemConnectivities.array.length * 4);
    const elemConnectivitiesAB = new Float32Array(elemConnectivitiesSAB);
    elemConnectivitiesAB.set(meshResult.elemConnectivities.array);

    //SAB: Shared array buffer
    const paramsSABMap: Map<string, SharedArrayBuffer> = new Map();
    const lutRgbArraySABMap: Map<string, SharedArrayBuffer> = new Map();
    const femResultModalValueSABMap: Map<string, SharedArrayBuffer> = new Map();
    const femResultNodalValueSABMap: Map<string, SharedArrayBuffer> = new Map();

    for (const resultName of femResultNames) {
        let resultLocation = 0;
        if (meshResult.resultFields[resultName].resultLocation === "OnNodes") {
            resultLocation = 0;
        } else if (meshResult.resultFields[resultName].resultLocation === "OnGaussPoints") {
            resultLocation = 1;
        }
        const paramsArray = [
            resultLocation,
            ...giveResultsLutParams(femSimulationGeneralInfo, resultName, meshResult),
        ]
        const paramsSAB = new SharedArrayBuffer(paramsArray.length * 4);
        const paramsArrayBuffer = new Float32Array(paramsSAB);
        paramsArrayBuffer.set(paramsArray);
        paramsSABMap.set(resultName, paramsSAB);

        const lutRgbArraySAB = new SharedArrayBuffer(count * 3 * 4);
        const lutRgbArrayAB = new Float32Array(lutRgbArraySAB);
        lutRgbArrayAB.set(femSimulationGeneralInfo[resultName].resultLut.giveLutRgbArray());
        lutRgbArraySABMap.set(resultName, lutRgbArraySAB);

        const femResultModalValueSAB = new SharedArrayBuffer(numberOfModes * 4);
        const femResultModalValueAB = new Float32Array(femResultModalValueSAB);
        femResultModalValueAB.set(femSimulationObjectState.resultFieldModalValues[resultName]);
        femResultModalValueSABMap.set(resultName, femResultModalValueSAB);

        const femResultNodalValueSAB = new SharedArrayBuffer(size * 4);
        const femResultNodalValueAB = new Float32Array(femResultNodalValueSAB);
        for (let imode = 1; imode <= numberOfModes; imode++) {
            const ipos = (imode - 1) * count;
            const resultpath = `${resultName}__${imode}`;
            const resultArray = meshResult.resultFields[resultName].modalValues[resultpath].array;
            femResultNodalValueAB.set(resultArray, ipos);
        }
        femResultNodalValueSABMap.set(resultName, femResultNodalValueSAB);
    }

    setParamsSABMap(paramsSABMap);
    setOriginaGeometrySAB(originaGeometrySAB);
    setElemConnectivitiesSAB(elemConnectivitiesSAB);
    setLutRgbArraySABMap(lutRgbArraySABMap);
    setFemResultModalValueSABMap(femResultModalValueSABMap);
    setFemResultNodalValueSABMap(femResultNodalValueSABMap);
}

export default createSharedArrayBuffersForFemResults;