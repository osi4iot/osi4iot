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
import { ISensorRef, ITopicRef, ckeckDigitalTwinRefFile } from './CreateDigitalTwin';

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
    const groupId = digitalTwinInitialData.groupId;
    const storedDigitalTwinType = digitalTwinInitialData.type;
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
    const [dtReferencesFileLoaded, setDTReferencesFileLoaded] = useState(false);
    const [digitalTwinType, setDigitalTwinType] = useState(digitalTwinInitialData.type);
    const [topicsRef, setTopicsRef] = useState<ITopicRef[]>(digitalTwinInitialData.topicsRef);
    const [sensorsRef, setSensorsRef] = useState<ISensorRef[]>(digitalTwinInitialData.sensorsRef);
    const [
        digitalTwinSimulationFormat,
        setDigitalTwinSimulationFormat
    ] = useState(digitalTwinInitialData.digitalTwinSimulationFormat);
    const [isGlftDataReady, setIsGlftDataReady] = useState(storedDigitalTwinType !== "Gltf 3D model");
    const [isFemResDataReady, setIsFemResDataReady] = useState(storedDigitalTwinType !== "Gltf 3D model");
    const [isDTRefDataReady, setIsDTRefDataReady] = useState(true);
    const [isFormReady, setIsFormReady] = useState(false);

    const {
        openFilePicker: openGlftFileSelector,
        filesContent: gltfFileParamsFilesContent,
        loading: gltfFileParamsLoading,
        plainFiles: gltfFileParamsPlainFiles,
        clear: gltfFileParamsClear
    } = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.gltf',
    });

    const {
        openFilePicker: openFemResFileSelector,
        filesContent: femResFileParamsFilesContent,
        loading: femResFileParamsLoading,
        plainFiles: femResFileParamsPlainFiles,
        clear: femResFileParamsClear,
    } = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.json',
    });

    const {
        openFilePicker: openDTRefFileSelector,
        filesContent: dtRefFileParamsFilesContent,
        plainFiles: dtRefFileParamsPlainFiles,
        loading: dtRefFileParamsLoading,
        clear: dtRefFileParamsClear
    } = useFilePicker({
        readAs: 'Text',
        multiple: false,
        accept: '.json',
    })

    useEffect(() => {
        const isDigitalTwinDataFilled = Object.keys(digitalTwinGltfData).length !== 0;
        if (storedDigitalTwinType === "Gltf 3D model" && isDigitalTwinDataFilled) {
            if (isGlftDataReady && isFemResDataReady && isDTRefDataReady) {
                const dtReferencesData = {
                    digitalTwinSimulationFormat,
                    topicsRef,
                    sensorsRef
                };

                if (isGlftDataReady && isFemResDataReady && isDTRefDataReady) {
                    const [isOk, errorMessage] = ckeckDigitalTwinRefFile(digitalTwinGltfData, dtReferencesData);
                    if (!isOk) {
                        toast.error(errorMessage);
                        setIsFormReady(false);
                    } else {
                        setTopicsRef(dtReferencesData.topicsRef);
                        setSensorsRef(dtReferencesData.sensorsRef);
                        setIsFormReady(true);
                    }
        
                } else {
                    setIsFormReady(false);
                }

            } else {
                setIsFormReady(false);
            }
        } else {
            setIsFormReady(true);
        }
    }, [
        storedDigitalTwinType,
        digitalTwinGltfData,
        isDTRefDataReady,
        isFemResDataReady,
        isGlftDataReady,
        digitalTwinSimulationFormat,
        topicsRef,
        sensorsRef
    ]);

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
                        setGltfFileLastModif(gltfFileLastModif);
                        setIsGlftDataReady(true);
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
                                setIsFemResDataReady(true);
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
            !gltfFileParamsLoading &&
            gltfFileParamsFilesContent.length !== 0 &&
            gltfFileParamsPlainFiles.length !== 0
        ) {
            setLocalGltfFileLoaded(true)
            try {
                const fileContent = gltfFileParamsFilesContent[0].content
                const gltfData = JSON.parse(fileContent);
                const message = checkGltfFile(gltfData);
                if (message !== "OK") {
                    throw new Error(message);
                }
                setDigitalTwinGltfData(gltfData);
                setGltfFile(gltfFileParamsPlainFiles[0]);
                const gltfFileName = gltfFileParamsPlainFiles[0].name;
                setGltfFileName(gltfFileName);
                const dateString = (gltfFileParamsPlainFiles[0] as any).lastModified;
                setGltfFileLastModif(formatDateString(dateString));
                setLocalGltfFileLoaded(false);
                gltfFileParamsClear();
                setIsGlftDataReady(true);
            } catch (error) {
                if (error instanceof Error) {
                    toast.error(`Invalid gltffile. ${error.message}`);
                } else {
                    toast.error("Invalid gltffile");
                }
                setLocalGltfFileLoaded(false);
                gltfFileParamsClear();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        gltfFileParamsLoading,
        gltfFileParamsFilesContent,
        gltfFileParamsPlainFiles,
        gltfFileParamsClear
    ])

    useEffect(() => {
        if (!femResFileParamsLoading &&
            femResFileParamsFilesContent.length !== 0 &&
            femResFileParamsPlainFiles.length !== 0
        ) {
            setLocalFemResFileLoaded(true);
            try {
                const fileContent = femResFileParamsFilesContent[0].content
                const femResData = JSON.parse(fileContent);
                setDigitalTwiFemResData(femResData);
                setFemResFile(femResFileParamsPlainFiles[0]);
                const femResFileName = femResFileParamsPlainFiles[0].name;
                setFemResFileName(femResFileName);
                const dateString = (femResFileParamsPlainFiles[0] as any).lastModified;
                setFemResFileLastModifDateString(formatDateString(dateString));
                setLocalFemResFileLoaded(false);
                femResFileParamsClear();
                setIsFemResDataReady(true);
            } catch (e) {
                console.log(e);
                toast.error("Invalid fem simulation file");
                setLocalFemResFileLoaded(false);
                femResFileParamsClear();
            }
        }
    },
        [
            femResFileParamsLoading,
            femResFileParamsFilesContent,
            femResFileParamsPlainFiles,
            femResFileParamsClear
        ]);

    useEffect(() => {
        if (
            !dtRefFileParamsLoading &&
            dtRefFileParamsFilesContent.length !== 0 &&
            dtRefFileParamsPlainFiles.length !== 0
        ) {
            setDTReferencesFileLoaded(true);
            try {
                const fileContent = dtRefFileParamsFilesContent[0].content
                const dtReferencesData = JSON.parse(fileContent);
                const digitalTwinSimulationFormat = dtReferencesData.digitalTwinSimulationFormat;
                const isFileOk = digitalTwinFormatValidation(digitalTwinSimulationFormat);
                if (!isFileOk) throw new Error("Invalid dt simulation format file");
                setDigitalTwinSimulationFormat(digitalTwinSimulationFormat);
                const newTopicsRef = dtReferencesData.topicsRef;
                newTopicsRef.map((topicReference: ITopicRef) => {
                    if (topicReference.topicId === 0) {
                        const storedTopicRef = digitalTwinInitialData.topicsRef.filter(item =>
                            item.topicRef === topicReference.topicRef
                        )[0];
                        if (storedTopicRef) topicReference.topicId = storedTopicRef.topicId;
                    }
                    return topicReference;
                })
                setTopicsRef(newTopicsRef);

                const newSensorsRef = dtReferencesData.sensorsRef;
                newSensorsRef.map((sensorReference: ISensorRef) => {
                    if (sensorReference.sensorId === 0) {
                        const storedSensorRef = digitalTwinInitialData.sensorsRef.filter(item =>
                            item.sensorRef === sensorReference.sensorRef
                        )[0];
                        if (storedSensorRef) {
                            sensorReference.sensorId = storedSensorRef.sensorId;
                            sensorReference.topicId = storedSensorRef.topicId;
                        }
                    }
                    return sensorReference;
                })
                setSensorsRef(newSensorsRef);
                const dtRefFileName = dtRefFileParamsPlainFiles[0].name;
                setDTRefFileName(dtRefFileName);
                const dateString = (dtRefFileParamsPlainFiles[0] as any).lastModified;
                setDTRefFileLastModifDate(formatDateString(dateString));
                setDTReferencesFileLoaded(false);
                dtRefFileParamsClear();
                setIsDTRefDataReady(true);
            } catch (error: any) {
                toast.error(error);
                setDTReferencesFileLoaded(false);
                dtRefFileParamsClear();
            }
        }
    },
        [
            dtRefFileParamsLoading,
            dtRefFileParamsFilesContent,
            dtRefFileParamsPlainFiles,
            dtRefFileParamsClear,
            digitalTwinInitialData.topicsRef,
            digitalTwinInitialData.sensorsRef
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
            digitalTwinSimulationFormat: JSON.stringify(digitalTwinSimulationFormat),
            dtRefFileName,
            dtRefFileLastModifDate,
            topicsRef,
            sensorsRef
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
            then: (schema) => schema.min(1, "The minimum numer of FEM results files is 1").required("Must enter maxNumResFemFiles")
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
        gltfFileParamsClear();
        setIsGlftDataReady(false);
    }

    const localGltfFileButtonHandler = async () => {
        if (!localGltfFileLoaded) {
            selectFile(openGlftFileSelector, gltfFileParamsClear);
        }
    }

    const clearFemResFile = () => {
        setFemResFileName("-");
        setFemResFileLastModifDateString("-");
        setDigitalTwiFemResData({});
        setLocalFemResFileLoaded(false);
        femResFileParamsClear();
        setIsFemResDataReady(false);
    }

    const localFemResFileButtonHandler = () => {
        if (!localFemResFileLoaded) {
            selectFile(openFemResFileSelector, femResFileParamsClear);
        }
    }

    const clearDTRefFile = () => {
        setDTRefFileName("-");
        setDTRefFileLastModifDate("-");
        setDigitalTwinSimulationFormat("{}");
        setTopicsRef([]);
        setSensorsRef([]);
        setDTReferencesFileLoaded(false);
        femResFileParamsClear();
        setIsDTRefDataReady(false);
    }

    const dtRefFileButtonHandler = () => {
        if (!dtReferencesFileLoaded) {
            selectFile(openDTRefFileSelector, dtRefFileParamsClear);
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
                                                <FormButtonsProps
                                                    onCancel={onCancel}
                                                    isValid={formik.isValid && isFormReady}
                                                    isSubmitting={formik.isSubmitting}
                                                />
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