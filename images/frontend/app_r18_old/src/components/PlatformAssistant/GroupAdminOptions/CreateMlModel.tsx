import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { nanoid } from "nanoid";
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import {
    axiosAuth,
    getDomainName,
    getProtocol,
} from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { ML_MODELS_OPTIONS } from '../Utils/platformAssistantOptions';
import { useFilePicker } from 'use-file-picker';
import formatDateString from '../../../tools/formatDate';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { setMlModelsOptionToShow, useMlModelsDispatch } from '../../../contexts/mlModelsOptions';

const FormContainer = styled.div`
	font-size: 12px;
    padding: 30px 20px 30px 20px;
    border: 3px solid #3274d9;
    border-radius: 20px;
    width: 400px;
    height: calc(100vh - 300px);

    form > div:nth-child(2) {
        margin-right: 10px;
    }
`;

const ControlsContainer = styled.div`
    height: calc(100vh - 435px);
    width: 100%;
    padding: 0px 5px;
    overflow-y: auto;
    /* width */
    ::-webkit-scrollbar {
        width: 10px;
    }

    /* Track */
    ::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    
    /* Handle */
    ::-webkit-scrollbar-thumb {
        background: #2c3235; 
        border-radius: 5px;
    }

    /* Handle on hover */
    ::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }

    div:first-child {
        margin-top: 0;
    }

    div:last-child {
        margin-bottom: 3px;
    }
`;

const DataFileTitle = styled.div`
    margin-bottom: 5px;
`;

const DataFileContainer = styled.div`
    border: 2px solid #2c3235;
    border-radius: 10px;
    padding: 10px;
    width: 100%;
    margin-bottom: 20px;
`;

const SelectDataFilesButtonContainer = styled.div`
    display: flex;
    margin-bottom: 10px;
    flex-direction: row;
    justify-content: center;
	align-items: center;
    background-color: #202226;
    width: 100%;
`;

const FileButton = styled.button`
	background-color: #3274d9;
	padding: 5px 10px;
    margin: 5px 10px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
    font-size: 14px;
    width: 40%;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}
`;

const MlModelFileName = styled.div`
    margin: 20px 0;

    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;

    & label {
        font-size: 12px;
        margin: 0 0 5px 3px;
        width: 100%;
    }

    & div {
        font-size: 14px;
        background-color: #0c0d0f;
        border: 2px solid #2c3235;
        padding: 5px;
        margin-left: 2px;
        color: white;
        width: 100%;

        &:focus {
            outline: none;
            box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
        }
    }
`;


const selectFile = (openFileSelector: () => void, clear: () => void) => {
    clear();
    openFileSelector();
}

const domainName = getDomainName();
const protocol = getProtocol();

const initialMlModelData = {
    groupId: "",
    mlModelUid: `MLM_${nanoid(20).replace(/-/g, "x").replace(/_/g, "X")}`,
    description: ""
}


interface CreateMlModelProps {
    backToTable: () => void;
    refreshMlModels: () => void;
}

const CreateMlModel: FC<CreateMlModelProps> = ({ backToTable, refreshMlModels }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const mlModelsDispatch = useMlModelsDispatch();
    const [localMlModelFilesLoaded, setLocalMlModelFilesLoaded] = useState(false);
    const [modelJsonFile, setModelJsonFile] = useState<File | null>(null);
    const [modelJsonFileName, setModelJsonFileName] = useState("-");
    const [modelJsonFileLastModif, setModelJsonFileLastModif] = useState("-");
    const [localMlModelFilesLabel, setLocalMlModelFilesLabel] = useState("Select ML model files");
    const [modelBinFiles, setModelBinFiles] = useState<File[]>([]);
    const [modelBinFileNames, setModelBinFileNames] = useState<string[]>([]);

    const {
        openFilePicker: openMlModelFilesSelector,
        filesContent: mlModelFilesParamsFilesContent,
        loading: mlModelFilesParamsLoading,
        plainFiles: mlModelFilesParamsPlainFiles,
        clear: mlModelFilesParamsClear,
    } = useFilePicker({
        readAs: 'Text',
        multiple: true,
        accept: ['.json', '.bin']
    });

    useEffect(() => {
        if (
            !mlModelFilesParamsLoading &&
            mlModelFilesParamsFilesContent.length !== 0 &&
            mlModelFilesParamsPlainFiles.length !== 0
        ) {
            setLocalMlModelFilesLoaded(true)
            setLocalMlModelFilesLabel("Add files data");
        }
    }, [mlModelFilesParamsLoading, mlModelFilesParamsFilesContent, mlModelFilesParamsPlainFiles])

    const onSubmit = (values: any, actions: any) => {
        const groupId = values.groupId;
        const url = `${protocol}://${domainName}/admin_api/ml_model/${groupId}`;
        const config = axiosAuth(accessToken);;

        const mlModelData = {
            description: values.description,
            mlModelUid: values.mlModelUid,
        }

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, mlModelData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const mlModelsOptionToShow = { mlModelsOptionToShow: ML_MODELS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setMlModelsOptionToShow(mlModelsDispatch, mlModelsOptionToShow);

                const configMultipart = axiosAuth(accessToken, "multipart/form-data")
                const urlUploadMlModelBase0 = `${protocol}://${domainName}/admin_api/ml_model_upload_file`;
                const urlUploadMlModelBase = `${urlUploadMlModelBase0}/${groupId}/${data.mlModelId}`;

                if (modelJsonFile && modelBinFiles.length !== 0) {
                    const modelJsonFileData = new FormData();
                    modelJsonFileData.append("file", modelJsonFile as File, modelJsonFileName);
                    const urlUploadModelJsonFile = `${urlUploadMlModelBase}/${modelJsonFileName}`;
                    getAxiosInstance(refreshToken, authDispatch)
                        .post(urlUploadModelJsonFile, modelJsonFileData, configMultipart)
                        .then((response) => {
                            toast.success(response.data.message);
                        })
                        .catch((error) => {
                            axiosErrorHandler(error, authDispatch);
                            backToTable();
                        })

                    for (let ifile = 0; ifile < modelBinFiles.length; ifile++) {
                        const modelBinFileData = new FormData();
                        modelBinFileData.append("file", modelBinFiles[ifile] as File, modelBinFileNames[ifile]);
                        const urlUploadModelBinFile = `${urlUploadMlModelBase}/${modelBinFileNames[ifile]}`;
                        getAxiosInstance(refreshToken, authDispatch)
                            .post(urlUploadModelBinFile, modelBinFileData, configMultipart)
                            .then((response) => {
                                toast.success(response.data.message);
                            })
                            .catch((error) => {
                                axiosErrorHandler(error, authDispatch);
                                backToTable();
                            })
                    }
                }
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshMlModels();
            })
    }

    const validationSchema = Yup.object().shape({
        groupId: Yup.number().required('Required'),
        mlModelUid: Yup.string().matches(/^MLM_.{20}$/, "String must be 24 characters long and start with 'MLM'").required('Required'),
        description: Yup.string().required('Required')
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create ML model</FormTitle>
            <FormContainer>
                <Formik initialValues={initialMlModelData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => {
                            const clearMlModelFiles = () => {
                                setLocalMlModelFilesLabel("Select ML model files");
                                setModelJsonFile(null);
                                setModelJsonFileName("-");
                                setModelJsonFileLastModif("-");
                                setModelBinFiles([]);
                                setModelBinFileNames([]);
                                mlModelFilesParamsClear();
                                setLocalMlModelFilesLoaded(false);
                            }

                            const localMlModelFilesButtonHandler = async () => {
                                if (!localMlModelFilesLoaded) {
                                    selectFile(openMlModelFilesSelector, mlModelFilesParamsClear);
                                } else {
                                    try {
                                        const filesContent = mlModelFilesParamsFilesContent;
                                        const files = mlModelFilesParamsPlainFiles;
                                        let binFilesNum = 0;
                                        const modelBinFiles = [];
                                        const modelBinFileNames: string[] = [];
                                        for (let ifile = 0; ifile < files.length; ifile++) {
                                            const fileName = files[ifile].name;
                                            const fileNameLength = fileName.length;
                                            const fileExtension = fileName.slice(fileNameLength - 4, fileNameLength);
                                            if (fileExtension === "json") {
                                                const fileObj = JSON.parse(filesContent[ifile].content);
                                                if (
                                                    fileObj.weightsManifest !== undefined &&
                                                    fileObj.weightsManifest.length !== 0 &&
                                                    fileObj.weightsManifest[0].paths !== undefined &&
                                                    fileObj.weightsManifest[0].paths.length !== 0
                                                ) {
                                                    binFilesNum = fileObj.weightsManifest[0].paths.length;
                                                } else {
                                                    throw new Error('The entered json file does not correspond to an ML model');
                                                }
                                                setModelJsonFile(files[ifile]);
                                                setModelJsonFileName(fileName);
                                                const dateString = formatDateString((files[ifile] as any).lastModified);
                                                setModelJsonFileLastModif(dateString);
                                            } else {
                                                modelBinFiles.push(files[ifile]);
                                                modelBinFileNames.push(fileName);
                                            }
                                        }
                                        if (binFilesNum !== modelBinFiles.length) {
                                            throw new Error('Missing to introduce some bin shard file');
                                        }
                                        if (modelBinFiles.length !== 0 && modelBinFileNames.length !== 0) {
                                            setModelBinFiles(modelBinFiles);
                                            modelBinFileNames.sort();
                                            setModelBinFileNames(modelBinFileNames);
                                        }

                                        setLocalMlModelFilesLabel("Select ML model files");
                                        mlModelFilesParamsClear();
                                    } catch (error) {
                                        if (error instanceof Error) {
                                            toast.error(`Invalid ML model files: ${error.message}`);
                                        } else {
                                            toast.error("Invalid ML model files");
                                        }
                                        clearMlModelFiles();
                                    }
                                }
                            }

                            return (
                                <Form>
                                    <ControlsContainer>
                                        <FormikControl
                                            control='input'
                                            label='GroupId'
                                            name='groupId'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='ML model Uid'
                                            name='mlModelUid'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='Description'
                                            name='description'
                                            type='text'
                                        />
                                        <DataFileTitle>ML model files</DataFileTitle>
                                        <DataFileContainer>
                                            <MlModelFileName>
                                                <label>Model json file name:</label>
                                                <div>{modelJsonFileName}</div>
                                            </MlModelFileName>
                                            <MlModelFileName>
                                                <label>Model json file last modification date:</label>
                                                <div>{modelJsonFileLastModif}</div>
                                            </MlModelFileName>
                                            {modelBinFileNames.map((fileName: any, index: number) => (
                                                <MlModelFileName key={`${fileName}_${index}`}>
                                                    <label>Shard {index + 1} of {modelBinFileNames.length}:</label>
                                                    <div>{fileName}</div>
                                                </MlModelFileName>
                                            ))}
                                            <SelectDataFilesButtonContainer >
                                                <FileButton
                                                    type='button'
                                                    onClick={clearMlModelFiles}
                                                >
                                                    Clear
                                                </FileButton>
                                                <FileButton
                                                    type='button'
                                                    onClick={() => localMlModelFilesButtonHandler()}
                                                >
                                                    {localMlModelFilesLabel}
                                                </FileButton>
                                            </SelectDataFilesButtonContainer>
                                        </DataFileContainer>
                                    </ControlsContainer>
                                    <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting} />
                                </Form>
                            )
                        }
                    }
                </Formik>
            </FormContainer>
        </>
    )
}

export default CreateMlModel;