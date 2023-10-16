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

const FieldContainer = styled.div`
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
    maxNumResFemFiles: string;
}>;

const EditDigitalTwin: FC<EditDigitalTwinProps> = ({ digitalTwins, backToTable, refreshDigitalTwins }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const digitalTwinsDispatch = useDigitalTwinsDispatch();
    const digitalTwinRowIndex = useDigitalTwinRowIndexToEdit();
    const digitalTwinInitialData = digitalTwins[digitalTwinRowIndex];
    const digitalTwinId = useDigitalTwinIdToEdit();
    const groupId = digitalTwins[digitalTwinRowIndex].groupId;
    const storedDigitalTwinType = digitalTwins[digitalTwinRowIndex].type;
    const [digitalTwinGltfDataLoading, setDigitalTwinGltfDataLoading] = useState(true);
    const [localGltfFileLoaded, setLocalGltfFileLoaded] = useState(false);
    const [gltfFile, setGltfFile] = useState<File>();
    const [storedGltfFileName, setStoredGltfFileName] = useState("-");
    const [storedGltfFileLastModif, setStoredGltfFileLastModif] = useState("-");
    const [gltfFileName, setGltfFileName] = useState("-");
    const [gltfFileLastModif, setGltfFileLastModif] = useState("-");
    const [digitalTwinGltfData, setDigitalTwinGltfData] = useState({});
    const [localFemResFileLoaded, setLocalFemResFileLoaded] = useState(false);
    const [digitalTwinFemResData, setDigitalTwiFemResData] = useState({});
    const [femResFile, setFemResFile] = useState<File>();
    const [femResFileNames, setFemResFileNames] = useState<string[]>([]);
    const [femResFilesLastModif, setFemResFilesLastModif] = useState<string[]>([]);
    const [femResFileName, setFemResFileName] = useState("-");
    const [femResFileLastModifDateString, setFemResFileLastModifDateString] = useState("-");
    const [dtRefFileName, setDTRefFileName] = useState(digitalTwinInitialData.dtRefFileName);
    const [dtRefFileLastModifDate, setDTRefFileLastModifDate] = useState(digitalTwinInitialData.dtRefFileLastModifDate);
    const initialDtReferencesData = {
        topicsRef: [],
        sensorsRef: [],
        digitalTwinSimulationFormat: digitalTwinInitialData.digitalTwinSimulationFormat
    };
    const [dtReferencesData, setDtReferencesData] = useState<any>(initialDtReferencesData);
    const [dtReferencesFileLoaded, setDTReferencesFileLoaded] = useState(false);
    const [digitalTwinType, setDigitalTwinType] = useState(digitalTwinInitialData.type);

    const [openGlftFileSelector, gltfFileParams] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.gltf',
    });

    const [openFemResFileSelector, femResFileParams] = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.json',
    });


    const [openDTRefFileSelector, dtRefFileParams] = useFilePicker({
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
                        const gltfFileName = gltfFileInfo[0].fileName.split("/")[4];
                        setStoredGltfFileName(gltfFileName);
                        setGltfFileName(gltfFileName);
                        const gltfFileLastModif = formatDateString(gltfFileInfo[0].lastModified);
                        setStoredGltfFileLastModif(gltfFileLastModif);
                        setGltfFileLastModif(gltfFileLastModif)
                        const urlfemResFileList = `${urlDigitalTwinFileListBase}/femResFiles`;
                        getAxiosInstance(refreshToken, authDispatch)
                            .get(urlfemResFileList, config)
                            .then((response) => {
                                const femResFileList: { fileName: string, lastModified: string }[] = response.data;
                                if (femResFileList.length !== 0) {
                                    const femResFileNames = femResFileList.map(femResFile => femResFile.fileName.split("/")[4]);
                                    setFemResFileNames(femResFileNames);
                                    setFemResFileName(femResFileNames[0])
                                    const femResFilesLastModif = femResFileList.map(femResFile => femResFile.lastModified);
                                    setFemResFilesLastModif(femResFilesLastModif);
                                    setFemResFileLastModifDateString(formatDateString(femResFilesLastModif[0]));
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
        if (
            !gltfFileParams.loading &&
            gltfFileParams.filesContent.length !== 0 &&
            gltfFileParams.plainFiles.length !== 0
        ) {
            setLocalGltfFileLoaded(true)
            try {
                const fileContent = gltfFileParams.filesContent[0].content
                const gltfData = JSON.parse(fileContent);
                const message = checkGltfFile(gltfData);
                if (message !== "OK") {
                    throw new Error(message);
                }
                setDigitalTwinGltfData(gltfData);
                setGltfFile(gltfFileParams.plainFiles[0]);
                const gltfFileName = gltfFileParams.plainFiles[0].name;
                setGltfFileName(gltfFileName);
                const dateString = (gltfFileParams.plainFiles[0] as any).lastModified;
                setGltfFileLastModif(formatDateString(dateString));
                setLocalGltfFileLoaded(false);
                gltfFileParams.clear();
            } catch (error) {
                if (error instanceof Error) {
                    toast.error(`Invalid gltffile. ${error.message}`);
                } else {
                    toast.error("Invalid gltffile");
                }
                setLocalGltfFileLoaded(false);
                gltfFileParams.clear();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        gltfFileParams.loading,
        gltfFileParams.filesContent,
        gltfFileParams.plainFiles,
        gltfFileParams,
    ])

    useEffect(() => {
        if (!femResFileParams.loading && femResFileParams.filesContent.length !== 0 && femResFileParams.plainFiles.length !== 0) {
            setLocalFemResFileLoaded(true);
            try {
                const fileContent = femResFileParams.filesContent[0].content
                const femResData = JSON.parse(fileContent);
                setDigitalTwiFemResData(femResData);
                setFemResFile(femResFileParams.plainFiles[0]);
                const femResFileName = femResFileParams.plainFiles[0].name;
                setFemResFileName(femResFileName);
                const dateString = (femResFileParams.plainFiles[0] as any).lastModified;
                setFemResFileLastModifDateString(formatDateString(dateString));
                setLocalFemResFileLoaded(false);
                femResFileParams.clear();
            } catch (e) {
                console.log(e);
                toast.error("Invalid fem simulation file");
                setLocalFemResFileLoaded(false);
                femResFileParams.clear();
            }
        }
    },
        [
            femResFileParams.loading,
            femResFileParams.filesContent,
            femResFileParams.plainFiles,
            femResFileParams
        ]);

    useEffect(() => {
        if (
            !dtRefFileParams.loading &&
            dtRefFileParams.filesContent.length !== 0 &&
            dtRefFileParams.plainFiles.length !== 0
        ) {
            setDTReferencesFileLoaded(true);
            try {
                const fileContent = dtRefFileParams.filesContent[0].content
                const dtReferencesData = JSON.parse(fileContent);
                setDtReferencesData(dtReferencesData);
                const digitalTwinSimulationFormat = dtReferencesData.digitalTwinSimulationFormat;
                const isFileOk = digitalTwinFormatValidation(digitalTwinSimulationFormat);
                if (!isFileOk) throw new Error("Invalid dt simulation format file");
                const dtRefFileName = dtRefFileParams.plainFiles[0].name;
                setDTRefFileName(dtRefFileName);
                const dateString = (dtRefFileParams.plainFiles[0] as any).lastModified;
                setDTRefFileLastModifDate(formatDateString(dateString));
                setDTReferencesFileLoaded(false);
                dtRefFileParams.clear();
            } catch (error) {
                toast.error(error);
                setDTReferencesFileLoaded(false);
                dtRefFileParams.clear();
            }
        }
    },
        [
            dtRefFileParams.loading,
            dtRefFileParams.filesContent,
            dtRefFileParams.plainFiles,
            dtRefFileParams
        ]);


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
                (femResFileNames[0] !== femResFileName ||
                    formatDateString(femResFilesLastModif[0]) !== formatDateString(femResFileLastModifDateString))
            ) {
                if (digitalTwins[digitalTwinRowIndex].maxNumResFemFiles < maxNumResFemFiles && maxNumResFemFiles >= 2) {
                    const warningMessage = "Please increase the 'Max number of FEM result files stored' before uploading a new file.";
                    toast.warning(warningMessage);
                    setIsSubmitting(false);
                    return;
                }
                const femResData = new FormData();
                femResData.append("file", femResFile as File, femResFileName);
                const urlUploadFemResFile = `${urlUploadGltfBase}/femResFiles/${femResFileName}`;
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
                (storedGltfFileName !== gltfFileName ||
                    formatDateString(storedGltfFileLastModif) !== formatDateString(gltfFileLastModif))
            ) {
                isGltfFileModified = true;
                const gltfData = new FormData();
                gltfData.append("file", gltfFile as File, gltfFileName);
                const urlUploadGltfFile = `${urlUploadGltfBase}/gltfFile/${gltfFileName}`;
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
            digitalTwinSimulationFormat: JSON.stringify(dtReferencesData.digitalTwinSimulationFormat),
            dtRefFileName,
            dtRefFileLastModifDate,
            topicsRef: dtReferencesData.topicsRef,
            sensorsRef: dtReferencesData.sensorsRef
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
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                backToTable();
            })
            .finally(() => {
                refreshDigitalTwins();
                const reloadTopicsTable = true;
                setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
                const reloadSensorsTable = true;
                setReloadSensorsTable(plaformAssistantDispatch, { reloadSensorsTable });
                const reloadDashboardsTable = true;
                setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
            })
    }


    const initialDigitalTwinData = {
        description: digitalTwins[digitalTwinRowIndex].description,
        type: digitalTwins[digitalTwinRowIndex].type,
        digitalTwinUid: digitalTwins[digitalTwinRowIndex].digitalTwinUid,
        maxNumResFemFiles: digitalTwins[digitalTwinRowIndex].maxNumResFemFiles as unknown as string,
    }

    const validationSchema = Yup.object().shape({
        digitalTwinUid: Yup.string().length(20, "String must be 20 characters long").required('Required'),
        description: Yup.string().required('Required'),
        type: Yup.string().max(20, "The maximum number of characters allowed is 20").required('Required'),
        maxNumResFemFiles: Yup.number().when("type", {
            is: "Gltf 3D model",
            then: Yup.number().min(1, "The minimum numer of FEM results files is 1").required("Must enter maxNumResFemFiles")
        })
    });


    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const onDigitalTwinTypeSelectChange = (e: { value: string }, formik: FormikType) => {
        setDigitalTwinType(e.value);
        formik.setFieldValue("type", e.value)
    }

    const clearGltfDataFile = () => {
        setGltfFileName("-");
        setGltfFileLastModif("-");
        setDigitalTwinGltfData({});
        setLocalGltfFileLoaded(false);
        gltfFileParams.clear();
    }

    const localGltfFileButtonHandler = async () => {
        if (!localGltfFileLoaded) {
            selectFile(openGlftFileSelector, gltfFileParams.clear);
        }
    }

    const clearFemResFile = () => {
        setFemResFileName("-");
        setFemResFileLastModifDateString("-");
        setDigitalTwiFemResData({});
        setLocalFemResFileLoaded(false);
        femResFileParams.clear();
    }

    const localFemResFileButtonHandler = () => {
        if (!localFemResFileLoaded) {
            selectFile(openFemResFileSelector, femResFileParams.clear);
        }
    }

    const clearDTRefFile = () => {
        setDTRefFileName("-");
        setDTRefFileLastModifDate("-");
        setDtReferencesData({});
        setDTReferencesFileLoaded(false);
        femResFileParams.clear();
    }

    const dtRefFileButtonHandler = () => {
        if (!dtReferencesFileLoaded) {
            selectFile(openDTRefFileSelector, dtRefFileParams.clear);
        }
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
                            <Formik
                                initialValues={initialDigitalTwinData}
                                validationSchema={validationSchema}
                                onSubmit={onSubmit}
                            >
                                {
                                    formik => {
                                        return (
                                            <Form>
                                                <ControlsContainer>
                                                    <FormikControl
                                                        control='input'
                                                        label='DigitalTwinUid'
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
                                                                <FieldContainer>
                                                                    <label>File name</label>
                                                                    <div>{gltfFileName}</div>
                                                                </FieldContainer>
                                                                <FieldContainer>
                                                                    <label>Last modification date</label>
                                                                    <div>{gltfFileLastModif}</div>
                                                                </FieldContainer>
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
                                                                        Select local file
                                                                    </FileButton>
                                                                </SelectDataFilenButtonContainer>
                                                            </DataFileContainer>
                                                            <DataFileTitle>FEM results file</DataFileTitle>
                                                            <DataFileContainer>
                                                                <FormikControl
                                                                    control='input'
                                                                    label='Max number of FEM result files stored'
                                                                    name='maxNumResFemFiles'
                                                                    type='text'
                                                                />
                                                                <FieldContainer>
                                                                    <label>File name</label>
                                                                    <div>{femResFileName}</div>
                                                                </FieldContainer>
                                                                <FieldContainer>
                                                                    <label>Last modification date</label>
                                                                    <div>{femResFileLastModifDateString}</div>
                                                                </FieldContainer>
                                                                <SelectDataFilenButtonContainer >
                                                                    <FileButton
                                                                        type='button'
                                                                        onClick={clearFemResFile}
                                                                    >
                                                                        Clear
                                                                    </FileButton>
                                                                    <FileButton
                                                                        type='button'
                                                                        onClick={() => localFemResFileButtonHandler()}
                                                                    >
                                                                        Select local file
                                                                    </FileButton>
                                                                </SelectDataFilenButtonContainer>
                                                            </DataFileContainer>
                                                            <DataFileTitle>Digital twin references file</DataFileTitle>
                                                            <DataFileContainer>
                                                                <FieldContainer>
                                                                    <label>File name</label>
                                                                    <div>{dtRefFileName}</div>
                                                                </FieldContainer>
                                                                <FieldContainer>
                                                                    <label>Last modification date</label>
                                                                    <div>{dtRefFileLastModifDate}</div>
                                                                </FieldContainer>
                                                                <SelectDataFilenButtonContainer >
                                                                    <FileButton
                                                                        type='button'
                                                                        onClick={clearDTRefFile}
                                                                    >
                                                                        Clear
                                                                    </FileButton>
                                                                    <FileButton
                                                                        type='button'
                                                                        onClick={() => dtRefFileButtonHandler()}
                                                                    >
                                                                        Select local file
                                                                    </FileButton>
                                                                </SelectDataFilenButtonContainer>
                                                            </DataFileContainer>
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