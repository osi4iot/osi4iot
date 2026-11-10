// Barra superior del visor del gemelo digital (diseño "panel acoplado"): nombre del gemelo,
// selector de vista, herramientas de la vista activa y estados (pipeline, gemelo digital, NATS).
import { FC, ReactNode, useEffect, useRef } from "react";
import styled, { css, keyframes } from "styled-components";
import {
    ChartLine,
    ChevronDown,
    Columns2,
    CircleStop,
    Download,
    Logs,
    PanelRight,
    Play,
    RefreshCw,
    Upload,
    Workflow,
    X,
} from "lucide-react";
import { VIEWER_GAP } from "../AssistantPanel/AssistantPanel";
import { useUiStore } from "../../../../state/uiStore";
import { PALETTE_WIDTH, PALETTE_WIDTH_KEY } from "../Pipeline/usePipelineLayout";
import { focusRing, panelColors as c } from "../AssistantPanel/controls";

const HiddenFileInput = styled.input`
    display: none;
`;

const Bar = styled.div<{ $left: string; $right: string }>`
    position: absolute;
    top: ${VIEWER_GAP}px;
    left: ${({ $left }) => $left};
    right: ${({ $right }) => $right};
    max-width: calc(100% - ${2 * VIEWER_GAP}px);
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

// Opens the asset switcher (Ctrl K): the asset and twin being viewed, with its status
const SwitcherButton = styled.button`
    height: 36px;
    min-width: 0;
    max-width: 340px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px 0 10px;
    margin-right: 4px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background-color: ${c.field};
    color: ${c.text};
    font: 500 13px Roboto, "Helvetica Neue", Arial, sans-serif;
    text-align: left;
    cursor: pointer;
    ${focusRing}

    &:hover {
        border-color: rgba(255, 255, 255, 0.2);
    }

    > svg {
        width: 15px;
        height: 15px;
        flex: none;
        color: ${c.textMuted};
    }
`;

const SwitcherLed = styled.span<{ $ok: boolean }>`
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background-color: ${({ $ok }) => ($ok ? "#56c271" : "#f2495c")};
`;

const SwitcherText = styled.span`
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    small {
        font-size: 12px;
        font-weight: 400;
        color: ${c.textMuted};
    }
`;

const SwitcherKbd = styled.kbd`
    flex: none;
    font: 400 11px Roboto, "Helvetica Neue", Arial, sans-serif;
    color: ${c.textMuted};
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    padding: 1px 5px;

    @media (max-width: 900px) {
        display: none;
    }
`;

const Segmented = styled.div`
    display: flex;
    gap: 2px;
    padding: 3px;
    background-color: ${c.field};
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 9px;
`;

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

const Segment = styled.button<{ $selected: boolean }>`
    position: relative;
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
    ${tooltip}

    &:not([data-tooltip])::after {
        display: none;
    }

    &:hover {
        color: #ffffff;
    }

    svg {
        width: 14px;
        height: 14px;
    }
`;

const ErrorBadge = styled.span`
    position: absolute;
    top: 2px;
    right: 1px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    box-sizing: border-box;
    border-radius: 999px;
    background: #ff6b6b;
    color: #1a0f0f;
    font: 700 9px/15px Roboto, Arial, sans-serif;
    text-align: center;
`;

const ErrorDot = styled.span`
    width: 7px;
    height: 7px;
    margin-left: 2px;
    border-radius: 50%;
    background: #ff6b6b;
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
    isAssistantPanelOpen: boolean;
    isNatsConnected: boolean;
    digitalTwinState: string;
    activeViewer: "3D" | "pipeline";
    showOnlyPipelineViewer: boolean;
    handleAssistantPanelOpenAndClose: () => void;
    handleToggleActiveViewer: () => void;
    handleSetActiveViewer: (viewer: "3D" | "pipeline") => void;
    handlePipelineLogsOpen: () => void;
    handleOpenGrafanaDashboard: () => void;
    handleDigitalTwinStateShield: () => void;
    handleDeployPipeline: () => void;
    handleStopPipeline: () => void;
    handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handleDownloadYamlFile: () => void;
    // nodes selected in the editor: "Download YAML" saves only those
    selectedNodesCount?: number;
    handleReinitiatePipeline: () => void;
    isPipelineUiChanged: boolean;
    close3DViewer: () => void;
    // the asset has a camera: the Viewer page has the Image panel (the parent decides what it shows)
    assetWithCameraSelected: boolean;
    pipelineStatus: string;
    pipelineLeaderReplicaIndex: number;
    digitalTwinName?: string;
    digitalTwinType?: string;
    // asset of the twin being viewed (shown on the asset switcher button)
    assetName?: string;
    // opens the asset switcher (Ctrl K); without it the bar shows the twin's name only
    onOpenAssetSwitcher?: () => void;
    // the Viewer page's buttons for its layout (Edit layout…)
    workspaceControls?: ReactNode;
    // el gemelo digital tiene chat (el panel lateral se puede abrir también en las vistas Imagen y Pipeline)
    chatEnabled?: boolean;
    // respuesta del asistente sin leer (punto en el botón del panel lateral)
    chatUnread?: boolean;
    // ancho del panel del asistente a la derecha (0 si no se ve): la barra ocupa el ancho libre a su izquierda
    assistantPanelWidth?: number;
    // width of the pipeline logs docked on the right (0 when hidden)
    logsWidth?: number;
    // pipeline errors not seen yet: badge on the logs button, dot on the Pipeline tab
    pipelineErrors?: number;
    isPipelineLogsOpen?: boolean;
    // the Viewer page (3D model and/or Image) has something to show: else only the pipeline
    viewerAvailable?: boolean;
    // the Viewer page has the 3D model (else only the Image): the scene settings of the assistant panel
    viewerHasModel?: boolean;
    // the height of the bar (it wraps on narrow pages): the panels of the Viewer page start below it
    onHeightChange?: (height: number) => void;
}

// "3D" is the Viewer page: the 3D model, images… as panels on a grid (Workspace/)
const VIEWER_OPTIONS: { value: "3D" | "pipeline"; label: string; icon: ReactNode }[] = [
    { value: "3D", label: "Viewer", icon: <Columns2 aria-hidden="true" /> },
    { value: "pipeline", label: "Pipeline", icon: <Workflow aria-hidden="true" /> },
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
    isNatsConnected,
    digitalTwinState,
    activeViewer,
    showOnlyPipelineViewer,
    handleAssistantPanelOpenAndClose,
    handleSetActiveViewer,
    handlePipelineLogsOpen,
    handleOpenGrafanaDashboard,
    handleDigitalTwinStateShield,
    handleDeployPipeline,
    handleStopPipeline,
    handleFileUpload,
    handleDownloadYamlFile,
    selectedNodesCount = 0,
    handleReinitiatePipeline,
    isPipelineUiChanged,
    close3DViewer,
    pipelineStatus,
    pipelineLeaderReplicaIndex,
    digitalTwinName,
    digitalTwinType,
    assetName,
    onOpenAssetSwitcher,
    workspaceControls,
    chatEnabled = false,
    chatUnread = false,
    assistantPanelWidth = 0,
    logsWidth = 0,
    pipelineErrors = 0,
    isPipelineLogsOpen = false,
    viewerAvailable = !showOnlyPipelineViewer,
    viewerHasModel = true,
    onHeightChange,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const barRef = useRef<HTMLDivElement>(null);
    const onHeightRef = useRef(onHeightChange);
    onHeightRef.current = onHeightChange;
    useEffect(() => {
        const bar = barRef.current;
        if (!bar) return;
        const report = () => onHeightRef.current?.(bar.getBoundingClientRect().height);
        report();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(report);
        observer.observe(bar);
        return () => observer.disconnect();
    }, []);

    // En la vista Pipeline la barra ocupa el ancho a la derecha de la paleta de nodos (el lienzo empieza
    // debajo de ella); en la vista 3D ocupa el ancho libre a la izquierda del panel del asistente.
    const paletteWidth = useUiStore((s) => (s.values[PALETTE_WIDTH_KEY] as number | undefined) ?? PALETTE_WIDTH);
    const left = activeViewer === "pipeline" ? `${paletteWidth + VIEWER_GAP}px` : `${VIEWER_GAP}px`;
    const rightPanel = Math.max(assistantPanelWidth, logsWidth);
    const right = rightPanel > 0 ? `${rightPanel + 2 * VIEWER_GAP}px` : `${VIEWER_GAP}px`;

    const dtOk = digitalTwinState === "OK";
    const viewerOptions = VIEWER_OPTIONS;

    // Panel lateral: en el Viewer con modelo 3D siempre; en el Viewer sin modelo 3D (solo la imagen) y en
    // Pipeline (gemelo sin visor), solo con el chat
    const panelOpen = assistantPanelWidth > 0;
    const showPanelButton =
        (activeViewer === "3D" && viewerHasModel) ||
        (chatEnabled && (activeViewer === "3D" || showOnlyPipelineViewer));
    const panelLabel = panelOpen ? "Close assistant panel" : "Open assistant panel";
    // The logs come from the pipeline nodes: their button is only in the pipeline view
    const errorsText = `${pipelineErrors} new pipeline ${pipelineErrors === 1 ? "error" : "errors"}`;
    const logsButton = (
        <ToolButton
            type="button"
            aria-label={pipelineErrors > 0 ? `Pipeline logs (${errorsText})` : "Pipeline logs"}
            data-tooltip={pipelineErrors > 0 ? `Pipeline logs · ${errorsText}` : "Pipeline logs"}
            aria-pressed={isPipelineLogsOpen}
            $active={isPipelineLogsOpen}
            onClick={handlePipelineLogsOpen}
        >
            <Logs aria-hidden="true" />
            {pipelineErrors > 0 && <ErrorBadge aria-hidden="true">{pipelineErrors > 99 ? "99+" : pipelineErrors}</ErrorBadge>}
        </ToolButton>
    );
    const dashboardButton = (
        <ToolButton type="button" aria-label="Grafana dashboard" data-tooltip="Grafana dashboard" onClick={handleOpenGrafanaDashboard}>
            <ChartLine aria-hidden="true" />
        </ToolButton>
    );

    return (
        <Bar ref={barRef} $left={left} $right={right} data-testid="viewer-top-bar">
            {onOpenAssetSwitcher && digitalTwinName && (
                <SwitcherButton
                    type="button"
                    aria-haspopup="dialog"
                    aria-keyshortcuts="Control+K"
                    aria-label={`${assetName ? `${assetName}, ` : ""}${digitalTwinName}. Go to another asset`}
                    title="Go to another asset or digital twin (Ctrl K)"
                    onClick={onOpenAssetSwitcher}
                >
                    <SwitcherLed $ok={dtOk} aria-hidden="true" />
                    <SwitcherText>
                        {assetName ? (
                            <>
                                {assetName} <small>· {digitalTwinName}</small>
                            </>
                        ) : (
                            digitalTwinName
                        )}
                    </SwitcherText>
                    <ChevronDown aria-hidden="true" />
                    <SwitcherKbd aria-hidden="true">Ctrl K</SwitcherKbd>
                </SwitcherButton>
            )}
            {!onOpenAssetSwitcher && activeViewer !== "pipeline" && digitalTwinName && (
                <Title>
                    <TitleMain title={digitalTwinName}>{digitalTwinName}</TitleMain>
                    {digitalTwinType && <TitleSub>{digitalTwinType}</TitleSub>}
                </Title>
            )}

            {viewerAvailable && (
                <Segmented role="tablist" aria-label="Views">
                    {viewerOptions.map((option) => {
                        // new pipeline errors while looking at another view: red dot on the Pipeline tab
                        const flagErrors = option.value === "pipeline" && activeViewer !== "pipeline" && pipelineErrors > 0;
                        return (
                            <Segment
                                key={option.value}
                                type="button"
                                role="tab"
                                aria-selected={activeViewer === option.value}
                                aria-label={flagErrors ? `${option.label} (${errorsText})` : undefined}
                                data-tooltip={flagErrors ? `${errorsText} · see them in the pipeline logs` : undefined}
                                $selected={activeViewer === option.value}
                                onClick={() => handleSetActiveViewer(option.value)}
                            >
                                {option.icon}
                                {option.label}
                                {flagErrors && <ErrorDot aria-hidden="true" />}
                            </Segment>
                        );
                    })}
                </Segmented>
            )}

            {activeViewer === "pipeline" && <PipelineStatusChip status={pipelineStatus} leader={pipelineLeaderReplicaIndex} />}

            <Spacer />

            {activeViewer === "3D" && workspaceControls}
            {activeViewer === "3D" && <Group>{dashboardButton}</Group>}

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
                    <ToolButton
                        type="button"
                        aria-label="Download YAML"
                        data-tooltip={
                            selectedNodesCount > 0
                                ? `Download YAML (${selectedNodesCount} selected ${selectedNodesCount === 1 ? "node" : "nodes"})`
                                : "Download YAML"
                        }
                        onClick={handleDownloadYamlFile}
                    >
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

            {showPanelButton && (
                <ToolButton
                    type="button"
                    aria-label={panelLabel}
                    data-tooltip={activeViewer === "3D" ? `${panelLabel} · chat & settings` : `${panelLabel} · chat`}
                    data-tooltip-align="end"
                    aria-pressed={panelOpen}
                    $active={panelOpen}
                    onClick={handleAssistantPanelOpenAndClose}
                >
                    <PanelRight aria-hidden="true" />
                    {chatUnread && <AttentionDot aria-label="New answer from the assistant" />}
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