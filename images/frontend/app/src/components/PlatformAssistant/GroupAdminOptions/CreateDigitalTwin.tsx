import { FC, useState, SyntheticEvent, useEffect } from "react";
import styled from "styled-components";
import { Formik, Form, FormikProps } from "formik";
import * as Yup from "yup";
import YAML from "yaml";
import { nanoid } from "nanoid";
import { GLTFLoader } from "three-stdlib";
import { useAuthState, useAuthDispatch } from "../../../contexts/authContext";
import {
    axiosAuth,
    checkGltfFile,
    convertArrayToOptions,
    digitalTwinFormatValidation,
    getDomainName,
    getProtocol,
    IOption,
} from "../../../tools/tools";
import { toast } from "react-toastify";
import FormikControl from "../../Tools/FormikControl";
import FormButtonsProps from "../../Tools/FormButtons";
import FormTitle from "../../Tools/FormTitle";
import { DIGITAL_TWINS_OPTIONS } from "../Utils/platformAssistantOptions";
import { setDigitalTwinsOptionToShow, useDigitalTwinsDispatch } from "../../../contexts/digitalTwinsOptions";
import { useFilePicker } from "use-file-picker";
import formatDateString from "../../../tools/formatDate";
import {
    setReloadDashboardsTable,
    setReloadSensorsTable,
    setReloadTopicsTable,
    useAssetsTable,
    useGroupsManagedTable,
    useOrgsOfGroupsManagedTable,
    usePlatformAssitantDispatch,
} from "../../../contexts/platformAssistantContext";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";
import { IAsset } from "../TableColumns/assetsColumns";
import { AxiosError, AxiosResponse } from "axios";

// CodeMirror imports
import CodeMirror, { keymap } from "@uiw/react-codemirror";
import { indentUnit, indentOnInput } from "@codemirror/language";
import { completionKeymap } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { CodeMirrorWrapper } from "../../Tools/CodeMirrorWrapper";
import { ControlsContainer, DraggableFormContainer, FieldErrorScroller } from "../../Tools/FormTools";
import { ReIndentCommand } from "../DigitalTwin3DViewer/Pipeline/types";

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
};

export interface ITopicRef {
    topicId: number;
    topicRef: string;
}

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

export const getSensorsRefFromDigitalTwinGltfData = (digitalTwinGltfData: any) => {
    const sensorsRef: string[] = [];
    if (typeof digitalTwinGltfData === "string") digitalTwinGltfData = JSON.parse(digitalTwinGltfData);
    if (Object.keys(digitalTwinGltfData).length && digitalTwinGltfData.nodes?.length !== 0) {
        digitalTwinGltfData.nodes.forEach(
            (node: {
                name?: string;
                mesh?: number;
                extras: {
                    animationType: string;
                    topicType: string;
                    objectOnOff: string;
                    sensorRef: string;
                    type: string;
                    clipSensorRef: string;
                };
            }) => {
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
            },
        );
    }
    return sensorsRef;
};

const findGroupArray = (
    orgsOfGroupManaged: IOrgOfGroupsManaged[],
    groupsManaged: IGroupManaged[],
): Record<string, string[]> => {
    const groupArray: Record<string, string[]> = {};
    for (const group of groupsManaged) {
        const orgAcronym = orgsOfGroupManaged.filter((org) => org.id === group.orgId)[0].acronym;
        if (groupArray[orgAcronym] === undefined) {
            groupArray[orgAcronym] = [];
        }
        if (groupArray[orgAcronym].indexOf(group.acronym) === -1) {
            groupArray[orgAcronym].push(group.acronym);
        }
    }
    return groupArray;
};

const findAssetNameArray = (assetsManaged: IAsset[], groupsManaged: IGroupManaged[]): Record<string, string[]> => {
    const assetArray: Record<string, string[]> = {};
    for (const asset of assetsManaged) {
        const groupAcronym = groupsManaged.filter((group) => group.id === asset.groupId)[0].acronym;
        if (assetArray[groupAcronym] === undefined) {
            assetArray[groupAcronym] = [];
        }
        const assetName = `Asset_${asset.assetUid}`;
        if (assetArray[groupAcronym].indexOf(assetName) === -1) {
            assetArray[groupAcronym].push(assetName);
        }
    }
    return assetArray;
};

const findAssetDescription = (assetsManaged: IAsset[], assetName: string): string => {
    const assetManaged = assetsManaged.filter((asset) => `Asset_${asset.assetUid}` === assetName)[0];
    return assetManaged.description;
};

interface CreateDigitalTwinProps {
    backToTable: () => void;
    refreshDigitalTwins: () => void;
}

interface IFormikValues {
    orgAcronym: string;
    groupAcronym: string;
    assetName: string;
    digitalTwinUid: string;
    description: string;
    type: string;
    maxNumResFemFiles: string;
    chatAssistantEnabled: boolean;
    chatAssistantLanguage: string;
    digitalTwinSimulationFormat: string;
}

export type ObjectMap = {
    nodes: { [name: string]: THREE.Object3D };
    materials: { [name: string]: THREE.Material };
};

export function buildGraph(object: THREE.Object3D) {
    const data: ObjectMap = { nodes: {}, materials: {} };
    if (object) {
        object.traverse((obj: any) => {
            if (obj.name) data.nodes[obj.name] = obj;
            if (obj.material && !data.materials[obj.material.name]) data.materials[obj.material.name] = obj.material;
        });
    }
    return data;
}

export function getSensorsRef(object: THREE.Object3D) {
    const sensorsRef: string[] = [];
    if (object) {
        object.traverse((node: any) => {
            if (node.name) {
                if (node.userData !== undefined) {
                    if (node.userData.type && node.userData.type === "sensor") {
                        const sensorRef = node.userData?.sensorRef;
                        if (sensorRef) {
                            if (sensorsRef.indexOf(sensorRef) === -1) {
                                sensorsRef.push(sensorRef);
                            }
                        }
                    }
                    if (node.userData.clipSensorRef !== undefined) {
                        const clipSensorRef = node.userData?.clipSensorRef;
                        if (clipSensorRef) {
                            if (sensorsRef.indexOf(clipSensorRef) === -1) {
                                sensorsRef.push(clipSensorRef);
                            }
                        }
                    }
                }
            }
        });
    }
    return sensorsRef;
}

type FormikType = FormikProps<IFormikValues>;

const CreateDigitalTwin: FC<CreateDigitalTwinProps> = ({ backToTable, refreshDigitalTwins }) => {
    const digitalTwinUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const digitalTwinsDispatch = useDigitalTwinsDispatch();
    const orgsOfGroupManaged = useOrgsOfGroupsManagedTable();
    const groupsManaged = useGroupsManagedTable();
    const assets = useAssetsTable();
    const initOrg = orgsOfGroupManaged[0];
    const initGroup = groupsManaged.filter((group) => group.orgId === initOrg.id)[0];
    const initAsset = assets.filter((asset) => asset.groupId === initGroup.id)[0];
    const initAssetName = `Asset_${initAsset.assetUid}`;
    const [orgOptions, setOrgOptions] = useState<IOption[]>([]);
    const [groupArray, setGroupArray] = useState<Record<string, string[]>>({});
    const [groupOptions, setGroupOptions] = useState<IOption[]>([]);
    const [assetNameOptions, setAssetNameOptions] = useState<IOption[]>([]);
    const [assetNameArray, setAssetNameArray] = useState<Record<string, string[]>>({});
    const [assetDescription, setAssetDescription] = useState<string>("");
    const [localGltfFileLoaded, setLocalGltfFileLoaded] = useState(false);
    const [gltfFile, setGltfFile] = useState<File>();
    const [isValidGltfFile, setIsValidGltfFile] = useState<boolean>(false);
    const [gltfFileContent, setGltfFileContent] = useState<string>();
    const [gltfFileName, setGltfFileName] = useState("-");
    const [gltfFileLastModif, setGltfFileLastModif] = useState("-");
    const [localFemResFileLoaded, setLocalFemResFileLoaded] = useState(false);
    const [digitalTwinFemResData, setDigitalTwiFemResData] = useState({});
    const [localPipelineFileLoaded, setLocalPipelineFileLoaded] = useState(false);
    const [digitalTwinPipelineData, setDigitalTwinPipelineData] = useState({});
    const [femResFile, setFemResFile] = useState<File>();
    const [femResFileName, setFemResFileName] = useState("-");
    const [femResFileLastModifDateString, setFemResFileLastModifDateString] = useState("-");
    const [pipelineFileName, setPipelineFileName] = useState("-");
    const [pipelineFileLastModifDateString, setPipelineFileLastModifDateString] = useState("-");
    const [docInfoFileName, setDocInfoFileName] = useState("-");
    const [docInfoFileLastModifDateString, setDocInfoFileLastModifDateString] = useState("-");
    const [docInfoFile, setDocInfoFile] = useState<File>();
    const [localDocInfoFileLoaded, setLocalDocInfoFileLoaded] = useState(false);
    const [docInfoFileData, setDocInfoFileData] = useState("");
    const [digitalTwinType, setDigitalTwinType] = useState("None");
    const [isGlftDataReady, setIsGlftDataReady] = useState(false);
    const [sensorsRef, setSensorsRef] = useState<string[]>([]);
    const [isChatAssistantEnabled, setIsChatAssistantEnabled] = useState(false);
    const [orgLlmEnabled, setOrgLlmEnabled] = useState(false);
    const [groupLlmEnabled, setGroupLlmEnabled] = useState(false);

    useEffect(() => {
        const orgArray = orgsOfGroupManaged.map((org) => org.acronym);
        setOrgOptions(convertArrayToOptions(orgArray));
        const groupArray = findGroupArray(orgsOfGroupManaged, groupsManaged);
        setGroupArray(groupArray);
        const orgAcronym = initOrg.acronym;
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
        const assetNameArray = findAssetNameArray(assets, groupsManaged);
        setAssetNameArray(assetNameArray);
        const groupAcronym = initGroup.acronym;
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = `Asset_${initAsset.assetUid}`;
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
        const org = orgsOfGroupManaged.filter((o) => o.acronym === orgAcronym)[0];
        setOrgLlmEnabled(org.llmEnabled);
        const group = groupsManaged.filter((g) => g.acronym === groupAcronym)[0];
        setGroupLlmEnabled(group.llmEnabled);
    }, [assets, groupsManaged, initAsset.assetUid, initGroup.acronym, initOrg.acronym, orgsOfGroupManaged]);

    const handleChangeOrg = (e: { value: string }, formik: FormikType) => {
        const orgAcronym = e.value;
        formik.setFieldValue("orgAcronym", orgAcronym);
        const groupsForOrgSelected = groupArray[orgAcronym];
        setGroupOptions(convertArrayToOptions(groupsForOrgSelected));
        const groupAcronym = groupsForOrgSelected[0];
        formik.setFieldValue("groupAcronym", groupsForOrgSelected[0]);
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = assetsForGroupSelected[0];
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
        const org = orgsOfGroupManaged.filter((o) => o.acronym === orgAcronym)[0];
        setOrgLlmEnabled(org.llmEnabled);
    };

    const handleChangeGroup = (e: { value: string }, formik: FormikType) => {
        const groupAcronym = e.value;
        formik.setFieldValue("groupAcronym", groupAcronym);
        const assetsForGroupSelected = assetNameArray[groupAcronym];
        setAssetNameOptions(convertArrayToOptions(assetsForGroupSelected));
        const assetName = assetsForGroupSelected[0];
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
        const group = groupsManaged.filter((g) => g.acronym === groupAcronym)[0];
        setGroupLlmEnabled(group.llmEnabled);
    };

    const handleChangeAsset = (e: { value: string }, formik: FormikType) => {
        const assetName = e.value;
        formik.setFieldValue("assetName", assetName);
        const assetDescription = findAssetDescription(assets, assetName);
        setAssetDescription(assetDescription);
    };

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

    const [openPipelineFileSelector, pipelineFileParams] = useFilePicker({
        readAs: "Text",
        multiple: false,
        accept: ".yml, .yaml",
    });

    const [openDocInfoFileSelector, docInfoFileParams] = useFilePicker({
        readAs: "Text",
        multiple: false,
        accept: ".txt",
    });

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
                //setDigitalTwinGltfData(gltfData);
                setIsValidGltfFile(true);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [gltfFileContent],
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

    useEffect(() => {
        if (
            !pipelineFileParams.loading &&
            pipelineFileParams.filesContent.length !== 0 &&
            pipelineFileParams.plainFiles.length !== 0
        ) {
            setLocalPipelineFileLoaded(true);
            try {
                const pipelineData = YAML.parse(pipelineFileParams.filesContent[0].content);
                setDigitalTwinPipelineData(pipelineData);
                const pipelineFileName = pipelineFileParams.plainFiles[0].name;
                setPipelineFileName(pipelineFileName);
                const dateString = (pipelineFileParams.plainFiles[0] as any).lastModified;
                setPipelineFileLastModifDateString(formatDateString(dateString));
                setLocalPipelineFileLoaded(false);
                pipelineFileParams.clear();
            } catch (e) {
                console.log(e);
                toast.error("Invalid pipeline file");
                setLocalPipelineFileLoaded(false);
                pipelineFileParams.clear();
            }
        }
    }, [
        pipelineFileParams.loading,
        pipelineFileParams.filesContent,
        pipelineFileParams.plainFiles,
        pipelineFileParams,
    ]);

    useEffect(() => {
        if (
            !docInfoFileParams.loading &&
            docInfoFileParams.filesContent.length !== 0 &&
            docInfoFileParams.plainFiles.length !== 0
        ) {
            setLocalDocInfoFileLoaded(true);
            try {
                const fileContent = docInfoFileParams.filesContent[0].content;
                setDocInfoFileData(fileContent);
                setDocInfoFile(docInfoFileParams.plainFiles[0]);
                const docInfoFileName = docInfoFileParams.plainFiles[0].name;
                setDocInfoFileName(docInfoFileName);
                const dateString = (docInfoFileParams.plainFiles[0] as any).lastModified;
                setDocInfoFileLastModifDateString(formatDateString(dateString));
                setLocalDocInfoFileLoaded(false);
                docInfoFileParams.clear();
            } catch (e) {
                console.log(e);
                toast.error("Invalid document information file");
                setLocalDocInfoFileLoaded(false);
                docInfoFileParams.clear();
            }
        }
    }, [docInfoFileParams.loading, docInfoFileParams.filesContent, docInfoFileParams.plainFiles, docInfoFileParams]);

    const submitPipeline = (config: any, groupId: number, digitalTwinId: number) => {
        const urlUploadPipelineBase = `${protocol}://${domainName}/admin_api/digital_twin_pipeline`;
        const urlUploadPipeline = `${urlUploadPipelineBase}/${groupId}/${digitalTwinId}`;
        const pipelineNodes = (digitalTwinPipelineData as any).nodes;
        for (let inode = 0; inode < pipelineNodes.length; inode++) {
            pipelineNodes[inode].settings = JSON.stringify(pipelineNodes[inode].settings);
        }
        const pipelineData = {
            pipelineFileName: pipelineFileName,
            pipelineFileLastModifDate: pipelineFileLastModifDateString,
            nodes: pipelineNodes,
        };
        getAxiosInstance(refreshToken, authDispatch)
            .post(urlUploadPipeline, pipelineData, config)
            .then((response: AxiosResponse<any, any>) => {
                toast.success(response.data.message);
                refreshDigitalTwins();
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
            });
    };

    const onSubmit = (values: any, actions: any) => {
        const groupId = groupsManaged.filter((group) => group.acronym === values.groupAcronym)[0].id;
        const assetName = values.assetName;
        const assetId = assets.filter((asset) => asset.assetUid === assetName.slice(6))[0].id;
        const url = `${protocol}://${domainName}/admin_api/digital_twin/${groupId}/${assetId}`;
        const config = axiosAuth(accessToken);

        const maxNumResFemFiles = parseInt(values.maxNumResFemFiles, 10);
        let chatAssistantLanguage = "none";
        if (values.chatAssistantEnabled) {
            chatAssistantLanguage = values.chatAssistantLanguage;
        }
        const digitalTwinData = {
            description: values.description,
            type: values.type,
            digitalTwinUid: values.digitalTwinUid,
            maxNumResFemFiles,
            chatAssistantEnabled: values.chatAssistantEnabled,
            chatAssistantLanguage,
            digitalTwinSimulationFormat: JSON.stringify(JSON.parse(values.digitalTwinSimulationFormat)),
            sensorsRef,
        };

        setIsSubmitting(true);
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, digitalTwinData, config)
            .then((response: AxiosResponse<any, any>) => {
                const data = response.data;
                toast.success(data.message);
                const digitalTwinsOptionToShow = { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.TABLE };
                setIsSubmitting(false);
                setDigitalTwinsOptionToShow(digitalTwinsDispatch, digitalTwinsOptionToShow);
                const configMultipart = axiosAuth(accessToken, "multipart/form-data");
                const urlUploadGltfBase0 = `${protocol}://${domainName}/admin_api/digital_twin_upload_file`;
                const urlUploadGltfBase = `${urlUploadGltfBase0}/${groupId}/${data.digitalTwinId}`;

                if (isValidGltfFile && (values.type === "Gltf 3D model" || values.type === "Glb 3D model")) {
                    let file = gltfFile as File;
                    const gltfData = new FormData();
                    gltfData.append("file", file, gltfFileName);

                    const urlUploadGltfFile = `${urlUploadGltfBase}/gltfFile/${gltfFileName}`;
                    getAxiosInstance(refreshToken, authDispatch)
                        .post(urlUploadGltfFile, gltfData, configMultipart)
                        .then((response: AxiosResponse<any, any>) => {
                            toast.success(response.data.message);
                        })
                        .catch((error: AxiosError) => {
                            axiosErrorHandler(error, authDispatch);
                            // backToTable();
                        });
                }

                if (Object.keys(digitalTwinFemResData).length !== 0) {
                    const femResData = new FormData();
                    femResData.append("file", femResFile as File, "femResFile");
                    const urlUploadFemResFile = `${urlUploadGltfBase}/femResFiles/${femResFileName}`;
                    getAxiosInstance(refreshToken, authDispatch)
                        .post(urlUploadFemResFile, femResData, configMultipart)
                        .then((response: AxiosResponse<any, any>) => {
                            toast.success(response.data.message);
                        })
                        .catch((error: AxiosError) => {
                            axiosErrorHandler(error, authDispatch);
                            // backToTable();
                        });
                }

                if (Object.keys(digitalTwinPipelineData).length !== 0) {
                    submitPipeline(configMultipart, groupId, data.digitalTwinId);
                }

                if (docInfoFileData !== "") {
                    const docInfoData = new FormData();
                    docInfoData.append("file", docInfoFile as File, "docInfoFile");
                    const urlUploadDocInfoFile = `${urlUploadGltfBase}/docInfoFiles/${docInfoFileName}`;
                    getAxiosInstance(refreshToken, authDispatch)
                        .post(urlUploadDocInfoFile, docInfoData, configMultipart)
                        .then((response: AxiosResponse<any, any>) => {
                            toast.success(response.data.message);
                        })
                        .catch((error: AxiosError) => {
                            axiosErrorHandler(error, authDispatch);
                        });
                }
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

    const validationSchema = Yup.object().shape({
        digitalTwinUid: Yup.string().length(20, "String must be 20 characters long").required("Required"),
        description: Yup.string().required("Required"),
        type: Yup.string().max(20, "The maximum number of characters allowed is 20").required("Required"),
        maxNumResFemFiles: Yup.number()
            .when("type", {
                is: "Gltf 3D model",
                then: Yup.number()
                    .min(1, "The minimum numer of FEM results files is 1")
                    .required("Must enter maxNumResFemFiles"),
            })
            .when("type", {
                is: "Glb 3D model",
                then: Yup.number()
                    .min(1, "The minimum numer of FEM results files is 1")
                    .required("Must enter maxNumResFemFiles"),
            }),
        digitalTwinSimulationFormat: Yup.string()
            .when("type", {
                is: "Gltf 3D model",
                then: Yup.string()
                    .test("test-name", "Wrong format for the json object", (value: any) =>
                        digitalTwinFormatValidation(value),
                    )
                    .required("Must enter Digital twin simulation format"),
            })
            .when("type", {
                is: "Glb 3D model",
                then: Yup.string()
                    .test("test-name", "Wrong format for the json object", (value: any) =>
                        digitalTwinFormatValidation(value),
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

    const clearPipelineFile = () => {
        setPipelineFileName("-");
        setPipelineFileLastModifDateString("-");
        setLocalPipelineFileLoaded(false);
        pipelineFileParams.clear();
    };

    const clearDocInfoFile = () => {
        setDocInfoFileName("-");
        setDocInfoFileLastModifDateString("-");
        setLocalDocInfoFileLoaded(false);
        docInfoFileParams.clear();
    };

    const localPipelineFileButtonHandler = () => {
        if (!localPipelineFileLoaded) {
            selectFile(openPipelineFileSelector, pipelineFileParams.clear);
        }
    };

    const docInfoFileButtonHandler = () => {
        if (!localDocInfoFileLoaded) {
            selectFile(openDocInfoFileSelector, docInfoFileParams.clear);
        }
    };

    const initialDigitalTwinData = {
        orgAcronym: initOrg.acronym,
        groupAcronym: initGroup.acronym,
        assetName: initAssetName,
        description: "",
        type: "Grafana dashboard",
        digitalTwinUid,
        maxNumResFemFiles: "1",
        chatAssistantEnabled: false,
        chatAssistantLanguage: "en-UK-male",
        digitalTwinSimulationFormat: "{}",
    };

    return (
        <>
            <FormTitle isSubmitting={isSubmitting}>Create digital twin</FormTitle>
            <DraggableFormContainer>
                <Formik initialValues={initialDigitalTwinData} validationSchema={validationSchema} onSubmit={onSubmit}>
                    {(formik) => {
                        return (
                            // @ts-ignore
                            <Form>
                                <ControlsContainer>
                                    <FormikControl
                                        control="select"
                                        label="Select org"
                                        name="orgAcronym"
                                        type="text"
                                        options={orgOptions}
                                        onChange={(e) => handleChangeOrg(e, formik)}
                                    />
                                    <FormikControl
                                        control="select"
                                        label="Select group"
                                        name="groupAcronym"
                                        type="text"
                                        options={groupOptions}
                                        onChange={(e) => handleChangeGroup(e, formik)}
                                    />
                                    <FormikControl
                                        control="select"
                                        label="Select asset"
                                        name="assetName"
                                        type="text"
                                        options={assetNameOptions}
                                        onChange={(e) => handleChangeAsset(e, formik)}
                                    />
                                    <FieldContainer>
                                        <label>Asset description</label>
                                        <div>{assetDescription}</div>
                                    </FieldContainer>
                                    <FormikControl
                                        control="input"
                                        label="DigitalTwinUid"
                                        name="digitalTwinUid"
                                        type="text"
                                    />
                                    <FormikControl control="input" label="Description" name="description" type="text" />
                                    <DataFileTitle>Pipeline</DataFileTitle>
                                    <DataFileContainer>
                                        <FieldContainer>
                                            <label>File name</label>
                                            <div>{pipelineFileName}</div>
                                        </FieldContainer>
                                        <FieldContainer>
                                            <label>Last modification date</label>
                                            <div>{pipelineFileLastModifDateString}</div>
                                        </FieldContainer>
                                        <SelectDataFilenButtonContainer>
                                            <FileButton type="button" onClick={clearPipelineFile}>
                                                Clear
                                            </FileButton>
                                            <FileButton type="button" onClick={() => localPipelineFileButtonHandler()}>
                                                Select local file
                                            </FileButton>
                                        </SelectDataFilenButtonContainer>
                                    </DataFileContainer>
                                    <FormikControl
                                        control="select"
                                        label="Type"
                                        name="type"
                                        options={digitalTwinTypeOptions}
                                        type="text"
                                        onChange={(e) => onDigitalTwinTypeSelectChange(e, formik)}
                                    />
                                    {(digitalTwinType === "Gltf 3D model" || digitalTwinType === "Glb 3D model") && (
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
                                            {orgLlmEnabled && groupLlmEnabled && (
                                                <>
                                                    <DataFileTitle>Documental info</DataFileTitle>
                                                    <DataFileContainer>
                                                        <FieldContainer>
                                                            <label>File name</label>
                                                            <div>{docInfoFileName}</div>
                                                        </FieldContainer>
                                                        <FieldContainer>
                                                            <label>Last modification date</label>
                                                            <div>{docInfoFileLastModifDateString}</div>
                                                        </FieldContainer>
                                                        <SelectDataFilenButtonContainer>
                                                            <FileButton type="button" onClick={clearDocInfoFile}>
                                                                Clear
                                                            </FileButton>
                                                            <FileButton
                                                                type="button"
                                                                onClick={() => docInfoFileButtonHandler()}
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
                                                </>
                                            )}
                                            <CodeMirrorWrapper fontSize="14px">
                                                <label>Digital twin simulation format</label>
                                                <div className="cm-wrapper">
                                                    <CodeMirror
                                                        value={formik.values.digitalTwinSimulationFormat}
                                                        height="300px"
                                                        theme={oneDark}
                                                        extensions={[
                                                            json(),
                                                            indentUnit.of("    "),
                                                            indentOnInput(),
                                                            keymap.of([
                                                                ...completionKeymap,
                                                                indentWithTab,
                                                                ReIndentCommand,
                                                            ]),
                                                        ]}
                                                        onChange={(value) => {
                                                            formik.setFieldValue("digitalTwinSimulationFormat", value);
                                                        }}
                                                        onBlur={() => {
                                                            formik.setFieldTouched("digitalTwinSimulationFormat", true);
                                                        }}
                                                        basicSetup={{
                                                            lineNumbers: true,
                                                            foldGutter: true,
                                                            bracketMatching: true,
                                                            closeBrackets: true,
                                                            syntaxHighlighting: true,
                                                            autocompletion: true,
                                                            tabSize: 4,
                                                            searchKeymap: true,
                                                        }}
                                                    />
                                                </div>
                                                <FieldErrorScroller name="digitalTwinSimulationFormat" />
                                            </CodeMirrorWrapper>
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
            </DraggableFormContainer>
        </>
    );
};

export default CreateDigitalTwin;
