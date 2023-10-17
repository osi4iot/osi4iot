import { FC, useState, SyntheticEvent, useEffect } from 'react';
import styled from "styled-components";
import { Formik, Form, FormikProps } from 'formik';
import * as Yup from 'yup';
import { nanoid } from "nanoid";
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import {
    axiosAuth,
    checkGltfFile,
    digitalTwinFormatValidation,
    getDomainName,
    getProtocol,
    IMeshNode
} from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { DIGITAL_TWINS_OPTIONS } from '../Utils/platformAssistantOptions';
import { setDigitalTwinsOptionToShow, useDigitalTwinsDispatch } from '../../../contexts/digitalTwinsOptions';
import { useFilePicker } from 'use-file-picker';
import formatDateString from '../../../tools/formatDate';
import { setReloadDashboardsTable, setReloadSensorsTable, setReloadTopicsTable, usePlatformAssitantDispatch } from '../../../contexts/platformAssistantContext';
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

export const getTopicSensorTypesFromDigitalTwin = (gltfData: any): {
    sensorsRefList: string[],
    topicsRefList: string[]
} => {
    const sensorsRefList: string[] = [];
    const topicsRefList: string[] = [];
    if (typeof gltfData === "string") gltfData = JSON.parse(gltfData);
    if (Object.keys(gltfData).length && gltfData.nodes?.length !== 0) {
        const meshNodes: IMeshNode[] = [];
        gltfData.nodes.forEach((node: IMeshNode) => {
            //node.mesh are not included for taking into account root nodes
            if (node.extras !== undefined) meshNodes.push(node);
        })
        meshNodes.forEach((node: IMeshNode) => {
            if (node.extras?.type !== undefined && node.extras?.type === "sensor") {
                const topicType = node.extras?.topicType;
                if (topicType && topicsRefList.findIndex(topicRefi => topicRefi === topicType) === -1) {
                    topicsRefList.push(topicType);
                }
                const sensorRef = node.extras?.sensorRef;
                if (sensorRef && sensorsRefList.findIndex(sensorRefi => sensorRefi === sensorRef) === -1) {
                    sensorsRefList.push(sensorRef)
                }
            }
            if (node.extras?.clipTopicType !== undefined) {
                const topicType = node.extras?.clipTopicType;
                if (topicType && topicsRefList.findIndex(topicRefi => topicRefi === topicType) === -1) {
                    topicsRefList.push(topicType);
                }
            }
        })
    }
    return { sensorsRefList, topicsRefList };
}

export interface ITopicRef {
    topicId: number;
    topicRef: string;
}

export interface ISensorRef {
    sensorId: number;
    sensorRef: string;
    topicId: number
}

const findTopicIdForSensor = (topicRef: string, topicsRef: ITopicRef[]) => {
    let sensorTopicId = -1;
    for (const topicSensor of topicsRef) {
        const topicSensorIndex = parseInt(topicSensor.topicRef.split("_").slice(-1)[0], 10);
        if (topicRef === `dev2pdb_${topicSensorIndex}`) {
            sensorTopicId = topicSensor.topicId;
            break;
        }
    }
    return sensorTopicId;
}

export const checkReferencesMatch = (digitalTwinGltfData: any, dtReferencesData: any) => {
    let referencesMatch = true;
    const { topicsRefList, sensorsRefList } = getTopicSensorTypesFromDigitalTwin(digitalTwinGltfData);
    if (
        topicsRefList.length !== dtReferencesData.topicsRef.length &&
        sensorsRefList.length !== dtReferencesData.sensorsRef.length
    ) {
        referencesMatch = false;
    } else {
        topicsRefList.sort();
        dtReferencesData.topicsRef.sort((a: any, b: any) => {
            return a.topicRef - b.topicRef;
        })
        let topicRefIndexMatch = true;
        for (let i = 0; i < topicsRefList.length; i++) {
            const index1 = parseInt(topicsRefList[i].split("_")[1], 10);
            const index2 = parseInt(dtReferencesData.topicsRef[i].topicRef.split("_")[1], 10);
            if (index1 !== index2 || index1 !== (i + 1)) {
                topicRefIndexMatch = false;
                break;
            }
        }

        if (topicRefIndexMatch) {
            sensorsRefList.sort();
            dtReferencesData.sensorsRef.sort((a: any, b: any) => {
                return a.sensorRef - b.sensorRef;
            })
            let sensorRefIndexMatch = true;
            for (let i = 0; i < sensorsRefList.length; i++) {
                const index1 = parseInt(sensorsRefList[i].split("_")[1], 10);
                const index2 = parseInt(dtReferencesData.sensorsRef[i].sensorRef.split("_")[1], 10);
                if (index1 !== index2 || index1 !== (i + 1)) {
                    sensorRefIndexMatch = false;
                    break;
                }
            }
            if (!sensorRefIndexMatch) referencesMatch = false;
        } else {
            referencesMatch = false;
        }
    }
    return referencesMatch;
}

export const updatedTopicSensorIdsFromDigitalTwinGltfData = (
    digitalTwinGltfData: any,
    setDigitalTwinGltfData: (digitalTwinGltfData: any) => void,
    topicsRef: ITopicRef[],
) => {
    if (typeof digitalTwinGltfData === "string") digitalTwinGltfData = JSON.parse(digitalTwinGltfData);
    if (Object.keys(digitalTwinGltfData).length && digitalTwinGltfData.nodes?.length !== 0) {
        digitalTwinGltfData.nodes.forEach(
            (
                node: {
                    name?: string; mesh?: number;
                    extras: {
                        animationType: string;
                        topicType: string;
                        objectOnOff: string;
                        sensorTopicId: number;
                        type: string;
                        clipTopicType: string;
                        clipTopicId: number;
                        sensorRef: string;
                        sensorId: number;
                    };
                }
            ) => {
                // if (node.mesh !== undefined && node.extras !== undefined) {
                if (node.extras !== undefined) {
                    if (node.extras.type && node.extras.type === "sensor") {
                        const topicRef = node.extras?.topicType;
                        if (topicRef) {
                            const topicId = findTopicIdForSensor(topicRef, topicsRef);
                            node.extras.sensorTopicId = topicId;
                        }
                    }
                    if (node.extras.clipTopicType !== undefined) {
                        const topicRef = node.extras?.clipTopicType;
                        const topicId = findTopicIdForSensor(topicRef, topicsRef);
                        node.extras.clipTopicId = topicId;
                    }
                }

            })
        setDigitalTwinGltfData(digitalTwinGltfData);
    }

}

const domainName = getDomainName();
const protocol = getProtocol();

const initialDigitalTwinData = {
    groupId: "",
    assetId: "",
    description: "",
    type: "Grafana dashboard",
    digitalTwinUid: "",
    maxNumResFemFiles: "1"
}

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


interface CreateDigitalTwinProps {
    backToTable: () => void;
    refreshDigitalTwins: () => void;
}

interface IFormikValues {
    groupId: string;
    assetId: string;
    digitalTwinUid: string;
    description: string;
    type: string;
    maxNumResFemFiles: string;
}

type FormikType = FormikProps<IFormikValues>

const CreateDigitalTwin: FC<CreateDigitalTwinProps> = ({ backToTable, refreshDigitalTwins }) => {
    initialDigitalTwinData.digitalTwinUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const digitalTwinsDispatch = useDigitalTwinsDispatch();
    const [localGltfFileLoaded, setLocalGltfFileLoaded] = useState(false);
    const [gltfFile, setGltfFile] = useState<File>();
    const [gltfFileName, setGltfFileName] = useState("-");
    const [gltfFileLastModifDateString, setGltfFileLastModifDateString] = useState("-");
    const [digitalTwinGltfData, setDigitalTwinGltfData] = useState({});
    const [localFemResFileLoaded, setLocalFemResFileLoaded] = useState(false);
    const [digitalTwinFemResData, setDigitalTwiFemResData] = useState({});
    const [femResFile, setFemResFile] = useState<File>();
    const [femResFileName, setFemResFileName] = useState("-");
    const [femResFileLastModifDateString, setFemResFileLastModifDateString] = useState("-");
    const [dtRefFileName, setDTRefFileName] = useState("-");
    const [dtRefFileLastModifDate, setDTRefFileLastModifDate] = useState("-");
    const [dtReferencesData, setDtReferencesData] = useState<any>({});
    const [dtReferencesFileLoaded, setDTReferencesFileLoaded] = useState(false);
    const [digitalTwinType, setDigitalTwinType] = useState("Grafana dashboard");
    const [isGlftDataReady, setIsGlftDataReady] = useState(false);
    const [isFemResDataReady, setIsFemResDataReady] = useState(false);
    const [isDTRefDataReady, setIsDTRefDataReady] = useState(false);
    const [isFormReady, setIsFormReady] = useState(false);
    const initialTopicsRef = [{ topicRef: "dev2pdb_1", topicId: 0 }];
    const [topicsRef, setTopicsRef] = useState<ITopicRef[]>(initialTopicsRef);
    const [sensorsRef, setSensorsRef] = useState<ISensorRef[]>([]);

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
        if (isGlftDataReady && isFemResDataReady && isDTRefDataReady) {
            const referencesMatch = checkReferencesMatch(digitalTwinGltfData, dtReferencesData);
            if (referencesMatch) {
                setTopicsRef(dtReferencesData.topicsRef);
                setSensorsRef(dtReferencesData.sensorsRef);
                setIsFormReady(true);
            } else {
                const errorMessage = "Gltf file references not match with digital twin references file";
                toast.error(errorMessage);
                setIsFormReady(false);
            }

        } else {
            setIsFormReady(false);
        }
    }, [
        digitalTwinGltfData,
        dtReferencesData,
        isDTRefDataReady,
        isFemResDataReady,
        isGlftDataReady
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
                setGltfFileLastModifDateString(formatDateString(dateString));
                setLocalGltfFileLoaded(false);
                gltfFileParams.clear();
                setIsGlftDataReady(true);
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
                setIsFemResDataReady(true);
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
                setIsDTRefDataReady(true);
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

    const onSubmit = (values: any, actions: any) => {
        const groupId = values.groupId;
        const assetId = values.assetId;
        const url = `${protocol}://${domainName}/admin_api/digital_twin/${groupId}/${assetId}`;
        const config = axiosAuth(accessToken);

        const maxNumResFemFiles = parseInt(values.maxNumResFemFiles, 10);
        let digitalTwinSimulationFormat = "{}";
        if (Object.keys(dtReferencesData).length !== 0) {
            digitalTwinSimulationFormat = JSON.stringify(dtReferencesData.digitalTwinSimulationFormat);
        }
        const digitalTwinData = {
            description: values.description,
            type: values.type,
            digitalTwinUid: values.digitalTwinUid,
            maxNumResFemFiles,
            digitalTwinSimulationFormat,
            dtRefFileName,
            dtRefFileLastModifDate,
            topicsRef,
            sensorsRef
        };

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, digitalTwinData, config)
            .then((response) => {
                const data = response.data;
                toast.success(data.message);
                const digitalTwinsOptionToShow = { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setDigitalTwinsOptionToShow(digitalTwinsDispatch, digitalTwinsOptionToShow);
                const configMultipart = axiosAuth(accessToken, "multipart/form-data")
                const urlUploadGltfBase0 = `${protocol}://${domainName}/admin_api/digital_twin_upload_file`;
                const urlUploadGltfBase = `${urlUploadGltfBase0}/${groupId}/${data.digitalTwinId}`;

                if (Object.keys(digitalTwinGltfData).length !== 0) {
                    let file = gltfFile as File;
                    if (values.type === "Gltf 3D model") {
                        updatedTopicSensorIdsFromDigitalTwinGltfData(
                            digitalTwinGltfData,
                            setDigitalTwinGltfData,
                            data.topicsRef
                        );
                        const str = JSON.stringify(digitalTwinGltfData);
                        const bytes = new TextEncoder().encode(str);
                        file = new File([bytes], (gltfFile as File).name);
                    }
                    const gltfData = new FormData();
                    gltfData.append("file", file, gltfFileName);
                    const urlUploadGltfFile = `${urlUploadGltfBase}/gltfFile/${gltfFileName}`;
                    getAxiosInstance(refreshToken, authDispatch)
                        .post(urlUploadGltfFile, gltfData, configMultipart)
                        .then((response) => {
                            toast.success(response.data.message);
                        })
                        .catch((error) => {
                            axiosErrorHandler(error, authDispatch);
                            backToTable();
                        })
                }

                if (Object.keys(digitalTwinFemResData).length !== 0) {
                    const femResData = new FormData();
                    femResData.append("file", femResFile as File, "femResFile");
                    const urlUploadFemResFile = `${urlUploadGltfBase}/femResFiles/${femResFileName}`;
                    getAxiosInstance(refreshToken, authDispatch)
                        .post(urlUploadFemResFile, femResData, configMultipart)
                        .then((response) => {
                            toast.success(response.data.message);
                        })
                        .catch((error) => {
                            axiosErrorHandler(error, authDispatch);
                            backToTable();
                        })
                }


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

    const validationSchema = Yup.object().shape({
        groupId: Yup.number().required('Required'),
        assetId: Yup.number().required('Required'),
        digitalTwinUid: Yup.string().length(20, "String must be 20 characters long").required('Required'),
        description: Yup.string().required('Required'),
        type: Yup.string().max(20, "The maximum number of characters allowed is 20").required('Required'),
        maxNumResFemFiles: Yup.number().when("type", {
            is: "Gltf 3D model",
            then: Yup.number().min(1, "The minimum numer of FEM results files is 1").required("Must enter maxNumResFemFiles")
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

    const clearGltfDataFile = () => {
        setGltfFileName("-");
        setGltfFileLastModifDateString("-");
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
            <FormTitle isSubmitting={isSubmitting}>Create digital twin</FormTitle>
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
                                            label='GroupId'
                                            name='groupId'
                                            type='text'
                                        />
                                        <FormikControl
                                            control='input'
                                            label='AssetId'
                                            name='assetId'
                                            type='text'
                                        />
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
                                                        <div>{gltfFileLastModifDateString}</div>
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
                                        isValid={
                                            formik.isValid &&
                                            (isFormReady || formik.values.type === "Grafana dashboard")
                                        }
                                        isSubmitting={formik.isSubmitting}
                                    />
                                </Form>
                            )
                        }
                    }
                </Formik>
            </FormContainer>
        </>
    )
}

export default CreateDigitalTwin;