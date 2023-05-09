const fs = require("fs");
const path = require('path');
const needle = require("needle");
const tf = require('@tensorflow/tfjs-node');

class MLModels {
    constructor() {
        this.token = "";
        this.groupId = "";
        this.mlModels = {};
        this.mlModelsData = [];
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

        try {
            const urlMlModels = `admin_api:3200/ml_models_in_group/${this.groupId}`;
            const response = await needle('get', urlMlModels, optionsToken);
            if (!(response.statusCode === 200 || response.statusCode === 304)) {
                this.mlModelsData = [];
            } else {
                const mlModelsData = response.body;
                this.mlModelsData.push(...mlModelsData)
            }
        } catch (error) {
            this.mlModelsData = [];
        }
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

    async getModelFromS3Async(mlModelData, mlModelInfoList) {
        const MLM_Ref = mlModelData.mlModelUid;
        const mlModelId = mlModelData.id;
        const folder = `/data/ml_models/${MLM_Ref}`;
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true });
        }
        let modelJsonFileName = "";
        for (const infoItem of mlModelInfoList) {
            const fileName = infoItem.fileName.split("/")[4];

            const fileNameLength = fileName.length;
            const fileExtension = fileName.slice(fileNameLength - 4, fileNameLength);
            if (fileExtension === "json") {
                modelJsonFileName = fileName;
            }

            const [errorMessage, data] = await this.downLoadMlModelFileFromS3(mlModelId, fileName);
            if (errorMessage) {
                console.log("errorMessage 1=", errorMessage)
                return;
            }
            const filePath = `${folder}/${fileName}`;
            fs.writeFileSync(filePath, data);
        }

        const modelJsonPath = `${folder}/${modelJsonFileName}`;
        const url = encodeURI('file://' + modelJsonPath);
        try {
            const modelJsondata = fs.readFileSync(modelJsonPath);
            const modelJsonObj = JSON.parse(modelJsondata);
            let mlModel = null;
            if (modelJsonObj.format === "graph-model") {
                mlModel = await tf.loadGraphModel(url);
            } else if(modelJsonObj.format === "layers-model") {
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

    mlModelPredict(MLM_Ref, data, shape) {
        let output = null;
        let errorMessage = null;
        if (this.mlModels[MLM_Ref] !== undefined) {
            const mlModel = this.mlModels[MLM_Ref];
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
        }
        return [errorMessage, output]
    }

    mlModelRemove(MLM_Ref) {
        this.mlModels[MLM_Ref] = undefined;
    }


    async loadMlModels(token, groupId) {
        this.token = token;
        this.groupId = groupId;
        await this.getMlModelsData();
        if (fs.existsSync("/data/ml_models")) {
            fs.rmSync("/data/ml_models", { recursive: true });
        }
        this.mlModels = {};
        for (const mlModelData of this.mlModelsData) {
            const [errorMessage1, mlModelInfoList] = await this.getMlModelInfoList(mlModelData);
            if (!errorMessage1) {
                await this.getModelFromS3Async(mlModelData, mlModelInfoList);
            }
        }
    }

    async loadMlModelsFromFileSystem() {
        const MLM_Refs = fs.readdirSync("/data/ml_models", { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        this.mlModels = {};
        for (const MLM_Ref of MLM_Refs) {
            const folder = `/data/ml_models/${MLM_Ref}`;
            const modelJsonFileName = fs.readdirSync(folder)
                .filter(e => path.extname(e).toLowerCase() === '.json')[0];
            const modelJsonPath = `${folder}/${modelJsonFileName}`;
            const url = encodeURI('file://' + modelJsonPath);
            try {
                const modelJsondata = fs.readFileSync(modelJsonPath);
                const modelJsonObj = JSON.parse(modelJsondata);
                let mlModel = null;
                if (modelJsonObj.format === "graph-model") {
                    mlModel = await tf.loadGraphModel(url);
                } else if(modelJsonObj.format === "layers-model") {
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
    }
}

module.exports = MLModels;