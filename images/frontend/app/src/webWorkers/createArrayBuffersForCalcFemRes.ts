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

const createArrayBuffersForCalcFemRes = (
    femSimulationResult: string,
    meshResult: any,
    showFemSimulationDeformation: boolean,
    femSimulationObject: IFemSimulationObject,
    deformationFields: string[],
    femSimulationDefScale: number,
    femSimulationGeneralInfo: Record<string, IResultRenderInfo>,
    femSimulationObjectState: FemSimulationObjectState
) => {

    let femSimulationResultValue = 1;
    let resultLocation = 0;
    if (femSimulationResult === "None result" || meshResult === null) {
        femSimulationResultValue = 0;
    } else {
        if (meshResult.resultFields[femSimulationResult].resultLocation === "OnNodes") {
            resultLocation = 0;
        } else if (meshResult.resultFields[femSimulationResult].resultLocation === "OnGaussPoints") {
            resultLocation = 1;
        }
    }
    const count = femSimulationObject.node.geometry.attributes.position.count;
    let showFemDeformation = 0;
    if (showFemSimulationDeformation && deformationFields.length === 3) showFemDeformation = 1;
    const paramsArray = [
        femSimulationResultValue,
        count,
        showFemDeformation,
        femSimulationDefScale,
        resultLocation,
        ...giveResultsLutParams(femSimulationGeneralInfo, femSimulationResult, meshResult),
    ]
    let numberOfModes = 1;
    if (femSimulationResultValue !== 0) {
        numberOfModes = meshResult.resultFields[femSimulationResult].numberOfModes;
    } else if (showFemDeformation !== 0) {
        numberOfModes = femSimulationObjectState.resultFieldModalValues[deformationFields[0]].length;
    }


    const arrayBuffer1 = new Float32Array(paramsArray);
    const arrayBuffer2 = new Float32Array(count * 3)
    const arrayBuffer3 = new Float32Array(femSimulationObject.originalGeometry);
    const arrayBuffer4 = new Float32Array(meshResult.elemConnectivities.array);
    const arrayBuffer5 = new Float32Array(numberOfModes);

    if (femSimulationResultValue !== 0) {
        arrayBuffer2.set(femSimulationGeneralInfo[femSimulationResult].resultLut.giveLutRgbArray());
        arrayBuffer5.set(femSimulationObjectState.resultFieldModalValues[femSimulationResult]);
    }

    const arrayBuffer6 = new Float32Array(numberOfModes); //ModalValues Disp_x
    const arrayBuffer7 = new Float32Array(numberOfModes); //ModalValues Disp_y
    const arrayBuffer8 = new Float32Array(numberOfModes); //ModalValues Disp_y

    if (showFemDeformation !== 0) {
        arrayBuffer6.set(femSimulationObjectState.resultFieldModalValues[deformationFields[0]]);
        arrayBuffer7.set(femSimulationObjectState.resultFieldModalValues[deformationFields[1]]);
        arrayBuffer8.set(femSimulationObjectState.resultFieldModalValues[deformationFields[2]]);
    }

    const size = femSimulationObject.node.geometry.attributes.position.count * numberOfModes;
    const arrayBuffer9 = new Float32Array(size);  // resultNodalValues
    const arrayBuffer10 = new Float32Array(size); // dispXNodalValues
    const arrayBuffer11 = new Float32Array(size); // dispYNodalValues
    const arrayBuffer12 = new Float32Array(size); // dispZNodalValues
    for (let imode = 1; imode <= numberOfModes; imode++) {
        const ipos = (imode - 1) * count;
        if (femSimulationResultValue !== 0) {
            const resultpath = `${femSimulationResult}__${imode}`;
            arrayBuffer9.set(meshResult.resultFields[femSimulationResult].modalValues[resultpath].array, ipos);
        }
        if (showFemDeformation !== 0) {
            const dispXPath = `${deformationFields[0]}__${imode}`;
            arrayBuffer10.set(meshResult.resultFields[deformationFields[0]].modalValues[dispXPath].array, ipos);

            const dispYPath = `${deformationFields[1]}__${imode}`;
            arrayBuffer11.set(meshResult.resultFields[deformationFields[1]].modalValues[dispYPath].array, ipos);

            const dispZPath = `${deformationFields[2]}__${imode}`;
            arrayBuffer12.set(meshResult.resultFields[deformationFields[2]].modalValues[dispZPath].array, ipos);
        }
    }

    const buffers = {
        arrayBuffer1,
        arrayBuffer2,
        arrayBuffer3,
        arrayBuffer4,
        arrayBuffer5,
        arrayBuffer6,
        arrayBuffer7,
        arrayBuffer8,
        arrayBuffer9,
        arrayBuffer10,
        arrayBuffer11,
        arrayBuffer12,
    };

    return buffers;
}

export default createArrayBuffersForCalcFemRes;