const initPyodide = require('./pyodide_init');
const MLModels = require('./ml_models');
const PythonLibraries = require('./python_libraries');

const initialization = async (token, groupId) => {
    //Init pyodide
    const pyodide = await initPyodide();

    //Inite pythonLibraries
    const pythonLibraries = await PythonLibraries(pyodide);

    //Init mlModels
    const mlModels = new MLModels();

    if (token !== "" && groupId !== "0") {
        await mlModels.loadMlModels(token, groupId, pyodide);
    } else {
        await mlModels.loadMlModelsFromFileSystem(pyodide);
    }

    return [pyodide, pythonLibraries, mlModels];
}

module.exports = initialization;