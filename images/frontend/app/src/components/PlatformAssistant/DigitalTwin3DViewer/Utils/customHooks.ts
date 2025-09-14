// hooks.ts
import { useState, useEffect, useCallback, useRef } from "react";
import YAML from "yaml";
import * as THREE from "three";
import { nanoid } from "nanoid";
import Paho, { MQTTError } from "paho-mqtt";

import {
    ViewerState,
    ViewerOptions,
    MqttOptions,
    ChatMessage,
    Viewer3DProps,
    IPipelineNode,
    IPipelineEdge,
    NodeWireData,
} from "../Types/types";
import { DEFAULT_VIEWER_OPTIONS, BUTTON_LABELS, PROTOCOL, DOMAIN_NAME } from "../Utils/constants";
import { useAuthDispatch, useAuthState, useLoggedUserLogin } from "../../../../contexts/authContext/authContext";
import { PipelineLog } from "../Pipeline/PipelineLogs";
import {
    setReloadDigitalTwinsTable,
    setWindowObjectReferences,
    usePlatformAssitantDispatch,
    useWindowObjectReferences,
} from "../../../../contexts/platformAssistantContext";
import { axiosAuth, openWindowTab } from "../../../../tools/tools";
import { existFemResFileLocallyStored, readFemResFile, writeFemResFile } from "../../../../tools/fileSystem";
import { readFemSimulationInfo } from "../ViewerTools/ViewerUtils";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import { AxiosError, AxiosResponse } from "axios";
import { toast } from "react-toastify";
import formatDateString from "../../../../tools/formatDate";
import { IDigitalTwin } from "../../TableColumns/digitalTwinsColumns";
import axiosErrorHandler from "../../../../tools/axiosErrorHandler";
import { IMqttTopicData } from "../Main/Model";
import { base64ToJpg } from "../../../../tools/base64ToJpg";

export const useViewerState = () => {
    const [state, setState] = useState<ViewerState>({
        isControlPanelOpen: false,
        isChatAssistantOpen: false,
        isPipelineLogsOpen: false,
        activeViewer: "3D", // Default to 3D viewer
        showDtSimulatorModal: false,
        digitalTwinState: "OK",
        digitalTwinSimulatorSendData: false,
        generalTransparencyIndex: 0,
        sensorObjects: [],
        sensorCollectionNames: [],
        assetObjects: [],
        assetCollectionNames: [],
        genericObjects: [],
        genericObjectCollectionNames: [],
        femSimulationObjects: [],
        femSimObjectCollectionNames: [],
        initialSensorsState: null,
        initialAssetsState: null,
        initialGenericObjectsState: null,
        initialFemSimObjectsState: [],
        initialDigitalTwinSimulatorState: {},
        initialGenericObjectsVisibilityState: null,
        initialSensorsVisibilityState: null,
        initialAssetsVisibilityState: null,
        initialFemSimObjectsVisibilityState: null,
        femSimulationGeneralInfo: null,
        femMinValues: [],
        femMaxValues: [],
        femResultDates: [],
        femResultFileNames: [],
        femResultNames: [],
        femResultData: null,
        femResultLoaded: false,
        femResFilesLastUpdate: new Date(),
        lockReadingButtomLabel: BUTTON_LABELS.LOCK_READ_MEASUREMENTS,
        getLastMeasurementsButtomLabel: BUTTON_LABELS.GET_LAST_MEASUREMENTS,
        legendRenderer: null,
        isPipelineUiChanged: false,
    });

    return [state, setState] as const;
};

export const useViewerOptions = (femResultDates: string[]) => {
    const [opts, setOptsState] = useState<ViewerOptions>({
        ...DEFAULT_VIEWER_OPTIONS,
        femResultDate: femResultDates[0] || "-",
        sensorsVisibilityState: {} as any,
        assetsVisibilityState: {} as any,
        animatedObjectsVisibilityState: {} as any,
        genericObjectsVisibilityState: {} as any,
        femSimulationObjectsVisibilityState: {} as any,
        digitalTwinSimulatorState: {} as any,
    });

    const setOpts = useCallback((updater: ((prevOpts: ViewerOptions) => ViewerOptions) | ViewerOptions) => {
        if (typeof updater === "function") {
            setOptsState(updater);
        } else {
            setOptsState(updater);
        }
    }, []);

    return [opts, setOpts] as const;
};

export const useMqttOptions = () => {
    const userName = useLoggedUserLogin();
    const { accessToken } = useAuthState();

    const mqttOptions: MqttOptions = {
        keepalive: 0,
        clientId: `Client_${nanoid(16).replace(/-/g, "x").replace(/_/g, "X")}`,
        port: 9001,
        username: `jwt_${userName}`,
        accessToken,
    };

    return mqttOptions;
};

export const useRefs = () => {
    const canvasContainerRef = useRef(null);
    const canvasRef = useRef(null);
    const controlsRef = useRef() as any;
    const selectedObjTypeRef = useRef(null);
    const selectedObjNameRef = useRef(null);
    const femMaxValueRef = useRef(null);
    const femMinValueRef = useRef(null);
    const selectedObjCollectionNameRef = useRef(null);

    return {
        canvasContainerRef,
        canvasRef,
        controlsRef,
        selectedObjTypeRef,
        selectedObjNameRef,
        femMaxValueRef,
        femMinValueRef,
        selectedObjCollectionNameRef,
    };
};

export const useMqttConnection = () => {
    const clientValid = useRef(false);
    const [connectionStatus, setStatus] = useState("Offline");
    const [mqttClient, setMqttClient] = useState<Paho.Client | null>(null);
    const options = useMqttOptions();

    useEffect(() => {
        if (!mqttClient && !clientValid.current) {
            clientValid.current = true;
            setStatus("Connecting");

            const port = 9001;
            const clientId = "clientId_" + Math.floor(Math.random() * 1000);
            const mqttClient = new Paho.Client(DOMAIN_NAME, port, clientId);

            const onConnect = () => {
                setStatus("Connected");
                setMqttClient(mqttClient);
            };

            const onConnectionLost = (error: MQTTError) => {
                if (error.errorCode !== 0) {
                    setStatus("Offline");
                }
            };

            const onFailure = (error: MQTTError) => {
                console.log(`Connection error: ${error}`);
                setStatus(error.errorMessage);
            };

            mqttClient.connect({
                useSSL: true,
                timeout: 3,
                onSuccess: onConnect,
                onFailure: onFailure,
                userName: options.username,
                password: options.accessToken,
            });

            mqttClient.onConnectionLost = onConnectionLost;
        }

        return () => {
            if (mqttClient) {
                mqttClient.disconnect();
                setMqttClient(null);
                clientValid.current = false;
            }
        };
    }, [options.username, options.accessToken, mqttClient]);

    return { connectionStatus, mqttClient };
};

export const useChatMessages = (
    setOpts: (updater: ViewerOptions | ((prevOpts: ViewerOptions) => ViewerOptions)) => void
) => {
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

    const handleUpdateChatAssistantMessages = useCallback((newLlmMessage: any) => {
        setChatMessages((prevMessages) => {
            const newMessages = [...prevMessages];
            const newMessage = {
                userName: "Assistant",
                message: newLlmMessage.message,
                sender: newLlmMessage.sender,
                time: new Date().toLocaleTimeString(),
                mcpToolCalls: newLlmMessage.mcpToolCalls,
            };
            newMessages.push(newMessage);
            return newMessages;
        });

        if (newLlmMessage.sender === "assistant" && newLlmMessage.uiOpts != null) {
            const updateOpts = (opts: any, updates: any) => {
                for (const [key, value] of Object.entries(updates)) {
                    if (typeof value === "object" && value !== null) {
                        if (Array.isArray(value)) {
                            opts[key] = [...value];
                        } else {
                            opts[key] = updateOpts(opts[key] ?? {}, value);
                        }
                    } else {
                        opts[key] = value;
                    }
                }
                return opts;
            };

            setOpts((prevOpts) => updateOpts({ ...prevOpts }, newLlmMessage.uiOpts));
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        chatMessages,
        setChatMessages,
        handleUpdateChatAssistantMessages,
    };
};

export const usePipelineStatus = (digitalTwinSelected: IDigitalTwin | null, mqttClient: Paho.Client | null, sim2stateTopic: string) => {
    const [pipelineStatus, setPipelineStatus] = useState("unknown");

    const handlePipelineStatusChange = useCallback((status: string) => {
        if (digitalTwinSelected && digitalTwinSelected.pipelineFileData !== "") {
            setPipelineStatus(status);
        } else {
            setPipelineStatus("unknown");
        }
    }, [digitalTwinSelected]);

    const queryPipelineStatus = useCallback(() => {
        if (digitalTwinSelected && digitalTwinSelected.pipelineFileData !== "" && mqttClient && sim2stateTopic !== "") {
            mqttClient.send(sim2stateTopic, JSON.stringify({ action: "queryPipelineStatus" }));
        }
    }, [digitalTwinSelected, mqttClient, sim2stateTopic]);

    return { pipelineStatus, handlePipelineStatusChange, queryPipelineStatus };
};

export const usePipelineLogs = (setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>) => {
    const [logMessages, setLogMessages] = useState<PipelineLog[]>([]);

    const handleUpdateLogMessages = useCallback((newLogMessage: PipelineLog) => {
        setLogMessages((prevMessages) => {
            const newMessages = [...prevMessages];
            newMessages.push(newLogMessage);
            return newMessages;
        });

        if (newLogMessage.description === "MCP Host error") {
            setChatMessages((prevMessages) => {
                const newChatMessages = [...prevMessages];
                const newMessage = {
                    userName: "Assistant",
                    message: newLogMessage.message,
                    sender: "mcphost" as "mcphost",
                    time: new Date().toLocaleTimeString(),
                    mcpToolCalls: [],
                };
                newChatMessages.push(newMessage);
                return newChatMessages;
            });
        }
    }, [setChatMessages]);

    return {
        logMessages,
        setLogMessages,
        handleUpdateLogMessages,
    };
};

export const useOpenWindowTab = () => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const windowObjectReferences = useWindowObjectReferences();

    const openDashboardTab = useCallback(
        (url: string) => {
            openWindowTab(url, plaformAssistantDispatch, windowObjectReferences, setWindowObjectReferences);
        },
        [plaformAssistantDispatch, windowObjectReferences]
    );

    return openDashboardTab;
};

export const useLegendRenderer = () => {
    const [legendRenderer, setLegendRenderer] = useState<THREE.WebGLRenderer | null>(null);

    useEffect(() => {
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        setLegendRenderer(renderer);

        return () => {
            renderer.dispose();
            renderer.forceContextLoss();
        };
    }, []);

    return legendRenderer;
};

export const useFemResults = (
    digitalTwinSelected: Viewer3DProps["digitalTwinSelected"],
    legendRenderer: THREE.WebGLRenderer | null,
    opts: ViewerOptions,
    fetchFemResFileWorker: Worker
) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();

    const [femResultDates, setFemResultDates] = useState<string[]>([]);
    const [femResultFileNames, setFemResultFileNames] = useState<string[]>([]);
    const [femResultData, setFemResultData] = useState<any>(null);
    const [femSimulationGeneralInfo, setFemSimulationGeneralInfo] = useState<any>(null);

    // Effect to fetch FEM result files list
    useEffect(() => {
        if (digitalTwinSelected) {
            const config = axiosAuth(accessToken);
            const groupId = digitalTwinSelected.groupId;
            const digitalTwinId = digitalTwinSelected.id;
            let urlBase = `${PROTOCOL}://${DOMAIN_NAME}/admin_api/digital_twin_file_list`;
            const urlFemResFolderBase = `${urlBase}/${groupId}/${digitalTwinId}`;
            const urlFemResFolder = `${urlFemResFolderBase}/femResFiles`;

            getAxiosInstance(refreshToken, authDispatch)
                .get(urlFemResFolder, config)
                .then((response: AxiosResponse<any, any>) => {
                    const femResFilesInfo: {
                        fileName: string;
                        lastModified: string;
                    }[] = response.data;
                    const dates = femResFilesInfo.map((fileInfo) => formatDateString(fileInfo.lastModified));
                    const fileNames = femResFilesInfo.map((fileInfo) => fileInfo.fileName.split("/")[4]);

                    setFemResultDates(dates);
                    setFemResultFileNames(fileNames);
                })
                .catch((error: AxiosError) => {
                    const warningMessage = "This model not have FEM results file.";
                    toast.warning(warningMessage);
                });
        }
    }, [digitalTwinSelected, accessToken, refreshToken, authDispatch]);

    // Effect to load FEM result data
    useEffect(() => {
        if (!legendRenderer || !digitalTwinSelected || femResultDates.length === 0 || femResultFileNames.length === 0) {
            return;
        }

        let femResultDate = opts.femResultDate;
        if (femResultDate === undefined || femResultDate === "-") {
            femResultDate = femResultDates[0];
        }

        if (femResultDate !== undefined) {
            const fileDateIndex = femResultDates.indexOf(femResultDate);
            const femResultFileName = femResultFileNames[fileDateIndex];
            const groupId = digitalTwinSelected.groupId;
            const digitalTwinId = digitalTwinSelected.id;
            let urlBase = `${PROTOCOL}://${DOMAIN_NAME}/admin_api/digital_twin_download_file`;
            const urlFemResFileBase = `${urlBase}/${groupId}/${digitalTwinId}`;
            const urlFemResFile = `${urlFemResFileBase}/femResFiles/${femResultFileName}`;
            const config = axiosAuth(accessToken);
            const digitalTwinUid = digitalTwinSelected.digitalTwinUid;

            existFemResFileLocallyStored(digitalTwinUid, femResultFileName, femResultDates, femResultFileNames).then(
                async (exists: boolean) => {
                    if (exists) {
                        const femResData = await readFemResFile(digitalTwinUid, femResultFileName);
                        setFemResultData(femResData);
                        readFemSimulationInfo(
                            legendRenderer as THREE.WebGLRenderer,
                            femResData,
                            setFemSimulationGeneralInfo
                        );
                    } else {
                        if (window.Worker) {
                            const message = {
                                urlFemResFile,
                                accessToken,
                                digitalTwinUid: digitalTwinSelected.digitalTwinUid,
                            };
                            fetchFemResFileWorker.postMessage(message);
                            fetchFemResFileWorker.onmessage = (e: MessageEvent<string>) => {
                                const femResData = e.data as any;
                                setFemResultData(femResData);
                                readFemSimulationInfo(
                                    legendRenderer as THREE.WebGLRenderer,
                                    femResData,
                                    setFemSimulationGeneralInfo
                                );
                                writeFemResFile(digitalTwinUid, femResultFileName, femResData, femResultDate);
                                const reloadDigitalTwinsTable = true;
                                setReloadDigitalTwinsTable(plaformAssistantDispatch, { reloadDigitalTwinsTable });
                            };
                            fetchFemResFileWorker.onerror = (event: ErrorEvent) => {
                                const errorMessage = "FEM results file can not be downloaded";
                                toast.warning(errorMessage);
                            };
                        } else {
                            getAxiosInstance(refreshToken, authDispatch)
                                .get(urlFemResFile, config)
                                .then((response: AxiosResponse<any, any>) => {
                                    const femResData = response.data;
                                    setFemResultData(femResData);
                                    readFemSimulationInfo(
                                        legendRenderer as THREE.WebGLRenderer,
                                        femResData,
                                        setFemSimulationGeneralInfo
                                    );
                                    writeFemResFile(digitalTwinUid, femResultFileName, femResData, femResultDate);
                                })
                                .catch((error: AxiosError) => {
                                    const errorMessage = "FEM results file can not be downloaded";
                                    toast.warning(errorMessage);
                                });
                        }
                    }
                }
            );
        }
    }, [
        legendRenderer,
        digitalTwinSelected,
        femResultDates,
        femResultFileNames,
        opts.femResultDate,
        fetchFemResFileWorker,
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
    ]);

    return {
        femResultDates,
        femResultFileNames,
        femResultData,
        femSimulationGeneralInfo,
    };
};

const deepEqual = (obj1: string | null, obj2: string | null) => {
    if (obj1 === obj2) return true;

    if (obj1 == null || obj2 == null) return obj1 === obj2;

    if (typeof obj1 !== "object" || typeof obj2 !== "object") {
        // Comparación especial para strings (scripts)
        if (typeof obj1 === "string" && typeof obj2 === "string") {
            const str1 = obj1.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
            const str2 = obj2.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
            return str1 === str2;
        }
        return obj1 === obj2;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (let key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
            return false;
        }
    }

    return true;
};

const normalizeFormData = (data: any, nodeType: string) => {
    const normalized = { ...data };

    // Normalizar valores numéricos
    if (typeof normalized.numOutputs === "string") {
        normalized.numOutputs = parseInt(normalized.numOutputs) || 0;
    }
    if (typeof normalized.duration === "string") {
        normalized.duration = parseFloat(normalized.duration) || 0;
    }
    if (typeof normalized.every === "string") {
        normalized.every = parseFloat(normalized.every) || 0;
    }

    if (nodeType === "MlModel") {
        if (typeof normalized.mlModelId === "string") {
            normalized.mlModelId = parseInt(normalized.mlModelId) || 0;
        }
    }

    const stringFields = [
        "label",
        "topic",
        "injectRef",
        "to",
        "subject",
        "body",
        "chatId",
        "telegramBotToken",
        "message",
    ];
    stringFields.forEach((field) => {
        if (normalized[field] === undefined || normalized[field] === null) {
            normalized[field] = "";
        }
    });

    return normalized;
};

export const useFormChanges = (selectedNode: any) => {
    const [hasChanges, setHasChanges] = useState(false);
    const originalDataRef = useRef(null);

    const checkForChangesInternal = useCallback(
        (currentData, nodeType) => {
            if (!originalDataRef.current || !selectedNode) {
                setHasChanges(false);
                return false;
            }

            const normalizedCurrent = normalizeFormData(currentData, nodeType);
            const hasChanged = !deepEqual(originalDataRef.current, normalizedCurrent);
            setHasChanges(hasChanged);
            return hasChanged;
        },
        [selectedNode]
    );

    const setOriginalData = useCallback((data, nodeType) => {
        const normalizedData = normalizeFormData(data, nodeType);
        originalDataRef.current = normalizedData;
        setHasChanges(false);
    }, []);

    const createInputChangeHandler = useCallback(
        (setFormData) => {
            return (field: any, value: any) => {
                setFormData((prev: any) => {
                    const newData = {
                        ...prev,
                        [field]: value,
                    };

                    if (field.includes("Script")) {
                        checkForChangesInternal(newData, selectedNode?.type);
                    } else {
                        setTimeout(() => {
                            checkForChangesInternal(newData, selectedNode?.type);
                        }, 0);
                    }

                    return newData;
                });
            };
        },
        [selectedNode, checkForChangesInternal]
    );

    const createDebugToggleHandler = useCallback(
        (setFormData, isDebugEnabled, setIsDebugEnabled) => {
            return () => {
                const newDebugState = !isDebugEnabled;
                setIsDebugEnabled(newDebugState);

                setFormData((prev: any) => {
                    const newData = {
                        ...prev,
                        debugEnabled: newDebugState,
                        debug: newDebugState ? "on" : "off",
                    };

                    setTimeout(() => {
                        checkForChangesInternal(newData, selectedNode?.type);
                    }, 0);

                    return newData;
                });
            };
        },
        [selectedNode, checkForChangesInternal]
    );

    // Función pública para verificar cambios (mantener compatibilidad)
    const checkForChanges = useCallback(
        (currentData, nodeType) => {
            return checkForChangesInternal(currentData, nodeType);
        },
        [checkForChangesInternal]
    );

    return {
        hasChanges,
        setOriginalData,
        checkForChanges,
        createInputChangeHandler,
        createDebugToggleHandler,
    };
};

export const useImageFrame = () => {
    const [imageUrl, setImageUrl] = useState<string>("");

    const handleImageUrlChange = (base64Image: string) => {
        const blob = base64ToJpg(base64Image);
        if (blob) {
            setImageUrl(URL.createObjectURL(blob));
        }
    };

    return {
        imageUrl,
        handleImageUrlChange,
    };
};

const createPipelineData = (pipelineNodes: IPipelineNode[], pipelineEdges: IPipelineEdge[]): any => {
    const nodes = [] as any[];
    const wiresData = new Map<string, NodeWireData>();
    const nodeNumOutputs = new Map<string, number>();

    for (const edge of pipelineEdges) {
        const sourceNode = edge.source;
        const targetNode = edge.target;
        const outputIndex = edge.sourceHandle ? parseInt(edge.sourceHandle.split("-")[1], 10) : 0;

        const keyWire = `${sourceNode}-${outputIndex}-${targetNode}`;
        if (!wiresData.has(keyWire)) {
            wiresData.set(keyWire, {
                nodeEndUid: targetNode,
                outputIndex,
            });

            const currentNumOutputs = nodeNumOutputs.get(sourceNode) || 0;
            if (!nodeNumOutputs.has(sourceNode)) {
                nodeNumOutputs.set(sourceNode, outputIndex + 1);
            } else {
                nodeNumOutputs.set(sourceNode, Math.max(currentNumOutputs, outputIndex + 1));
            }
        }
    }

    for (const node of pipelineNodes) {
        const settings = node.data.settings;
        const nodeUid = node.id;
        const numOutputs = nodeNumOutputs.get(nodeUid) || 0;
        const debug = node.data.debug || "off";
        const wires = new Array(numOutputs).fill(null).map(() => [] as { nodeEndUid: string }[]);
        for (let [keyNodeUid, wireData] of Array.from(wiresData.entries())) {
            keyNodeUid = keyNodeUid.split("-")[0]; // Extract the nodeUid from the key
            if (keyNodeUid === nodeUid) {
                const newWireItem = {
                    nodeEndUid: wireData.nodeEndUid,
                };
                wires[wireData.outputIndex].push(newWireItem);
            }
        }
        const nodeData = {
            name: node.data.label,
            nodeUid,
            type: node.type,
            x: node.position.x,
            y: node.position.y,
            numOutputs,
            debug,
            settings,
            wires,
        };
        nodes.push(nodeData);
    }

    return nodes;
};

const isStoredPipelineDataChanged = (digitalTwinSelected: IDigitalTwin, pipelineDataNodes: any): boolean => {
    const pipelineDataNodesAux = JSON.parse(JSON.stringify(pipelineDataNodes));
    for (let inode = 0; inode < pipelineDataNodesAux.length; inode++) {
        if (Object.keys(pipelineDataNodesAux[inode].settings).length !== 0) {
            pipelineDataNodesAux[inode].settings = JSON.stringify(pipelineDataNodesAux[inode].settings);
        }
    }

    if (!digitalTwinSelected || !digitalTwinSelected.pipelineFileData) {
        return true;
    }

    const existingPipelineDataString = JSON.stringify(JSON.parse(digitalTwinSelected.pipelineFileData));
    if (JSON.stringify(pipelineDataNodesAux) !== existingPipelineDataString) {
        return true;
    }
    return false;
};

const deployPipeline = (
    pipelineNodes: IPipelineNode[],
    pipelineEdges: IPipelineEdge[],
    handlePipelineUiChanged: (isChanged: boolean) => void,
    handleSetPipelineLogsOpen: (open: boolean) => void,
    refreshDigitalTwins: () => void,
    params: UsePipelineActionsParamsProps
) => {
    const { digitalTwinSelected, accessToken, refreshToken, authDispatch } = params;
    if (!digitalTwinSelected) {
        toast.error("No digital twin selected.");
        return;
    }

    const pipelineDataNodes = createPipelineData(pipelineNodes, pipelineEdges);
    const config = axiosAuth(accessToken);
    const groupId = digitalTwinSelected.groupId;
    const digitalTwinId = digitalTwinSelected.id;
    const urlUploadPipelineBase = `${PROTOCOL}://${DOMAIN_NAME}/admin_api/digital_twin_pipeline`;
    const urlUploadPipeline = `${urlUploadPipelineBase}/${groupId}/${digitalTwinId}`;

    if (pipelineDataNodes && pipelineDataNodes.length === 0) {
        getAxiosInstance(refreshToken, authDispatch)
            .delete(urlUploadPipeline, config)
            .then((response: AxiosResponse<any, any>) => {
                handleSetPipelineLogsOpen(true);
                handlePipelineUiChanged(false);
                toast.success(response.data.message);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
            })
            .finally(() => {
                refreshDigitalTwins();
            });
        return;
    }

    if (isStoredPipelineDataChanged(digitalTwinSelected, pipelineDataNodes)) {
        const pipelineFileName = `pipeline_${digitalTwinSelected.digitalTwinUid}.yml`;
        const pipelineFileLastModifDate = formatDateString(new Date().toISOString());
        for (let inode = 0; inode < pipelineDataNodes.length; inode++) {
            if (Object.keys(pipelineDataNodes[inode].settings).length !== 0) {
                pipelineDataNodes[inode].settings = JSON.stringify(pipelineDataNodes[inode].settings);
            }
        }
        const newPipelineData = {
            pipelineFileName,
            pipelineFileLastModifDate,
            nodes: pipelineDataNodes,
        };

        if (digitalTwinSelected.pipelineFileData === "") {
            getAxiosInstance(refreshToken, authDispatch)
                .post(urlUploadPipeline, newPipelineData, config)
                .then((response: AxiosResponse<any, any>) => {
                    handleSetPipelineLogsOpen(true);
                    handlePipelineUiChanged(false);
                    toast.success(response.data.message);
                })
                .catch((error: AxiosError) => {
                    axiosErrorHandler(error, authDispatch);
                })
                .finally(() => {
                    refreshDigitalTwins();
                });
        } else {
            getAxiosInstance(refreshToken, authDispatch)
                .patch(urlUploadPipeline, newPipelineData, config)
                .then((response: AxiosResponse<any, any>) => {
                    handleSetPipelineLogsOpen(true);
                    handlePipelineUiChanged(false);
                    toast.success(response.data.message);
                })
                .catch((error: AxiosError) => {
                    axiosErrorHandler(error, authDispatch);
                })
                .finally(() => {
                    refreshDigitalTwins();
                });
        }
    } else {
        const reinitialize = false;
        const urlSetPipelineActionBase = `${PROTOCOL}://${DOMAIN_NAME}/admin_api/digital_twin_pipeline_action`;
        const urlSetPipelineAction = `${urlSetPipelineActionBase}/${groupId}/${digitalTwinId}`;
        const pipelineAction = {
            action: "restart",
            reinitialize,
        };

        getAxiosInstance(refreshToken, authDispatch)
            .post(urlSetPipelineAction, pipelineAction, config)
            .then((response: AxiosResponse<any, any>) => {
                handleSetPipelineLogsOpen(true);
                handlePipelineUiChanged(false);
                toast.success(response.data.message);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
            });
    }
};

const stopPipeline = (handleSetPipelineLogsOpen: (open: boolean) => void, params: UsePipelineActionsParamsProps) => {
    const { digitalTwinSelected, accessToken, refreshToken, authDispatch } = params;
    if (!digitalTwinSelected) {
        toast.error("No digital twin selected.");
        return;
    }
    const groupId = digitalTwinSelected.groupId;
    const digitalTwinId = digitalTwinSelected.id;
    const config = axiosAuth(accessToken);
    const urlSetPipelineActionBase = `${PROTOCOL}://${DOMAIN_NAME}/admin_api/digital_twin_pipeline_action`;
    const urlSetPipelineAction = `${urlSetPipelineActionBase}/${groupId}/${digitalTwinId}`;
    const pipelineAction = {
        action: "stop",
        reinitialize: false,
    };

    getAxiosInstance(refreshToken, authDispatch)
        .post(urlSetPipelineAction, pipelineAction, config)
        .then((response: AxiosResponse<any, any>) => {
            handleSetPipelineLogsOpen(true);
            toast.success(response.data.message);
        })
        .catch((error: AxiosError) => {
            axiosErrorHandler(error, authDispatch);
        });
};

const reinitializePipeline = (
    handleSetPipelineLogsOpen: (open: boolean) => void,
    params: UsePipelineActionsParamsProps
) => {
    if (!params.digitalTwinSelected) {
        toast.error("No digital twin selected.");
        return;
    }
    const { digitalTwinSelected, accessToken, refreshToken, authDispatch } = params;
    const config = axiosAuth(accessToken);
    const groupId = digitalTwinSelected.groupId;
    const digitalTwinId = digitalTwinSelected.id;
    const urlSetPipelineActionBase = `${PROTOCOL}://${DOMAIN_NAME}/admin_api/digital_twin_pipeline_action`;
    const urlSetPipelineAction = `${urlSetPipelineActionBase}/${groupId}/${digitalTwinId}`;
    const reinitialize = true;
    const pipelineAction = {
        action: "restart",
        reinitialize,
    };

    getAxiosInstance(refreshToken, authDispatch)
        .post(urlSetPipelineAction, pipelineAction, config)
        .then((response: AxiosResponse<any, any>) => {
            handleSetPipelineLogsOpen(true);
            toast.success(response.data.message);
        })
        .catch((error: AxiosError) => {
            axiosErrorHandler(error, authDispatch);
        });
};

export const createNodesAndEdges = (
    pipelineNodes: any,
    mqttClient: Paho.Client | null,
    mqttTopicsData: IMqttTopicData[]
) => {
    const nodeUidMap = new Map();
    for (const node of pipelineNodes) {
        nodeUidMap.set(node.name, node.nodeUid);
    }

    for (let inode = 0; inode < pipelineNodes.length; inode++) {
        const node = pipelineNodes[inode];
        for (let outputIndex = 0; outputIndex < node.wires.length; outputIndex++) {
            const wireArray = node.wires[outputIndex];
            if (wireArray && wireArray.length > 0) {
                for (let wireIdx = 0; wireIdx < wireArray.length; wireIdx++) {
                    const wire = wireArray[wireIdx];
                    if (!wire.nodeEndUid) {
                        pipelineNodes[inode].wires[outputIndex][wireIdx].nodeEndUid = nodeUidMap.get(wire.nodeEndName);
                    }
                }
            }
        }
    }

    const nodes = [];
    const edges = [];
    for (let inode = 0; inode < pipelineNodes.length; inode++) {
        const nodeItem = pipelineNodes[inode];

        let settings = nodeItem.settings || {};
        if (typeof settings === "string") {
            settings = JSON.parse(settings);
        }

        const nodeData = {
            label: nodeItem.name,
            nodeUid: nodeItem.nodeUid,
            numOutputs: nodeItem.numOutputs || 0,
            debug: nodeItem.debug || "off",
            settings,
        };

        const position = {
            x: nodeItem.x || 0,
            y: nodeItem.y || 0,
        };

        if (nodeItem.type === "Inject") {
            (nodeData as any).mqttTopics = mqttTopicsData;
            (nodeData as any).mqttClient = mqttClient;
        }

        nodes.push({
            id: nodeItem.nodeUid,
            type: nodeItem.type,
            position,
            data: nodeData,
        });

        for (let iedge = 0; iedge < nodeItem.wires.length; iedge++) {
            const wireArray = nodeItem.wires[iedge];
            if (wireArray && wireArray.length > 0) {
                for (const wire of wireArray) {
                    edges.push({
                        id: `${nodeItem.nodeUid}-${iedge}-${wire.nodeEndUid}`,
                        source: nodeItem.nodeUid,
                        target: wire.nodeEndUid,
                        sourceHandle: `${nodeData.nodeUid}-${iedge}`,
                    });
                }
            }
        }
    }

    return { nodes, edges };
};

const downloadYamlFile = (
    digitalTwinSelected: IDigitalTwin | null,
    pipelineNodes: IPipelineNode[],
    pipelineEdges: IPipelineEdge[]
) => {
    if (!digitalTwinSelected) {
        toast.error("No digital twin selected.");
        return;
    }

    const nodes = [] as any[];
    const wiresData = new Map<string, NodeWireData>();
    const nodeNumOutputs = new Map<string, number>();

    for (const edge of pipelineEdges) {
        const sourceNode = edge.source;
        const targetNode = edge.target;
        const outputIndex = edge.sourceHandle ? parseInt(edge.sourceHandle.split("-")[1], 10) : 0;

        if (!wiresData.has(sourceNode)) {
            wiresData.set(sourceNode, {
                nodeEndUid: targetNode,
                outputIndex,
            });

            const currentNumOutputs = nodeNumOutputs.get(sourceNode) || 0;
            if (!nodeNumOutputs.has(sourceNode)) {
                nodeNumOutputs.set(sourceNode, outputIndex + 1);
            } else {
                nodeNumOutputs.set(sourceNode, Math.max(currentNumOutputs, outputIndex + 1));
            }
        }
    }

    for (const node of pipelineNodes) {
        const settings = node.data.settings;
        const nodeUid = node.id;
        const numOutputs = nodeNumOutputs.get(nodeUid) || 0;
        const wires = new Array(numOutputs).fill(null).map(() => [] as { nodeEndUid: string }[]);
        for (let [keyNodeUid, wireData] of Array.from(wiresData.entries())) {
            if (keyNodeUid === nodeUid) {
                const newWireItem = {
                    nodeEndUid: wireData.nodeEndUid,
                };
                wires[wireData.outputIndex].push(newWireItem);
            }
        }
        const nodeData = {
            name: node.data.label,
            nodeUid,
            type: node.type,
            x: node.position.x,
            y: node.position.y,
            numOutputs,
            settings,
            wires,
        };
        nodes.push(nodeData);
    }

    const pipelineData = {
        nodes,
    };

    const yamlContentString = YAML.stringify(pipelineData);
    const blob = new Blob([yamlContentString], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pipeline_${digitalTwinSelected.digitalTwinUid}.yml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

interface UsePipelineActionsParamsProps {
    digitalTwinSelected: IDigitalTwin | null;
    accessToken: string;
    refreshToken: string;
    authDispatch: React.Dispatch<any>;
}

export const usePipelineActions = (
    pipelineNodes: IPipelineNode[],
    pipelineEdges: IPipelineEdge[],
    setPipelineNodes: React.Dispatch<any>,
    setPipelineEdges: React.Dispatch<any>,
    handlePipelineUiChanged: (isChanged: boolean) => void,
    handleSetPipelineLogsOpen: (open: boolean) => void,
    mqttClient: Paho.Client | null,
    mqttTopicsData: IMqttTopicData[],
    refreshDigitalTwins: () => void,
    params: UsePipelineActionsParamsProps
) => {
    const handleDeployPipeline = useCallback(() => {
        deployPipeline(
            pipelineNodes,
            pipelineEdges,
            handlePipelineUiChanged,
            handleSetPipelineLogsOpen,
            refreshDigitalTwins,
            params
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pipelineNodes, pipelineEdges, refreshDigitalTwins, params]);

    const handleFileUpload = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const content = e.target?.result as string;
                    try {
                        const yamlData = YAML.parse(content);
                        const pipelineNodes = yamlData.nodes || [];
                        const { nodes, edges } = createNodesAndEdges(pipelineNodes, mqttClient, mqttTopicsData);
                        setPipelineNodes(nodes);
                        setPipelineEdges(edges);
                        handlePipelineUiChanged(true);
                        toast.success("YAML file loaded successfully");
                    } catch (error) {
                        toast.error("Error parsing YAML file");
                        console.error("YAML parsing error:", error);
                    }
                };
                reader.onerror = () => {
                    toast.error("Error reading file");
                };
                reader.readAsText(file);
            }
            event.target.value = "";
            // eslint-disable-next-line react-hooks/exhaustive-deps
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [mqttClient, mqttTopicsData]
    );

    const handleDownloadYamlFile = useCallback(() => {
        downloadYamlFile(params.digitalTwinSelected, pipelineNodes, pipelineEdges);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.digitalTwinSelected, pipelineNodes, pipelineEdges]);

    const handleStopPipeline = useCallback(() => {
        stopPipeline(handleSetPipelineLogsOpen, params);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params]);

    const handleReinitiatePipeline = useCallback(() => {
        reinitializePipeline(handleSetPipelineLogsOpen, params);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params]);

    return {
        handleDeployPipeline,
        handleStopPipeline,
        handleFileUpload,
        handleDownloadYamlFile,
        handleReinitiatePipeline,
    };
};
