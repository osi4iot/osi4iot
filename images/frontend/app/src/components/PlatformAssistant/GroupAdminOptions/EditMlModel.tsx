import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { useFilePicker } from 'use-file-picker';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { ML_MODELS_OPTIONS } from '../Utils/platformAssistantOptions';
import Loader from '../../Tools/Loader';
import formatDateString from '../../../tools/formatDate';
import { setReloadDashboardsTable, setReloadTopicsTable, useGroupsManagedTable, useOrgsOfGroupsManagedTable, usePlatformAssitantDispatch } from '../../../contexts/platformAssistantContext';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { IMlModel } from '../TableColumns/mlModelsColumns';
import { setMlModelsOptionToShow, useMlModelIdToEdit, useMlModelRowIndexToEdit, useMlModelsDispatch } from '../../../contexts/mlModelsOptions';
import { MlModelFileName } from './CreateMlModel';
import { FieldContainer } from './EditAsset';
import { ControlsContainer, FormContainer } from './CreateAsset';

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

const MlModelField = styled.div`
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

const mlLibrariesOptions = [
    {
        label: "Tensorflow",
        value: "Tensorflow"
    },
    {
        label: "Scikit-learn",
        value: "Scikit-learn"
    }
];

const selectFile = (openFileSelector: () => void, clear: () => void) => {
    clear();
    openFileSelector();
}

interface InitialMLModelData {
    description: string;
    mlLibrary: string;
}

type FormikType = FormikProps<InitialMLModelData>


const domainName = getDomainName();
const protocol = getProtocol();

interface EditMlModelProps {
    mlModels: IMlModel[];
    backToTable: () => void;
    refreshMlModels: () => void;
}

const EditMlModel: FC<EditMlModelProps> = ({ mlModels, backToTable, refreshMlModels }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const mlModelsDispatch = useMlModelsDispatch();
    const mlModelRowIndex = useMlModelRowIndexToEdit();
    const mLModelId = useMlModelIdToEdit();
    const groupId = mlModels[mlModelRowIndex].groupId;
    const groupsManaged = useGroupsManagedTable();
    const group = groupsManaged.filter(groupManaged => groupManaged.id === groupId)[0];
    const groupAcronym = group.acronym;
    const orgsOfGroupsManaged = useOrgsOfGroupsManagedTable();
    const organization = orgsOfGroupsManaged.filter(org => org.id === group.orgId)[0];
    const orgAcronym = organization.acronym;
    const [mLModelDataLoading, setMlModelDataLoading] = useState(true);
    const [areMlModelFilesModified, setAreMlModelFilesModified] = useState(false);

    const [tensorflowLocalFilesLoaded, setTensorflowLocalFilesLoaded] = useState(false);
    const [tensorflowJsonFile, setTensorflowJsonFile] = useState<File | null>(null);
    const [tensorflowJsonFileName, setTensorflowJsonFileName] = useState("-");
    const [tensorflowJsonFileLastModif, setTensorflowJsonFileLastModif] = useState("-");
    const [tensorflowBinFiles, setTensorflowBinFiles] = useState<File[]>([]);
    const [tensorflowBinFileNames, setTensorflowBinFileNames] = useState<string[]>([]);
    const [scikitLearnLocalFilesLoaded, setScikitLearnLocalFilesLoaded] = useState(false);
    const [scikitLearnPickleFile, setScikitLearnPickleFile] = useState<File | null>(null);
    const [scikitLearnPickleFileName, setScikitLearnPickleFileName] = useState("-");
    const [scikitLearnPickleFileLastModif, setScikitLearnPickleFileLastModif] = useState("-");
    const [mlLibrary, setMlLibrary] = useState(mlModels[mlModelRowIndex].mlLibrary);

    useEffect(() => {
        const config = axiosAuth(accessToken);
        const urlMlModelFileListBase0 = `${protocol}://${domainName}/admin_api/ml_model_file_list`;
        const urlMlModelFileList = `${urlMlModelFileListBase0}/${groupId}/${mLModelId}`;
        getAxiosInstance(refreshToken, authDispatch)
            .get(urlMlModelFileList, config)
            .then((response) => {
                const mlModelFilesInfo = response.data;
                if (mlModelFilesInfo.length !== 0) {
                    const modelBinFileNames: string[] = [];
                    for (const fileInfo of mlModelFilesInfo) {
                        const fileName = fileInfo.fileName.split("/")[4] as string;
                        const fileNameLength = fileName.length;
                        const dateString = formatDateString(fileInfo.lastModified);
                        if (fileName.slice(fileNameLength - 4) === "json") {
                            setTensorflowJsonFileName(fileName);
                            setTensorflowJsonFileLastModif(dateString);
                        } else if (fileName.slice(fileNameLength - 3) === "pkl") {
                            setScikitLearnPickleFileName(fileName);
                            setScikitLearnPickleFileLastModif(dateString);
                        }
                        else {
                            modelBinFileNames.push(fileName);
                        }
                    }
                    if (modelBinFileNames.length !== 0) {
                        modelBinFileNames.sort();
                        setTensorflowBinFileNames(modelBinFileNames);
                    }
                    setMlModelDataLoading(false);
                    setIsSubmitting(false);
                } else {
                    setMlModelDataLoading(false);
                    setIsSubmitting(false);
                }
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                setMlModelDataLoading(false);
            })
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        backToTable,
        groupId,
        mLModelId
    ])

    const onMlLibrarySelectChange = (e: { value: string }, formik: FormikType) => {
        setMlLibrary(e.value);
        formik.setFieldValue("mlLibrary", e.value)
    }

    const [openTensorflowFilesSelector, tensorflowFilesParams] = useFilePicker({
        readAs: 'Text',
        multiple: true,
        accept: ['.json', '.bin']
    });

    const clearTensorflowDataFile = () => {
        setTensorflowLocalFilesLoaded(false);
        setTensorflowJsonFile(null);
        setTensorflowJsonFileName("-");
        setTensorflowJsonFileLastModif("-");
        setTensorflowBinFiles([]);
        setTensorflowBinFileNames([]);
        tensorflowFilesParams.clear();
    }

    useEffect(() => {
        if (
            !tensorflowFilesParams.loading &&
            tensorflowFilesParams.filesContent.length !== 0 &&
            tensorflowFilesParams.plainFiles.length !== 0
        ) {
            try {
                const filesContent = tensorflowFilesParams.filesContent;
                const files = tensorflowFilesParams.plainFiles;
                let binFilesNum = 0;
                const modelBinFiles = [];
                const modelBinFileNames: string[] = [];
                for (let ifile = 0; ifile < files.length; ifile++) {
                    const fileName = files[ifile].name;
                    const fileNameLength = fileName.length;
                    const fileExtension = fileName.slice(fileNameLength - 4);
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
                        setTensorflowJsonFile(files[ifile]);
                        setTensorflowJsonFileName(fileName);
                        const dateString = formatDateString((files[ifile] as any).lastModified);
                        setTensorflowJsonFileLastModif(dateString);
                    } else {
                        modelBinFiles.push(files[ifile]);
                        modelBinFileNames.push(fileName);
                    }
                }
                if (binFilesNum !== modelBinFiles.length) {
                    throw new Error('Missing to introduce some bin shard file');
                }
                if (modelBinFiles.length !== 0 && modelBinFileNames.length !== 0) {
                    setTensorflowBinFiles(modelBinFiles);
                    modelBinFileNames.sort();
                    setTensorflowBinFileNames(modelBinFileNames);
                }
                setTensorflowLocalFilesLoaded(true);
                setAreMlModelFilesModified(true);
                tensorflowFilesParams.clear();
            } catch (error) {
                if (error instanceof Error) {
                    toast.error(`Invalid Tensorflow ML model files: ${error.message}`);
                } else {
                    toast.error("Invalid Tensorflow ML model files");
                }
                setAreMlModelFilesModified(false);
                setTensorflowLocalFilesLoaded(false);
                setTensorflowJsonFile(null);
                setTensorflowJsonFileName("-");
                setTensorflowJsonFileLastModif("-");
                setTensorflowBinFiles([]);
                setTensorflowBinFileNames([]);
                tensorflowFilesParams.clear();
            }
        }
    }, [
        tensorflowFilesParams.loading,
        tensorflowFilesParams.filesContent,
        tensorflowFilesParams.plainFiles,
        tensorflowFilesParams,
    ])

    const tensorflowFileButtonHandler = () => {
        if (!tensorflowLocalFilesLoaded) {
            selectFile(openTensorflowFilesSelector, tensorflowFilesParams.clear);
        }
    }

    const [openScikitLearnFileSelector, scikitLearnFileParams] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: ['.pkl']
    });

    const clearScikitLearnDataFile = () => {
        setScikitLearnLocalFilesLoaded(false);
        setScikitLearnPickleFile(null);
        setScikitLearnPickleFileName("-");
        setScikitLearnPickleFileLastModif("-");
        scikitLearnFileParams.clear();
    }

    const scikitLearnFileButtonHandler = () => {
        if (!scikitLearnLocalFilesLoaded) {
            selectFile(openScikitLearnFileSelector, scikitLearnFileParams.clear);
        }
    }

    useEffect(() => {
        if (
            !scikitLearnFileParams.loading &&
            scikitLearnFileParams.filesContent.length !== 0 &&
            scikitLearnFileParams.plainFiles.length !== 0
        ) {
            try {
                const files = scikitLearnFileParams.plainFiles;
                const pickleFileName = files[0].name;
                setScikitLearnPickleFileName(pickleFileName);
                const dateString = formatDateString((files[0] as any).lastModified);
                setScikitLearnPickleFileLastModif(dateString);
                setScikitLearnPickleFile(files[0]);
                setScikitLearnLocalFilesLoaded(true);
                setAreMlModelFilesModified(true);
                scikitLearnFileParams.clear();
            } catch (error) {
                if (error instanceof Error) {
                    toast.error(`Invalid Scikit-Learn ML model files: ${error.message}`);
                } else {
                    toast.error("Invalid Scikit-Learn ML model files");
                }
                setAreMlModelFilesModified(false);
                setScikitLearnLocalFilesLoaded(false);
                setScikitLearnPickleFile(null);
                setScikitLearnPickleFileName("-");
                setScikitLearnPickleFileLastModif("-");
                scikitLearnFileParams.clear();
            }
        }
    }, [
        scikitLearnFileParams.loading,
        scikitLearnFileParams.plainFiles,
        scikitLearnFileParams,
    ])

    const onSubmit = async (values: any, actions: any) => {
        const groupId = mlModels[mlModelRowIndex].groupId;
        const updateUrl = `${protocol}://${domainName}/admin_api/ml_model/${groupId}/id/${mLModelId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        try {
            const mlModelData = {
                description: values.description,
                mlLibrary: values.mlLibrary,
                areMlModelFilesModified
            };
            const response = await getAxiosInstance(refreshToken, authDispatch)
                .patch(updateUrl, mlModelData, config);

            if (response.data) {
                const data = response.data;
                toast.success(data.message);
                const mlModelsOptionToShow = { mlModelsOptionToShow: ML_MODELS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setMlModelsOptionToShow(mlModelsDispatch, mlModelsOptionToShow);
                refreshMlModels();

                const reloadTopicsTable = true;
                setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
                const reloadDashboardsTable = true;
                setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
            }
        } catch (error: any) {
            axiosErrorHandler(error, authDispatch);
            backToTable();
        }

        const configMultipart = axiosAuth(accessToken, "multipart/form-data")
        const urlUploadMlModelFileBase0 = `${protocol}://${domainName}/admin_api/ml_model_upload_file`;
        const urlUploadMlModelBase = `${urlUploadMlModelFileBase0}/${groupId}/${mLModelId}`;

        if (areMlModelFilesModified) {
            if (mlLibrary === "Tensorflow") {
                if (tensorflowJsonFile && tensorflowBinFiles.length !== 0) {
                    const tensorflowJsonFileData = new FormData();
                    tensorflowJsonFileData.append("file", tensorflowJsonFile as File, tensorflowJsonFileName);
                    const urlUploadTensorflowJsonFile = `${urlUploadMlModelBase}/${tensorflowJsonFileName}`;
                    getAxiosInstance(refreshToken, authDispatch)
                        .post(urlUploadTensorflowJsonFile, tensorflowJsonFileData, configMultipart)
                        .then((response) => {
                            toast.success(response.data.message);
                        })
                        .catch((error) => {
                            axiosErrorHandler(error, authDispatch);
                            backToTable();
                        })

                    for (let ifile = 0; ifile < tensorflowBinFiles.length; ifile++) {
                        const modelBinFileData = new FormData();
                        modelBinFileData.append(
                            "file",
                            tensorflowBinFiles[ifile] as File,
                            tensorflowBinFileNames[ifile]
                        );
                        const urlUploadModelBinFile = `${urlUploadMlModelBase}/${tensorflowBinFileNames[ifile]}`;
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
            } else if (mlLibrary === "Scikit-learn") {
                if (scikitLearnPickleFile) {
                    const pickleFileData = new FormData();
                    pickleFileData.append(
                        "file",
                        scikitLearnPickleFile as File,
                        scikitLearnPickleFileName
                    );
                    const urlUploadPickleFile = `${urlUploadMlModelBase}/${scikitLearnPickleFileName}`;
                    getAxiosInstance(refreshToken, authDispatch)
                        .post(urlUploadPickleFile, pickleFileData, configMultipart)
                        .then((response) => {
                            toast.success(response.data.message);
                        })
                        .catch((error) => {
                            axiosErrorHandler(error, authDispatch);
                            backToTable();
                        })
                }

            }
        }
    }

    const initialDigitalTwinData = {
        description: mlModels[mlModelRowIndex].description,
        mlLibrary: mlModels[mlModelRowIndex].mlLibrary
    }

    const validationSchema = Yup.object().shape({
        description: Yup.string().required('Required')
    });


    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    return (
        <>
            {
                mLModelDataLoading ?
                    <Loader />
                    :
                    <>
                        <FormTitle isSubmitting={isSubmitting} >Edit ML model</FormTitle>
                        <FormContainer>
                            <Formik initialValues={initialDigitalTwinData} validationSchema={validationSchema} onSubmit={onSubmit} >
                                {
                                    formik => {
                                        return (
                                            <Form>
                                                <ControlsContainer>
                                                    <FieldContainer>
                                                        <label>Org acronym</label>
                                                        <div>{orgAcronym}</div>
                                                    </FieldContainer>
                                                    <FieldContainer>
                                                        <label>Group acronym</label>
                                                        <div>{groupAcronym}</div>
                                                    </FieldContainer>
                                                    <MlModelField>
                                                        <label>ML model reference:</label>
                                                        <div>{mlModels[mlModelRowIndex].mlModelUid}</div>
                                                    </MlModelField>
                                                    <FormikControl
                                                        control='input'
                                                        label='Description'
                                                        name='description'
                                                        type='text'
                                                    />
                                                    <FormikControl
                                                        control='select'
                                                        label='Select ML library'
                                                        name="mlLibrary"
                                                        options={mlLibrariesOptions}
                                                        type='text'
                                                        onChange={(e) => onMlLibrarySelectChange(e, formik)}
                                                    />
                                                    <DataFileTitle>ML model files</DataFileTitle>
                                                    {
                                                        mlLibrary === "Tensorflow" ?
                                                            <DataFileContainer>
                                                                <MlModelFileName>
                                                                    <label>Json file name:</label>
                                                                    <div>{tensorflowJsonFileName}</div>
                                                                </MlModelFileName>
                                                                <MlModelFileName>
                                                                    <label>Json file last modification date:</label>
                                                                    <div>{tensorflowJsonFileLastModif}</div>
                                                                </MlModelFileName>
                                                                {tensorflowBinFileNames.map((fileName: any, index: number) => (
                                                                    <MlModelFileName key={`${fileName}_${index}`}>
                                                                        <label>Shard {index + 1} of {tensorflowBinFileNames.length}:</label>
                                                                        <div>{fileName}</div>
                                                                    </MlModelFileName>
                                                                ))}
                                                                <SelectDataFilesButtonContainer >
                                                                    <FileButton
                                                                        type='button'
                                                                        onClick={clearTensorflowDataFile}
                                                                    >
                                                                        Clear
                                                                    </FileButton>
                                                                    <FileButton
                                                                        type='button'
                                                                        onClick={() => tensorflowFileButtonHandler()}
                                                                    >
                                                                        Select local files
                                                                    </FileButton>
                                                                </SelectDataFilesButtonContainer>
                                                            </DataFileContainer>
                                                            :
                                                            <DataFileContainer>
                                                                <MlModelFileName>
                                                                    <label>Pickle file name:</label>
                                                                    <div>{scikitLearnPickleFileName}</div>
                                                                </MlModelFileName>
                                                                <MlModelFileName>
                                                                    <label>Pickle file last modification date:</label>
                                                                    <div>{scikitLearnPickleFileLastModif}</div>
                                                                </MlModelFileName>
                                                                <SelectDataFilesButtonContainer >
                                                                    <FileButton
                                                                        type='button'
                                                                        onClick={clearScikitLearnDataFile}
                                                                    >
                                                                        Clear
                                                                    </FileButton>
                                                                    <FileButton
                                                                        type='button'
                                                                        onClick={() => scikitLearnFileButtonHandler()}
                                                                    >
                                                                        Select local file
                                                                    </FileButton>
                                                                </SelectDataFilesButtonContainer>
                                                            </DataFileContainer>
                                                    }
                                                </ControlsContainer>
                                                <FormButtonsProps onCancel={onCancel} isValid={formik.isValid} isSubmitting={formik.isSubmitting} />
                                            </Form>
                                        )
                                    }
                                }
                            </Formik>
                        </FormContainer>
                    </>
            }
        </>
    )
}

export default EditMlModel;
