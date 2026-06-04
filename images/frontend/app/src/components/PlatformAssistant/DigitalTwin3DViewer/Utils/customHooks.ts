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
    INatsClientOptions,
} from "../Types/types";
import { DEFAULT_VIEWER_OPTIONS, BUTTON_LABELS, PROTOCOL, DOMAIN_NAME, NATS_SEED_SERVERS } from "../Utils/constants";
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
import { IMqttTopicData, INatsSubjectData } from "../Main/Model";
import { base64ToJpg } from "../../../../tools/base64ToJpg";
import { connect, NatsConnection } from "nats.ws";

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
    const controlsRef = useRef(null) as any;
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
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const [connectionStatus, setStatus] = useState("Offline");
    const [mqttClient, setMqttClient] = useState<Paho.Client | null>(null);
    const options = useMqttOptions();

    // Reconnection configuration
    const MAX_RECONNECT_ATTEMPTS = 10;
    const INITIAL_RECONNECT_DELAY = 1000; // 1 second
    const MAX_RECONNECT_DELAY = 30000; // 30 seconds

    const calculateReconnectDelay = (attempt: number) => {
        //Exponential backoff with maximum limit
        const delay = Math.min(
            INITIAL_RECONNECT_DELAY * Math.pow(2, attempt),
            MAX_RECONNECT_DELAY
        );
        return delay;
    };

    const connect = useCallback(() => {
        if (clientValid.current) return;

        clientValid.current = true;
        setStatus("Connecting");

        const port = 9001;
        const clientId = "clientId_" + Math.floor(Math.random() * 1000);
        const client = new Paho.Client(DOMAIN_NAME, port, clientId);

        const onConnect = () => {
            setStatus("Connected");
            setMqttClient(client);
            reconnectAttemptsRef.current = 0; // Reset attempts on successful connection
        };

        const onConnectionLost = (error: MQTTError) => {
            if (error.errorCode !== 0) {
                console.log(`Connection lost: ${error.errorMessage}`);
                setStatus("Offline");
                setMqttClient(null);
                clientValid.current = false;

                // Try to reconnect
                if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                    const delay = calculateReconnectDelay(reconnectAttemptsRef.current);
                    setStatus(`Reconnecting in ${Math.round(delay / 1000)}s...`);
                    
                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttemptsRef.current++;
                        connect();
                    }, delay);
                } else {
                    setStatus("Connection failed - Max attempts reached");
                }
            }
        };

        const onFailure = (error: MQTTError) => {
            console.log(`Connection error: ${error.errorMessage}`);
            setStatus("Connection failed");
            clientValid.current = false;

            // Try to reconnect
            if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                const delay = calculateReconnectDelay(reconnectAttemptsRef.current);
                setStatus(`Reconnecting in ${Math.round(delay / 1000)}s...`);
                
                reconnectTimeoutRef.current = setTimeout(() => {
                    reconnectAttemptsRef.current++;
                    connect();
                }, delay);
            } else {
                setStatus("Connection failed - Max attempts reached");
            }
        };

        client.connect({
            useSSL: true,
            timeout: 3,
            onSuccess: onConnect,
            onFailure: onFailure,
            userName: options.username,
            password: options.accessToken,
        });

        client.onConnectionLost = onConnectionLost;
    }, [options.username, options.accessToken]);

    useEffect(() => {
        connect();

        return () => {
            // Clear reconnection timeout
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }

            // Disconnect mqtt client
            if (mqttClient && mqttClient.isConnected()) {
                mqttClient.disconnect();
            }
            
            setMqttClient(null);
            clientValid.current = false;
            reconnectAttemptsRef.current = 0;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connect]);

    return { connectionStatus, mqttClient };
};



export const useNatsOptions = () => {
    const userName = useLoggedUserLogin();
    const { accessToken } = useAuthState();

    const natsOptions: INatsClientOptions = {
        clientId: `Client_${nanoid(16).replace(/-/g, "x").replace(/_/g, "X")}`,
        port: 9001,
        username: `jwt_${userName}`,
        accessToken,
    };

    return natsOptions;
};


const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 1000;  // 1 second
const MAX_RECONNECT_DELAY = 30000;     // 30 seconds
 
const calculateReconnectDelay = (attempt: number): number => {
    return Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
};
 
export const useNatsConnection = () => {
    const [connectionStatus, setStatus] = useState("Offline");
    const [natsClient, setNatsClient] = useState<NatsConnection | null>(null);
    const options = useNatsOptions(); // replaces useMqttOptions — same shape: { username, accessToken }
 
    const isConnectingRef = useRef(false);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Keep a ref to the active connection so the cleanup effect can close it
    const natsClientRef = useRef<NatsConnection | null>(null);
 
    const connectNats = useCallback(async () => {
        if (isConnectingRef.current) return;
 
        isConnectingRef.current = true;
        setStatus("Connecting");
 
        try {
            const nc = await connect({
                servers: NATS_SEED_SERVERS.split(",").map((s: string) => s.trim()),
                user: options.username,
                pass: options.accessToken,
            });
 
            isConnectingRef.current = false;
            reconnectAttemptsRef.current = 0;
            natsClientRef.current = nc;
            setNatsClient(nc);
            setStatus("Connected");
 
            // Monitor connection status in background
            (async () => {
                for await (const s of nc.status()) {
                    if (s.type === "disconnect" || s.type === "error") {
                        setStatus("Offline");
                        setNatsClient(null);
                        natsClientRef.current = null;
                        scheduleReconnect();
                    } else if (s.type === "reconnect") {
                        reconnectAttemptsRef.current = 0;
                        setStatus("Connected");
                        setNatsClient(nc);
                        natsClientRef.current = nc;
                    }
                }
            })();
 
            // Handle clean close
            nc.closed().then(() => {
                setStatus("Offline");
                setNatsClient(null);
                natsClientRef.current = null;
            });
 
        } catch (err: any) {
            isConnectingRef.current = false;
            console.log(`NATS connection error: ${err?.message ?? err}`);
            setStatus("Connection failed");
            scheduleReconnect();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options.username, options.accessToken]);
 
    const scheduleReconnect = useCallback(() => {
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            setStatus("Connection failed - Max attempts reached");
            return;
        }
 
        const delay = calculateReconnectDelay(reconnectAttemptsRef.current);
        setStatus(`Reconnecting in ${Math.round(delay / 1000)}s...`);
 
        reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connectNats();
        }, delay);
    }, [connectNats]);
 
    useEffect(() => {
        connectNats();
 
        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (natsClientRef.current) {
                natsClientRef.current.close();
                natsClientRef.current = null;
            }
            setNatsClient(null);
            isConnectingRef.current = false;
            reconnectAttemptsRef.current = 0;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectNats]);
 
    return { connectionStatus, natsClient };
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

export const usePipelineState = (
    digitalTwinSelected: IDigitalTwin | null,
    natsClient: NatsConnection | null,
    sim2stateTopic: string,
    setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
) => {
    const [pipelineStatus, setPipelineStatus] = useState("unknown");
    const [pipelineLeaderReplicaIndex, setPipelineLeaderReplicaIndex] = useState<number>(-1);
    const userName = useLoggedUserLogin();

    const handlePipelineStatusChange = useCallback(
        (status: string) => {
            if (digitalTwinSelected) {
                setPipelineStatus(status);
            } else {
                setPipelineStatus("unknown");
            }
        },
        [digitalTwinSelected]
    );

    const handlePipelineLeaderReplicaIndexChange = useCallback(
        (index: number) => {
            if (digitalTwinSelected) {
                setPipelineLeaderReplicaIndex(index);
            } else {
                setPipelineLeaderReplicaIndex(-1);
            }
        },
        [digitalTwinSelected]
    );

    const queryPipelineStatus = useCallback(() => {
        if (digitalTwinSelected && digitalTwinSelected.pipelineFileData !== "" && natsClient && sim2stateTopic !== "") {
            natsClient.publish(sim2stateTopic, JSON.stringify({ action: "queryPipelineStatus" }));
        }
    }, [digitalTwinSelected, natsClient, sim2stateTopic]);

    const queryChatMessages = useCallback(() => {
        if (
            digitalTwinSelected &&
            digitalTwinSelected.pipelineFileData !== "" &&
            natsClient &&
            sim2stateTopic !== "" &&
            digitalTwinSelected.chatAssistantEnabled
        ) {
            natsClient.publish(
                sim2stateTopic,
                JSON.stringify({
                    action: "queryChatMessages",
                    userName,
                })
            );
        }
    }, [digitalTwinSelected, natsClient, sim2stateTopic, userName]);

    const handleSetChatMessages = useCallback(
        (storedMessages: ChatMessage[]) => {
            const messages: ChatMessage[] = [];
            if (storedMessages == null) {
                storedMessages = [];
            }
            for (let i = 0; i < storedMessages.length; i++) {
                const msg = storedMessages[i];
                try {
                    const msgObject = JSON.parse(msg.message);
                    if (msgObject && msgObject.message) {
                        msg.message = msgObject.message;
                    }
                } catch (e) {}
                messages.push(msg);
            }
            setChatMessages(messages);
        },
        [setChatMessages]
    );

    const handleRemoveChatAssistantHistory = useCallback(() => {
        if (digitalTwinSelected && digitalTwinSelected.pipelineFileData !== "" && natsClient && sim2stateTopic !== "") {
            natsClient.publish(
                sim2stateTopic,
                JSON.stringify({
                    action: "queryRemoveChatMessages",
                    userName,
                })
            );
        }
    }, [digitalTwinSelected, natsClient, sim2stateTopic, userName]);

    return {
        pipelineStatus,
        pipelineLeaderReplicaIndex,
        handlePipelineStatusChange,
        handlePipelineLeaderReplicaIndexChange,
        handleSetChatMessages,
        queryPipelineStatus,
        queryChatMessages,
        handleRemoveChatAssistantHistory,
    };
};

export const usePipelineLogs = (setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>) => {
    const [logMessages, setLogMessages] = useState<PipelineLog[]>([]);

    const handleUpdateLogMessages = useCallback(
        (newLogMessage: PipelineLog) => {
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
        },
        [setChatMessages]
    );

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
        let renderer: THREE.WebGLRenderer | null = null;
        let active = true;

        try {
            renderer = new THREE.WebGLRenderer({ antialias: true });
            if (active) setLegendRenderer(renderer);
        } catch (e) {
            console.warn("useLegendRenderer: It can't create WebGL context", e);
            return;
        }

        return () => {
            active = false;
            if (renderer) {
                renderer.forceContextLoss();
                renderer.dispose();
            }
            setLegendRenderer(null);
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
        (currentData: any, nodeType: string) => {
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

    const setOriginalData = useCallback((data: any, nodeType: string) => {
        const normalizedData = normalizeFormData(data, nodeType);
        originalDataRef.current = normalizedData;
        setHasChanges(false);
    }, []);

    const createInputChangeHandler = useCallback(
        (setFormData: (arg0: (prev: any) => any) => void) => {
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
        (setFormData: (arg0: (prev: any) => any) => void, isDebugEnabled: any, setIsDebugEnabled: (arg0: boolean) => void) => {
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
        (currentData: any, nodeType: string) => {
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
    const prevUrlRef = useRef<string>("");
 
    useEffect(() => {
        return () => {
            if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
            if (imageUrl) URL.revokeObjectURL(imageUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
 
    const handleImageUrlChange = (imageBytes: Uint8Array, mimeType: string) => {
        const arrayBuffer = new ArrayBuffer(imageBytes.byteLength);
        new Uint8Array(arrayBuffer).set(imageBytes);
        const blob = new Blob([arrayBuffer], { type: mimeType });
        const newUrl = URL.createObjectURL(blob);
 
        setImageUrl((currentUrl) => {
            if (currentUrl) {
                requestAnimationFrame(() => URL.revokeObjectURL(currentUrl));
            }
            prevUrlRef.current = newUrl;
            return newUrl;
        });
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
                digitalTwinSelected.pipelineFileData = "";
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
                    digitalTwinSelected.pipelineFileData = JSON.stringify(pipelineDataNodes);
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
                    digitalTwinSelected.pipelineFileData = JSON.stringify(pipelineDataNodes);
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
    existingNodes: any[],
    existingEdges: any[],
    pipelineNodesData: any,
    natsClient: NatsConnection | null,
    natsSubjectsData: INatsSubjectData[]
) => {
    const nodes = [];
    const edges = [];
    let maxY = 0;
    const existingNodeNameSet = new Set<string>();
    const existingNodeUidSet = new Set<string>();
    if (existingNodes && existingNodes.length > 0) {
        for (const node of existingNodes) {
            nodes.push(node);
            existingNodeNameSet.add(node.data.label);
            existingNodeUidSet.add(node.id);
            if (node.position.y > maxY) {
                maxY = node.position.y;
            }
        }
    }

    if (existingEdges && existingEdges.length > 0) {
        for (const edge of existingEdges) {
            edges.push(edge);
        }
    }

    const nodeUidMap = new Map();
    const pipelineNodes = [] as any[];
    for (const node of pipelineNodesData) {
        if (!existingNodeNameSet.has(node.name) && !existingNodeUidSet.has(node.nodeUid)) {
            pipelineNodes.push(node);
        } else {
            let newNodeUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
            const newNode = { ...node, nodeUid: newNodeUid };
            pipelineNodes.push(newNode);
            nodeUidMap.set(node.nodeUid, newNodeUid);
        }
    }

    for (let inode = 0; inode < pipelineNodes.length; inode++) {
        const node = pipelineNodes[inode];
        for (let outputIndex = 0; outputIndex < node.wires.length; outputIndex++) {
            const wireArray = node.wires[outputIndex];
            if (wireArray && wireArray.length > 0) {
                for (let wireIdx = 0; wireIdx < wireArray.length; wireIdx++) {
                    const wire = wireArray[wireIdx];
                    if (nodeUidMap.has(wire.nodeEndUid)) {
                        pipelineNodes[inode].wires[outputIndex][wireIdx].nodeEndUid = nodeUidMap.get(wire.nodeEndUid);
                    }
                }
            }
        }
    }

    let newNodesMinY = 0;
    for (let inode = 0; inode < pipelineNodes.length; inode++) {
        const node = pipelineNodes[inode];
        if (inode === 0) {
            newNodesMinY = node.y;
        } else {
            if (node.y < newNodesMinY!) {
                newNodesMinY = node.y;
            }
        }
    }

    if (newNodesMinY < 40) {
        maxY += 40 - newNodesMinY;
    }

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

        let yPosition = nodeItem.y || 0;
        yPosition += maxY;
        const position = {
            x: nodeItem.x || 0,
            y: yPosition,
        };

        if (nodeItem.type === "Inject") {
            (nodeData as any).natsSubjectsData = natsSubjectsData;
            (nodeData as any).natsClient = natsClient;
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
        const outputIndex = edge.sourceHandle ? parseInt(edge.sourceHandle.split("-")[1], 10) : 0

        if (!wiresData.has(edge.id)) {
            wiresData.set(edge.id, {
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
        for (let [key, wireData] of Array.from(wiresData.entries())) {
            const keyNodeUid = key.split("-")[0]; // Extract the nodeUid from the key
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
    natsClient: NatsConnection | null,
    natsSubjectsData: INatsSubjectData[],
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
                        const newPipelineNodes = yamlData.nodes || [];
                        const { nodes, edges } = createNodesAndEdges(
                            pipelineNodes,
                            pipelineEdges,
                            newPipelineNodes,
                            natsClient,
                            natsSubjectsData
                        );
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
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pipelineNodes, pipelineEdges, natsClient, natsSubjectsData]
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
