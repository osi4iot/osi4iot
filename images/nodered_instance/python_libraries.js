const PythonLibraries = async (pyodide) => {
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    const libraryList = ['scikit-learn'];

    const load = async (nameList) => {
        if (Array.isArray(nameList)) {
            for (const  libraryName of nameList) {
                if (libraryList.indexOf(libraryName) === -1) {
                    try {
                        await micropip.install(libraryName);
                        libraryList.push(libraryName);
                    } catch (err) {
                        console.log(`Error: Python library '${libraryName}' is unknown.`);
                    }
                }
            }
        } else {
            console.log("Error: The load function argument must be an array of string.")
        }
    }

    const purge = () => {
        while (libraryList.length !== 0) libraryList.pop();
    }

    return {
        load,
        purge
    }
}

module.exports = PythonLibraries;