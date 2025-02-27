import { FC, useState, SyntheticEvent, useEffect } from "react";
import styled from "styled-components";
import { Formik, Form, FormikProps } from "formik";
import * as Yup from "yup";
import { useFilePicker } from "use-file-picker";
import { GLTFLoader } from "three-stdlib";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import {
    axiosAuth,
    checkGltfFile,
    digitalTwinFormatValidation,
    getDomainName,
    getProtocol,
} from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { DIGITAL_TWINS_OPTIONS } from "../Utils/platformAssistantOptions";
import {
    setDigitalTwinsOptionToShow,
    useDigitalTwinIdToEdit,
    useDigitalTwinRowIndexToEdit,
    useDigitalTwinsDispatch,
} from "../../../contexts/digitalTwinsOptions";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import Loader from "../../Tools/Loader";
import formatDateString from "../../../tools/formatDate";
import {
    setReloadDashboardsTable,
    setReloadSensorsTable,
    setReloadTopicsTable,
    useGroupsManagedTable,
    useOrgsOfGroupsManagedTable,
    usePlatformAssitantDispatch,
} from "../../../contexts/platformAssistantContext";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { getSensorsRef, getSensorsRefFromDigitalTwinGltfData } from "./CreateDigitalTwin";
import { FieldContainer } from "./EditAsset";
import { ControlsContainer, FormContainer } from "./CreateAsset";
import { AxiosResponse, AxiosError } from "axios";

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

const ChatAssistantTitle = styled.div`
    margin-bottom: 5px;
`;

const ChatAssistantContainer = styled.div`
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
};

const domainName = getDomainName();
const protocol = getProtocol();

const digitalTwinTypeOptions = [
    {
        label: "Grafana dashboard",
        value: "Grafana dashboard",
    },
    {
        label: "Glb 3D model",
        value: "Glb 3D model",
    },
    {
        label: "Gltf 3D model",
        value: "Gltf 3D model",
    },
];

const chatAssistantEnabledOptions = [
    {
        label: "Yes",
        value: true,
    },
    {
        label: "No",
        value: false,
    },
];


const chatAssistantLanguageOptions = [
    {
        label: "None",
        value: "none",
    },
    {
        label: "UK English Male",
        value: "en-UK-male",
    },
    {
        label: "UK English Female",
        value: "en-UK-female",
    },
    {
        label: "Spanish",
        value: "es-ES",
    },
    {
        label: "French",
        value: "fr-FR",
    },
    {
        label: "Italian",
        value: "it-IT",
    },
    {
        label: "German",
        value: "de-DE",
    },
    {
        label: "Catalan",
        value: "ca",
    },
];

interface EditDigitalTwinProps {
    digitalTwins: IDigitalTwin[];
    backToTable: () => void;
    refreshDigitalTwins: () => void;
}

type FormikType = FormikProps<{
    description: string;
    type: string;
    maxNumResFemFiles: string;
    chatAssistantEnabled: boolean;
    chatAssistantLanguage: string;
    digitalTwinSimulationFormat: string;
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
    const orgId = digitalTwins[digitalTwinRowIndex].orgId;
    const groupsManaged = useGroupsManagedTable();
    const group = groupsManaged.filter((groupManaged) => groupManaged.id === groupId)[0];
    const groupAcronym = group.acronym;
    const orgsOfGroupsManaged = useOrgsOfGroupsManagedTable();
    const organization = orgsOfGroupsManaged.filter((org) => org.id === orgId)[0];
    const orgAcronym = organization.acronym;
    const storedDigitalTwinType = digitalTwinInitialData.type;
    const [digitalTwinGltfDataLoading, setDigitalTwinGltfDataLoading] = useState(true);
    const [localGltfFileLoaded, setLocalGltfFileLoaded] = useState(false);
    const [gltfFile, setGltfFile] = useState<File>();
    const [isValidGltfFile, setIsValidGltfFile] = useState<boolean>(false);
    const [gltfFileContent, setGltfFileContent] = useState<string>();
    const [storedGltfFileName, setStoredGltfFileName] = useState("-");
    const [storedGltfFileLastModif, setStoredGltfFileLastModif] = useState("-");
    const [gltfFileName, setGltfFileName] = useState("-");
    const [gltfFileLastModif, setGltfFileLastModif] = useState("-");
    const [localFemResFileLoaded, setLocalFemResFileLoaded] = useState(false);
    const [digitalTwinFemResData, setDigitalTwiFemResData] = useState({});
    const [femResFile, setFemResFile] = useState<File>();
    const [femResFileNames, setFemResFileNames] = useState<string[]>([]);
    const [femResFilesLastModif, setFemResFilesLastModif] = useState<string[]>([]);
    const [femResFileName, setFemResFileName] = useState("-");
    const [femResFileLastModifDateString, setFemResFileLastModifDateString] = useState("-");
    const [digitalTwinType, setDigitalTwinType] = useState(digitalTwinInitialData.type);
    const [sensorsRef, setSensorsRef] = useState<string[]>([]);
    const [isGlftDataReady, setIsGlftDataReady] = useState(storedDigitalTwinType !== "Gltf 3D model");
    const [isChatAssistantEnabled, setIsChatAssistantEnabled] = useState(
        digitalTwins[digitalTwinRowIndex].chatAssistantEnabled
    );
    const digitalTwinUid = digitalTwins[digitalTwinRowIndex].digitalTwinUid;

    const [openGlftFileSelector, gltfFileParams] = useFilePicker({
        readAs: digitalTwinType === "Gltf 3D model" ? "Text" : "DataURL",
        multiple: false,
        accept: digitalTwinType === "Gltf 3D model" ? ".gltf" : ".glb",
    });

    const [openFemResFileSelector, femResFileParams] = useFilePicker({
        readAs: "Text",
        multiple: false,
        accept: ".json",
    });

    useEffect(() => {
        if (storedDigitalTwinType === "Gltf 3D model" || storedDigitalTwinType === "Glb 3D model") {
            const config = axiosAuth(accessToken);
            const urlDigitalTwinFileListBase0 = `${protocol}://${domainName}/admin_api/digital_twin_file_list`;
            const urlDigitalTwinFileListBase = `${urlDigitalTwinFileListBase0}/${groupId}/${digitalTwinId}`;
            const urlGltfFileList = `${urlDigitalTwinFileListBase}/gltfFile`;
            getAxiosInstance(refreshToken, authDispatch)
                .get(urlGltfFileList, config)
                .then((response: AxiosResponse<any, any>) => {
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
                            .then((response: AxiosResponse<any, any>) => {
                                const femResFileList: { fileName: string; lastModified: string }[] = response.data;
                                if (femResFileList.length !== 0) {
                                    const femResFileNames = femResFileList.map(
                                        (femResFile) => femResFile.fileName.split("/")[4]
                                    );
                                    setFemResFileNames(femResFileNames);
                                    setFemResFileName(femResFileNames[0]);
                                    const femResFilesLastModif = femResFileList.map(
                                        (femResFile) => femResFile.lastModified
                                    );
                                    setFemResFilesLastModif(femResFilesLastModif);
                                    setFemResFileLastModifDateString(formatDateString(femResFilesLastModif[0]));
                                }
                                setDigitalTwinGltfDataLoading(false);
                                setIsSubmitting(false);
                            })
                            .catch((error: AxiosError) => {
                                axiosErrorHandler(error, authDispatch);
                                setDigitalTwinGltfDataLoading(false);
                            });
                    } else {
                        setDigitalTwinGltfDataLoading(false);
                        setIsSubmitting(false);
                    }
                })
                .catch((error: AxiosError) => {
                    axiosErrorHandler(error, authDispatch);
                    setDigitalTwinGltfDataLoading(false);
                });
        } else setDigitalTwinGltfDataLoading(false);
    }, [accessToken, refreshToken, authDispatch, backToTable, storedDigitalTwinType, digitalTwinId, groupId]);

    useEffect(
        () => {
            if (gltfFileContent === undefined || gltfFileName === "-") return;
            if (gltfFileName.slice(-3) === "glb") {
                const loader = new GLTFLoader();
                loader
                    .loadAsync(gltfFileContent)
                    .then((gltf) => {
                        const sensorsRef = getSensorsRef(gltf.scene);
                        setSensorsRef(sensorsRef);
                        setIsValidGltfFile(true);
                    })
                    .catch((error) => {
                        if (error instanceof Error) {
                            toast.error(`Invalid gltffile. ${error.message}`);
                        } else {
                            toast.error("Invalid gltffile");
                        }
                        setGltfFileContent(undefined);
                        setLocalGltfFileLoaded(false);
                        setIsValidGltfFile(false);
                        gltfFileParams.clear();
                    });
            } else if (gltfFileName.slice(-4) === "gltf") {
                const gltfData = JSON.parse(gltfFileContent);
                const message = checkGltfFile(gltfData);
                if (message !== "OK") {
                    setIsValidGltfFile(false);
                    throw new Error(message);
                }
                const sensorsRef = getSensorsRefFromDigitalTwinGltfData(gltfData);
                setSensorsRef(sensorsRef);
                setIsValidGltfFile(true);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [gltfFileContent]
    );

    useEffect(() => {
        if (
            !gltfFileParams.loading &&
            gltfFileParams.filesContent.length !== 0 &&
            gltfFileParams.plainFiles.length !== 0
        ) {
            setLocalGltfFileLoaded(true);
            try {
                const fileContent = gltfFileParams.filesContent[0].content;
                setGltfFileContent(fileContent);
                setGltfFile(gltfFileParams.plainFiles[0]);
                const gltfFileName = gltfFileParams.plainFiles[0].name;
                setGltfFileName(gltfFileName);
                const dateString = (gltfFileParams.plainFiles[0] as any).lastModified;
                setGltfFileLastModif(formatDateString(dateString));
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
    }, [gltfFileParams.loading, gltfFileParams.filesContent, gltfFileParams.plainFiles, gltfFileParams]);

    useEffect(() => {
        if (
            !femResFileParams.loading &&
            femResFileParams.filesContent.length !== 0 &&
            femResFileParams.plainFiles.length !== 0
        ) {
            setLocalFemResFileLoaded(true);
            try {
                const fileContent = femResFileParams.filesContent[0].content;
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
    }, [femResFileParams.loading, femResFileParams.filesContent, femResFileParams.plainFiles, femResFileParams]);

    const onSubmit = async (values: any, actions: any) => {
        const groupId = digitalTwins[digitalTwinRowIndex].groupId;
        const url = `${protocol}://${domainName}/admin_api/digital_twin/${groupId}/${digitalTwinId}`;
        const config = axiosAuth(accessToken);
        setIsSubmitting(true);

        const configMultipart = axiosAuth(accessToken, "multipart/form-data");
        const urlUploadGltfBase0 = `${protocol}://${domainName}/admin_api/digital_twin_upload_file`;
        const urlUploadGltfBase = `${urlUploadGltfBase0}/${groupId}/${digitalTwinId}`;
        let isGltfFileModified = false;
        const maxNumResFemFiles = parseInt(values.maxNumResFemFiles, 10);

        if (isValidGltfFile && (values.type === "Gltf 3D model" || values.type === "Glb 3D model")) {
            if (
                Object.keys(digitalTwinFemResData).length !== 0 &&
                (femResFileNames[0] !== femResFileName ||
                    formatDateString(femResFilesLastModif[0]) !== formatDateString(femResFileLastModifDateString))
            ) {
                if (digitalTwins[digitalTwinRowIndex].maxNumResFemFiles < maxNumResFemFiles && maxNumResFemFiles >= 2) {
                    const warningMessage =
                        "Please increase the 'Max number of FEM result files stored' before uploading a new file.";
                    toast.warning(warningMessage);
                    setIsSubmitting(false);
                    return;
                }
                const femResData = new FormData();
                femResData.append("file", femResFile as File, femResFileName);
                const urlUploadFemResFile = `${urlUploadGltfBase}/femResFiles/${femResFileName}`;
                try {
                    const response = await getAxiosInstance(refreshToken, authDispatch).post(
                        urlUploadFemResFile,
                        femResData,
                        configMultipart
                    );
                    if (response.data) {
                        toast.success(response.data.message);
                    }
                } catch (error: any) {
                    axiosErrorHandler(error, authDispatch);
                    backToTable();
                }
            }

            if (
                gltfFile !== undefined &&
                (storedGltfFileName !== gltfFileName ||
                    formatDateString(storedGltfFileLastModif) !== formatDateString(gltfFileLastModif))
            ) {
                isGltfFileModified = true;
                const gltfData = new FormData();
                gltfData.append("file", gltfFile as File, gltfFileName);
                const urlUploadGltfFile = `${urlUploadGltfBase}/gltfFile/${gltfFileName}`;
                try {
                    const response = await getAxiosInstance(refreshToken, authDispatch).post(
                        urlUploadGltfFile,
                        gltfData,
                        configMultipart
                    );
                    if (response.data) {
                        toast.success(response.data.message);
                    }
                } catch (error: any) {
                    axiosErrorHandler(error, authDispatch);
                    backToTable();
                }
            }
        }

        let chatAssistantLanguage = "none";
        if (values.chatAssistantEnabled) {
            chatAssistantLanguage = values.chatAssistantLanguage;
        }
        const digitalTwinData = {
            digitalTwinUid,
            description: values.description,
            type: values.type,
            maxNumResFemFiles,
            isGltfFileModified,
            chatAssistantEnabled: values.chatAssistantEnabled,
            chatAssistantLanguage,
            digitalTwinSimulationFormat: JSON.stringify(JSON.parse(values.digitalTwinSimulationFormat)),
            sensorsRef,
        };

        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, digitalTwinData, config)
            .then((response: AxiosResponse<any, any>) => {
                if (response.data) {
                    toast.success(response.data.message);
                }
                const digitalTwinsOptionToShow = { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setDigitalTwinsOptionToShow(digitalTwinsDispatch, digitalTwinsOptionToShow);
            })
            .catch((error: AxiosError) => {
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
            });
    };

    const initialDigitalTwinData = {
        description: digitalTwins[digitalTwinRowIndex].description,
        type: digitalTwins[digitalTwinRowIndex].type,
        maxNumResFemFiles: digitalTwins[digitalTwinRowIndex].maxNumResFemFiles as unknown as string,
        chatAssistantEnabled: digitalTwins[digitalTwinRowIndex].chatAssistantEnabled,
        chatAssistantLanguage: digitalTwins[digitalTwinRowIndex].chatAssistantLanguage,
        digitalTwinSimulationFormat: JSON.stringify(
            digitalTwins[digitalTwinRowIndex].digitalTwinSimulationFormat,
            null,
            4
        ),
    };

    const validationSchema = Yup.object().shape({
        description: Yup.string().required("Required"),
        type: Yup.string().max(20, "The maximum number of characters allowed is 20").required("Required"),
        maxNumResFemFiles: Yup.number().when("type", {
            is: "Gltf 3D model",
            then: Yup.number()
                .min(1, "The minimum numer of FEM results files is 1")
                .required("Must enter maxNumResFemFiles"),
        }),
        digitalTwinSimulationFormat: Yup.string().when("type", {
            is: "Gltf 3D model",
            then: Yup.string()
                .test("test-name", "Wrong format for the json object", (value: any) =>
                    digitalTwinFormatValidation(value)
                )
                .required("Must enter Digital twin simulation format"),
        }),
    });

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        backToTable();
    };

    const onDigitalTwinTypeSelectChange = (e: { value: string }, formik: FormikType) => {
        setDigitalTwinType(e.value);
        formik.setFieldValue("type", e.value);
    };

    const onchatAssistantEnabledOptions = (e: { value: boolean }, formik: FormikType) => {
        formik.setFieldValue("chatAssistantEnabled", e.value);
        setIsChatAssistantEnabled(e.value);
    };

    const onchatAssistantLanguageOptions = (e: { value: string }, formik: FormikType) => {
        formik.setFieldValue("chatAssistantLanguage", e.value);
    };

    const clearGltfDataFile = () => {
        setGltfFileName("-");
        setGltfFileLastModif("-");
        setLocalGltfFileLoaded(false);
        gltfFileParams.clear();
        setIsGlftDataReady(false);
    };

    const localGltfFileButtonHandler = async () => {
        if (!localGltfFileLoaded) {
            selectFile(openGlftFileSelector, gltfFileParams.clear);
        }
    };

    const clearFemResFile = () => {
        setFemResFileName("-");
        setFemResFileLastModifDateString("-");
        setDigitalTwiFemResData({});
        setLocalFemResFileLoaded(false);
        femResFileParams.clear();
    };

    const localFemResFileButtonHandler = () => {
        if (!localFemResFileLoaded) {
            selectFile(openFemResFileSelector, femResFileParams.clear);
        }
    };

    return (
        <>
            {digitalTwinGltfDataLoading ? (
                <Loader />
            ) : (
                <>
                    <FormTitle isSubmitting={isSubmitting}>Edit digital twin</FormTitle>
                    <FormContainer>
                        <Formik
                            initialValues={initialDigitalTwinData}
                            validationSchema={validationSchema}
                            onSubmit={onSubmit}
                        >
                            {(formik) => {
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
                                            <FieldContainer>
                                                <label>DigitalTwinUid</label>
                                                <div>{digitalTwinUid}</div>
                                            </FieldContainer>
                                            <FormikControl
                                                control="input"
                                                label="Description"
                                                name="description"
                                                type="text"
                                            />
                                            <FormikControl
                                                control="select"
                                                label="Type"
                                                name="type"
                                                options={digitalTwinTypeOptions}
                                                type="text"
                                                onChange={(e) => onDigitalTwinTypeSelectChange(e, formik)}
                                            />
                                            {(digitalTwinType === "Gltf 3D model" ||
                                                digitalTwinType === "Glb 3D model") && (
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
                                                        <SelectDataFilenButtonContainer>
                                                            <FileButton type="button" onClick={clearGltfDataFile}>
                                                                Clear
                                                            </FileButton>
                                                            <FileButton
                                                                type="button"
                                                                onClick={() => localGltfFileButtonHandler()}
                                                            >
                                                                Select local file
                                                            </FileButton>
                                                        </SelectDataFilenButtonContainer>
                                                    </DataFileContainer>
                                                    <DataFileTitle>FEM results file</DataFileTitle>
                                                    <DataFileContainer>
                                                        <FormikControl
                                                            control="input"
                                                            label="Max number of FEM result files stored"
                                                            name="maxNumResFemFiles"
                                                            type="text"
                                                        />
                                                        <FieldContainer>
                                                            <label>File name</label>
                                                            <div>{femResFileName}</div>
                                                        </FieldContainer>
                                                        <FieldContainer>
                                                            <label>Last modification date</label>
                                                            <div>{femResFileLastModifDateString}</div>
                                                        </FieldContainer>
                                                        <SelectDataFilenButtonContainer>
                                                            <FileButton type="button" onClick={clearFemResFile}>
                                                                Clear
                                                            </FileButton>
                                                            <FileButton
                                                                type="button"
                                                                onClick={() => localFemResFileButtonHandler()}
                                                            >
                                                                Select local file
                                                            </FileButton>
                                                        </SelectDataFilenButtonContainer>
                                                    </DataFileContainer>
                                                    <ChatAssistantTitle>Chat assistant</ChatAssistantTitle>
                                                    <ChatAssistantContainer>
                                                        <FormikControl
                                                            control="select"
                                                            label="Use chat assistant"
                                                            name="chatAssistantEnabled"
                                                            options={chatAssistantEnabledOptions}
                                                            type="text"
                                                            onChange={(e) => onchatAssistantEnabledOptions(e, formik)}
                                                        />
                                                        {isChatAssistantEnabled && (
                                                            <FormikControl
                                                                control="select"
                                                                label="Select chat assistant language"
                                                                name="chatAssistantLanguage"
                                                                options={chatAssistantLanguageOptions}
                                                                type="text"
                                                                onChange={(e) =>
                                                                    onchatAssistantLanguageOptions(e, formik)
                                                                }
                                                            />
                                                        )}
                                                    </ChatAssistantContainer>
                                                    <FormikControl
                                                        control="textarea"
                                                        label="Digital twin simulation format"
                                                        name="digitalTwinSimulationFormat"
                                                        textAreaSize="Small"
                                                    />
                                                </>
                                            )}
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
                                );
                            }}
                        </Formik>
                    </FormContainer>
                </>
            )}
        </>
    );
};

export default EditDigitalTwin;
