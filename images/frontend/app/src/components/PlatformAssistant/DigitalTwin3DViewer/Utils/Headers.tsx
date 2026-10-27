// Barra superior del visor del gemelo digital (diseño "inspector acoplado"): nombre del gemelo,
// selector de vista, herramientas de la vista activa y estados (pipeline, gemelo digital, NATS).
import { FC, ReactNode, useRef } from "react";
import styled, { css, keyframes } from "styled-components";
import {
    Box,
    Camera,
    ChartLine,
    CircleStop,
    Download,
    Logs,
    MessageSquare,
    PanelRight,
    Play,
    RefreshCw,
    SlidersHorizontal,
    Upload,
    Workflow,
    X,
} from "lucide-react";
import { INSPECTOR_GAP, INSPECTOR_WIDTH } from "../Inspector/Inspector";
import { useUiStore } from "../../../../state/uiStore";
import { PALETTE_WIDTH, PALETTE_WIDTH_KEY } from "../Pipeline/usePipelineLayout";
import { focusRing, inspectorColors as c } from "../Inspector/controls";

const HiddenFileInput = styled.input`
    display: none;
`;

const Bar = styled.div<{ $left: string; $right: string }>`
    position: absolute;
    top: ${INSPECTOR_GAP}px;
    left: ${({ $left }) => $left};
    right: ${({ $right }) => $right};
    max-width: calc(100% - ${2 * INSPECTOR_GAP}px);
    min-height: 52px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 6px 8px 6px 16px;
    background-color: ${c.surface};
    backdrop-filter: blur(8px);
    border: 1px solid ${c.border};
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    color: ${c.text};
    font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
    z-index: 1000;
    user-select: none;
`;

const Title = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 260px;
    margin-right: 8px;

    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const TitleMain = styled.span`
    font-size: 14px;
    font-weight: 500;
`;

const TitleSub = styled.span`
    font-size: 11px;
    color: ${c.textMuted};
`;

const Segmented = styled.div`
    display: flex;
    gap: 2px;
    padding: 3px;
    background-color: ${c.field};
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 9px;
`;

const Segment = styled.button<{ $selected: boolean }>`
    height: 30px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border: 0;
    border-radius: 6px;
    background-color: ${({ $selected }) => ($selected ? "#2a3140" : "transparent")};
    color: ${({ $selected }) => ($selected ? "#ffffff" : c.textMuted)};
    font: 500 12px Roboto, "Helvetica Neue", Arial, sans-serif;
    cursor: pointer;
    ${focusRing}

    &:hover {
        color: #ffffff;
    }

    svg {
        width: 14px;
        height: 14px;
    }
`;

const Spacer = styled.div`
    flex: 1;
`;

const Group = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
`;

const Divider = styled.div`
    width: 1px;
    height: 24px;
    margin: 0 4px;
    background-color: rgba(255, 255, 255, 0.1);
`;

// Tooltip debajo del botón (la barra está arriba del todo)
const tooltip = css`
    &::after {
        content: attr(data-tooltip);
        position: absolute;
        top: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
        padding: 5px 8px;
        border-radius: 6px;
        background-color: #1f2937;
        border: 1px solid #4b5563;
        color: #ffffff;
        font: 12px Roboto, "Helvetica Neue", Arial, sans-serif;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s;
        z-index: 2000;
    }

    &[data-tooltip-align="end"]::after {
        left: auto;
        right: 0;
        transform: none;
    }

    &:hover::after,
    &:focus-visible::after {
        opacity: 1;
    }
`;

const ToolButton = styled.button<{ $active?: boolean; $attention?: boolean }>`
    position: relative;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 8px;
    background-color: ${({ $active }) => ($active ? "#2a3140" : "transparent")};
    color: ${({ $active, $attention }) => ($attention ? "#ffb35c" : $active ? "#ffffff" : c.textSecondary)};
    cursor: pointer;
    ${focusRing}
    ${tooltip}

    &:hover {
        background-color: ${({ $active }) => ($active ? "#2a3140" : c.hover)};
        color: #ffffff;
    }

    svg {
        width: 18px;
        height: 18px;
    }
`;

const AttentionDot = styled.span`
    position: absolute;
    top: 6px;
    right: 6px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: #ffb35c;
    box-shadow: 0 0 0 2px ${c.surfaceSolid};
`;

const pulse = keyframes`
    50% { opacity: 0.45; }
`;

type ChipTone = "ok" | "info" | "danger" | "muted";

const chipColors: Record<ChipTone, { bg: string; fg: string; dot: string }> = {
    ok: { bg: "rgba(98, 247, 0, 0.08)", fg: c.okText, dot: c.ok },
    info: { bg: "rgba(61, 130, 240, 0.12)", fg: c.accentText, dot: c.accent },
    danger: { bg: "rgba(255, 64, 64, 0.12)", fg: "#ff8a8a", dot: "#ff4040" },
    muted: { bg: "rgba(255, 255, 255, 0.06)", fg: c.textMuted, dot: "#806787" },
};

const chipStyles = css<{ $tone: ChipTone; $pulse?: boolean }>`
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 14px;
    background-color: ${({ $tone }) => chipColors[$tone].bg};
    color: ${({ $tone }) => chipColors[$tone].fg};
    font: 500 12px Roboto, "Helvetica Neue", Arial, sans-serif;
    white-space: nowrap;

    &::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background-color: ${({ $tone }) => chipColors[$tone].dot};
        animation: ${({ $pulse }) => ($pulse ? css`${pulse} 1s ease-in-out infinite` : "none")};
    }
`;

const Chip = styled.span<{ $tone: ChipTone; $pulse?: boolean }>`
    ${chipStyles}
    ${tooltip}
`;

const ChipButton = styled.button<{ $tone: ChipTone; $pulse?: boolean }>`
    ${chipStyles}
    ${tooltip}
    cursor: pointer;
    ${focusRing}

    &:hover {
        filter: brightness(1.2);
    }
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
    digitalTwinName?: string;
    digitalTwinType?: string;
    isChatAssistantOpen?: boolean;
    isPipelineLogsOpen?: boolean;
}

const VIEWER_OPTIONS: { value: "3D" | "pipeline" | "image_frame"; label: string; icon: ReactNode }[] = [
    { value: "3D", label: "3D model", icon: <Box aria-hidden="true" /> },
    { value: "pipeline", label: "Pipeline", icon: <Workflow aria-hidden="true" /> },
    { value: "image_frame", label: "Image", icon: <Camera aria-hidden="true" /> },
];

const PipelineStatusChip: FC<{ status: string; leader: number }> = ({ status, leader }) => {
    if (status === "running") {
        const text = leader >= 0 ? `Running · leader ${leader}` : "Running";
        return (
            <Chip $tone="ok" data-tooltip="Pipeline status" role="status">
                {text}
            </Chip>
        );
    }
    if (status === "stopped") {
        return (
            <Chip $tone="danger" data-tooltip="Pipeline status" role="status">
                Stopped
            </Chip>
        );
    }
    if (status === "error") {
        return (
            <Chip $tone="danger" $pulse data-tooltip="Pipeline status" role="status">
                Error
            </Chip>
        );
    }
    return (
        <Chip $tone="muted" data-tooltip="Pipeline status" role="status">
            Unknown
        </Chip>
    );
};

export const Header: FC<HeaderProps> = ({
    isControlPanelOpen,
    isNatsConnected,
    digitalTwinState,
    activeViewer,
    showOnlyPipelineViewer,
    handleControlPanelOpenAndClose,
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
    digitalTwinName,
    digitalTwinType,
    isChatAssistantOpen = false,
    isPipelineLogsOpen = false,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    // En la vista Pipeline la barra ocupa el ancho a la derecha de la paleta de nodos (el lienzo empieza
    // debajo de ella); en la vista 3D ocupa el ancho libre a la izquierda del inspector.
    const paletteWidth = useUiStore((s) => (s.values[PALETTE_WIDTH_KEY] as number | undefined) ?? PALETTE_WIDTH);
    const inspectorVisible = activeViewer === "3D" && isControlPanelOpen;
    const left = activeViewer === "pipeline" ? `${paletteWidth + INSPECTOR_GAP}px` : `${INSPECTOR_GAP}px`;
    const right = inspectorVisible ? `${INSPECTOR_WIDTH + 2 * INSPECTOR_GAP}px` : `${INSPECTOR_GAP}px`;

    const dtOk = digitalTwinState === "OK";
    const viewerOptions = VIEWER_OPTIONS.filter((o) => o.value !== "image_frame" || assetWithCameraSelected);

    const chatButton = (
        <ToolButton
            type="button"
            aria-label="Chat with assistant"
            data-tooltip="Chat with assistant"
            aria-pressed={isChatAssistantOpen}
            $active={isChatAssistantOpen}
            onClick={handleChatAssistantOpen}
        >
            <MessageSquare aria-hidden="true" />
        </ToolButton>
    );
    const logsButton = (
        <ToolButton
            type="button"
            aria-label="Pipeline logs"
            data-tooltip="Pipeline logs"
            aria-pressed={isPipelineLogsOpen}
            $active={isPipelineLogsOpen}
            onClick={handlePipelineLogsOpen}
        >
            <Logs aria-hidden="true" />
        </ToolButton>
    );
    const dashboardButton = (
        <ToolButton type="button" aria-label="Grafana dashboard" data-tooltip="Grafana dashboard" onClick={handleOpenGrafanaDashboard}>
            <ChartLine aria-hidden="true" />
        </ToolButton>
    );

    return (
        <Bar $left={left} $right={right} data-testid="viewer-top-bar">
            {activeViewer !== "pipeline" && digitalTwinName && (
                <Title>
                    <TitleMain title={digitalTwinName}>{digitalTwinName}</TitleMain>
                    {digitalTwinType && <TitleSub>{digitalTwinType}</TitleSub>}
                </Title>
            )}

            {!showOnlyPipelineViewer && (
                <Segmented role="tablist" aria-label="Viewer">
                    {viewerOptions.map((option) => (
                        <Segment
                            key={option.value}
                            type="button"
                            role="tab"
                            aria-selected={activeViewer === option.value}
                            $selected={activeViewer === option.value}
                            onClick={() => handleSetActiveViewer(option.value)}
                        >
                            {option.icon}
                            {option.label}
                        </Segment>
                    ))}
                </Segmented>
            )}

            {activeViewer === "pipeline" && <PipelineStatusChip status={pipelineStatus} leader={pipelineLeaderReplicaIndex} />}

            <Spacer />

            {activeViewer === "3D" && (
                <Group>
                    {chatButton}
                    <ToolButton
                        type="button"
                        aria-label="Digital twin simulator"
                        data-tooltip="Digital twin simulator"
                        onClick={handleOpenSimulator}
                    >
                        <SlidersHorizontal aria-hidden="true" />
                    </ToolButton>
                    {logsButton}
                    {dashboardButton}
                </Group>
            )}

            {activeViewer === "pipeline" && (
                <Group>
                    <ToolButton
                        type="button"
                        aria-label={isPipelineUiChanged ? "Deploy changes (there are undeployed changes)" : "Deploy changes"}
                        data-tooltip={isPipelineUiChanged ? "Deploy changes · not deployed yet" : "Deploy changes"}
                        $attention={isPipelineUiChanged}
                        onClick={handleDeployPipeline}
                    >
                        <Play aria-hidden="true" />
                        {isPipelineUiChanged && <AttentionDot />}
                    </ToolButton>
                    <ToolButton type="button" aria-label="Stop pipeline" data-tooltip="Stop pipeline" onClick={handleStopPipeline}>
                        <CircleStop aria-hidden="true" />
                    </ToolButton>
                    <ToolButton
                        type="button"
                        aria-label="Reinitiate pipeline"
                        data-tooltip="Reinitiate pipeline"
                        onClick={handleReinitiatePipeline}
                    >
                        <RefreshCw aria-hidden="true" />
                    </ToolButton>
                    <Divider />
                    <ToolButton type="button" aria-label="Download YAML" data-tooltip="Download YAML" onClick={handleDownloadYamlFile}>
                        <Download aria-hidden="true" />
                    </ToolButton>
                    <ToolButton
                        type="button"
                        aria-label="Upload YAML"
                        data-tooltip="Upload YAML"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload aria-hidden="true" />
                    </ToolButton>
                    <Divider />
                    {logsButton}
                    {showOnlyPipelineViewer && dashboardButton}
                </Group>
            )}

            {activeViewer === "image_frame" && (
                <Group>
                    {chatButton}
                    {logsButton}
                    {dashboardButton}
                </Group>
            )}

            <Divider />
            <Group style={{ gap: 6 }}>
                {(activeViewer !== "pipeline" || showOnlyPipelineViewer) && (
                    <ChipButton
                        type="button"
                        $tone={dtOk ? "ok" : "danger"}
                        $pulse={!dtOk}
                        data-tooltip={dtOk ? "Digital twin state is OK" : "Digital twin state is not OK"}
                        onClick={handleDigitalTwinStateShield}
                    >
                        {dtOk ? "DT OK" : "DT alert"}
                    </ChipButton>
                )}
                <Chip
                    $tone={isNatsConnected ? "info" : "muted"}
                    data-tooltip={isNatsConnected ? "NATS connection is active" : "NATS connection is inactive"}
                    data-tooltip-align="end"
                    role="status"
                >
                    {isNatsConnected ? "NATS" : "NATS offline"}
                </Chip>
            </Group>

            {activeViewer === "3D" && (
                <ToolButton
                    type="button"
                    aria-label={isControlPanelOpen ? "Close inspector" : "Open inspector"}
                    data-tooltip={isControlPanelOpen ? "Close inspector" : "Open inspector"}
                    data-tooltip-align="end"
                    aria-pressed={isControlPanelOpen}
                    $active={isControlPanelOpen}
                    onClick={handleControlPanelOpenAndClose}
                >
                    <PanelRight aria-hidden="true" />
                </ToolButton>
            )}
            <ToolButton
                type="button"
                aria-label="Close viewer"
                data-tooltip="Close viewer"
                data-tooltip-align="end"
                onClick={close3DViewer}
            >
                <X aria-hidden="true" />
            </ToolButton>
            <HiddenFileInput ref={fileInputRef} type="file" accept=".yml,.yaml" onChange={handleFileUpload} />
        </Bar>
    );
};
