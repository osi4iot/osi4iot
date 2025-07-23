import { FC, useRef } from "react";
import {
    HeaderContainer,
    HeaderOptionsContainer,
    MqttConnectionDiv,
    ExitIcon,
    DashboardIcon,
    HiShieldCheckIcon,
    HiShieldExclamationIcon,
    OpenFolderIcon,
    CloseFolderIcon,
    TiFlowMergeIcon,
    SlidersHorizontalIcon,
    LogsIcon,
    ChatAssistantIcon,
    WifiIcon,
    NoWifiIcon,
    BoxIcon,
    MqttText,
    CircleXIcon,
    DownloadIcon,
    PlayIcon,
    RefreshCwIcon,
    UploadIcon,
} from "./StyledComponents";
import { TooltipWrapper } from "./TooltipWrapper";
import styled from "styled-components";

const HiddenFileInput = styled.input`
    display: none;
`;

interface HeaderProps {
    isControlPanelOpen: boolean;
    isMqttConnected: boolean;
    digitalTwinState: string;
    activeViewer: "3D" | "pipeline";
    handleControlPanelOpenAndClose: () => void;
    handleToggleActiveViewer: () => void;
    handleChatAssistantOpen: () => void;
    handlePipelineLogsOpen: () => void;
    handleOpenSimulator: () => void;
    handleOpenGrafanaDashboard: () => void;
    handleDigitalTwinStateShield: () => void;
    handleDeployPipeline: () => void;
    handleStopPipeline: () => void;
    handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handleDownloadYamlFile: () => void;
    handleReinitiatePipeline: () => void;
    isPipelineUiChanged: boolean;
    close3DViewer: () => void;
}

export const Header: FC<HeaderProps> = ({
    isControlPanelOpen,
    isMqttConnected,
    digitalTwinState,
    activeViewer,
    handleControlPanelOpenAndClose,
    handleToggleActiveViewer,
    handleChatAssistantOpen,
    handlePipelineLogsOpen,
    handleOpenSimulator,
    handleOpenGrafanaDashboard,
    handleDigitalTwinStateShield,
    handleDeployPipeline,
    handleStopPipeline,
    handleFileUpload,
    handleDownloadYamlFile,
    handleReinitiatePipeline,
    isPipelineUiChanged,
    close3DViewer,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <HeaderContainer>
            <HeaderOptionsContainer>
                {activeViewer === "pipeline" ? (
                    <TooltipWrapper tooltip="Switch to 3D model viewer" onClick={handleToggleActiveViewer}>
                        <BoxIcon />
                    </TooltipWrapper>
                ) : (
                    <TooltipWrapper tooltip="Switch to pipeline viewer" onClick={handleToggleActiveViewer}>
                        <TiFlowMergeIcon />
                    </TooltipWrapper>
                )}

                {activeViewer === "3D" ? (
                    <>
                        {isControlPanelOpen ? (
                            <TooltipWrapper tooltip="Close control panel" onClick={handleControlPanelOpenAndClose}>
                                <CloseFolderIcon />
                            </TooltipWrapper>
                        ) : (
                            <TooltipWrapper tooltip="Open control panel" onClick={handleControlPanelOpenAndClose}>
                                <OpenFolderIcon />
                            </TooltipWrapper>
                        )}
                        <TooltipWrapper tooltip="Chat with assistant" onClick={handleChatAssistantOpen}>
                            <ChatAssistantIcon />
                        </TooltipWrapper>
                        <TooltipWrapper tooltip="Open digital twin simulator" onClick={handleOpenSimulator}>
                            <SlidersHorizontalIcon className="w-4 h-4" />
                        </TooltipWrapper>

                        <TooltipWrapper tooltip="Open pipeline logs" onClick={handlePipelineLogsOpen}>
                            <LogsIcon />
                        </TooltipWrapper>

                        <TooltipWrapper tooltip="Open Grafana dashboard" onClick={handleOpenGrafanaDashboard}>
                            <DashboardIcon />
                        </TooltipWrapper>

                        {digitalTwinState === "OK" ? (
                            <TooltipWrapper tooltip="Digital twin state is OK">
                                <HiShieldCheckIcon onClick={handleDigitalTwinStateShield} />
                            </TooltipWrapper>
                        ) : (
                            <TooltipWrapper tooltip="Digital twin state is not OK">
                                <HiShieldExclamationIcon onClick={handleDigitalTwinStateShield} />
                            </TooltipWrapper>
                        )}
                    </>
                ) : (
                    <>
                        <TooltipWrapper tooltip="Deploy changes" onClick={handleDeployPipeline}>
                            <PlayIcon
                                className="w-4 h-4"
                                style={{
                                    backgroundColor: "#141619",
                                    color: isPipelineUiChanged ? "#dc2626" : "#3274d9",
                                    margin: "10px",
                                    cursor: "pointer",
                                    transition: "color 0.2s ease",
                                }}
                            />
                        </TooltipWrapper>
                        <TooltipWrapper tooltip="Open pipeline logs" onClick={handlePipelineLogsOpen}>
                            <LogsIcon />
                        </TooltipWrapper>
                        <TooltipWrapper tooltip="Stop pipeline" onClick={handleStopPipeline}>
                            <CircleXIcon className="w-4 h-4" />
                        </TooltipWrapper>
                        <TooltipWrapper tooltip="Reinitiate pipeline" onClick={handleReinitiatePipeline}>
                            <RefreshCwIcon className="w-4 h-4" />
                        </TooltipWrapper>
                        <TooltipWrapper tooltip="Download YAML" onClick={handleDownloadYamlFile}>
                            <DownloadIcon className="w-4 h-4" />
                        </TooltipWrapper>
                        <TooltipWrapper
                            tooltip="Upload YAML"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <UploadIcon className="w-4 h-4" />
                        </TooltipWrapper>
                    </>
                )}

                <MqttConnectionDiv>
                    {isMqttConnected ? (
                        <TooltipWrapper tooltip="MQTT connection is active">
                            <MqttText>MQTT</MqttText>
                            <WifiIcon />
                        </TooltipWrapper>
                    ) : (
                        <TooltipWrapper tooltip="MQTT connection is inactive">
                            <MqttText>MQTT</MqttText>
                            <NoWifiIcon />
                        </TooltipWrapper>
                    )}
                </MqttConnectionDiv>

                <ExitIcon onClick={close3DViewer} />
            </HeaderOptionsContainer>
            <HiddenFileInput ref={fileInputRef} type="file" accept=".yml,.yaml" onChange={handleFileUpload} />
        </HeaderContainer>
    );
};
