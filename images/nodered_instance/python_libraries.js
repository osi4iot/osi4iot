async function PythonLibraries(pyodide) {
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    const libraryList = [];

    const loadLibrary = async (nameList) => {
        for (const name of nameList) {
            if (libraryList.indexOf(name) === -1) {
                await micropip.install(name);
                libraryList.push(name);
            }
        }
    }
    return {
        loadLibrary
    }
}

export default PythonLibraries;