import nReadlines from 'n-readlines';
import fs from 'fs';



// import process from 'process';


// print process.argv
const args = process.argv;
args.forEach(function (val, index, array) {
    console.log(index + ': ' + val);
});

let arg2 = args[2];

if (arg2 == undefined) {
    console.log('You need to specify a folder.gid where the .post.msh and .post.res are located.')
    throw new Error('You need to specify a folder.gid where the .post.msh and .post.res are located.');
}

if (arg2.includes('/')){

}
else{if(arg2.includes('\\')){
    arg2=arg2.replace(/\\/g,'/')
}
else{
    console.log(`introduce the path using '/' instead of '\\'`)
}}


const inputMeshPath = `${arg2}/${arg2.split('/')[arg2.split('/').length-1].replace('.gid','')}.post.msh`
const inputResultsPath = `${arg2}/${arg2.split('/')[arg2.split('/').length-1].replace('.gid','')}.post.res`
const inputDataPathArray = inputMeshPath.split('/');
const directory = inputDataPathArray.slice(0, -1).join('/');
const fileName = inputDataPathArray[inputDataPathArray.length - 1].split('.')[0];


let resultsOfInterest = undefined;
let reverseField = undefined;
let thresholdLimits = {
    'min': {
        'field': undefined,
        'value': undefined,
    },
    'max': {
        'field': undefined,
        'value': undefined,
    },
}

let skipArg=0; // how many arguments to skip, by default no-skip = 0
    let lastArg=undefined;
    for (let argidx = 3; argidx < args.length; argidx++) {
        let argi=args[argidx];
        if (skipArg==0){
            switch (argi) {
                case '--reverse-field':
                    skipArg=1;
                    lastArg=argi
                    break;
                case '--results-of-interest':
                    skipArg=1;
                    lastArg=argi
                    break;
                case '--min-threshold-field':
                    skipArg=2;
                    lastArg=argi
                    break;
                case '--max-threshold-field':
                    skipArg=2;
                    lastArg=argi
                    break;
                default:
                    break;
            }
        } else {
            switch (lastArg) {
                case '--reverse-field':
                    try {
                        reverseField=argi.replace('[','').replace(']','').split(/[ ,]+/);
                    } catch (error) {
                        console.log('No reverse field specified, using the defaults.')
                        reverseField = undefined
                    }
                    break;
                case '--results-of-interest':
                    try {
                        resultsOfInterest = argi.replace('[','').replace(']','').split(/[ ,]+/);
                    } catch (error) {
                        console.log('Error parsing the result inserted.')
                        throw new Error(error)
                    }
                    break;
                case '--min-threshold-field':
                    switch (skipArg) {
                        case 2:
                            try {
                                thresholdLimits.min.field = argi.replace('[','').replace(']','').split(/[ ,]+/);
                            } catch (error) {
                                console.log('Error parsing the min field inserted.')
                                throw new Error(error)
                            }
                            break;
                        case 1:
                            try {
                                thresholdLimits.min.value = argi.replace('[','').replace(']','').split(/[ ,]+/);
                                for (let idx = 0; idx < thresholdLimits.min.value.length; idx++) {
                                    thresholdLimits.min.value[idx] = parseFloat(thresholdLimits.min.value[idx]);
                                    
                                }
                            } catch (error) {
                                console.log('Error parsing the min value inserted.')
                                throw new Error(error)
                            }
                            break;
                        default:
                            break;
                    }
                    break;
                case '--max-threshold-field':
                    switch (skipArg) {
                        case 2:
                            try {
                                thresholdLimits.max.field = argi.replace('[','').replace(']','').split(/[ ,]+/);
                            } catch (error) {
                                console.log('Error parsing the max field inserted.')
                                throw new Error(error)
                            }
                            break;
                        case 1:
                            try {
                                thresholdLimits.max.value = argi.replace('[','').replace(']','').split(/[ ,]+/);
                                for (let idx = 0; idx < thresholdLimits.max.value.length; idx++) {
                                    thresholdLimits.max.value[idx] = parseFloat(thresholdLimits.max.value[idx]);
                                    
                                }
                            } catch (error) {
                                console.log('Error parsing the max value inserted.')
                                throw new Error(error)
                            }
                            break;
                        default:
                            break;
                    }
                    break;
                default:
                    // switch (skipArg) {
                        // case 1: 
                        //      break;
                        // case 2:
                        //      break;
                        // ...
                        // case 3:
                        //      break;
                    // }
                    break;
            }
            skipArg--;
        }
    }

const dictCompOfInterest = {
    'Displacements':3,
    'Shells//Stresses_Top':1,
    'Shells//Stresses_Bottom':1,
    'Shells//Equivalent_stresses//Von_Mises//Top':1,
    'Shells//Equivalent_stresses//Von_Mises//Bottom':1,
    'Shells//Stresses_Top//Von_mises':6,
    'Shells//Main_stresses//Top//Si':1,
    'Shells//Main_stresses//Top//Sii':1,
    'Shells//Main_stresses//Top//Siii':1,
    'Shells//Main_stresses//Bottom//Si':1,
    'Shells//Main_stresses//Bottom//Sii':1,
    'Shells//Main_stresses//Bottom//Siii':1,
    'Shells//Stresses_Top//SI':1,
    'Shells//Stresses_Top//SII':1,
    'Shells//Stresses_Top//SIII':1,
    'Stresses_Top (Pa)':6,
    'Stresses_Bottom':6,
    'Axial_Force':4,
    'Temperature': 1,
    // Please if you ask for something different, complete this dictionary.
}

if (resultsOfInterest == undefined) {
    console.log('No result specified, using the defaults.');
    resultsOfInterest = ["Displacements", "Shells//Stresses_Top", "Shells//Stresses_Bottom, Von_mises"];
    // resultsOfInterest = ["Displacements","Stresses_Top (Pa)","Stresses_Bottom (Pa)","Axial_Force"];
}


const Ninv = [[1.0, -1.0, 1], [1.0, 1.0, -1.0], [-1.0, 1.0, 1.0]];

const lineClasifier = (lineString) => {
    let readLine = true;
    const lineStringArray = lineString.split(" ").filter(word => word !== "");
    if (lineStringArray[0] === "Mesh") readLine = false;
    else if (lineStringArray[0] === "GiD Post Results File 1.2") readLine = false;

    return readLine;
}

const readCoordinates = (liner, nodes) => {
    let line;
    while (line = liner.next()) {
        const lineString = line.toString('ascii');
        if (lineString.slice(0, 15) === "End Coordinates") break;
        const lineStringArray = lineString.split(" ").filter(word => word !== "");
        const node = lineStringArray.slice(1).map(word => parseFloat(word));
        nodes.push(node);
    }
    return;
}

const readElements = (liner, elements) => {
    let line;
    while (line = liner.next()) {
        const lineString = line.toString('ascii');
        if (lineString.slice(0, 12) === "End Elements") break;
        const lineStringArray = lineString.split(" ").filter(word => word !== "");
        const element = lineStringArray.slice(1).map(word => parseInt(word, 10));
        elements.push(element);
    }
    return;
}

const readGaussPoints = (liner) => {
    let line;
    while (line = liner.next()) {
        const lineString = line.toString('ascii');
        if (lineString.slice(0, 15) === "End GaussPoints") break;
    }
    return;
}


var numCompOfInterest = new Array(resultsOfInterest.length).fill(0);

for (let icomp = 0; icomp < numCompOfInterest.length; icomp++) {
    numCompOfInterest[icomp] = dictCompOfInterest[resultsOfInterest[icomp]];
}
let numberOfModes = 0;

const isResultOfInterest = (resultName) => {
    return resultsOfInterest.includes(resultName);
}

const readResults = (header, liner, elements, nodalResults, elemResults, maxValues, minValues, units) => {
    const headerStringArray = header.split(" ").filter(word => word !== "");
    let mode = parseInt(headerStringArray[3]);
    let ishift = 0;
    if (isNaN(mode)) ishift=+1
    mode = parseInt(headerStringArray[3+ishift])
    // const modeAux = headerStringArray[2].slice(1, -1);
    // let mode = null;
    // if (modeAux !== "") mode = parseInt(modeAux.slice(5), 10);
    if (mode > numberOfModes) numberOfModes = mode;

    const resultName = headerStringArray[1].slice(1,).replace("\"","") // RP: before was 1,-1 but then it was Displacement instead of Displacements


    const resultTypeAux = headerStringArray[5+ishift];
    let resultType;
    if (resultTypeAux.slice(0, 7) === "OnNodes") resultType = "OnNodes";
    else if (resultTypeAux.slice(0, 13) === "OnGaussPoints") resultType = "OnGaussPoints";
    else resultType = "Not relevant";

    const lineString2 = liner.next().toString();
    const lineString2Array = lineString2.split(" ").filter(word => word !== "");
    let componentNamesArray = null;
    let resUnits = "";
    if (isResultOfInterest(resultName)) {
        if (lineString2Array[0] === "ComponentNames") {
            const componentNamesArrayAux2 = lineString2Array.map((word, index, array) => {
                if (index === (array.length - 1)) return word.slice(1, -2);
                else return word.slice(1, -1);
            });
            const index = resultsOfInterest.indexOf(resultName)
            componentNamesArray = componentNamesArrayAux2.slice(1, numCompOfInterest[index] + 1)
            const unitsLine = liner.next();
            resUnits = unitsLine.toString().split('"')[1];

        } else {
            const componentName = resultName.split("//").slice(-1);
            componentNamesArray = componentName;
            resUnits = lineString2.split('"')[1];
        }

        for (let icomp = 0; icomp < componentNamesArray.length; icomp++) {
            const fieldName = `${componentNamesArray[icomp]}__${mode}`
            if (resultType == "OnNodes" && nodalResults[fieldName] === undefined) nodalResults[fieldName] = [];
            if (resultType == "OnGaussPoints" && elemResults[fieldName] === undefined) elemResults[fieldName] = [];
            if (units[componentNamesArray[icomp]] === undefined) units[componentNamesArray[icomp]] = resUnits;
        }
    }

    // liner.next(); //Values flag // RP: It was skipping first node
    let line;
    while (line = liner.next()) {
        let boolMixMaxSave = true;
        let valueSign = 1
        let lineString = line.toString('ascii');
        if (lineString.slice(0, 10) === "End Values") break;

        if (componentNamesArray) {
            if (resultType === "OnNodes") {
                const valuesArray = lineString.split(" ").filter(word => word !== "").slice(1);
                let idx_elm=parseInt(lineString.split(" ").filter(word => word !== "").slice(0,1));
                if (elements[0][idx_elm]==undefined) boolMixMaxSave = false;
                for (let icomp = 0; icomp < componentNamesArray.length; icomp++) {
                    const fieldNameParent =componentNamesArray[icomp]
                    if (reverseField && reverseField.indexOf(fieldNameParent)>-1){
                        valueSign=-1;
                    } else { valueSign=1}
                    const fieldName = `${fieldNameParent}__${mode}`;
                    
                    let value = valueSign * parseFloat(valuesArray[icomp]);
                    if (!value || Math.abs(value) < 1.0e-30) value = 0.0;
                    if (thresholdLimits.min.field && thresholdLimits.min.value && thresholdLimits.min.field.indexOf(fieldNameParent)>-1 && value < thresholdLimits.min.value[thresholdLimits.min.field.indexOf(fieldNameParent)]) value = thresholdLimits.min.value[thresholdLimits.min.field.indexOf(fieldNameParent)];
                    if (thresholdLimits.max.field && thresholdLimits.max.value && thresholdLimits.max.field.indexOf(fieldNameParent)>-1 && value > thresholdLimits.max.value[thresholdLimits.min.field.indexOf(fieldNameParent)]) value = thresholdLimits.max.value[thresholdLimits.max.field.indexOf(fieldNameParent)];
                    nodalResults[fieldName].push(value);

                    if (boolMixMaxSave){
                        if (maxValues[fieldNameParent] === undefined) maxValues[fieldNameParent] = value;
                        if (minValues[fieldNameParent] === undefined) minValues[fieldNameParent] = value;
                        if (value > maxValues[fieldNameParent]) maxValues[fieldNameParent] = value;
                        if (value < minValues[fieldNameParent]) minValues[fieldNameParent] = value;
                    }
                }
            } else if (resultType === "OnGaussPoints") {
                const gpValuesMatrix = [];
                gpValuesMatrix[0] = lineString.split(" ").filter(word => word !== "").slice(1);
                let idx_elm=parseInt(lineString.split(" ").filter(word => word !== "").slice(0,1));
                if (elements[0][idx_elm]==undefined) boolMixMaxSave = false;
                line = liner.next()
                lineString = line.toString('ascii');
                gpValuesMatrix[1] = lineString.split(" ").filter(word => word !== "");

                line = liner.next()
                lineString = line.toString('ascii');
                gpValuesMatrix[2] = lineString.split(" ").filter(word => word !== "");

                for (let icomp = 0; icomp < componentNamesArray.length; icomp++) {
                    const fieldNameParent =componentNamesArray[icomp]
                    if (reverseField && reverseField.indexOf(fieldNameParent)>-1){
                        valueSign=-1;
                    } else {valueSign=1}
                    const fieldName = `${fieldNameParent}__${mode}`;
                    const nodalValues = [];
                    for (let inode = 0; inode < 3; inode++) {
                        nodalValues[inode] = 0.0;
                        for (let igauss = 0; igauss < 3; igauss++) {
                            let value = valueSign * parseFloat(gpValuesMatrix[igauss][icomp]);
                            if (!value || Math.abs(value) < 1.0e-30) value = 0.0;
                            if (thresholdLimits.min.field && thresholdLimits.min.value && thresholdLimits.min.field.indexOf(fieldNameParent)>-1 && value < thresholdLimits.min.value[thresholdLimits.min.field.indexOf(fieldNameParent)]) value = thresholdLimits.min.value[thresholdLimits.min.field.indexOf(fieldNameParent)];
                    if (thresholdLimits.max.field && thresholdLimits.max.value && thresholdLimits.max.field.indexOf(fieldNameParent)>-1 && value > thresholdLimits.max.value[thresholdLimits.min.field.indexOf(fieldNameParent)]) value = thresholdLimits.max.value[thresholdLimits.max.field.indexOf(fieldNameParent)];
                            nodalValues[inode] += Ninv[inode][igauss] * value;
                        }
                        if (boolMixMaxSave){
                            if (maxValues[fieldNameParent] === undefined) maxValues[fieldNameParent] = nodalValues[inode];
                            if (minValues[fieldNameParent] === undefined) minValues[fieldNameParent] = nodalValues[inode];
                            if (nodalValues[inode] > maxValues[fieldNameParent]) maxValues[fieldNameParent] = nodalValues[inode];
                            if (nodalValues[inode] < minValues[fieldNameParent]) minValues[componentNamesArray[icomp]] = nodalValues[inode];
                        }
                    }
                    for (let inode = 0; inode < 3; inode++) {
                        elemResults[fieldName].push(nodalValues[inode]);
                    }
                }
            }
        }
    }

    return;
}

const gid2json = () => {

    const linerMesh = new nReadlines(inputMeshPath);
    let line;
    let lineNumber = 0;

    const nodes = [];
    const elements = [];
    const elemResults = {};
    const nodalResults = {};
    const maxValues = {};
    const minValues = {};
    const units = {};

    // Read Mesh
    let numMeshes = 0;
    let meshName = "";
    while (line = linerMesh.next()) {
        const lineString = line.toString('ascii');
        if (lineString === "") next;
        const lineStringArray1 = lineString.split(" ").filter(word => word !== "");
        const lineStringArray2 = lineString.split('"');
        if (lineStringArray1[0] === "MESH") {
            meshName = lineStringArray2[1];
        }

        if (lineClasifier(lineString)) {
            if (lineString.slice(0, 11) === 'Coordinates' 
            // && (meshName == "Fixed constraints Auto1" || meshName == "Elastic constraints Auto1")
            ) readCoordinates(linerMesh, nodes);
            else if (lineString.slice(0, 8) === 'Elements' 
            && meshName.slice(0, 5) === "Mesh_"
            ) {
                numMeshes++;
                const indexMesh = parseInt(meshName.slice(5), 10) - 1;
                elements[indexMesh] = [];
                readElements(linerMesh, elements[indexMesh])
            }
            lineNumber++;
        }

    }

    const meshes = {
        meshes: []
    };

    const elemsConnectivities = [];
    const nodesInMesh = [];      
    for (let imesh = 0; imesh < numMeshes; imesh++) {
        let nodeCont = 0;
        elemsConnectivities[imesh] = [];
        nodesInMesh[imesh] = [];
        for (let ielem = 0; ielem < elements[imesh].length; ielem++) {
            const conectivities = elements[imesh][ielem];
            for (let inode = 0; inode < 3; inode++) {
                const node = conectivities[inode];
                const indexOfNode = nodesInMesh[imesh].indexOf(node);
                if (indexOfNode === -1) {
                    nodeCont++;
                    nodesInMesh[imesh].push(node);
                    elemsConnectivities[imesh].push(nodeCont);
                } else {
                    elemsConnectivities[imesh].push(indexOfNode+1);
                }
            }
        }

        const nodes_coords = [];
        nodesInMesh[imesh].forEach(inode => {
            const coords = nodes[inode - 1];
            for (let icoord = 0; icoord < 3; icoord++) {
                nodes_coords.push(coords[icoord]);
            }
        })

        const mesh = {
            name: `Triangles_mesh_${imesh + 1}`,
            nodes: { itemSize: 3, array: nodes_coords },
            elements: { itemSize: 3, array: elemsConnectivities[imesh] }
        }

        meshes.meshes.push(mesh);
    }
    const dataMesh = JSON.stringify(meshes);

    // Read results
    const linerResults = new nReadlines(inputResultsPath);
    while (line = linerResults.next()) {
        const lineString = line.toString('ascii');
        if (lineString === "") next;
        if (lineClasifier(lineString)) {
            if (lineString.slice(0, 11) === 'GaussPoints') readGaussPoints(linerResults);
            else if (lineString.slice(0, 6) === 'Result')
                readResults(
                    lineString,
                    linerResults,
                    elements,
                    nodalResults,
                    elemResults,
                    maxValues,
                    minValues,
                    units
                );
        }
        lineNumber++;
    }

    const resultsData = {
        metadata: {
            version: 1.0,
            resultFields: [],
            deformationFields: [
                "Disp_X",
                "Disp_Y",
                "Disp_Z"
            ]
        },
        meshResults: []

    };

    for (let imesh = 0; imesh < numMeshes; imesh++) {
        const meshResult = {
            name: `Triangles_mesh_${imesh + 1}`,
            elemConnectivities: {
                itemSize: 3,
                array: elemsConnectivities[imesh]
            },
            resultFields: {}
        }
        resultsData.meshResults.push(meshResult)
    }

    const defaultModalValues = [];
    for (let imode = 0; imode < numberOfModes; imode++) {
        if (imode === 0) defaultModalValues[imode] = 1;
        else defaultModalValues[imode] = 0;
    }
    const meshNodalResultField = {};
    const metadataNodalResultField = {};
    const resultsOnNodesFieldsArray = Object.keys(nodalResults);
    resultsOnNodesFieldsArray.forEach(modalFieldName => {
        const resultName = modalFieldName.split("__").filter(word => word !== "")[0];

        if (metadataNodalResultField[resultName] === undefined) {
            metadataNodalResultField[resultName] = {
                resultName,
                units: units[resultName],
                maxValue: maxValues[resultName],
                minValue: minValues[resultName]
            }
            resultsData.metadata.resultFields.push(metadataNodalResultField[resultName]);
        }

        if (meshNodalResultField[resultName] === undefined) {
            meshNodalResultField[resultName] = {
                numberOfModes,
                defaultModalValues,
                resultLocation: "OnNodes",
                modalValues: {}
            };
        }

        for (let imesh = 0; imesh < numMeshes; imesh++) {
            const nodalResultsInMesh = [];
            nodesInMesh[imesh].forEach(inode => {
                const nodalResult = nodalResults[modalFieldName][inode-1];
                nodalResultsInMesh.push(nodalResult)
            })
            meshNodalResultField[resultName].modalValues[modalFieldName] = {
                itemSize: 1,
                array: nodalResultsInMesh
            }

            resultsData.meshResults[imesh].resultFields[resultName] = meshNodalResultField[resultName];
        }
    });

    const meshGaussResultField = {};
    const metadataGaussNodalResultField = {};
    const resultsOnGaussPointsFieldsArray = Object.keys(elemResults);
    resultsOnGaussPointsFieldsArray.forEach(modalFieldName => {
        const resultName = modalFieldName.split("__").filter(word => word !== "")[0];

        if (metadataGaussNodalResultField[resultName] === undefined) {
            metadataGaussNodalResultField[resultName] = {
                resultName,
                units: units[resultName],
                maxValue: maxValues[resultName],
                minValue: minValues[resultName]
            }
            resultsData.metadata.resultFields.push(metadataGaussNodalResultField[resultName]);
        }

        if (meshGaussResultField[resultName] === undefined) {
            meshGaussResultField[resultName] = {
                numberOfModes,
                defaultModalValues,
                resultLocation: "OnGaussPoints",
                modalValues: {}
            };
        }

        let elementCont = 0;
        for (let imesh = 0; imesh < numMeshes; imesh++) {
            const elementResults = []
            for (let ielem = 0; ielem < elements[imesh].length; ielem++) {
                for (let inode = 0; inode < 3; inode++) {
                    const result = elemResults[modalFieldName][elementCont * 3 + inode];
                    elementResults.push(result);
                }
                elementCont++;
            }


            meshGaussResultField[resultName].modalValues[modalFieldName] = {
                itemSize: 1,
                array: elementResults
            }

            resultsData.meshResults[imesh].resultFields[resultName] = meshGaussResultField[resultName];
        }

    });

    const resultsDataString = JSON.stringify(resultsData);


    try {
        const meshesFilePath = `${directory}/${fileName}_mesh.json`
        fs.writeFileSync(meshesFilePath, dataMesh);

        const resultsFilePath = `${directory}/${fileName}_res.json`
        fs.writeFileSync(resultsFilePath, resultsDataString);
        console.log(`JSON data is saved in ${directory}.`);
    } catch (error) {
        console.error(err);
    }

}

gid2json();