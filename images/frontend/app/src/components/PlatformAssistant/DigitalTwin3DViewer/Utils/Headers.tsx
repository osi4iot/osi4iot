import { FC, useRef, useState, useEffect } from "react";
import {
    HeaderContainer,
    HeaderOptionsContainer,
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
    NatsText,
    CircleXIcon,
    DownloadIcon,
    PlayIcon,
    RefreshCwIcon,
    UploadIcon,
    CameraIcon,
    StoppedIndicator,
    RunningIndicator,
    ErrorIndicator,
    UnknownIndicator,
    IndicatorContainer,
    InstanceBadge,
    NatsConnectionDiv,
} from "./StyledComponents";
import { TooltipWrapper } from "./TooltipWrapper";
import styled from "styled-components";
import { ChevronDown } from "lucide-react";

const HiddenFileInput = styled.input`
    display: none;
`;

const ViewerDropdownContainer = styled.div`
    position: relative;
    display: inline-block;
`;

const ViewerDropdownButton = styled.button`
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: #141619;
    border: 1px solid #3274d9;
    border-radius: 6px;
    color: #3274d9;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 12px;
    margin: 6px;
    transition: all 0.2s;

    &:hover {
        background-color: #1e2a3a;
        color: white;
        border-color: white;

        * {
            color: white !important;
            stroke: white !important;
            background-color: transparent !important;
        }
    }

    svg {
        background-color: transparent !important;
        margin: 0 !important;
        font-size: 16px !important;
        width: 16px;
        height: 16px;
    }
`;

const ViewerDropdownMenu = styled.div<{ open: boolean }>`
    display: ${({ open }) => (open ? "flex" : "none")};
    flex-direction: column;
    position: absolute;
    top: calc(100% + 2px);
    right: 5px;
    background-color: #1a1d21;
    border: 1px solid #3274d9;
    border-radius: 6px;
    z-index: 2000;
    min-width: 110px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
`;

const ViewerDropdownItem = styled.button<{ active: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    background-color: ${({ active }) => (active ? "#1e2a3a" : "transparent")};
    border: none;
    color: ${({ active }) => (active ? "white" : "#9ca3af")};
    padding: 8px 12px;
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    transition: all 0.15s;

    &:hover {
        background-color: #1e2a3a;
        color: white;

        * {
            color: white !important;
            stroke: white !important;
            background-color: transparent !important;
        }
    }

    svg {
        background-color: transparent !important;
        margin: 0 !important;
        font-size: 16px !important;
        width: 18px;
        height: 18px;
        flex-shrink: 0;
    }
`;

const ChevronIcon = styled(ChevronDown)<{ open: boolean }>`
    background-color: transparent !important;
    margin: 0 !important;
    width: 14px !important;
    height: 14px !important;
    transition: transform 0.2s;
    transform: ${({ open }) => (open ? "rotate(180deg)" : "rotate(0deg)")};
`;

interface HeaderProps {
    isControlPanelOpen: boolean;
    isNatsConnected: boolean;
    digitalTwinState: string;
    activeViewer: "3D" | "pipeline" | "image_frame";
    showOnlyPipelineViewer: boolean;
    handleControlPanelOpenAndClose: () => void;
    handleToggleActiveViewer: () => void;
    handleSetActiveViewer: (viewer: "3D" | "pipeline" | "image_frame") => void;
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
    assetWithCameraSelected: boolean;
    pipelineStatus: string;
    pipelineLeaderReplicaIndex: number;
}

const RunningIndicatorWithBadge: FC<{ leaderIndex: number }> = ({ leaderIndex }) => {
    return (
        <IndicatorContainer>
            <RunningIndicator />
            <InstanceBadge>{leaderIndex}</InstanceBadge>
        </IndicatorContainer>
    );
};

const VIEWER_OPTIONS: {
    value: "3D" | "pipeline" | "image_frame";
    label: string;
    icon: FC<{ className?: string }>;
}[] = [
    { value: "3D", label: "3D Model", icon: BoxIcon },
    { value: "pipeline", label: "Pipeline", icon: TiFlowMergeIcon },
    { value: "image_frame", label: "Image", icon: CameraIcon },
];

export const Header: FC<HeaderProps> = ({
    isControlPanelOpen,
    isNatsConnected,
    digitalTwinState,
    activeViewer,
    showOnlyPipelineViewer,
    handleControlPanelOpenAndClose,
    handleToggleActiveViewer,
    handleSetActiveViewer,
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
    assetWithCameraSelected,
    pipelineStatus,
    pipelineLeaderReplicaIndex,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const activeOption = VIEWER_OPTIONS.find((o) => o.value === activeViewer);
    const ActiveIcon = activeOption?.icon;

    const viewerDropdown = () => (
        <ViewerDropdownContainer ref={dropdownRef}>
            <ViewerDropdownButton onClick={() => setDropdownOpen((prev) => !prev)}>
                {ActiveIcon && <ActiveIcon className="w-4 h-4" />}
                <span>{activeOption?.label}</span>
                <ChevronIcon open={dropdownOpen} />
            </ViewerDropdownButton>

            <ViewerDropdownMenu open={dropdownOpen}>
                {VIEWER_OPTIONS.map(({ value, label, icon: Icon }) => {
                    // Hide image_frame option if no camera asset is selected
                    if (value === "image_frame" && !assetWithCameraSelected) return null;
                    return (
                        <ViewerDropdownItem
                            key={value}
                            active={activeViewer === value}
                            onClick={() => {
                                handleSetActiveViewer(value);
                                setDropdownOpen(false);
                            }}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </ViewerDropdownItem>
                    );
                })}
            </ViewerDropdownMenu>
        </ViewerDropdownContainer>
    );

    const pipelineStatusIndicator = () => {
        if (activeViewer !== "pipeline") return null;
        if (pipelineStatus === "running") {
            return (
                <TooltipWrapper tooltip={`Status: Running (Leader: ${pipelineLeaderReplicaIndex})`}>
                    <RunningIndicatorWithBadge leaderIndex={pipelineLeaderReplicaIndex} />
                </TooltipWrapper>
            );
        }
        if (pipelineStatus === "stopped") {
            return (
                <TooltipWrapper tooltip="Status: Stopped">
                    <StoppedIndicator />
                </TooltipWrapper>
            );
        }
        if (pipelineStatus === "error") {
            return (
                <TooltipWrapper tooltip="Status: Error">
                    <ErrorIndicator />
                </TooltipWrapper>
            );
        }
        if (pipelineStatus === "unknown") {
            return (
                <TooltipWrapper tooltip="Status: Unknown">
                    <UnknownIndicator />
                </TooltipWrapper>
            );
        }
        return null;
    };

    return (
        <HeaderContainer>
            <HeaderOptionsContainer>
                {!showOnlyPipelineViewer && viewerDropdown()}
                {pipelineStatusIndicator()}

                {activeViewer === "3D" && (
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
                )}

                {activeViewer === "pipeline" && (
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
                        <TooltipWrapper tooltip="Upload YAML" onClick={() => fileInputRef.current?.click()}>
                            <UploadIcon className="w-4 h-4" />
                        </TooltipWrapper>
                        {showOnlyPipelineViewer && (
                            <>
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
                        )}
                    </>
                )}

                {activeViewer === "image_frame" && (
                    <>
                        <TooltipWrapper tooltip="Chat with assistant" onClick={handleChatAssistantOpen}>
                            <ChatAssistantIcon />
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
                )}

                <NatsConnectionDiv>
                    {isNatsConnected ? (
                        <TooltipWrapper tooltip="NATS connection is active">
                            <NatsText>NATS</NatsText>
                            <WifiIcon />
                        </TooltipWrapper>
                    ) : (
                        <TooltipWrapper tooltip="NATS connection is inactive">
                            <NatsText>NATS</NatsText>
                            <NoWifiIcon />
                        </TooltipWrapper>
                    )}
                </NatsConnectionDiv>

                <ExitIcon onClick={close3DViewer} />
            </HeaderOptionsContainer>
            <HiddenFileInput ref={fileInputRef} type="file" accept=".yml,.yaml" onChange={handleFileUpload} />
        </HeaderContainer>
    );
};
