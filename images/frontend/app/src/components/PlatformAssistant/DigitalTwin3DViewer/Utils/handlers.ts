// handlers.ts
import { toast } from "react-toastify";
import { AxiosError, AxiosResponse } from "axios";
// import YAML from "yaml";

import { OPACITY_SERIE, BUTTON_LABELS, PROTOCOL, DOMAIN_NAME } from "./constants";
import {  ViewerOptions } from "../Types/types";
import {
    generateInitialSensorsState,
    generateInitialAssetsState,
    generateInitialGenericObjectsState,
    IDigitalTwinGltfData,
} from "../ViewerTools/ViewerUtils";
import { IDigitalTwin } from "../../TableColumns/digitalTwinsColumns";
import { axiosAuth } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import axiosErrorHandler from "../../../../tools/axiosErrorHandler";

interface HandlersParams {
    digitalTwinSelected: IDigitalTwin | null;
    digitalTwinGltfData: IDigitalTwinGltfData;
    activeViewer: "3D" | "pipeline";
    accessToken: string;
    refreshToken: string;
    authDispatch: any;
    sensorObjects: any[];
    assetObjects: any[];
    genericObjects: any[];
    lockReadingButtomLabel: string;
    getLastMeasurementsButtomLabel: string;
    initialDigitalTwinSimulatorState: Record<string, number>;
    generalTransparencyIndex: number;
    isControlPanelOpen: boolean;
    isChatAssistantOpen: boolean;
    isPipelineLogsOpen: boolean;
    isPipelineUiChanged: boolean;
    openDashboardTab: (url: string) => void;
}

export const createHandlers = (
    params: HandlersParams,
    setters: {
        setActiveViewer: (viewer: "3D" | "pipeline") => void;
        setGetLastMeasurementsButtomLabel: (label: string) => void;
        setInitialDigitalTwinSimulatorState: (state: Record<string, number>) => void;
        setLockReadingButtomLabel: (label: string) => void;
        setDigitalTwinSimulatorSendData: (send: boolean | ((prev: boolean) => boolean)) => void;
        setInitialSensorsState: (state: any) => void;
        setInitialAssetsState: (state: any) => void;
        setInitialGenericObjectsState: (state: any) => void;
        setIsControlPanelOpen: (open: boolean) => void;
        setChatAssistantOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
        setPipelineLogsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
        setShowDtSimulatorModal: (show: boolean) => void;
        setGeneralTransparencyIndex: (index: number) => void;
        setIsPipelineUiChanged: (changed: boolean) => void;
        setOpts: (updater: (prev: ViewerOptions) => ViewerOptions) => void;
    }
) => {
    const handleGetLastMeasurementsButton = () => {
        const {
            digitalTwinSelected,
            digitalTwinGltfData,
            accessToken,
            refreshToken,
            authDispatch,
            initialDigitalTwinSimulatorState,
        } = params;

        const digitalTwinSimulationFormat = digitalTwinGltfData.digitalTwinSimulationFormat;

        if (digitalTwinSelected && Object.keys(digitalTwinSimulationFormat).length !== 0) {
            const filteredTopics = digitalTwinGltfData.mqttTopicsData.filter(
                (topic) => topic.topicRef.slice(0, 7) === "dev2pdb"
            );
            const topicsIdArray = filteredTopics.map((topic) => topic.topicId);

            if (topicsIdArray.length !== 0) {
                setters.setGetLastMeasurementsButtomLabel(BUTTON_LABELS.LOADING);
                const groupId = digitalTwinSelected.groupId;
                const urlLastMeasurements = `${PROTOCOL}://${DOMAIN_NAME}/admin_api/measurements_last_from_topicsid_array/${groupId}/`;
                const config = axiosAuth(accessToken);
                const topicsIdArrayObj = { topicsIdArray };

                getAxiosInstance(refreshToken, authDispatch)
                    .post(urlLastMeasurements, topicsIdArrayObj, config)
                    .then((response: AxiosResponse<any, any>) => {
                        const lastMeasurements = response.data;
                        const newInitialDigitalTwinSimulatorState = {
                            ...initialDigitalTwinSimulatorState,
                        };
                        lastMeasurements.forEach((measurement: { payload: Record<string, number> }) => {
                            const payload = measurement.payload;
                            Object.keys(payload).forEach((fieldName) => {
                                if (newInitialDigitalTwinSimulatorState[fieldName] !== undefined) {
                                    newInitialDigitalTwinSimulatorState[fieldName] = payload[fieldName];
                                }
                            });
                        });
                        setters.setInitialDigitalTwinSimulatorState(newInitialDigitalTwinSimulatorState);
                        setters.setGetLastMeasurementsButtomLabel(BUTTON_LABELS.GET_LAST_MEASUREMENTS);
                    })
                    .catch((error: AxiosError) => {
                        axiosErrorHandler(error, authDispatch);
                        setters.setGetLastMeasurementsButtomLabel(BUTTON_LABELS.GET_LAST_MEASUREMENTS);
                    });
            }
        }
    };

    const handleLockReadMeasurementsButtonClick = () => {
        const { lockReadingButtomLabel, sensorObjects, assetObjects, genericObjects, digitalTwinGltfData } = params;

        if (lockReadingButtomLabel === BUTTON_LABELS.LOCK_READ_MEASUREMENTS) {
            setters.setLockReadingButtomLabel(BUTTON_LABELS.UNLOCK_READ_MEASUREMENTS);
        } else if (lockReadingButtomLabel === BUTTON_LABELS.UNLOCK_READ_MEASUREMENTS) {
            setters.setLockReadingButtomLabel(BUTTON_LABELS.LOCK_READ_MEASUREMENTS);
            setters.setInitialSensorsState(generateInitialSensorsState(sensorObjects, digitalTwinGltfData));
            setters.setInitialAssetsState(generateInitialAssetsState(assetObjects, digitalTwinGltfData));
            setters.setInitialGenericObjectsState(
                generateInitialGenericObjectsState(genericObjects, digitalTwinGltfData)
            );
        }
        setters.setDigitalTwinSimulatorSendData((prev) => !prev);
        handleGetLastMeasurementsButton();
    };

    const handleControlPanelOpenAndClose = () => {
        const { isControlPanelOpen } = params;

        if (isControlPanelOpen) {
            setters.setIsControlPanelOpen(false);
        } else {
            handleGetLastMeasurementsButton();
            setters.setIsControlPanelOpen(true);
            setters.setChatAssistantOpen(false);
            setters.setPipelineLogsOpen(false);
        }
    };

    const handleOpenGrafanaDashboard = () => {
        const { digitalTwinSelected, openDashboardTab } = params;

        if (digitalTwinSelected) {
            const dashboardUrl = digitalTwinSelected.dashboardUrl;
            if (dashboardUrl.slice(0, 7) === "Warning") {
                toast.warning(dashboardUrl);
            } else {
                openDashboardTab(dashboardUrl);
            }
        }
    };

    const handlePipelineLogsOpen = () => {
        const { digitalTwinSelected, isControlPanelOpen, isChatAssistantOpen } = params;

        if (digitalTwinSelected) {
            if (isControlPanelOpen || isChatAssistantOpen) {
                setters.setPipelineLogsOpen(false);
            } else {
                setters.setPipelineLogsOpen((prev) => !prev);
            }
        }
    };

    const handleSetPipelineLogsOpen = (open: boolean) => {
        setters.setPipelineLogsOpen(open);
    };

    const handlePipelineUiChanged = (isChanged: boolean) => {
        setters.setIsPipelineUiChanged(isChanged);
    };

    const handleChatAssistantOpen = () => {
        const { digitalTwinSelected, isControlPanelOpen } = params;

        if (digitalTwinSelected && digitalTwinSelected.chatAssistantEnabled) {
            if (isControlPanelOpen) {
                setters.setChatAssistantOpen(false);
            } else {
                setters.setChatAssistantOpen((prev) => !prev);
            }
        } else {
            toast.warning("Chat assistant is not enabled for this digital twin.");
        }
    };

    const handleDigitalTwinStateShield = () => {
        const { digitalTwinSelected, generalTransparencyIndex } = params;

        if (digitalTwinSelected) {
            let currentGeneralTransparencyIndex = generalTransparencyIndex + 1;
            if (currentGeneralTransparencyIndex === OPACITY_SERIE.length) {
                currentGeneralTransparencyIndex = 0;
            }
            setters.setGeneralTransparencyIndex(currentGeneralTransparencyIndex);
            let opacity = OPACITY_SERIE[currentGeneralTransparencyIndex];
            const showDeepObjects = currentGeneralTransparencyIndex >= 1 ? true : false;

            setters.setOpts((prevOpts) => ({
                ...prevOpts,
                genericObjectsOpacity: opacity,
                genericObjectsShowDeepObjects: showDeepObjects,
            }));
        }
    };

    const handleOpenSimulator = () => {
        setters.setShowDtSimulatorModal(true);
        setters.setDigitalTwinSimulatorSendData(true);
    };

    const updateDigitalTwinSimulatorState = (digitalTwinSimulatorState: Record<string, number>) => {
        setters.setOpts((prevOpts) => ({
            ...prevOpts,
            digitalTwinSimulatorState,
        }));
    };

    const handleToggleActiveViewer = () => {
        const { activeViewer } = params;
        const newViewer = activeViewer === "3D" ? "pipeline" : "3D";
        setters.setActiveViewer(newViewer);
        if (newViewer === "pipeline") {
            setters.setIsControlPanelOpen(false);
            setters.setChatAssistantOpen(false);
            setters.setShowDtSimulatorModal(false);
            //setters.setPipelineLogsOpen(false);
        }
    };

    return {
        handleGetLastMeasurementsButton,
        handleLockReadMeasurementsButtonClick,
        handleControlPanelOpenAndClose,
        handleOpenGrafanaDashboard,
        handlePipelineLogsOpen,
        handleSetPipelineLogsOpen,
        handlePipelineUiChanged,
        handleChatAssistantOpen,
        handleDigitalTwinStateShield,
        handleOpenSimulator,
        updateDigitalTwinSimulatorState,
        handleToggleActiveViewer,
    };
};
