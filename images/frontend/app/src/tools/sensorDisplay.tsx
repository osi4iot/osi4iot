import * as THREE from 'three'

const digitMesh = [
    [1, 0, 1, 1, 1, 1, 1], // Value 0
    [0, 0, 0, 0, 1, 0, 1], // Value 1
    [1, 1, 1, 0, 1, 1, 0], // Value 2
    [1, 1, 1, 0, 1, 0, 1], // Value 3
    [0, 1, 0, 1, 1, 0, 1], // Value 4
    [1, 1, 1, 1, 0, 0, 1], // Value 5
    [1, 1, 1, 1, 0, 1, 1], // Value 6
    [1, 0, 0, 0, 1, 0, 1], // Value 7
    [1, 1, 1, 1, 1, 1, 1], // Value 8
    [1, 1, 1, 1, 1, 0, 1], // Value 9
];

const defaulEmitColor = new THREE.Color(0x00ff00);
const noEmitColor = new THREE.Color(0, 0, 0);

export const sensorDisplay = (
    obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>,
    sensorValueIn: number | number[]
) => {

    if (typeof sensorValueIn === "number") {
        const defaultNumDecimals = calcDefaultNumDecimals(obj);
        const sensorValue = sensorValueIn.toFixed(defaultNumDecimals);
        const digits = (sensorValue + '').split('');
        let decimalPointPos = digits.indexOf(".");
        let numDecimals = digits.length - decimalPointPos - 1;
        if (decimalPointPos === -1) {
            decimalPointPos = digits.length;
            numDecimals = 0;
            digits.push(".");
        }
        if (numDecimals < defaultNumDecimals) {
            for (let ipos = numDecimals; ipos < defaultNumDecimals; ipos++) {
                digits.push("0");
            }
        }
        let emitColor = defaulEmitColor;
        if (obj.userData.displayColor !== undefined) {
            emitColor = new THREE.Color(parseInt(obj.userData.displayColor, 16));
        }
        for (let imesh = 0; imesh < obj.children.length; imesh++) {
            if (
                obj.children[imesh].userData.displayType !== undefined &&
                obj.children[imesh].userData.displayType === "digit"
            ) {
                const digitPosition = obj.children[imesh].userData.digitPosition;
                const digitIndex = decimalPointPos - digitPosition;
                if (digitIndex >= 0 && digitIndex < digits.length) {
                    if (digitPosition === 0) {
                        (obj.children[imesh] as any).material.emissive = emitColor;
                    } else {
                        const digitValue = parseInt(digits[digitIndex], 10);
                        for (let jmesh = 0; jmesh < obj.children[imesh].children.length; jmesh++) {
                            const digitMeshType = obj.children[imesh].children[jmesh].userData.digitMeshType;
                            if (digitMesh[digitValue][digitMeshType - 1]) {
                                (obj.children[imesh].children[jmesh] as any).material.emissive = emitColor;
                            } else {
                                (obj.children[imesh].children[jmesh] as any).material.emissive = noEmitColor;
                            }
                        }
                    }
                } else {
                    for (let jmesh = 0; jmesh < obj.children[imesh].children.length; jmesh++) {
                        (obj.children[imesh].children[jmesh] as any).material.emissive = noEmitColor;
                    }
                }
            } else {
                if ((obj.children[imesh] as any).material !== undefined) {
                    (obj.children[imesh] as any).material.emissive = emitColor;
                }
            }
        }
    }
}

const calcDefaultNumDecimals = (obj: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>) => {
    let minDigitPosition = 0;
    for (let imesh = 0; imesh < obj.children.length; imesh++) {
        if (obj.children[imesh].userData.displayType === "digit") {
            const digitPosition = obj.children[imesh].userData.digitPosition;
            if (digitPosition < minDigitPosition) minDigitPosition = digitPosition;
        }
    }
    return Math.abs(minDigitPosition);
}