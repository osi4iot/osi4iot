import nReadlines from 'n-readlines';
import fs from 'fs';
// import process from 'process';


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

// const resultsOfInterest = ["Displacements", "Shells//Stresses_Top//Von_mises"];
const resultsOfInterest = ["Displacements", "Shells//Stresses_Top", "Shells//Stresses_Bottom"];
// const numCompOfInterest = [3, 1];
const numCompOfInterest = [3, 1, 1];
let numberOfModes = 0;

const isResultOfInterest = (resultName) => {
    return resultsOfInterest.includes(resultName);
}

const readResults = (header, liner, elements, nodalResults, elemResults, maxValues, minValues, units) => {
    const headerStringArray = header.split(" ").filter(word => word !== "");
    const modeAux = headerStringArray[2].slice(1, -1);
    let mode = null;
    if (modeAux !== "") mode = parseInt(modeAux.slice(5), 10);
    if (mode > numberOfModes) numberOfModes = mode;

    const resultName = headerStringArray[1].slice(1, -1);

    const resultTypeAux = headerStringArray[5];
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

    liner.next(); //Values flag
    let line;
    while (line = liner.next()) {
        let lineString = line.toString('ascii');
        if (lineString.slice(0, 10) === "End Values") break;

        if (componentNamesArray) {
            if (resultType === "OnNodes") {
                const valuesArray = lineString.split(" ").filter(word => word !== "").slice(1);
                for (let icomp = 0; icomp < componentNamesArray.length; icomp++) {
                    const fieldName = `${componentNamesArray[icomp]}__${mode}`;
                    let value = parseFloat(valuesArray[icomp]);
                    if (!value || Math.abs(value) < 1.0e-30) value = 0.0;
                    nodalResults[fieldName].push(value);

                    if (maxValues[componentNamesArray[icomp]] === undefined) maxValues[componentNamesArray[icomp]] = value;
                    if (minValues[componentNamesArray[icomp]] === undefined) minValues[componentNamesArray[icomp]] = value;
                    if (value > maxValues[componentNamesArray[icomp]]) maxValues[componentNamesArray[icomp]] = value;
                    if (value < minValues[componentNamesArray[icomp]]) minValues[componentNamesArray[icomp]] = value;
                }
            } else if (resultType === "OnGaussPoints") {
                const gpValuesMatrix = [];
                gpValuesMatrix[0] = lineString.split(" ").filter(word => word !== "").slice(1);

                line = liner.next()
                lineString = line.toString('ascii');
                gpValuesMatrix[1] = lineString.split(" ").filter(word => word !== "");

                line = liner.next()
                lineString = line.toString('ascii');
                gpValuesMatrix[2] = lineString.split(" ").filter(word => word !== "");

                for (let icomp = 0; icomp < componentNamesArray.length; icomp++) {
                    const fieldName = `${componentNamesArray[icomp]}__${mode}`;
                    const nodalValues = [];
                    for (let inode = 0; inode < 3; inode++) {
                        nodalValues[inode] = 0.0;
                        for (let igauss = 0; igauss < 3; igauss++) {
                            let value = parseFloat(gpValuesMatrix[igauss][icomp]);
                            if (!value || Math.abs(value) < 1.0e-30) value = 0.0;
                            nodalValues[inode] += Ninv[inode][igauss] * value;
                        }
                        if (maxValues[componentNamesArray[icomp]] === undefined) maxValues[componentNamesArray[icomp]] = nodalValues[inode];
                        if (minValues[componentNamesArray[icomp]] === undefined) minValues[componentNamesArray[icomp]] = nodalValues[inode];
                        if (nodalValues[inode] > maxValues[componentNamesArray[icomp]]) maxValues[componentNamesArray[icomp]] = nodalValues[inode];
                        if (nodalValues[inode] < minValues[componentNamesArray[icomp]]) minValues[componentNamesArray[icomp]] = nodalValues[inode];

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
    // console.log(process.cwd());
    // process.chdir('D:/documents/software/dropbox/Dropbox/Work/Project/Fibre4Yards/GIT/osi4iot/osi4iot-master/utils/gid2json/projects/galga_montaje_simple.gid'); // Only if debug
    // console.log(process.cwd());
    // const inputMeshPath = './projects/montaje_galgas/montaje_galgas.post.msh'
    // const inputResultsPath = './projects/montaje_galgas/montaje_galgas.post.res'

    const rootFolder = 'D:/documents/software/dropbox/Dropbox/Work/Project/Fibre4Yards/GIT/osi4iot/osi4iot-master/utils/gid2json/'

    const inputMeshPath = rootFolder+'projects/galga_montaje.gid/galga_montaje.post.msh'
    const inputResultsPath = rootFolder+'projects/galga_montaje.gid/galga_montaje.post.res'

    const inputDataPathArray = inputMeshPath.split('/');
    const directory = inputDataPathArray.slice(0, -1).join('/');
    const fileName = inputDataPathArray[inputDataPathArray.length - 1].split('.')[0];

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
        console.log("JSON data is saved.");
    } catch (error) {
        console.error(err);
    }

}

gid2json();