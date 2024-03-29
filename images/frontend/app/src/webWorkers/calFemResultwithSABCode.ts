declare function postMessage(message: any, transfer?: Transferable[] | undefined): void;

const calFemResultwithSAB = () => {

    const getColorRGB = (alpha: number, minV: number, maxV: number, n: number, rgbArray: Float32Array) => {
        if (alpha <= minV) {
            alpha = minV;
        } else if (alpha >= maxV) {
            alpha = maxV;
        }
        alpha = (alpha - minV) / (maxV - minV);
        var colorPosition = Math.round(alpha * n);
        if (colorPosition === n) colorPosition -= 1;
        const r = rgbArray[3 * colorPosition];
        const g = rgbArray[3 * colorPosition + 1];
        const b = rgbArray[3 * colorPosition + 2];
        return { r, g, b };
    }

    // eslint-disable-next-line no-restricted-globals
    self.onmessage = (event: MessageEvent<any>) => {
        const {
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
            dispZNodalValuesBuffer,
        } = event.data;
        const initialIndex = generalData.initialIndex;
        const finalIndex = generalData.finalIndex;
        const femSimulationDefScale = generalData.femSimulationDefScale;
        const resultType = generalData.resultType;
        const count = generalData.count;
        const paramsArray = new Float32Array(paramsBuffer);
        const resultLocation: number = paramsArray[0]; //0:  "OnNodes", 1: "OnGaussPoints"
        const minV: number = paramsArray[1];
        const maxV: number = paramsArray[2];
        const n: number = paramsArray[3];

        const rgbArray = new Float32Array(lutRgbBuffer);
        const originalGeometry = new Float32Array(originalGeometryBuffer);
        const elemConnectivities = new Float32Array(elemConnectivitiesBuffer);
        const resultFieldModalValues = new Float32Array(resultFieldModalValuesBuffer);
        const dispXModalValues = new Float32Array(dispXModalValuesBuffer);
        const dispYModalValues = new Float32Array(dispYModalValuesBuffer);
        const dispZModalValues = new Float32Array(dispZModalValuesBuffer);
        const resultNodalValues = new Float32Array(resultNodalValuesBuffer);
        const dispXNodalValues = new Float32Array(dispXNodalValuesBuffer);
        const dispYNodalValues = new Float32Array(dispYNodalValuesBuffer);
        const dispZNodalValues = new Float32Array(dispZNodalValuesBuffer);

        let resultColors: Float32Array;
        let currentPositions = new Float32Array((finalIndex - initialIndex) * 3);
        let MinMaxValues: Float32Array;

        let lutColors: number[] = [];
        let femMinValue: any;
        let femMaxValue: any;
        let numberOfModes = resultFieldModalValues.length;
        if (resultType === 2) {
            numberOfModes = dispXModalValues.length;
        }
        const currentPositionArray: number[] = [];

        let ipos = 0;
        for (let i = initialIndex; i < finalIndex; i++) {
            if (resultType === 1 || resultType === 3) {
                let totalcolorValue = 0;
                for (let imode = 1; imode <= numberOfModes; imode++) {
                    const modalValue = resultFieldModalValues[imode - 1];
                    if (modalValue === 0.0) continue;
                    if (resultLocation === 0) { //"OnNodes"
                        const inode = elemConnectivities[i] - 1;
                        const resultValue = resultNodalValues[inode + (imode - 1) * count];
                        totalcolorValue += resultValue * modalValue;
                    } else if (resultLocation === 1) { //"OnGaussPoints"
                        totalcolorValue += resultNodalValues[i + (imode - 1) * count] * modalValue;
                    }
                }

                if (femMinValue === undefined) femMinValue = totalcolorValue;
                if (totalcolorValue < femMinValue) femMinValue = totalcolorValue;
                if (femMaxValue === undefined) femMaxValue = totalcolorValue;
                if (totalcolorValue > femMaxValue) femMaxValue = totalcolorValue;

                const { r, g, b } = getColorRGB(totalcolorValue, minV, maxV, n, rgbArray);
                if (r === undefined || g === undefined || b === undefined) {
                    console.log("ERROR: " + totalcolorValue);
                } else {
                    lutColors[3 * ipos] = r;
                    lutColors[3 * ipos + 1] = g;
                    lutColors[3 * ipos + 2] = b;
                }
            }

            if (resultType === 2 || resultType === 3) {
                const deformationScale = Math.pow(10.0, femSimulationDefScale);
                let currentCoordX = originalGeometry[i * 3];
                let currentCoordY = originalGeometry[i * 3 + 1];
                let currentCoordZ = originalGeometry[i * 3 + 2];
                const inode = elemConnectivities[i] - 1;

                for (let imode = 1; imode <= numberOfModes; imode++) {
                    const nodalDispX = dispXNodalValues[(imode - 1) * count + inode];
                    const modalValueX = dispXModalValues[imode - 1];
                    currentCoordX += nodalDispX * modalValueX * deformationScale;

                    const nodalDispY = dispYNodalValues[(imode - 1) * count + inode];
                    const modalValueY = dispYModalValues[imode - 1];
                    currentCoordZ += nodalDispY * modalValueY * deformationScale;

                    const nodalDispZ = dispZNodalValues[(imode - 1) * count + inode];
                    const modalValueZ = dispZModalValues[imode - 1];
                    currentCoordY += nodalDispZ * modalValueZ * deformationScale;
                }

                currentPositionArray.push(currentCoordX, currentCoordY, currentCoordZ);
                if (i === (finalIndex - 1)) {
                    currentPositions.set(currentPositionArray);
                }
            }
            ++ipos;
        }

        MinMaxValues = new Float32Array([femMinValue, femMaxValue]);
        resultColors = new Float32Array(lutColors);

        const result = {
            buffer1: MinMaxValues.buffer,
            buffer2: resultColors.buffer,
            buffer3: currentPositions.buffer,
        }
        postMessage(result,
            [
                MinMaxValues.buffer,
                resultColors.buffer,
                currentPositions.buffer,
            ]
        );

    };
};

let code = calFemResultwithSAB.toString();
code = code.substring(code.indexOf("{") + 1, code.lastIndexOf("}"));

const blob = new Blob([code], { type: "application/javascript" });
const calFemResultwithSABCode = URL.createObjectURL(blob);

export default calFemResultwithSABCode;