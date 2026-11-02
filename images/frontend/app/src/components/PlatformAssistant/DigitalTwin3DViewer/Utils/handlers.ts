// handlers.ts
import { toast } from "react-toastify";
import { AxiosError, AxiosResponse } from "axios";
// import YAML from "yaml";

import { OPACITY_SERIE, BUTTON_LABELS, PROTOCOL, DOMAIN_NAME } from "./constants";
import { ViewerOptions } from "../Types/types";
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
    activeViewer: "3D" | "pipeline" | "image_frame";
    assetWithCameraSelected: boolean;
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
    isAssistantPanelOpen: boolean;
    // pestaña del chat seleccionada en el panel del asistente (el chat está a la vista si además el panel del asistente está abierto)
    isChatAssistantOpen: boolean;
    // el panel del asistente se ve (en la vista 3D, o solo con el chat en las vistas Imagen y Pipeline)
    isAssistantPanelShown: boolean;
    isPipelineLogsOpen: boolean;
    isPipelineUiChanged: boolean;
    openDashboardTab: (url: string) => void;
}

export const createHandlers = (
    params: HandlersParams,
    setters: {
        setActiveViewer: (viewer: "3D" | "pipeline" | "image_frame") => void;
        setGetLastMeasurementsButtomLabel: (label: string) => void;
        setInitialDigitalTwinSimulatorState: (state: Record<string, number>) => void;
        setLockReadingButtomLabel: (label: string) => void;
        setDigitalTwinSimulatorSendData: (send: boolean | ((prev: boolean) => boolean)) => void;
        setInitialSensorsState: (state: any) => void;
        setInitialAssetsState: (state: any) => void;
        setInitialGenericObjectsState: (state: any) => void;
        setIsAssistantPanelOpen: (open: boolean) => void;
        setChatAssistantOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
        setPipelineLogsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
        setShowDtSimulatorModal: (show: boolean) => void;
        setGeneralTransparencyIndex: (index: number) => void;
        setIsPipelineUiChanged: (changed: boolean) => void;
        setOpts: (updater: (prev: ViewerOptions) => ViewerOptions) => void;
    },
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
            const filteredSubjects = digitalTwinGltfData.natsSubjectsData.filter(
                (subjectData) => subjectData.topicRef.slice(0, 7) === "dev2pdb",
            );
            const topicsIdArray = filteredSubjects.map((subject) => subject.topicId);

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
                generateInitialGenericObjectsState(genericObjects, digitalTwinGltfData),
            );
        }
        setters.setDigitalTwinSimulatorSendData((prev) => !prev);
        handleGetLastMeasurementsButton();
    };

    // Botón del panel lateral (chat del asistente + ajustes del visor): es el único que lo abre y lo cierra.
    // En las vistas Imagen y Pipeline solo tiene el chat, así que se abre en esa pestaña.
    const handleAssistantPanelOpenAndClose = () => {
        const { isAssistantPanelShown, lockReadingButtomLabel, activeViewer, digitalTwinSelected } = params;
        if (isAssistantPanelShown) {
            setters.setIsAssistantPanelOpen(false);
        } else if (activeViewer !== "3D") {
            if (digitalTwinSelected?.chatAssistantEnabled) {
                setters.setChatAssistantOpen(true);
                setters.setIsAssistantPanelOpen(true);
                // both panels dock on the right: in the pipeline view the assistant panel replaces the logs
                if (activeViewer === "pipeline") setters.setPipelineLogsOpen(false);
            }
        } else {
            // the simulator shows the last measurements, unless the reading is locked: then it keeps the
            // values being simulated (set in the Sim tab or by the AI agent)
            if (lockReadingButtomLabel !== BUTTON_LABELS.UNLOCK_READ_MEASUREMENTS) handleGetLastMeasurementsButton();
            // opens on the last tab it had (the chat included); the logs are only shown in the pipeline
            // view, so they stay as they are
            setters.setIsAssistantPanelOpen(true);
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

    // The logs belong to the pipeline view (their button is only there). Both panels dock on the right,
    // so opening the logs closes the assistant panel when it is shown there (digital twins without a 3D model).
    const handlePipelineLogsOpen = () => {
        const { digitalTwinSelected, isAssistantPanelShown, isPipelineLogsOpen } = params;
        if (!digitalTwinSelected) return;
        if (!isPipelineLogsOpen && isAssistantPanelShown) setters.setIsAssistantPanelOpen(false);
        setters.setPipelineLogsOpen(!isPipelineLogsOpen);
    };

    const handleSetPipelineLogsOpen = (open: boolean) => {
        setters.setPipelineLogsOpen(open);
    };

    const handlePipelineUiChanged = (isChanged: boolean) => {
        setters.setIsPipelineUiChanged(isChanged);
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

    // Simulador en ventana flotante (botón "Float" de la pestaña Sim. del panel del asistente): se bloquea la lectura de
    // los sensores para que lleguen al gemelo digital los valores simulados
    const handleOpenSimulator = () => {
        setters.setShowDtSimulatorModal(true);
        setters.setLockReadingButtomLabel(BUTTON_LABELS.UNLOCK_READ_MEASUREMENTS);
        setters.setDigitalTwinSimulatorSendData(true);
    };
    // Vuelve a la pestaña Sim. del panel del asistente: se mantiene la simulación (la lectura sigue bloqueada)
    const handleDockSimulator = () => {
        setters.setShowDtSimulatorModal(false);
    };
    // "Stop simulation" de la ventana flotante: se cierra y se vuelven a leer los sensores
    const handleStopSimulator = () => {
        const { lockReadingButtomLabel } = params;
        setters.setShowDtSimulatorModal(false);
        if (lockReadingButtomLabel === BUTTON_LABELS.UNLOCK_READ_MEASUREMENTS) {
            handleLockReadMeasurementsButtonClick();
        } else {
            setters.setDigitalTwinSimulatorSendData(false);
        }
    };

    const updateDigitalTwinSimulatorState = (digitalTwinSimulatorState: Record<string, number>) => {
        setters.setOpts((prevOpts) => ({
            ...prevOpts,
            digitalTwinSimulatorState,
        }));
    };

    const handleToggleActiveViewer = () => {
        const { activeViewer } = params;
        const viewerOptions = ["3D", "pipeline"];
        if (params.assetWithCameraSelected) {
            viewerOptions.push("image_frame");
        }
        const currentIndex = viewerOptions.indexOf(activeViewer);
        const nextIndex = (currentIndex + 1) % viewerOptions.length;
        const newViewer = viewerOptions[nextIndex] as "3D" | "pipeline" | "image_frame";
        setters.setActiveViewer(newViewer);
        if (newViewer === "pipeline") {
            // el panel del asistente se cierra pero recuerda su pestaña (la del chat incluida)
            setters.setIsAssistantPanelOpen(false);
            setters.setShowDtSimulatorModal(false);
            //setters.setPipelineLogsOpen(false);
        }
    };

    const handleSetActiveViewer = (newViewer: "3D" | "pipeline" | "image_frame") => {
        setters.setActiveViewer(newViewer);
        if (newViewer === "pipeline") {
            // el panel del asistente se cierra pero recuerda su pestaña (la del chat incluida)
            setters.setIsAssistantPanelOpen(false);
            setters.setShowDtSimulatorModal(false);
        }
    };

    return {
        handleGetLastMeasurementsButton,
        handleLockReadMeasurementsButtonClick,
        handleAssistantPanelOpenAndClose,
        handleOpenGrafanaDashboard,
        handlePipelineLogsOpen,
        handleSetPipelineLogsOpen,
        handlePipelineUiChanged,
        handleDigitalTwinStateShield,
        handleOpenSimulator,
        handleDockSimulator,
        handleStopSimulator,
        updateDigitalTwinSimulatorState,
        handleToggleActiveViewer,
        handleSetActiveViewer,
    };
};
