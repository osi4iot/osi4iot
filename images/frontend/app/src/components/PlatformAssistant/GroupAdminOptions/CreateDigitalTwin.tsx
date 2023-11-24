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

//Corregir
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

const domainName = getDomainName();
const protocol = getProtocol();

const initialDigitalTwinData = {
    groupId: "",
    assetId: "",
    description: "",
    type: "Grafana dashboard",
    digitalTwinUid: "",
    maxNumResFemFiles: "1",
    digitalTwinSimulationFormat: "{}"
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

export const getSensorsRefFromDigitalTwinGltfData = (
    digitalTwinGltfData: any,
) => {
    const sensorsRef: string[] = [];
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
                        sensorRef: string;
                        type: string;
                        clipSensorRef: string;
                    };
                }
            ) => {
                // if (node.mesh !== undefined && node.extras !== undefined) {
                if (node.extras !== undefined) {
                    if (node.extras.type && node.extras.type === "sensor") {
                        const sensorRef = node.extras?.sensorRef;
                        if (sensorRef) {
                            if (sensorsRef.indexOf(sensorRef) === -1) {
                                sensorsRef.push(sensorRef);
                            }
                        }
                    }
                    if (node.extras.clipSensorRef !== undefined) {
                        const clipSensorRef = node.extras?.clipSensorRef;
                        if (clipSensorRef) {
                            if (sensorsRef.indexOf(clipSensorRef) === -1) {
                                sensorsRef.push(clipSensorRef);
                            }
                        }
                    }
                }

            })
    }
    return sensorsRef;
}


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
    digitalTwinSimulationFormat: string;
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
    const [digitalTwinType, setDigitalTwinType] = useState("Grafana dashboard");
    const [isGlftDataReady, setIsGlftDataReady] = useState(false);
    const [sensorsRef, setSensorsRef] = useState<string[]>([]);


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
                const sensorsRef = getSensorsRefFromDigitalTwinGltfData(gltfData);
                setSensorsRef(sensorsRef);
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


    const onSubmit = (values: any, actions: any) => {
        const groupId = values.groupId;
        const assetId = values.assetId;
        const url = `${protocol}://${domainName}/admin_api/digital_twin/${groupId}/${assetId}`;
        const config = axiosAuth(accessToken);

        const maxNumResFemFiles = parseInt(values.maxNumResFemFiles, 10);
        const digitalTwinData = {
            description: values.description,
            type: values.type,
            digitalTwinUid: values.digitalTwinUid,
            maxNumResFemFiles,
            digitalTwinSimulationFormat: JSON.stringify(JSON.parse(values.digitalTwinSimulationFormat)),
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

    const clearGltfDataFile = () => {
        setGltfFileName("-");
        setGltfFileLastModifDateString("-");
        setDigitalTwinGltfData({});
        setLocalGltfFileLoaded(false);
        gltfFileParams.clear();
        setIsGlftDataReady(false);
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
                                                <FormikControl
                                                    control='textarea'
                                                    label='Digital twin simulation format'
                                                    name='digitalTwinSimulationFormat'
                                                    textAreaSize='Small'
                                                />
                                            </>

                                        }
                                    </ControlsContainer>
                                    <FormButtonsProps
                                        onCancel={onCancel}
                                        isValid={
                                            formik.isValid &&
                                            (isGlftDataReady || formik.values.type === "Grafana dashboard")
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