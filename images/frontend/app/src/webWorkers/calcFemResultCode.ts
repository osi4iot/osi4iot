declare function postMessage(message: any, transfer?: Transferable[] | undefined): void;

const calcFemResult = () => {

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
        } = event.data;


        //arrayBuffer1
        const paramsArray = new Float32Array(arrayBuffer1);
        const count: number = paramsArray[0];
        const showFemDeformation = paramsArray[1];
        const femSimulationDefScale: number = paramsArray[2];
        const resultLocation: number = paramsArray[3]; //0:  "OnNodes", 1: "OnGaussPoints"
        const minV: number = paramsArray[4];
        const maxV: number = paramsArray[5];
        const n: number = paramsArray[6];

        const rgbArray = new Float32Array(arrayBuffer2);
        const originalGeometry = new Float32Array(arrayBuffer3);
        const elemConnectivities = new Float32Array(arrayBuffer4);
        const resultFieldModalValues = new Float32Array(arrayBuffer5);
        const dispXModalValues = new Float32Array(arrayBuffer6);
        const dispYModalValues = new Float32Array(arrayBuffer7);
        const dispZModalValues =  new Float32Array(arrayBuffer8);
        const resultNodalValues = new Float32Array(arrayBuffer9);
        const dispXNodalValues = new Float32Array(arrayBuffer10);
        const dispYNodalValues = new Float32Array(arrayBuffer11);
        const dispZNodalValues = new Float32Array(arrayBuffer12);

        let resultColors: Float32Array;
        let currentPositions =  new Float32Array(originalGeometry);
        let MinMaxValues: Float32Array;

        let lutColors: number[] = [];
        let femMinValue: any;
        let femMaxValue: any;
        const numberOfModes = resultFieldModalValues.length;
        const currentPositionArray: number[] = [];

        for (let i = 0; i < count; i++) {
            let totalcolorValue = 0;
            for (let imode = 1; imode <= numberOfModes; imode++) {
                const modalValue = resultFieldModalValues[imode - 1];
                if (modalValue === 0.0) continue;
                if (resultLocation === 0) { //"OnNodes"
                    const inode = elemConnectivities[i] - 1;
                    const resultValue = resultNodalValues[inode + (imode - 1) * count];
                    totalcolorValue += resultValue * modalValue;
                } else if (resultLocation === 1) { //"OnGaussPoints"
                    totalcolorValue += resultNodalValues[i] * modalValue;
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
                lutColors[3 * i] = r;
                lutColors[3 * i + 1] = g;
                lutColors[3 * i + 2] = b;
            }

            if (showFemDeformation !== 0) {
                const deformationScale = Math.pow(10.0, femSimulationDefScale);
                let currentCoordX = originalGeometry[i * 3];
                let currentCoordY = originalGeometry[i * 3 + 1];
                let currentCoordZ = originalGeometry[i * 3 + 2];
                const inode = elemConnectivities[i] - 1;

                for (let imode = 1; imode <= numberOfModes; imode++) {
                    const nodalDispX = dispXNodalValues[inode + (imode - 1) * count];
                    const modalValueX = dispXModalValues[imode - 1];
                    currentCoordX += nodalDispX * modalValueX * deformationScale;

                    const nodalDispY = dispYNodalValues[inode + (imode - 1) * count];
                    const modalValueY = dispYModalValues[imode - 1];
                    currentCoordZ += nodalDispY * modalValueY * deformationScale;

                    const nodalDispZ = dispZNodalValues[inode + (imode - 1) * count];
                    const modalValueZ = dispZModalValues[imode - 1];
                    currentCoordY += nodalDispZ * modalValueZ * deformationScale;
                }

                currentPositionArray.push(currentCoordX, currentCoordY, currentCoordZ);
                if (i === (count - 1)) {
                    currentPositions = new Float32Array(currentPositionArray);
                }
            }
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

let code = calcFemResult.toString();
code = code.substring(code.indexOf("{") + 1, code.lastIndexOf("}"));

const blob = new Blob([code], { type: "application/javascript" });
const calcFemResultCode = URL.createObjectURL(blob);

export default calcFemResultCode;