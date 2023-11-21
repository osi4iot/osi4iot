const { loadPyodide } = require("pyodide");

const initPyodide = async () => {
    const pyodide = await loadPyodide();
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    await micropip.install('scikit-learn');
    return pyodide;
}


module.exports = initPyodide;