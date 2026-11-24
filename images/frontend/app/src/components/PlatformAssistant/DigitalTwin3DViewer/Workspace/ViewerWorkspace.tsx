// The Viewer page as a workspace: panels (the 3D model, images of several topics…) on a grid that a group
// administrator arranges for the whole group (react-grid-layout). Everybody can put a panel full page; while
// editing, panels are moved by their bar and resized from their edges. Below WORKSPACE_PHONE_BELOW pixels the
// page shows one panel at a time, chosen with tabs.
//
// Every panel stays mounted (the 3D model is never rebuilt, images keep painting): a full page panel covers
// the others, which are only hidden. A panel can also go full screen (the Fullscreen API: on Android it hides
// the browser and the status bar too); where the browser does not allow it (Safari on the iPhone) the panel covers
// the page instead.
import { CSSProperties, FC, ReactNode, PointerEvent as ReactPointerEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled, { css } from "styled-components";
import { scrollbarStyle } from "../../../Tools/FormTools";
import GridLayout, { getCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Blend, Presentation, Activity, Building2, HeartPulse, PictureInPicture2, SlidersHorizontal, ScrollText, ChartScatter, BellRing, Box, ChartBar, FileImage, FileText, Image as ImageIcon, Video, ChartColumn, ChartColumnBig, ChartGantt, ChartLine, ChartPie, ClipboardCheck, Gauge, Hash, Table2, GripVertical, Info, Maximize, Maximize2, Minimize, Minimize2, Pencil, Plus, Upload, X } from "lucide-react";
import { ChartSeriesOption, defaultChartTitle } from "./chartSeries";
import { PanelLinks } from "./charts/Links";
import ImageSourceField from "./ImageSourceField";
import {
    CHART_MAX_SERIES,
    GRID_MARGIN,
    ImageSourceOption,
    NewPanel,
    WORKSPACE_PHONE_BELOW,
    WorkspaceSlide,
    WorkspacePanel,
    applyGridItems,
    canAddModelPanel,
    canAddPanelType,
    addPanel,
    imageSourceLabel,
    panelTitle,
    ANY_IMAGE_SOURCE,
    removePanel,
    renamePanel,
    setPanelSource,
    setPanelDisplay,
    imageDisplayOf,
    rowHeightFor,
    gridOf,
    toGridItems,
    FLOATING_PANEL_TYPES,
    FloatRect,
    showsSimulation,
    setPanelFloat,
    setPanelTranslucent,
} from "./workspaceLayout";

export const PANEL_BAR_HEIGHT = 40;
const CANVAS_COMPACTOR = getCompactor(null, true);
const EDIT_BAR_HEIGHT = 52;
const PHONE_TABS_HEIGHT = 48;

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

const Area = styled.div`
    position: absolute;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: ${GRID_MARGIN}px;
    font-family: ${font};
    color: #e6e8eb;
`;

const Scroller = styled.div<{ $locked: boolean; $canvas?: "view" | "edit" }>`
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: ${({ $locked, $canvas }) => ($locked || $canvas ? "hidden" : "auto")};
    ${scrollbarStyle}
    /* over a canvas: the canvas is used where there is no panel; while the canvas is edited, the panels are faint
       and let it be drawn under them */
    ${({ $canvas }) =>
        $canvas
            ? `
    z-index: 1;
    pointer-events: none;
    .react-grid-item {
        pointer-events: ${$canvas === "edit" ? "none" : "auto"};
        opacity: ${$canvas === "edit" ? 0.3 : 1};
        transition: opacity 0.2s;
    }`
            : ""}


    .react-grid-item.react-grid-placeholder {
        background: #3d82f0;
        opacity: 0.18;
        border-radius: 12px;
    }

    .react-grid-item > .react-resizable-handle {
        z-index: 6;
        opacity: 0.7;
    }
    .react-grid-item > .react-resizable-handle::after {
        border-color: #9aa1aa;
    }

    /* one panel full page: it covers the visible area, the others stay mounted but hidden */
    .react-grid-item.ws-max {
        transform: none !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        height: var(--ws-height) !important;
        z-index: 20;
        transition: none;
    }
    .react-grid-item.ws-hidden {
        visibility: hidden;
        pointer-events: none;
    }
    /* full screen where the browser has no Fullscreen API (iPhone): the panel covers the page */
    .react-grid-item.ws-fs {
        position: fixed !important;
        inset: 0 !important;
        transform: none !important;
        width: 100vw !important;
        height: 100vh !important;
        height: 100dvh !important;
        z-index: 3000;
        transition: none;
    }
`;

// the canvas of a slide, behind its panels (without a stacking context of its own: its controls go over them)
const CanvasHost = styled.div`
    position: absolute;
    inset: 0;
`;

// the slide's area: the grid (it scrolls) and, over it, the floating panels (they do not)
const Stage = styled.div<{ $covering?: "present" | "edit" }>`
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    /* the slide in full screen (a slide with a canvas): its canvas and its panels, in the same proportions */
    &:fullscreen {
        background: #121417;
    }
    ${({ $covering }) =>
        $covering &&
        css`
            position: fixed;
            inset: 0;
            /* drawing a canvas: under the dialogs of the panels (Add panel, the editors) */
            z-index: ${$covering === "edit" ? 1500 : 3000};
            background: #121417;
        `}
`;

// what the canvas of a slide can do with the slide's area: show it in full screen
export interface StageControls {
    fullscreen: boolean;
    toggleFullscreen: () => void;
    // a panel of the slide, with its bar (its title, edit, remove…): the canvas draws it as an element
    renderPanel: (panelId: string) => ReactNode;
}

// over the slide; over the whole screen while a panel is in full screen (then it is put inside that panel, the only
// thing the browser shows)
const FloatLayer = styled.div<{ $screen: boolean }>`
    position: ${({ $screen }) => ($screen ? "fixed" : "absolute")};
    inset: 0;
    pointer-events: none;
    z-index: ${({ $screen }) => ($screen ? 3001 : 30)};
`;

const FloatFrame = styled.div<{ $moving: boolean }>`
    position: absolute;
    pointer-events: auto;
    display: flex;
    min-width: 220px;
    min-height: 150px;
    border-radius: 12px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);

    & > section {
        flex: 1;
        min-width: 0;
        height: 100%;
    }
    /* moved by its bar */
    .ws-drag-handle {
        cursor: ${({ $moving }) => ($moving ? "grabbing" : "grab")};
        touch-action: none;
    }
`;

// resizes a floating panel, from its lower right corner
const ResizeGrip = styled.div`
    position: absolute;
    right: 0;
    bottom: 0;
    width: 18px;
    height: 18px;
    cursor: nwse-resize;
    touch-action: none;
    z-index: 7;

    &::after {
        content: "";
        position: absolute;
        right: 4px;
        bottom: 4px;
        width: 8px;
        height: 8px;
        border-right: 2px solid #9aa1aa;
        border-bottom: 2px solid #9aa1aa;
        opacity: 0.7;
    }
`;

const Panel = styled.section<{ $editing: boolean; $fullscreen?: boolean }>`
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background-color: #141619;
    border: 1px solid ${({ $editing }) => ($editing ? "#34537f" : "#262a2f")};
    border-radius: 12px;
    overflow: hidden;
    ${({ $fullscreen }) =>
        $fullscreen &&
        css`
            border: none;
            border-radius: 0;
        `}
`;

// a translucent panel: what is behind it shows through, blurred
const TRANSLUCENT: CSSProperties = {
    backgroundColor: "rgba(20, 22, 25, 0.55)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    borderColor: "rgba(255, 255, 255, 0.1)",
};

// a panel's own actions in full screen (its bar is hidden there): next to the button that leaves it
const FullscreenActions = styled.div`
    position: absolute;
    top: max(10px, env(safe-area-inset-top));
    right: calc(max(10px, env(safe-area-inset-right)) + 48px);
    z-index: 10;
    display: flex;
    gap: 8px;

    button {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        cursor: pointer;
    }
    button:hover,
    button:focus-visible,
    button[aria-pressed="true"] {
        background: rgba(0, 0, 0, 0.75);
    }
    svg {
        width: 18px;
        height: 18px;
    }
`;

// to leave the full screen: always visible over the panel, in a corner
const ExitFullscreenButton = styled.button`
    position: absolute;
    top: max(10px, env(safe-area-inset-top));
    right: max(10px, env(safe-area-inset-right));
    z-index: 10;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    cursor: pointer;

    &:hover,
    &:focus-visible {
        background: rgba(0, 0, 0, 0.75);
    }

    svg {
        width: 20px;
        height: 20px;
    }
`;

const PanelBar = styled.div<{ $editing: boolean }>`
    flex: none;
    height: ${PANEL_BAR_HEIGHT}px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 4px 0 12px;
    border-bottom: 1px solid #262a2f;
    background-color: #141619;
    user-select: none;
    ${({ $editing }) =>
        $editing &&
        css`
            cursor: grab;
            padding-left: 6px;
            &:active {
                cursor: grabbing;
            }
        `}

    > svg {
        width: 16px;
        height: 16px;
        flex: none;
        color: #9aa1aa;
    }

    h2 {
        margin: 0;
        min-width: 0;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
`;

const Meta = styled.span`
    min-width: 0;
    font-size: 12px;
    color: #9aa1aa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const BarSpacer = styled.span`
    flex: 1;
`;

const IconButton = styled.button`
    width: 32px;
    height: 32px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 7px;
    color: #c7cbd1;
    cursor: pointer;

    &:hover,
    &:focus-visible {
        background: #1f2226;
        border-color: #3a4048;
    }

    svg {
        width: 16px;
        height: 16px;
    }
    &[aria-pressed="true"] {
        background: #1f2a3a;
        border-color: #3d82f0;
        color: #e6e8eb;
    }
`;

// An action of a panel of its own, in its bar (and over it in full screen): e.g. the 3D model's settings
export interface PanelAction {
    label: string;
    icon: ReactNode;
    // a toggle: pressed while what it opens is open
    active?: boolean;
    onClick: () => void;
}

const TitleInput = styled.input`
    min-width: 0;
    flex: 1;
    height: 28px;
    padding: 0 8px;
    background: #0e1013;
    border: 1px solid #2c3137;
    border-radius: 6px;
    color: #f2f3f5;
    font: 600 13px ${font};

    &:focus {
        outline: none;
        border-color: #3d82f0;
    }
`;

const PanelBody = styled.div`
    position: relative;
    flex: 1;
    min-height: 0;
`;

const SourceRow = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 8px;

    > select {
        flex: none;
        height: 30px;
        padding: 0 8px;
        background: #0e1013;
        border: 1px solid #2c3137;
        border-radius: 8px;
        color: #e6e8eb;
        font-size: 13px;
    }
    > div {
        flex: 1;
        min-width: 0;
    }
`;

const SourceStrip = styled.div`
    flex: none;
    padding: 6px 8px;
    border-bottom: 1px solid #262a2f;
    background: #111316;
`;

const Bar = styled.div`
    flex: none;
    min-height: ${EDIT_BAR_HEIGHT}px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 10px 8px 14px;
    background: #17202c;
    border: 1px solid #34537f;
    border-radius: 12px;
    font-size: 13px;

    p {
        margin: 0;
        flex: 1;
        min-width: 200px;
        color: #c9d6e8;
    }

    strong {
        color: #f2f3f5;
        font-weight: 600;
    }
`;

export const TextButton = styled.button<{ $primary?: boolean }>`
    height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid ${({ $primary }) => ($primary ? "#3d82f0" : "#2c3137")};
    background: ${({ $primary }) => ($primary ? "#3d82f0" : "#1b1e22")};
    color: ${({ $primary }) => ($primary ? "#fff" : "#d5d9de")};
    font: 500 13px ${font};
    white-space: nowrap;
    cursor: pointer;

    &:hover:not(:disabled) {
        border-color: ${({ $primary }) => ($primary ? "#5c97f5" : "#3d82f0")};
    }

    &:disabled {
        opacity: 0.55;
        cursor: default;
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 2px;
    }

    svg {
        width: 15px;
        height: 15px;
    }
`;

const Tabs = styled.nav`
    flex: none;
    height: ${PHONE_TABS_HEIGHT}px;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    ${scrollbarStyle}
`;

const Tab = styled.button<{ $on: boolean }>`
    height: 36px;
    flex: none;
    padding: 0 14px;
    border-radius: 18px;
    border: 1px solid ${({ $on }) => ($on ? "#3d82f0" : "#2c3137")};
    background: ${({ $on }) => ($on ? "#23324a" : "transparent")};
    color: ${({ $on }) => ($on ? "#e6efff" : "#c7cbd1")};
    font: ${({ $on }) => ($on ? 600 : 500)} 13px ${font};
    cursor: pointer;
`;

const Empty = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #9aa1aa;
    font-size: 14px;
    text-align: center;
    padding: 16px;
`;

// ---------------------------------------------------------------------------------------------------------
// Add panel

const Backdrop = styled.div`
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(5, 6, 8, 0.6);
`;

const Dialog = styled.form`
    width: min(520px, 100%);
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    ${scrollbarStyle}
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background: #17191c;
    border: 1px solid #2c3137;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    color: #e6e8eb;
    font: 400 14px ${font};

    h2 {
        margin: 0;
        font-size: 17px;
        font-weight: 600;
    }

    fieldset {
        margin: 0;
        padding: 0;
        border: none;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 8px;
    }

    legend,
    label > span {
        display: block;
        margin-bottom: 6px;
        color: #9aa1aa;
        font-size: 12px;
        font-weight: 600;
    }

    select,
    input[type="text"] {
        width: 100%;
        height: 38px;
        box-sizing: border-box;
        padding: 0 10px;
        background: #0e1013;
        border: 1px solid #2c3137;
        border-radius: 8px;
        color: #f2f3f5;
        font: 400 14px ${font};
    }

    select:focus,
    input[type="text"]:focus {
        outline: none;
        border-color: #3d82f0;
    }
`;

const TypeCard = styled.label<{ $on: boolean; $disabled: boolean }>`
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid ${({ $on }) => ($on ? "#3d82f0" : "#2c3137")};
    background: ${({ $on }) => ($on ? "#1d2836" : "#1b1e22")};
    opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
    cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};

    input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
    }

    &:focus-within {
        outline: 2px solid #3d82f0;
        outline-offset: 2px;
    }

    strong {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        font-weight: 600;
    }

    small {
        color: #9aa1aa;
        font-size: 12px;
        line-height: 1.4;
    }

    svg {
        width: 16px;
        height: 16px;
    }
`;

const DialogActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
`;

interface AddPanelDialogProps {
    canAddModel: boolean;
    // the alarms and approvals panels (one of each on a page)
    canAddAlarms?: boolean;
    canAddApprovals?: boolean;
    // the asset state panel (one on a page)
    canAddAssetState?: boolean;
    // a group's control room: its Health and Pipeline logs panels (one of each on a page)
    controlRoom?: boolean;
    canAddHealth?: boolean;
    canAddPipelineLogs?: boolean;
    // the organization overview: its indicators panel (one on a page)
    organization?: boolean;
    canAddOrgOverview?: boolean;
    // the digital twin's simulator (one on a page; not in control rooms nor in the organization overview)
    canAddSimulator?: boolean;
    // a canvas behind the panels of the slide (one; not in control rooms nor in the organization overview)
    canAddCanvas?: boolean;
    onAddCanvas?: () => void;
    sources: ImageSourceOption[];
    // the fields of the asset's sensors a chart can show
    chartOptions: ChartSeriesOption[];
    onAdd: (spec: NewPanel) => void;
    onClose: () => void;
}

const SeriesList = styled.div`
    max-height: 220px;
    overflow-y: auto;
    ${scrollbarStyle}
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    background: #0e1013;
    border: 1px solid #2c3137;
    border-radius: 8px;

    label {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 32px;
        padding: 0 8px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
    }

    label:hover {
        background: #1b1e22;
    }

    label > span {
        display: inline;
        margin: 0;
        color: #e6e8eb;
        font-size: 13px;
        font-weight: 400;
    }

    input {
        accent-color: #3d82f0;
        width: 15px;
        height: 15px;
        flex: none;
    }

    small {
        margin-left: auto;
        color: #8b929b;
        font-size: 12px;
        white-space: nowrap;
    }
`;

const Hint = styled.p`
    margin: 0;
    color: #9aa1aa;
    font-size: 12px;
`;

// the Image panels are two choices: video (live, with pause) and photo (the last one)
type DialogType =
    | "model"
    | "video"
    | "photo"
    | "picture"
    | "chart"
    | "markdown"
    | "dataChart"
    | "alarms"
    | "approvals"
    | "assetState"
    | "health"
    | "pipelineLogs"
    | "orgOverview"
    | "simulator"
    | "canvas";

export const AddPanelDialog: FC<AddPanelDialogProps> = ({
    canAddModel,
    canAddAlarms = true,
    canAddApprovals = true,
    canAddAssetState = true,
    controlRoom = false,
    canAddHealth = true,
    canAddPipelineLogs = true,
    organization = false,
    canAddOrgOverview = true,
    canAddSimulator = true,
    canAddCanvas = false,
    onAddCanvas,
    sources,
    chartOptions,
    onAdd,
    onClose,
}) => {
    const firstType: DialogType = canAddModel ? "model" : "video";
    const [type, setType] = useState<DialogType>(firstType);
    const [source, setSource] = useState(sources.find((s) => s.live && s.value !== "any")?.value ?? "any");
    // what is typed as the source is valid
    const [sourceOk, setSourceOk] = useState(true);
    const [title, setTitle] = useState("");
    const [chosen, setChosen] = useState<string[]>([]);
    const titleId = useId();
    const firstRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        firstRef.current?.focus();
    }, []);
    const chosenOptions = chartOptions.filter((o) => chosen.includes(o.key));
    const types = [
        { value: "model" as const, label: "3D model", hint: canAddModel ? "The digital twin's model" : "Already on the page", icon: <Box />, disabled: !canAddModel },
        { value: "video" as const, label: "Video", hint: "Live frames of a camera or a pipeline, with pause", icon: <Video />, disabled: false },
        { value: "photo" as const, label: "Photo", hint: "The last photo of a device and when it arrived", icon: <ImageIcon />, disabled: false },
        {
            value: "chart" as const,
            label: "Time series chart",
            hint: chartOptions.length ? "Measurements of the asset's sensors in time" : "The asset has no sensors with measurements",
            icon: <ChartLine />,
            disabled: chartOptions.length === 0,
        },
        { value: "picture" as const, label: "Picture", hint: "An image of the twin; an SVG can move with live values", icon: <FileImage />, disabled: false },
        { value: "markdown" as const, label: "Text", hint: "Markdown, LaTeX formulas and live values", icon: <FileText />, disabled: false },
        {
            value: "dataChart" as const,
            label: "Data chart",
            hint: "The data of a message or of the asset state: 2D series, heat maps, 3D surfaces or points",
            icon: <ChartScatter />,
            disabled: false,
        },
        {
            value: "alarms" as const,
            label: "Alarms",
            hint: canAddAlarms ? "Active alarms and their events" : "Already on the page",
            icon: <BellRing />,
            disabled: !canAddAlarms,
        },
        {
            value: "approvals" as const,
            label: "Approvals",
            hint: canAddApprovals ? "Requests waiting and decisions" : "Already on the page",
            icon: <ClipboardCheck />,
            disabled: !canAddApprovals,
        },
        {
            value: "assetState" as const,
            label: "Asset state",
            hint: canAddAssetState ? "Status and fields of the asset now" : "Already on the page",
            icon: <Activity />,
            disabled: !canAddAssetState,
        },
        ...(!controlRoom && !organization
            ? [
                  {
                      value: "simulator" as const,
                      label: "Simulator",
                      hint: canAddSimulator ? "Send simulated values to the digital twin; it can float" : "Already on the page",
                      icon: <SlidersHorizontal />,
                      disabled: !canAddSimulator,
                  },
              ]
            : []),
        ...(!controlRoom && !organization && onAddCanvas
            ? [
                  {
                      value: "canvas" as const,
                      label: "Canvas",
                      hint: canAddCanvas ? "A whiteboard behind the panels: ideas, diagrams, live values, steps" : "The slide already has one",
                      icon: <Presentation />,
                      disabled: !canAddCanvas,
                  },
              ]
            : []),
        ...(controlRoom
            ? [
                  {
                      value: "health" as const,
                      label: "Health",
                      hint: canAddHealth ? "Pipelines, last data, devices, S3" : "Already on the page",
                      icon: <HeartPulse />,
                      disabled: !canAddHealth,
                  },
                  {
                      value: "pipelineLogs" as const,
                      label: "Pipeline logs",
                      hint: canAddPipelineLogs ? "What the pipelines logged and log now" : "Already on the page",
                      icon: <ScrollText />,
                      disabled: !canAddPipelineLogs,
                  },
              ]
            : []),
        ...(organization
            ? [
                  {
                      value: "orgOverview" as const,
                      label: "Organization overview",
                      hint: canAddOrgOverview ? "Availability, alarms and approvals of every group" : "Already on the page",
                      icon: <Building2 />,
                      disabled: !canAddOrgOverview,
                  },
              ]
            : []),
    ];
    const canSubmit =
        type === "model"
            ? canAddModel
            : type === "chart"
              ? chosen.length > 0
              : type === "markdown" || type === "picture" || type === "dataChart"
                ? true
                : type === "alarms"
                ? canAddAlarms
                : type === "approvals"
                  ? canAddApprovals
                  : type === "assetState"
                  ? canAddAssetState
                  : type === "health"
                  ? canAddHealth
                  : type === "pipelineLogs"
                  ? canAddPipelineLogs
                  : type === "orgOverview"
                  ? canAddOrgOverview
                  : type === "simulator"
                  ? canAddSimulator
                  : type === "canvas"
                  ? canAddCanvas
                  : sourceOk;
    const toggle = (key: string) =>
        setChosen((list) =>
            list.includes(key) ? list.filter((k) => k !== key) : list.length >= CHART_MAX_SERIES ? list : [...list, key],
        );
    const placeholder =
        type === "model"
            ? "3D model"
            : type === "video" || type === "photo"
              ? `${type === "photo" ? "Photo" : "Video"}${source === "any" ? "" : ` · ${imageSourceLabel(source)}`}`
              : type === "chart"
                ? defaultChartTitle(chosenOptions)
                : type === "markdown"
                  ? "Text"
                  : type === "picture"
                  ? "Picture"
                  : type === "dataChart"
                  ? "Data chart"
                  : type === "alarms"
                  ? "Alarms"
                  : type === "assetState"
                  ? "Asset state"
                  : type === "health"
                  ? "Health"
                  : type === "pipelineLogs"
                  ? "Pipeline logs"
                  : type === "orgOverview"
                  ? "Organization overview"
                  : type === "simulator"
                  ? "Simulator"
                  : "Approvals";
    return (
        <Backdrop
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <Dialog
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.stopPropagation();
                        onClose();
                    }
                }}
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!canSubmit) return;
                    if (type === "canvas") onAddCanvas?.();
                    else if (type === "video" || type === "photo") onAdd({ type: "image", display: type, source, title });
                    else if (type === "chart") {
                        onAdd({
                            type,
                            viz: "timeseries",
                            title: title.trim() || defaultChartTitle(chosenOptions),
                            series: chosenOptions.map(({ sensor, field, index }) =>
                                index === undefined ? { sensor, field } : { sensor, field, index },
                            ),
                        });
                    } else onAdd({ type, title });
                }}
            >
                <h2 id={titleId}>Add panel</h2>
                <fieldset>
                    <legend>Type</legend>
                    {types.map((t) => (
                        <TypeCard key={t.value} $on={type === t.value} $disabled={t.disabled}>
                            <input
                                ref={t.value === firstType ? firstRef : undefined}
                                type="radio"
                                name="panel-type"
                                value={t.value}
                                checked={type === t.value}
                                disabled={t.disabled}
                                onChange={() => setType(t.value)}
                            />
                            <strong>
                                {t.icon}
                                {t.label}
                            </strong>
                            <small>{t.hint}</small>
                        </TypeCard>
                    ))}
                </fieldset>
                {(type === "video" || type === "photo") && (
                    <div role="group" aria-labelledby={`${titleId}-source`}>
                        <span id={`${titleId}-source`} style={{ display: "block", marginBottom: 6, color: "#9aa1aa", fontSize: 12, fontWeight: 600 }}>
                            Source
                        </span>
                        <ImageSourceField
                            value={source}
                            options={sources}
                            onChange={(next) => {
                                setSourceOk(next !== null);
                                if (next !== null) setSource(next);
                            }}
                        />
                    </div>
                )}
                {type === "picture" && <Hint>The picture opens in its editor: choose or upload an image (JPEG, PNG, WebP, GIF or SVG) and, for an SVG, animate its elements with the values of the NATS messages.</Hint>}
                {type === "dataChart" && (
                    <Hint>
                        The Data chart opens in its editor: lists of numbers of the last message of a topic (dtm2sim…) or of the asset state — a spectrum freq[] / amplitude[] — as lines, points, bars or areas;
                        or a grid or a formula z = f(x, y) as a heat map or a 3D surface; or 3D points. For values in time, the Time series chart.
                    </Hint>
                )}
                {type === "markdown" && <Hint>The text opens in its editor: markdown, LaTeX formulas ($…$) and values of the NATS messages as they arrive ({"{{dtm2sim.rotorRpm}}"}).</Hint>}
                {(type === "alarms" || type === "approvals") && (
                    <Hint>
                        {type === "alarms"
                            ? "The alarms of this digital twin that are not normal now, and its latest alarm events (from the alarm history)."
                            : "The approval requests of this digital twin that wait for a decision, and the latest decisions (from the approval history)."}
                    </Hint>
                )}
                {type === "assetState" && (
                    <Hint>
                        {controlRoom
                            ? "The current state of every asset of the group, as a table: what needs attention first. Edit the panel to add columns with fields of the states and colour other statuses."
                            : "The current state of this digital twin's asset, as the pipelines write it (Asset state, Alarm and Machine state nodes): its status, description, alarms and machines. Edit the panel to show fields of the state and colour other statuses."}
                    </Hint>
                )}
                {type === "health" && (
                    <Hint>
                        Each digital twin of the group: whether its pipeline runs, when its asset last sent data, how many of its devices sent
                        data within the hour, and its S3 archives.
                    </Hint>
                )}
                {type === "pipelineLogs" && (
                    <Hint>
                        What the pipelines of the group's digital twins logged in the last 7 days and log now, with filters by level and digital
                        twin (for the group's editors and administrators).
                    </Hint>
                )}
                {type === "orgOverview" && (
                    <Hint>
                        The indicators of the organization: availability, MTBF and MTTR of the assets with the state history on, the alarms and the
                        approvals of every group. Edit the panel to say which statuses are not available (for the organization&apos;s
                        administrators).
                    </Hint>
                )}
                {type === "chart" && (
                    <>
                        <div role="group" aria-labelledby={`${titleId}-series`}>
                            <span
                                id={`${titleId}-series`}
                                style={{ display: "block", marginBottom: 6, color: "#9aa1aa", fontSize: 12, fontWeight: 600 }}
                            >
                                Series ({chosen.length}/{CHART_MAX_SERIES})
                            </span>
                            <SeriesList>
                                {chartOptions.map((o) => (
                                    <label key={o.key}>
                                        <input
                                            type="checkbox"
                                            checked={chosen.includes(o.key)}
                                            disabled={!chosen.includes(o.key) && chosen.length >= CHART_MAX_SERIES}
                                            onChange={() => toggle(o.key)}
                                        />
                                        <span>
                                            {o.label}
                                            {o.units !== "-" ? ` (${o.units})` : ""}
                                        </span>
                                        <small>{o.sensorDescription}</small>
                                    </label>
                                ))}
                            </SeriesList>
                        </div>
                        <Hint>The chart opens in the panel editor: visualization (time series, stat, gauge…), options and thresholds.</Hint>
                    </>
                )}
                <label>
                    <span>Title (optional)</span>
                    <input
                        type="text"
                        value={title}
                        maxLength={80}
                        placeholder={placeholder}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </label>
                <DialogActions>
                    <TextButton type="button" onClick={onClose}>
                        Cancel
                    </TextButton>
                    <TextButton type="submit" $primary disabled={!canSubmit}>
                        Add panel
                    </TextButton>
                </DialogActions>
            </Dialog>
        </Backdrop>
    );
};

// ---------------------------------------------------------------------------------------------------------
// The workspace

export interface ViewerWorkspaceProps {
    // the slide shown: its panels
    layout: WorkspaceSlide;
    // an empty slide of a twin without model: the editor may load its viewer data (Viewer data)
    onLoadViewerData?: () => void;
    // where the layout comes from: the user's temporary changes, the group's, or automatic
    origin: "local" | "group" | "automatic";
    editing: boolean;
    // a group administrator: saves for the group
    canSave: boolean;
    saving?: boolean;
    hasModel: boolean;
    imageSources: ImageSourceOption[];
    // the fields of the asset's sensors a chart can show
    chartOptions?: ChartSeriesOption[];
    maximizedId: string | null;
    hidden?: boolean;
    style?: CSSProperties;
    onLayoutChange: (layout: WorkspaceSlide) => void;
    onMaximize: (id: string | null) => void;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onSave: () => void;
    onDone: () => void;
    // back to the automatic layout (administrators) or to the group's one (the others)
    onRestore: () => void;
    renderPanel: (panel: WorkspacePanel) => ReactNode;
    // what a panel shows next to its title (e.g. the rotor speed)
    panelMeta?: (panel: WorkspacePanel) => ReactNode;
    // reports when the page shows one panel at a time (narrow screens)
    onPhoneChange?: (phone: boolean) => void;
    // opens a chart panel in the panel editor
    onEditPanel?: (id: string) => void;
    // a panel's own actions, out of the layout editing (e.g. the 3D model's settings)
    panelActions?: (panel: WorkspacePanel) => PanelAction[];
    // the Add panel dialog, when the caller opens it (the Add panel icon of the slide bar)
    addingPanel?: boolean;
    // Insert panel of a canvas: the frame the new panel goes to (one 3D model and one simulator in each frame)
    insertFrame?: string | null;
    onAddingPanelChange?: (adding: boolean) => void;
    // a group's control room: it may add the Health and Pipeline logs panels
    controlRoom?: boolean;
    // the organization overview: it may add the Organization overview panel
    organization?: boolean;
    // the slides (arrows, tabs, filters) above the panels
    slideBar?: ReactNode;
    // shown over the slide bar and the panels (e.g. all the slides)
    overlay?: ReactNode;
    // the canvas of the slide (layout.canvas), behind its panels; while it is edited the panels let it be drawn
    canvasLayer?: ReactNode | ((stage: StageControls) => ReactNode);
    canvasEditing?: boolean;
    // gives the slide a canvas (Add panel › Canvas)
    onAddCanvas?: () => void;
}

const panelIcon = (panel: WorkspacePanel) =>
    panel.type === "model" ? (
        <Box aria-hidden="true" />
    ) : panel.type === "alarms" ? (
        <BellRing aria-hidden="true" />
    ) : panel.type === "approvals" ? (
        <ClipboardCheck aria-hidden="true" />
    ) : panel.type === "assetState" ? (
        <Activity aria-hidden="true" />
    ) : panel.type === "health" ? (
        <HeartPulse aria-hidden="true" />
    ) : panel.type === "pipelineLogs" ? (
        <ScrollText aria-hidden="true" />
    ) : panel.type === "orgOverview" ? (
        <Building2 aria-hidden="true" />
    ) : panel.type === "simulator" ? (
        <SlidersHorizontal aria-hidden="true" />
    ) : panel.type === "markdown" ? (
        <FileText aria-hidden="true" />
    ) : panel.type === "picture" ? (
        <FileImage aria-hidden="true" />
    ) : panel.type === "surface" || panel.type === "dataChart" ? (
        <ChartScatter aria-hidden="true" />
    ) : panel.type === "chart" ? (
        panel.viz === "stat" ? (
            <Hash aria-hidden="true" />
        ) : panel.viz === "gauge" ? (
            <Gauge aria-hidden="true" />
        ) : panel.viz === "bargauge" ? (
            <ChartBar aria-hidden="true" />
        ) : panel.viz === "table" ? (
            <Table2 aria-hidden="true" />
        ) : panel.viz === "barchart" ? (
            <ChartColumn aria-hidden="true" />
        ) : panel.viz === "piechart" ? (
            <ChartPie aria-hidden="true" />
        ) : panel.viz === "statetimeline" ? (
            <ChartGantt aria-hidden="true" />
        ) : panel.viz === "histogram" ? (
            <ChartColumnBig aria-hidden="true" />
        ) : (
            <ChartLine aria-hidden="true" />
        )
    ) : panel.display === "photo" ? (
        <ImageIcon aria-hidden="true" />
    ) : (
        <Video aria-hidden="true" />
    );

const ViewerWorkspace: FC<ViewerWorkspaceProps> = ({
    layout,
    origin,
    editing,
    canSave,
    saving = false,
    hasModel,
    controlRoom = false,
    organization = false,
    onLoadViewerData,
    imageSources,
    chartOptions = [],
    maximizedId,
    hidden = false,
    style,
    onLayoutChange,
    onMaximize,
    onStartEdit,
    onCancelEdit,
    onSave,
    onDone,
    onRestore,
    renderPanel,
    panelMeta,
    onPhoneChange,
    onEditPanel,
    panelActions,
    addingPanel,
    insertFrame = null,
    onAddingPanelChange,
    slideBar,
    overlay,
    canvasLayer,
    canvasEditing = false,
    onAddCanvas,
}) => {
    const grid = gridOf(layout);
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [addingOwn, setAddingOwn] = useState(false);
    const adding = addingPanel ?? addingOwn;
    const setAdding = (value: boolean) => (onAddingPanelChange ? onAddingPanelChange(value) : setAddingOwn(value));
    const [phoneTab, setPhoneTab] = useState<string | null>(null);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const report = () => {
            const width = Math.round(el.clientWidth);
            const height = Math.round(el.clientHeight);
            setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        };
        report();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(report);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const phone = size.width > 0 && size.width < WORKSPACE_PHONE_BELOW;
    useEffect(() => {
        onPhoneChange?.(phone);
    }, [phone, onPhoneChange]);

    // the panel in full screen: with the Fullscreen API ("native") or covering the page
    const [fullscreen, setFullscreen] = useState<{ id: string; native: boolean } | null>(null);
    const [, setFullscreenTick] = useState(0);
    const panelElements = useRef(new Map<string, HTMLElement>());
    const enterFullscreen = (id: string) => {
        const el = panelElements.current.get(id);
        if (el && document.fullscreenEnabled && typeof el.requestFullscreen === "function") {
            setFullscreen({ id, native: true });
            el.requestFullscreen({ navigationUI: "hide" }).catch(() => setFullscreen({ id, native: false }));
        } else {
            setFullscreen({ id, native: false });
        }
    };
    const exitFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        setFullscreen(null);
    };
    useEffect(() => {
        // left with the system (Android's back gesture, Esc): the panel goes back to its place
        const onChange = () => {
            if (!document.fullscreenElement) setFullscreen((prev) => (prev?.native ? null : prev));
            // the floating panels go into the panel in full screen (or come back): see FloatLayer
            setFullscreenTick((t) => t + 1);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setFullscreen((prev) => (prev && !prev.native ? null : prev));
        };
        document.addEventListener("fullscreenchange", onChange);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("fullscreenchange", onChange);
            document.removeEventListener("keydown", onKey);
        };
    }, []);

    const panels = layout.panels;
    const activePhonePanel = phone ? panels.find((p) => p.id === phoneTab) ?? panels[0] ?? null : null;
    const fullId = phone ? activePhonePanel?.id ?? null : panels.some((p) => p.id === maximizedId) ? maximizedId : null;
    const editable = editing && !phone && !fullId;

    // --- Floating panels (the simulator) ----------------------------------------------------------------------
    // A floating panel keeps its place in the grid: it is never moved nor resized there. Floating only matters
    // while another panel that shows the simulation (the 3D model, a 3D Surface of dtm2sim…: showsSimulation)
    // covers the slide (full screen, or full page): then it is shown over that one — top right
    // at its own size until the user drags it by its bar or resizes it from its corner — so it stays at hand. Its "float" icon turns that on or off: while the layout
    // is edited it changes the layout (an editor saves it for the group); otherwise it lasts while the viewer is
    // open. On a phone a panel is always alone on screen, so nothing floats.
    const [localFloat, setLocalFloat] = useState<Record<string, boolean>>({});
    const floatingOf = (panel: WorkspacePanel) =>
        !phone && FLOATING_PANEL_TYPES.includes(panel.type) && (editable ? panel.floating === true : localFloat[panel.id] ?? panel.floating === true);
    const setFloat = (panel: WorkspacePanel, floating: boolean) => {
        if (editable) onLayoutChange(setPanelFloat(layout, panel.id, floating));
        else setLocalFloat((prev) => ({ ...prev, [panel.id]: floating }));
    };
    // a slide with a canvas: its panels are elements of the drawing (canvas/canvasPanels.ts), not in the grid
    const panelsInCanvas = !!layout.canvas && !!canvasLayer;
    const gridPanels = panelsInCanvas ? [] : panels;
    // the panel covering the slide, if any: the floating ones are shown over it
    const coverId = fullscreen?.id ?? fullId;
    // only over a panel that shows the simulation (showsSimulation: the 3D model, the panels of dtm2sim / sim2dtm)
    const cover = coverId ? panels.find((p) => p.id === coverId) : undefined;
    const floatPanels = cover && showsSimulation(cover) ? panels.filter((p) => p.id !== cover.id && floatingOf(p)) : [];
    const floatAction = (panel: WorkspacePanel): PanelAction[] => {
        if (phone || !FLOATING_PANEL_TYPES.includes(panel.type)) return [];
        const floating = floatingOf(panel);
        return [
            {
                label: floating
                    ? "Floating over the 3D model or a panel of the simulation in full screen: turn it off"
                    : "Float over the 3D model or a panel of the simulation in full screen",
                icon: <PictureInPicture2 aria-hidden="true" />,
                active: floating,
                onClick: () => setFloat(panel, !floating),
            },
        ];
    };
    // while the layout is edited: a translucent background (what is behind it shows through: a canvas, a panel)
    const translucentActionOf = (panel: WorkspacePanel): PanelAction[] =>
        panel.type !== "model"
            ? [
                  {
                      label: panel.translucent ? "Translucent background: make it opaque" : "Make the background translucent",
                      icon: <Blend aria-hidden="true" />,
                      active: panel.translucent === true,
                      onClick: () => onLayoutChange(setPanelTranslucent(layout, panel.id, !panel.translucent)),
                  },
              ]
            : [];
    const actionsOf = (panel: WorkspacePanel): PanelAction[] => [...(editable ? [] : panelActions?.(panel) ?? []), ...floatAction(panel), ...(editable ? translucentActionOf(panel) : [])];

    // The slide in full screen (a slide with a canvas): its canvas and its panels fill the screen in the same
    // proportions (the grid follows the size of its area). With the Fullscreen API, else covering the page.
    const [stageFull, setStageFull] = useState<{ native: boolean } | null>(null);
    const toggleStageFullscreen = () => {
        if (stageFull) {
            if (stageFull.native && document.fullscreenElement) document.exitFullscreen().catch(() => {});
            setStageFull(null);
            return;
        }
        const el = stageRef.current;
        if (el && document.fullscreenEnabled && typeof el.requestFullscreen === "function") {
            setStageFull({ native: true });
            el.requestFullscreen({ navigationUI: "hide" }).catch(() => setStageFull({ native: false }));
        } else setStageFull({ native: false });
    };
    useEffect(() => {
        if (!stageFull) return;
        const onChange = () => {
            if (stageFull.native && document.fullscreenElement !== stageRef.current) setStageFull(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !stageFull.native) setStageFull(null);
        };
        document.addEventListener("fullscreenchange", onChange);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("fullscreenchange", onChange);
            document.removeEventListener("keydown", onKey);
        };
    }, [stageFull]);
    // another slide, or one without a canvas: out of the full screen
    useEffect(() => {
        if (stageFull && (!layout.canvas || editing)) toggleStageFullscreen();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout.id, layout.canvas, editing]);
    const editOf = (panel: WorkspacePanel) =>
        (panel.type === "chart" || panel.type === "markdown" || panel.type === "picture" || panel.type === "dataChart" || panel.type === "assetState" || panel.type === "orgOverview") && onEditPanel && !phone
            ? () => onEditPanel(panel.id)
            : undefined;
    // a panel drawn in the canvas: its bar and its content (no full page nor full screen: the slide has them)
    const renderCanvasPanel = (panelId: string) => {
        const panel = panels.find((p) => p.id === panelId);
        if (!panel) return null;
        return (
            <WorkspacePanelView
                panel={panel}
                editing={editing}
                isFull={false}
                phone={phone}
                meta={panelMeta?.(panel)}
                onRemove={() => onLayoutChange(removePanel(layout, panel.id))}
                onRename={(title) => onLayoutChange(renamePanel(layout, panel.id, title))}
                actions={[...(editing ? [] : panelActions?.(panel) ?? []), ...(editing && !phone ? translucentActionOf(panel) : [])]}
                onEdit={editOf(panel)}
            >
                {renderPanel(panel)}
            </WorkspacePanelView>
        );
    };
    const shownCanvas =
        layout.canvas && canvasLayer
            ? typeof canvasLayer === "function"
                ? canvasLayer({ fullscreen: !!stageFull, toggleFullscreen: toggleStageFullscreen, renderPanel: renderCanvasPanel })
                : canvasLayer
            : null;

    // its size in the grid
    const floatSize = (panel: WorkspacePanel) => {
        const width = Math.round((panel.w / grid.cols) * size.width);
        const height = Math.round(panel.h * (rowHeightFor(size.height, grid.margin, grid.rows) + grid.margin));
        return { width: Math.max(220, width), height: Math.max(150, height) };
    };

    // Over the panel in full screen it can be moved by its bar and resized from its corner. Where it is stays while
    // the viewer is open, in fractions of what it floats over (the screen, or the slide's area), so it keeps its
    // place when the window changes size. Until moved: top right, at its size in the grid.
    const stageRef = useRef<HTMLDivElement>(null);
    const [floatRects, setFloatRects] = useState<Record<string, FloatRect>>({});
    const floatArea = () => {
        if (fullscreen) return { width: window.innerWidth, height: window.innerHeight };
        const rect = stageRef.current?.getBoundingClientRect();
        return rect && rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
    };
    const defaultFloatRect = (panel: WorkspacePanel, index: number, area: { width: number; height: number }): FloatRect => {
        const { width, height } = floatSize(panel);
        const top = (fullscreen ? 62 : 54) + index * 24;
        const w = Math.min(width, area.width - 28) / area.width;
        const h = Math.min(height, area.height - top - 14) / area.height;
        const x = Math.max(0, 1 - w - (14 + index * 24) / area.width);
        return { x, y: Math.min(top / area.height, 1 - h), w, h };
    };
    const [moving, setMoving] = useState<{ id: string; mode: "move" | "resize"; x0: number; y0: number; rect: FloatRect; areaW: number; areaH: number } | null>(
        null,
    );
    const [movingRect, setMovingRect] = useState<FloatRect | null>(null);
    const movingRectRef = useRef<FloatRect | null>(null);
    const startMove = (event: ReactPointerEvent, panel: WorkspacePanel, index: number, mode: "move" | "resize") => {
        const target = event.target as HTMLElement;
        if (mode === "move" && (!target.closest(".ws-drag-handle") || target.closest(".ws-no-drag, button, input, select, textarea, a"))) return;
        const area = floatArea();
        if (!area) return;
        event.preventDefault();
        event.stopPropagation();
        movingRectRef.current = null;
        const rect = floatRects[panel.id] ?? defaultFloatRect(panel, index, area);
        setMoving({ id: panel.id, mode, x0: event.clientX, y0: event.clientY, rect, areaW: area.width, areaH: area.height });
    };
    useEffect(() => {
        if (!moving) return;
        const clampTo = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
        const onMove = (e: PointerEvent) => {
            const dx = (e.clientX - moving.x0) / moving.areaW;
            const dy = (e.clientY - moving.y0) / moving.areaH;
            const r = moving.rect;
            const next =
                moving.mode === "move"
                    ? { ...r, x: clampTo(r.x + dx, 0, 1 - r.w), y: clampTo(r.y + dy, 0, 1 - r.h) }
                    : {
                          ...r,
                          w: clampTo(r.w + dx, Math.min(220 / moving.areaW, 1 - r.x), 1 - r.x),
                          h: clampTo(r.h + dy, Math.min(150 / moving.areaH, 1 - r.y), 1 - r.y),
                      };
            movingRectRef.current = next;
            setMovingRect(next);
        };
        const onUp = () => {
            const rect = movingRectRef.current;
            if (rect) setFloatRects((prev) => ({ ...prev, [moving.id]: rect }));
            setMoving(null);
            setMovingRect(null);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        return () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
        };
    }, [moving]);

    const floatingView =
        floatPanels.length > 0 ? (
            <FloatLayer $screen={!!fullscreen}>
                {floatPanels.map((panel, index) => {
                    const area = floatArea();
                    const r =
                        moving?.id === panel.id && movingRect
                            ? movingRect
                            : floatRects[panel.id] ?? (area ? defaultFloatRect(panel, index, area) : null);
                    const { width, height } = floatSize(panel);
                    const style = r
                        ? { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }
                        : { top: 54, right: 14, width: `min(${width}px, calc(100% - 28px))`, height: `min(${height}px, calc(100% - 76px))` };
                    return (
                        <FloatFrame
                            key={panel.id}
                            $moving={moving?.id === panel.id && moving.mode === "move"}
                            data-testid={`floating-${panel.id}`}
                            style={style}
                            onPointerDown={(e) => startMove(e, panel, index, "move")}
                        >
                            <WorkspacePanelView
                                panel={panel}
                                editing={false}
                                isFull={false}
                                phone={false}
                                meta={panelMeta?.(panel)}
                                onRemove={() => onLayoutChange(removePanel(layout, panel.id))}
                                onRename={(title) => onLayoutChange(renamePanel(layout, panel.id, title))}
                                actions={actionsOf(panel)}
                            >
                                {renderPanel(panel)}
                            </WorkspacePanelView>
                            <ResizeGrip aria-hidden="true" data-testid={`resize-${panel.id}`} onPointerDown={(e) => startMove(e, panel, index, "resize")} />
                        </FloatFrame>
                    );
                })}
            </FloatLayer>
        ) : null;
    // with a panel in full screen (Fullscreen API) the browser only shows that panel: the floating ones go inside it
    const floatingTarget = fullscreen?.native && document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : null;

    // a full page panel: scrolled to the top so that it covers the visible area
    useEffect(() => {
        if (fullId && scrollerRef.current) scrollerRef.current.scrollTop = 0;
    }, [fullId]);

    const rowHeight = rowHeightFor(size.height, grid.margin, grid.rows);

    const addFromDialog = (spec: NewPanel) => {
        setAdding(false);
        const next = addPanel(layout, { ...spec, frame: insertFrame });
        onLayoutChange(next);
        // a new chart goes straight to the panel editor
        if ((spec.type === "chart" || spec.type === "markdown" || spec.type === "picture" || spec.type === "dataChart") && next !== layout) onEditPanel?.(next.panels[next.panels.length - 1].id);
    };

    const openAdd = () => {
        if (!editing) onStartEdit();
        setAdding(true);
    };

    return (
        <Area style={{ ...style, display: hidden ? "none" : "flex" }} data-testid="viewer-workspace">
            {/* editing on a wide screen is driven from the slide bar (Add panel, Cancel, Save); on a phone, this */}
            {editing && phone && (
                <Bar role="region" aria-label="Edit layout">
                    {phone ? (
                        <p>The layout is edited on a wider screen.</p>
                    ) : canSave ? (
                        <p>
                            <strong>Editing the layout of the group.</strong> Drag a panel by its bar, resize it from its
                            edges.
                        </p>
                    ) : (
                        <p>
                            <strong>Your changes are only for you</strong> and last while the viewer is open. A group
                            administrator saves the layout for everyone.
                        </p>
                    )}
                    {!phone && (
                        <TextButton type="button" onClick={() => setAdding(true)}>
                            <Plus aria-hidden="true" />
                            Add panel
                        </TextButton>
                    )}
                    {!phone && (canSave ? origin !== "automatic" : origin === "local") && (
                        <TextButton type="button" onClick={onRestore} disabled={saving}>
                            {canSave ? "Automatic layout" : "Group layout"}
                        </TextButton>
                    )}
                    {canSave && !phone ? (
                        <>
                            <TextButton type="button" onClick={onCancelEdit} disabled={saving}>
                                Cancel
                            </TextButton>
                            <TextButton type="button" $primary onClick={onSave} disabled={saving}>
                                {saving ? "Saving…" : "Save for the group"}
                            </TextButton>
                        </>
                    ) : (
                        <TextButton type="button" $primary onClick={onDone}>
                            Done
                        </TextButton>
                    )}
                </Bar>
            )}

            {slideBar}

            {phone && panels.length > 1 && (
                <Tabs aria-label="Panels">
                    {panels.map((p) => (
                        <Tab
                            key={p.id}
                            type="button"
                            $on={activePhonePanel?.id === p.id}
                            aria-current={activePhonePanel?.id === p.id ? "true" : undefined}
                            onClick={() => setPhoneTab(p.id)}
                        >
                            {panelTitle(p)}
                        </Tab>
                    ))}
                </Tabs>
            )}

            <Stage ref={stageRef} $covering={shownCanvas && canvasEditing ? "edit" : stageFull?.native === false ? "present" : undefined}>
            {shownCanvas && <CanvasHost>{shownCanvas}</CanvasHost>}
            <Scroller
                ref={scrollerRef}
                $locked={!!fullId}
                $canvas={shownCanvas ? (canvasEditing ? "edit" : "view") : undefined}
                style={{ ["--ws-height" as string]: `${size.height}px` } as CSSProperties}
            >
                {panels.length === 0 && !layout.canvas && (
                    <Empty>
                        <span>There are no panels on this slide.</span>
                        <TextButton type="button" $primary onClick={openAdd}>
                            <Plus aria-hidden="true" />
                            Add panel
                        </TextButton>
                        {onLoadViewerData && (
                            <>
                                <span style={{ marginTop: 6 }}>
                                    Or load all its viewer data (the .zip of a whole digital twin) or a viewer configuration.
                                </span>
                                <TextButton type="button" onClick={onLoadViewerData}>
                                    <Upload aria-hidden="true" />
                                    Load viewer data
                                </TextButton>
                            </>
                        )}
                    </Empty>
                )}
                {size.width > 0 && gridPanels.length > 0 && (
                    <GridLayout
                        width={size.width}
                        layout={toGridItems({ panels: gridPanels }, editable)}
                        gridConfig={{
                            cols: grid.cols,
                            rowHeight,
                            margin: [grid.margin, grid.margin],
                            containerPadding: [0, 0],
                            maxRows: grid.maxRows,
                        }}
                        // over a canvas a panel stays where it is put (no compaction) and may overlap another
                        compactor={grid.compact ? undefined : CANVAS_COMPACTOR}
                        dragConfig={{ enabled: editable, handle: ".ws-drag-handle", cancel: ".ws-no-drag", bounded: false }}
                        resizeConfig={{ enabled: editable, handles: ["se", "e", "s"] }}
                        onLayoutChange={(items) => {
                            if (!editable) return;
                            const next = applyGridItems(layout, items);
                            if (next !== layout) onLayoutChange(next);
                        }}
                    >
                        {gridPanels.map((panel) => {
                            const isFull = fullId === panel.id;
                            const isFullscreen = fullscreen?.id === panel.id;
                            const className =
                                [fullId ? (isFull ? "ws-max" : "ws-hidden") : "", isFullscreen && !fullscreen?.native ? "ws-fs" : ""]
                                    .filter(Boolean)
                                    .join(" ") || undefined;
                            return (
                                <div key={panel.id} className={className} aria-hidden={fullId && !isFull ? true : undefined}>
                                    <WorkspacePanelView
                                        panel={panel}
                                        editing={editable}
                                        isFull={isFull}
                                        phone={phone}
                                        meta={panelMeta?.(panel)}
                                        isFullscreen={isFullscreen}
                                        panelRef={(el) => {
                                            if (el) panelElements.current.set(panel.id, el);
                                            else panelElements.current.delete(panel.id);
                                        }}
                                        onFullscreen={() => (isFullscreen ? exitFullscreen() : enterFullscreen(panel.id))}
                                        onMaximize={() => onMaximize(isFull ? null : panel.id)}
                                        onRemove={() => onLayoutChange(removePanel(layout, panel.id))}
                                        onRename={(title) => onLayoutChange(renamePanel(layout, panel.id, title))}
                                        actions={actionsOf(panel)}
                                        onEdit={editOf(panel)}
                                        source={
                                            editable && panel.type === "image" ? (
                                                <SourceRow>
                                                <select
                                                    aria-label={`Show the panel ${panelTitle(panel)} as`}
                                                    value={imageDisplayOf(panel)}
                                                    onChange={(e) => onLayoutChange(setPanelDisplay(layout, panel.id, e.target.value === "photo" ? "photo" : "video"))}
                                                >
                                                    <option value="video">Video</option>
                                                    <option value="photo">Photo</option>
                                                </select>
                                                <ImageSourceField
                                                    compact
                                                    label={`Source of the panel ${panelTitle(panel)}`}
                                                    value={panel.source ?? ANY_IMAGE_SOURCE}
                                                    options={imageSources}
                                                    onChange={(next) => {
                                                        if (next !== null && next !== panel.source) onLayoutChange(setPanelSource(layout, panel.id, next));
                                                    }}
                                                />
                                                </SourceRow>
                                            ) : undefined
                                        }
                                    >
                                        {renderPanel(panel)}
                                    </WorkspacePanelView>
                                </div>
                            );
                        })}
                    </GridLayout>
                )}
            </Scroller>
            {floatingTarget && floatingView ? createPortal(floatingView, floatingTarget) : floatingView}
            </Stage>

            {adding && (
                <AddPanelDialog
                    canAddModel={canAddModelPanel(layout, hasModel, insertFrame)}
                    canAddAlarms={canAddPanelType(layout, "alarms", hasModel, insertFrame)}
                    canAddApprovals={canAddPanelType(layout, "approvals", hasModel, insertFrame)}
                    canAddAssetState={canAddPanelType(layout, "assetState", hasModel, insertFrame)}
                    controlRoom={controlRoom}
                    canAddHealth={canAddPanelType(layout, "health", hasModel, insertFrame)}
                    canAddPipelineLogs={canAddPanelType(layout, "pipelineLogs", hasModel, insertFrame)}
                    organization={organization}
                    canAddOrgOverview={canAddPanelType(layout, "orgOverview", hasModel, insertFrame)}
                    canAddSimulator={canAddPanelType(layout, "simulator", hasModel, insertFrame)}
                    canAddCanvas={!layout.canvas && !!onAddCanvas}
                    onAddCanvas={
                        onAddCanvas
                            ? () => {
                                  setAdding(false);
                                  onAddCanvas();
                              }
                            : undefined
                    }
                    sources={imageSources}
                    chartOptions={chartOptions}
                    onAdd={addFromDialog}
                    onClose={() => setAdding(false)}
                />
            )}
            {overlay}
        </Area>
    );
};

interface WorkspacePanelViewProps {
    panel: WorkspacePanel;
    editing: boolean;
    isFull: boolean;
    phone: boolean;
    meta?: ReactNode;
    // full screen: the panel's element (for the Fullscreen API), whether it is, and the button
    isFullscreen?: boolean;
    panelRef?: (el: HTMLElement | null) => void;
    onFullscreen?: () => void;
    // none: no full page button (a floating panel)
    onMaximize?: () => void;
    onRemove: () => void;
    onRename: (title: string) => void;
    onEdit?: () => void;
    actions?: PanelAction[];
    // the source of an Image panel, while the layout is edited
    source?: ReactNode;
    children: ReactNode;
}

const WorkspacePanelView: FC<WorkspacePanelViewProps> = ({
    panel,
    editing,
    isFull,
    phone,
    meta,
    isFullscreen = false,
    panelRef,
    onFullscreen,
    onMaximize,
    onRemove,
    onRename,
    onEdit,
    actions,
    source,
    children,
}) => {
    const title = panelTitle(panel);
    const sourceText =
        panel.type === "image" && panel.title ? imageSourceLabel(panel.source) : null;
    return (
        <Panel
            ref={panelRef}
            $editing={editing}
            $fullscreen={isFullscreen}
            aria-label={title}
            style={{
                height: "100%",
                ...(panel.translucent && !isFullscreen ? TRANSLUCENT : {}),
                ...(panel.options?.transparent === true && !editing && !isFullscreen ? { background: "transparent", borderColor: "transparent" } : {}),
            }}
        >
            {isFullscreen && actions && actions.length > 0 && (
                <FullscreenActions>
                    {actions.map((action) => (
                        <button
                            key={action.label}
                            type="button"
                            aria-label={action.label}
                            title={action.label}
                            aria-pressed={action.active === undefined ? undefined : action.active}
                            onClick={action.onClick}
                        >
                            {action.icon}
                        </button>
                    ))}
                </FullscreenActions>
            )}
            {isFullscreen && onFullscreen && (
                <ExitFullscreenButton type="button" aria-label="Exit full screen" title="Exit full screen" onClick={onFullscreen}>
                    <Minimize aria-hidden="true" />
                </ExitFullscreenButton>
            )}
            {/* in full screen, all the screen for the panel: its bar comes back when it leaves */}
            {!isFullscreen && (
            <PanelBar $editing={editing} className="ws-drag-handle">
                {editing && <GripVertical aria-hidden="true" />}
                {panelIcon(panel)}
                {editing ? (
                    <TitleInput
                        className="ws-no-drag"
                        aria-label={`Title of the panel ${title}`}
                        defaultValue={panel.title ?? ""}
                        placeholder={title}
                        maxLength={80}
                        onBlur={(e) => {
                            if (e.target.value.trim() !== (panel.title ?? "")) onRename(e.target.value);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                    />
                ) : (
                    <h2>{title}</h2>
                )}
                {!editing && sourceText && <Meta>{sourceText}</Meta>}
                {!editing && meta && <Meta>{meta}</Meta>}
                {!editing && typeof panel.options?.description === "string" && (
                    <span className="ws-no-drag" tabIndex={0} title={panel.options.description} aria-label={`About: ${panel.options.description}`} style={{ display: "flex", color: "#9aa1aa" }}>
                        <Info aria-hidden="true" style={{ width: 14, height: 14 }} />
                    </span>
                )}
                <BarSpacer />
                {!editing && Array.isArray(panel.options?.links) && <PanelLinks links={panel.options.links} />}
                {actions?.map((action) => (
                    <IconButton
                        key={action.label}
                        type="button"
                        className="ws-no-drag"
                        aria-label={action.label}
                        title={action.label}
                        aria-pressed={action.active === undefined ? undefined : action.active}
                        onClick={action.onClick}
                    >
                        {action.icon}
                    </IconButton>
                ))}
                {onEdit && (
                    <IconButton type="button" className="ws-no-drag" aria-label={`Edit ${title}`} title="Edit the panel" onClick={onEdit}>
                        <Pencil aria-hidden="true" />
                    </IconButton>
                )}
                {!phone && onMaximize && (
                    <IconButton
                        type="button"
                        className="ws-no-drag"
                        aria-label={isFull ? `Back to the layout` : `Show ${title} full page`}
                        title={isFull ? "Back to the layout" : "Full page"}
                        onClick={onMaximize}
                    >
                        {isFull ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
                    </IconButton>
                )}
                {!editing && onFullscreen && (
                    <IconButton
                        type="button"
                        className="ws-no-drag"
                        aria-label={`Show ${title} full screen`}
                        title="Full screen"
                        onClick={onFullscreen}
                    >
                        <Maximize aria-hidden="true" />
                    </IconButton>
                )}
                {editing && (
                    <IconButton
                        type="button"
                        className="ws-no-drag"
                        aria-label={`Remove the panel ${title}`}
                        title="Remove the panel"
                        onClick={onRemove}
                    >
                        <X aria-hidden="true" />
                    </IconButton>
                )}
            </PanelBar>
            )}
            {source && <SourceStrip className="ws-no-drag">{source}</SourceStrip>}
            <PanelBody>{children}</PanelBody>
        </Panel>
    );
};

export default ViewerWorkspace;
