const { loadPyodide } = require("pyodide");

let pyodide = null;

if (!pyodide) {
    pyodide = await loadPyodide({
        indexURL: "/usr/src/node-red/node_modules/pyodide",
        stdout: (msg) => console.log(`Pyodide: ${msg}`),
    });
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    await micropip.install('scikit-learn');
}

module.exports = pyodide;