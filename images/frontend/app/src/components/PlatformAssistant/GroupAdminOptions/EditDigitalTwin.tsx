import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { useFilePicker } from 'use-file-picker';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, checkGltfFile, digitalTwinFormatValidation, getDomainName, getProtocol } from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { DIGITAL_TWINS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setDigitalTwinsOptionToShow,
    useDigitalTwinIdToEdit,
    useDigitalTwinRowIndexToEdit,
    useDigitalTwinsDispatch
} from '../../../contexts/digitalTwinsOptions';
import { IDigitalTwin } from '../TableColumns/digitalTwinsColumns';
import Loader from '../../Tools/Loader';
import formatDateString from '../../../tools/formatDate';
import {
    setReloadDashboardsTable,
    setReloadSensorsTable,
    setReloadTopicsTable,
    usePlatformAssitantDispatch
} from '../../../contexts/platformAssistantContext';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';


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

const SelectDataFilenButtonContainer = styled.div`
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

const selectFile = (openFileSelector: () => void, clear: () => void) => {
    clear();
    openFileSelector();
}

const domainName = getDomainName();
const protocol = getProtocol();

const digitalTwinTypeOptions = [
    {
        label: "Grafana dashboard",
        value: "Grafana dashboard"
    },
    {
        label: "Gltf 3D model",
        value: "Gltf 3D model"
    }
];

interface EditDigitalTwinProps {
    digitalTwins: IDigitalTwin[];
    backToTable: () => void;
    refreshDigitalTwins: () => void;
}

type FormikType = FormikProps<{
    digitalTwinUid: string;
    description: string;
    type: string;
    gltfFileName: string;
    gltfFileLastModifDateString: string;
    femResDataFileName: string;
    femResDataFileLastModifDateString: string;
    maxNumResFemFiles: string;
    digitalTwinSimulationFormat: string;
}>;

const EditDigitalTwin: FC<EditDigitalTwinProps> = ({ digitalTwins, backToTable, refreshDigitalTwins }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const digitalTwinsDispatch = useDigitalTwinsDispatch();
    const digitalTwinRowIndex = useDigitalTwinRowIndexToEdit();
    const digitalTwinId = useDigitalTwinIdToEdit();
    const groupId = digitalTwins[digitalTwinRowIndex].groupId;
    const storedDigitalTwinType = digitalTwins[digitalTwinRowIndex].type;
    const [digitalTwinGltfDataLoading, setDigitalTwinGltfDataLoading] = useState(true);
    const [localGltfFileLoaded, setLocalGltfFileLoaded] = useState(false);
    const [gltfFileName, setGltfFileName] = useState("-");
    const [gltfFileLastModif, setGltfFileLastModif] = useState("-");
    const [gltfFile, setGltfFile] = useState<File>();
    const [femResFileNames, setFemResFileNames] = useState<string[]>([]);
    const [femResFilesLastModif, setFemResFilesLastModif] = useState<string[]>([]);
    const [localGltfFileLabel, setLocalGltfFileLabel] = useState("Select local file");
    const [digitalTwinGltfData, setDigitalTwinGltfData] = useState({});
    const [localFemSimFileLoaded, setLocalFemSimFileLoaded] = useState(false);
    const [localFemSimFileLabel, setLocalFemSimFileLabel] = useState("Select local file");
    const [digitalTwinFemResData, setDigitalTwiFemResData] = useState({});
    const [femResFile, setFemResFile] = useState<File>();
    const [digitalTwinType, setDigitalTwinType] = useState(digitalTwins[digitalTwinRowIndex].type);

    const [openGlftFileSelector, gltfFileParams] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.gltf',
    });

    const [openFemSimulationFileSelector, femResFileParams] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.json',
    });

    useEffect(() => {
        if (storedDigitalTwinType === "Gltf 3D model") {
            const config = axiosAuth(accessToken);
            const urlDigitalTwinFileListBase0 = `${protocol}://${domainName}/admin_api/digital_twin_file_list`;
            const urlDigitalTwinFileListBase = `${urlDigitalTwinFileListBase0}/${groupId}/${digitalTwinId}`;
            const urlGltfFileList = `${urlDigitalTwinFileListBase}/gltfFile`;
            getAxiosInstance(refreshToken, authDispatch)
                .get(urlGltfFileList, config)
                .then((response) => {
                    const gltfFileInfo = response.data;
                    if (gltfFileInfo.length !== 0) {
                        setGltfFileName(gltfFileInfo[0].fileName.split("/")[5]);
                        setGltfFileLastModif(gltfFileInfo[0].lastModified);
                        const urlfemResFileList = `${urlDigitalTwinFileListBase}/femResFiles`;
                        getAxiosInstance(refreshToken, authDispatch)
                            .get(urlfemResFileList, config)
                            .then((response) => {
                                const femResFileList: { fileName: string, lastModified: string }[] = response.data;
                                if (femResFileList.length !== 0) {
                                    const femResFileNames = femResFileList.map(femResFile => femResFile.fileName.split("/")[5]);
                                    setFemResFileNames(femResFileNames);
                                    const femResFilesLastModif = femResFileList.map(femResFile => femResFile.lastModified);
                                    setFemResFilesLastModif(femResFilesLastModif);
                                }
                                setDigitalTwinGltfDataLoading(false);
                                setIsSubmitting(false);
                            })
                            .catch((error) => {
                                axiosErrorHandler(error, authDispatch);
                                setDigitalTwinGltfDataLoading(false);
                            })
                    } else {
                        setDigitalTwinGltfDataLoading(false);
                        setIsSubmitting(false);
                    }

                })
                .catch((error) => {
                    axiosErrorHandler(error, authDispatch);
                    setDigitalTwinGltfDataLoading(false);
                })
        } else setDigitalTwinGltfDataLoading(false);
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        backToTable,
        storedDigitalTwinType,
        digitalTwinId,
        groupId
    ])

    useEffect(() => {
        if (!gltfFileParams.loading && gltfFileParams.filesContent.length !== 0 && gltfFileParams.plainFiles.length !== 0) {
            setLocalGltfFileLoaded(true)
            setLocalGltfFileLabel("Add file data");
        }
    }, [gltfFileParams.loading, gltfFileParams.filesContent, gltfFileParams.plainFiles])

    useEffect(() => {
        if (!femResFileParams.loading && femResFileParams.filesContent.length !== 0 && femResFileParams.plainFiles.length !== 0) {
            setLocalFemSimFileLoaded(true)
            setLocalFemSimFileLabel("Add file data");
        }
    }, [femResFileParams.loading, femResFileParams.filesContent, femResFileParams.plainFiles])


    const onSubmit = async (values: any, actions: any) => {
        const groupId = digitalTwins[digitalTwinRowIndex].groupId;
        const url = `${protocol}://${domainName}/admin_api/digital_twin/${groupId}/${digitalTwinId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        const configMultipart = axiosAuth(accessToken, "multipart/form-data")
        const urlUploadGltfBase0 = `${protocol}://${domainName}/admin_api/digital_twin_upload_file`;
        const urlUploadGltfBase = `${urlUploadGltfBase0}/${groupId}/${digitalTwinId}`;
        let isGltfFileModified = false;
        const maxNumResFemFiles = parseInt(values.maxNumResFemFiles, 10);

        if (values.type === "Gltf 3D model") {
            if (
                Object.keys(digitalTwinFemResData).length !== 0 &&
                (femResFileNames[0] !== values.femResDataFileName ||
                    formatDateString(femResFilesLastModif[0]) !== formatDateString(values.femResDataFileLastModifDateString))
            ) {
                if (digitalTwins[digitalTwinRowIndex].maxNumResFemFiles < maxNumResFemFiles && maxNumResFemFiles >= 2) {
                    const warningMessage = "Please increase the 'Max number of FEM result files stored' before uploading a new file.";
                    toast.warning(warningMessage);
                    setIsSubmitting(false);
                    return;
                }
                const femResData = new FormData();
                femResData.append("file", femResFile as File, values.femResDataFileName);
                const urlUploadFemResFile = `${urlUploadGltfBase}/femResFiles/${values.femResDataFileName}`;
                try {
                    const response = await getAxiosInstance(refreshToken, authDispatch)
                        .post(urlUploadFemResFile, femResData, configMultipart)
                    if (response.data) {
                        toast.success(response.data.message);
                    }
                } catch (error: any) {
                    axiosErrorHandler(error, authDispatch);
                    backToTable();
                }
            }

            if (
                Object.keys(digitalTwinGltfData).length !== 0 &&
                (gltfFileName !== values.gltfFileName ||
                    formatDateString(gltfFileLastModif) !== formatDateString(values.gltfFileLastModifDateString))
            ) {
                isGltfFileModified = true;
                const gltfData = new FormData();
                gltfData.append("file", gltfFile as File, values.gltfFileName);
                const urlUploadGltfFile = `${urlUploadGltfBase}/gltfFile/${values.gltfFileName}`;
                try {
                    const response = await getAxiosInstance(refreshToken, authDispatch)
                        .post(urlUploadGltfFile, gltfData, configMultipart);
                    if (response.data) {
                        toast.success(response.data.message);
                    }
                } catch (error: any) {
                    axiosErrorHandler(error, authDispatch);
                    backToTable();
                }
            }

        }

        const digitalTwinData = {
            digitalTwinUid: values.digitalTwinUid,
            description: values.description,
            type: values.type,
            maxNumResFemFiles,
            isGltfFileModified,
            digitalTwinSimulationFormat: JSON.stringify(JSON.parse(values.digitalTwinSimulationFormat)),
        }

        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, digitalTwinData, config)
            .then((response) => {
                if (response.data) {
                    toast.success(response.data.message);
                }
                const digitalTwinsOptionToShow = { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setDigitalTwinsOptionToShow(digitalTwinsDispatch, digitalTwinsOptionToShow);
                refreshDigitalTwins();

                const reloadTopicsTable = true;
                setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
                const reloadSensorsTable = true;
                setReloadSensorsTable(plaformAssistantDispatch, { reloadSensorsTable });
                const reloadDashboardsTable = true;
                setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
    }

    const initialDigitalTwinData = {
        digitalTwinUid: digitalTwins[digitalTwinRowIndex].digitalTwinUid,
        description: digitalTwins[digitalTwinRowIndex].description,
        type: digitalTwins[digitalTwinRowIndex].type,
        gltfFileName: gltfFileName,
        gltfFileLastModifDateString: formatDateString(gltfFileLastModif),
        femResDataFileName: femResFileNames[0] !== undefined ? femResFileNames[0] : "-",
        femResDataFileLastModifDateString: formatDateString(femResFilesLastModif[0]),
        maxNumResFemFiles: digitalTwins[digitalTwinRowIndex].maxNumResFemFiles as unknown as string,
        digitalTwinSimulationFormat: JSON.stringify(digitalTwins[digitalTwinRowIndex].digitalTwinSimulationFormat, null, 4)
    }

    const validationSchema = Yup.object().shape({
        digitalTwinUid: Yup.string().matches(/^DT.{21}$/, "String must be 23 characters long and start with 'DT'").required('Required'),
        description: Yup.string().required('Required'),
        type: Yup.string().max(20, "The maximum number of characters allowed is 20").required('Required'),
        gltfFileName: Yup.string().when("type", {
            is: "Gltf 3D model",
            then: Yup.string().required("Must enter gltfFileName")
        }),
        gltfFileLastModifDateString: Yup.string().when("type", {
            is: "Gltf 3D model",
            then: Yup.string().max(190, "The maximum number of characters allowed is 190").required("Must enter gltfFileLastModifDateString")
        }),
        femResDataFileName: Yup.string().when("type", {
            is: "Gltf 3D model",
            then: Yup.string().max(190, "The maximum number of characters allowed is 190").required("Must enter femResDataFileName")
        }),
        femResDataFileLastModifDateString: Yup.string().when("type", {
            is: "Gltf 3D model",
            then: Yup.string().max(190, "The maximum number of characters allowed is 190").required("Must enter femResDataFileLastModifDateString")
        }),
        maxNumResFemFiles: Yup.number().when("type", {
            is: "Gltf 3D model",
            then: Yup.number().min(1, "The minimum number of FEM results files is 1").required("Must enter maxNumResFemFiles")
        }),
        digitalTwinSimulationFormat: Yup.string().when("type", {
            is: "Gltf 3D model",
            then: Yup.string()
                .test("test-name", "Wrong format for the json object", (value: any) => digitalTwinFormatValidation(value))
                .required("Must enter Digital twin simulation format")
        }),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const onDigitalTwinTypeSelectChange = (e: { value: string }, formik: FormikType) => {
        setDigitalTwinType(e.value);
        formik.setFieldValue("type", e.value)
    }

    return (
        <>
            {
                digitalTwinGltfDataLoading ?
                    <Loader />
                    :
                    <>
                        <FormTitle isSubmitting={isSubmitting} >Edit digital twin</FormTitle>
                        <FormContainer>
                            <Formik initialValues={initialDigitalTwinData} validationSchema={validationSchema} onSubmit={onSubmit} >
                                {
                                    formik => {
                                        const clearGltfDataFile = () => {
                                            const values = { ...formik.values };
                                            values.gltfFileName = "-";
                                            values.gltfFileLastModifDateString = "-";
                                            formik.setValues(values);
                                            setLocalGltfFileLabel("Select local file");
                                            setDigitalTwinGltfData({});
                                            setLocalGltfFileLoaded(false);
                                            gltfFileParams.clear();
                                        }

                                        const localGltfFileButtonHandler = () => {
                                            if (!localGltfFileLoaded) {
                                                selectFile(openGlftFileSelector, gltfFileParams.clear);
                                            } else {
                                                try {
                                                    const values = { ...formik.values };
                                                    const fileContent = gltfFileParams.filesContent[0].content
                                                    const gltfData = JSON.parse(fileContent);
                                                    const message = checkGltfFile(gltfData);
                                                    if (message !== "OK") {
                                                        throw new Error(message);
                                                    }
                                                    setDigitalTwinGltfData(gltfData);
                                                    setGltfFile(gltfFileParams.plainFiles[0]);
                                                    values.gltfFileName = gltfFileParams.plainFiles[0].name;
                                                    const dateString = (gltfFileParams.plainFiles[0] as any).lastModified;
                                                    values.gltfFileLastModifDateString = formatDateString(dateString);
                                                    formik.setValues(values);
                                                    setLocalGltfFileLabel("Select local file");
                                                    gltfFileParams.clear();
                                                } catch (error) {
                                                    if (error instanceof Error) {
                                                        toast.error(`Invalid gltffile. ${error.message}`);
                                                    } else {
                                                        toast.error("Invalid gltffile");
                                                    }
                                                    setLocalGltfFileLabel("Select local file");
                                                    setLocalGltfFileLoaded(false);
                                                    gltfFileParams.clear();
                                                }
                                            }
                                        }

                                        const clearFemSimDataFile = () => {
                                            const values = { ...formik.values };
                                            values.femResDataFileName = "-";
                                            values.femResDataFileLastModifDateString = "-";
                                            formik.setValues(values);
                                            setLocalFemSimFileLabel("Select local file");
                                            setDigitalTwiFemResData({});
                                            setLocalFemSimFileLoaded(false);
                                            femResFileParams.clear();
                                        }

                                        const localFemSimFileButtonHandler = () => {
                                            if (!localFemSimFileLoaded) {
                                                selectFile(openFemSimulationFileSelector, femResFileParams.clear);
                                            } else {
                                                try {
                                                    const values = { ...formik.values };
                                                    const fileContent = femResFileParams.filesContent[0].content
                                                    const femResData = JSON.parse(fileContent);
                                                    setDigitalTwiFemResData(femResData);
                                                    setFemResFile(femResFileParams.plainFiles[0]);
                                                    values.femResDataFileName = femResFileParams.plainFiles[0].name;
                                                    const dateString = (femResFileParams.plainFiles[0] as any).lastModified;
                                                    values.femResDataFileLastModifDateString = formatDateString(dateString);
                                                    formik.setValues(values);
                                                    setLocalFemSimFileLabel("Select local file");
                                                    femResFileParams.clear();
                                                } catch (e) {
                                                    console.log(e);
                                                    toast.error("Invalid fem simulation file");
                                                    setLocalFemSimFileLabel("Select local file");
                                                    setLocalFemSimFileLoaded(false);
                                                    femResFileParams.clear();
                                                }
                                            }
                                        }

                                        return (
                                            <Form>
                                                <ControlsContainer>
                                                    <FormikControl
                                                        control='input'
                                                        label='Ref'
                                                        name='digitalTwinUid'
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
                                                        label='Type'
                                                        name="type"
                                                        options={digitalTwinTypeOptions}
                                                        type='text'
                                                        onChange={(e) => onDigitalTwinTypeSelectChange(e, formik)}
                                                    />
                                                    {
                                                        digitalTwinType === "Gltf 3D model" &&
                                                        <>
                                                            <DataFileTitle>Gltf data file</DataFileTitle>
                                                            <DataFileContainer>
                                                                <FormikControl
                                                                    control='input'
                                                                    label='File name'
                                                                    name='gltfFileName'
                                                                    type='text'
                                                                />
                                                                <FormikControl
                                                                    control='input'
                                                                    label='Last modification date'
                                                                    name='gltfFileLastModifDateString'
                                                                    type='text'
                                                                />
                                                                <SelectDataFilenButtonContainer >
                                                                    <FileButton
                                                                        type='button'
                                                                        onClick={clearGltfDataFile}
                                                                    >
                                                                        Clear
                                                                    </FileButton>
                                                                    <FileButton
                                                                        type='button'
                                                                        onClick={() => localGltfFileButtonHandler()}
                                                                    >
                                                                        {localGltfFileLabel}
                                                                    </FileButton>
                                                                </SelectDataFilenButtonContainer>
                                                            </DataFileContainer>
                                                            <DataFileTitle>FEM result files</DataFileTitle>
                                                            <DataFileContainer>
                                                                <FormikControl
                                                                    control='input'
                                                                    label='Max number of FEM result files stored'
                                                                    name='maxNumResFemFiles'
                                                                    type='text'
                                                                />
                                                                <FormikControl
                                                                    control='input'
                                                                    label='Name of the newest file'
                                                                    name='femResDataFileName'
                                                                    type='text'
                                                                />
                                                                <FormikControl
                                                                    control='input'
                                                                    label='Date of the last modification of the newest file'
                                                                    name='femResDataFileLastModifDateString'
                                                                    type='text'
                                                                />
                                                                <SelectDataFilenButtonContainer >
                                                                    <FileButton
                                                                        type='button'
                                                                        onClick={clearFemSimDataFile}
                                                                    >
                                                                        Clear
                                                                    </FileButton>
                                                                    <FileButton
                                                                        type='button'
                                                                        onClick={() => localFemSimFileButtonHandler()}
                                                                    >
                                                                        {localFemSimFileLabel}
                                                                    </FileButton>
                                                                </SelectDataFilenButtonContainer>
                                                            </DataFileContainer>
                                                            <FormikControl
                                                                control='textarea'
                                                                label='Digital twin simulation format'
                                                                name='digitalTwinSimulationFormat'
                                                                textAreaSize='Small'
                                                            />
                                                        </>
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

export default EditDigitalTwin;