import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { nanoid } from "nanoid";
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import {
    IOption,
    axiosAuth,
    convertArrayToOptions,
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
import { IGroupManaged } from '../TableColumns/groupsManagedColumns';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';

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

const findGroupArray = (
    orgsOfGroupManaged: IOrgOfGroupsManaged[],
    groupsManaged: IGroupManaged[]
): Record<string, string[]> => {
    const groupArray: Record<string, string[]> = {}
    for (const group of groupsManaged) {
        const orgAcronym = orgsOfGroupManaged.filter(org => org.id === group.orgId)[0].acronym;
        if (groupArray[orgAcronym] === undefined) {
            groupArray[orgAcronym] = [];
        }
        if (groupArray[orgAcronym].indexOf(group.acronym) === -1) {
            groupArray[orgAcronym].push(group.acronym);
        }
    }
    return groupArray;
}

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

const domainName = getDomainName();
const protocol = getProtocol();


interface InitialMLModelData {
    orgAcronym: string;
    groupAcronym: string;
    mlModelUid: string;
    description: string;
    mlLibrary: string;
}

type FormikType = FormikProps<InitialMLModelData>


interface CreateMlModelProps {
    backToTable: () => void;
    refreshMlModels: () => void;
    orgsOfGroupManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
}

const CreateMlModel: FC<CreateMlModelProps> = ({
    backToTable,
    refreshMlModels,
    orgsOfGroupManaged,
    groupsManaged
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const mlModelsDispatch = useMlModelsDispatch();
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);
    const [groupArray, setGroupArray] = useState<Record<string, string[]>>({});
    const [groupOptions, setGroupOptions] = useState<IOption[]>([]);
    const initOrg = orgsOfGroupManaged[0];
    const initGroup = groupsManaged.filter(group => group.orgId === initOrg.id)[0];
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
    const [mlLibrary, setMlLibrary] = useState("Tensorflow");

    useEffect(() => {
        const orgArray = orgsOfGroupManaged.map(org => org.acronym);
        setOrgOptions(convertArrayToOptions(orgArray));
        const groupArray = findGroupArray(orgsOfGroupManaged, groupsManaged);
        setGroupArray(groupArray);
        const orgAcronym = orgsOfGroupManaged[0].acronym;
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
    }, [groupsManaged, orgsOfGroupManaged]);

    const handleChangeOrg = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = e.value;
        formik.setFieldValue("orgAcronym", orgAcronym);
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
        const groupAcronym = groupsForOrgSelected[0];
        formik.setFieldValue("groupAcronym", groupAcronym);
    }

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
                tensorflowFilesParams.clear();
            } catch (error) {
                if (error instanceof Error) {
                    toast.error(`Invalid Tensorflow ML model files: ${error.message}`);
                } else {
                    toast.error("Invalid Tensorflow ML model files");
                }
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
                scikitLearnFileParams.clear();
            } catch (error) {
                if (error instanceof Error) {
                    toast.error(`Invalid Scikit-Learn ML model files: ${error.message}`);
                } else {
                    toast.error("Invalid Scikit-Learn ML model files");
                }
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

    const onSubmit = (values: any, actions: any) => {
        const config = axiosAuth(accessToken);
        const groupAcronym = values.groupAcronym;
        const groupSelected = groupsManaged.filter(group => group.acronym === groupAcronym)[0];
        const groupId = groupSelected.id;
        const url = `${protocol}://${domainName}/admin_api/ml_model/${groupId}`;

        const mlModelData = {
            mlModelUid: values.mlModelUid,
            description: values.description,
            mlLibrary: mlLibrary
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
        mlModelUid: Yup.string().matches(/^MLM_.{20}$/, "String must be 24 characters long and start with 'MLM'").required('Required'),
        description: Yup.string().required('Required')
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const initialMlModelData = {
        orgAcronym: initOrg.acronym,
        groupAcronym: initGroup.acronym,
        mlModelUid: `MLM_${nanoid(20).replace(/-/g, "x").replace(/_/g, "X")}`,
        description: "",
        mlLibrary: "Tensorflow"
    }

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create ML model</FormTitle>
            <FormContainer>
                <Formik initialValues={initialMlModelData} validationSchema={validationSchema} onSubmit={onSubmit} >
                    {
                        formik => (
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control='select'
                                        label='Org acronym'
                                        name='orgAcronym'
                                        options={orgOptions}
                                        type='text'
                                        onChange={(e) => handleChangeOrg(e, formik)}
                                    />
                                    <FormikControl
                                        control='select'
                                        label='Group acronym'
                                        name='groupAcronym'
                                        options={groupOptions}
                                        type='text'
                                    />
                                    <FormikControl
                                        control='input'
                                        label='ML model reference'
                                        name='mlModelUid'
                                        type='text'
                                    />
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
                                <FormButtonsProps
                                    onCancel={onCancel}
                                    isValid={formik.isValid}
                                    isSubmitting={formik.isSubmitting}
                                />
                            </Form>
                        )
                    }
                </Formik>
            </FormContainer>
        </>
    )
}

export default CreateMlModel;