const fs = require("fs");
const path = require('path');
const needle = require("needle");
const tf = require('@tensorflow/tfjs-node');
const { loadPyodide } = require("pyodide");

class MLModels {
    constructor() {
        this.token = "";
        this.groupId = "";
        this.mlModels = {};
        this.mlLibrary = {};
        this.pyodide = null;
    }

    async getMlModelsData() {
        const optionsToken = {
            headers: {
                "Authorization": `Bearer ${this.token}`,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            rejectUnauthorized: false
        };

        const mlModelsData = [];

        try {
            const urlMlModels = `admin_api:3200/ml_models_in_group/${this.groupId}`;
            const response = await needle('get', urlMlModels, optionsToken);
            if (response.statusCode === 200 || response.statusCode === 304) {
                const data = response.body;
                mlModelsData.push(...data);
                for (const mlModelData of mlModelsData) {
                    const MLM_Ref = mlModelData.mlModelUid;
                    if (this.mlLibrary[MLM_Ref] === undefined) {
                        this.mlLibrary[MLM_Ref] = mlModelData.mlLibrary;
                    }
                }
            }
        } catch (error) {
            console.log(`Error: The data from the machine learning models of groupId: ${this.groupId} could not be obtained`)
        }

        return mlModelsData;
    }


    async downLoadMlModelFileFromS3(mlModelId, fileName) {
        let errorMessage = null;
        let mlModelFile = null;
        const groupId = this.groupId;

        const optionsToken = {
            headers: {
                "Authorization": `Bearer ${this.token}`,
                "Content-Type": "*/*",
                "Accept": "application/json",
            },
            rejectUnauthorized: false,
            responseType: 'buffer'
        };

        try {
            const urlMlModelFile = `admin_api:3200/ml_model_download_file/${groupId}/${mlModelId}/${fileName}`;
            const response = await needle('get', urlMlModelFile, optionsToken);
            mlModelFile = response.body;
        } catch (error) {
            errorMessage = error.message;
            return [errorMessage, mlModelFile];
        }

        return [errorMessage, mlModelFile];
    }

    async getMlModelInfoList(mlModelData) {
        let errorMessage = null;
        let mlModelInfoList = null;
        const optionsToken = {
            headers: {
                "Authorization": `Bearer ${this.token}`,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            rejectUnauthorized: false
        };

        const groupId = mlModelData.groupId;
        const mlModelId = mlModelData.id;
        const urlMlModelInfoList = `admin_api:3200/ml_model_file_list/${groupId}/${mlModelId}`;
        try {
            const response = await needle('get', urlMlModelInfoList, optionsToken);
            mlModelInfoList = response.body;
            return [null, mlModelInfoList];
        } catch (error) {
            errorMessage = error.message;
            return [errorMessage, mlModelInfoList];
        }
    }

    async mlModelPredict(MLM_Ref, data, shape) {
        let output = null;
        let errorMessage = null;
        if (this.mlModels[MLM_Ref] !== undefined && this.mlLibrary[MLM_Ref] !== undefined) {
            const mlModel = this.mlModels[MLM_Ref];
            if (this.mlLibrary[MLM_Ref] === "Tensorflow") {
                try {
                    let testTensor;
                    if (shape !== undefined && Array.isArray(shape) && shape.length !== 0) {
                        testTensor = tf.tensor(data, shape)
                    } else {
                        testTensor = tf.tensor(data);
                    }
                    const prediction = mlModel.predict(testTensor);
                    output = prediction.dataSync();
                    tf.dispose(testTensor)
                    tf.dispose(prediction)
                } catch (error) {
                    errorMessage = error.message;
                    return [errorMessage, output];
                }
            } else if (this.mlLibrary[MLM_Ref] === "Scikit-learn") {
                try {
                    this.pyodide.globals.set("mlModel", mlModel);
                    this.pyodide.globals.set("data", data);
                    const result_py  = await this.pyodide.runPythonAsync(`        
                        prediction= mlModel.predict(data)
                        prediction
                    `);
                    output = parseFloat(result_py.toJs());
                    result_py.destroy();
                } catch (error) {
                    errorMessage = error.message;
                    return [errorMessage, output];
                }
            }
        }
        return [errorMessage, output]
    }

    mlModelRemove(MLM_Ref) {
        this.mlModels[MLM_Ref] = undefined;
        this.mlLibrary[MLM_Ref] = undefined;
    }

    async loadMlModels(token, groupId) {
        this.token = token;
        this.groupId = groupId;
        const mlModelsData = await this.getMlModelsData();
        if (!this.pyodide) {
            this.pyodide = await loadPyodide();
            await this.pyodide.loadPackage("micropip");
            const micropip = this.pyodide.pyimport("micropip");
            await micropip.install('scikit-learn');
        }
        if (fs.existsSync("/data/ml_models")) {
            fs.rmSync("/data/ml_models", { recursive: true });
        }
        this.mlModels = {};
        for (const mlModelData of mlModelsData) {
            const [errorMessage1, mlModelInfoList] = await this.getMlModelInfoList(mlModelData);
            if (!errorMessage1) {
                await this.getModelFromS3Async(mlModelData, mlModelInfoList);
            }
        }
    }

    async loadTensorflowModel(MLM_Ref, folder, modelJsonFileName) {
        const modelJsonPath = `${folder}/${modelJsonFileName}`;
        const url = encodeURI('file://' + modelJsonPath);
        try {
            const modelJsondata = fs.readFileSync(modelJsonPath);
            const modelJsonObj = JSON.parse(modelJsondata);
            let mlModel = null;
            if (modelJsonObj.format === "graph-model") {
                mlModel = await tf.loadGraphModel(url);
            } else if (modelJsonObj.format === "layers-model") {
                mlModel = await tf.loadLayersModel(url);
            }
            if (mlModel) {
                this.mlModels[MLM_Ref] = mlModel;
            } else {
                this.mlModels[MLM_Ref] = undefined;
            }
        } catch (error) {
            this.mlModels[MLM_Ref] = undefined;
        }
    }

    async loadScikitlearnModel(MLM_Ref, folder, pickleFileName) {
        const modelPicklePath = `${folder}/${pickleFileName}`;
        try {
            const modelPickleData = fs.readFileSync(modelPicklePath);
            this.pyodide.FS.writeFile("./model.pkl", modelPickleData);
            const mlModel = await this.pyodide.runPythonAsync(`
                import joblib     
                mlModel = joblib.load("./model.pkl")
                mlModel
            `);
            if (mlModel) {
                this.mlModels[MLM_Ref] = mlModel;
            } else {
                this.mlModels[MLM_Ref] = undefined;
            }
        } catch (error) {
            this.mlModels[MLM_Ref] = undefined;
        }
    }

    async getModelFromS3Async(mlModelData, mlModelInfoList) {
        const MLM_Ref = mlModelData.mlModelUid;
        const mlModelId = mlModelData.id;
        const folder = `/data/ml_models/${MLM_Ref}`;
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true });
        }
        let modelJsonFileName = "";
        let pickleFileName = "";
        for (const infoItem of mlModelInfoList) {
            const fileName = infoItem.fileName.split("/")[4];

            if (mlModelData.mlLibrary === "Tensorflow") {
                const fileNameLength = fileName.length;
                const fileExtension = fileName.slice(fileNameLength - 4);
                if (fileExtension === "json") {
                    modelJsonFileName = fileName;
                }
            } else if (mlModelData.mlLibrary === "Scikit-learn") {
                const fileNameLength = fileName.length;
                const fileExtension = fileName.slice(fileNameLength - 3);
                if (fileExtension === "pkl") {
                    pickleFileName = fileName;
                }
            }

            const [errorMessage, data] = await this.downLoadMlModelFileFromS3(mlModelId, fileName);
            if (errorMessage) {
                console.log("errorMessage 1=", errorMessage)
                return;
            }
            const filePath = `${folder}/${fileName}`;
            fs.writeFileSync(filePath, data);
        }

        if (mlModelData.mlLibrary === "Tensorflow") {
            await this.loadTensorflowModel(MLM_Ref, folder, modelJsonFileName);
        } else if (mlModelData.mlLibrary === "Scikit-learn") {
            await this.loadScikitlearnModel(MLM_Ref, folder, pickleFileName);
        }
    }

    async loadMlModelsFromFileSystem() {
        if (!this.pyodide) {
            this.pyodide = await loadPyodide();
            await this.pyodide.loadPackage("micropip");
            const micropip = this.pyodide.pyimport("micropip");
            await micropip.install('scikit-learn');
        }

        const MLM_Refs = fs.readdirSync("/data/ml_models", { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        this.mlModels = {};

        for (const MLM_Ref of MLM_Refs) {
            const folder = `/data/ml_models/${MLM_Ref}`;
            const folderFiles = fs.readdirSync(folder);
            const modelJsonFileName = folderFiles.filter(e => path.extname(e).toLowerCase() === '.json')[0];
            const pickleFileName = folderFiles.filter(e => path.extname(e).toLowerCase() === '.pkl')[0];

            if (modelJsonFileName) {
                await this.loadTensorflowModel(MLM_Ref, folder, modelJsonFileName);
                if (this.mlLibrary[MLM_Ref] === undefined) {
                    this.mlLibrary[MLM_Ref] = "Tensorflow";
                }
            }

            if (pickleFileName) {
                await this.loadScikitlearnModel(MLM_Ref, folder, pickleFileName);
                if (this.mlLibrary[MLM_Ref] === undefined) {
                    this.mlLibrary[MLM_Ref] = "Scikit-learn";
                }
            }

        }
    }
}

module.exports = MLModels;