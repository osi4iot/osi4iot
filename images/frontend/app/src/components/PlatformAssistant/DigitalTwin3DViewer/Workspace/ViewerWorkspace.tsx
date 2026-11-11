// The Viewer page as a workspace: panels (the 3D model, images of several topics…) on a grid that a group
// administrator arranges for the whole group (react-grid-layout). Everybody can put a panel full page; while
// editing, panels are moved by their bar and resized from their edges. Below WORKSPACE_PHONE_BELOW pixels the
// page shows one panel at a time, chosen with tabs.
//
// Every panel stays mounted (the 3D model is never rebuilt, images keep painting): a full page panel covers
// the others, which are only hidden.
import { CSSProperties, FC, ReactNode, useEffect, useId, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { scrollbarStyle } from "../../../Tools/FormTools";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { BellRing, Box, ChartBar, FileImage, FileText, Image as ImageIcon, Video, ChartColumn, ChartColumnBig, ChartGantt, ChartLine, ChartPie, ClipboardCheck, Gauge, Hash, Table2, GripVertical, Info, Maximize2, Minimize2, Pencil, Plus, X } from "lucide-react";
import { ChartSeriesOption, defaultChartTitle } from "./chartSeries";
import { PanelLinks } from "./charts/Links";
import ImageSourceField from "./ImageSourceField";
import {
    CHART_MAX_SERIES,
    GRID_COLS,
    GRID_MARGIN,
    ImageSourceOption,
    MAX_ROWS,
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
    toGridItems,
} from "./workspaceLayout";

export const PANEL_BAR_HEIGHT = 40;
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

const Scroller = styled.div<{ $locked: boolean }>`
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: ${({ $locked }) => ($locked ? "hidden" : "auto")};
    ${scrollbarStyle}


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
`;

const Panel = styled.section<{ $editing: boolean }>`
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background-color: #141619;
    border: 1px solid ${({ $editing }) => ($editing ? "#34537f" : "#262a2f")};
    border-radius: 12px;
    overflow: hidden;
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
`;

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
type DialogType = "model" | "video" | "photo" | "picture" | "chart" | "markdown" | "alarms" | "approvals";

export const AddPanelDialog: FC<AddPanelDialogProps> = ({
    canAddModel,
    canAddAlarms = true,
    canAddApprovals = true,
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
            label: "Chart",
            hint: chartOptions.length ? "Measurements of the asset's sensors" : "The asset has no sensors with measurements",
            icon: <ChartLine />,
            disabled: chartOptions.length === 0,
        },
        { value: "picture" as const, label: "Picture", hint: "An image of the twin; an SVG can move with live values", icon: <FileImage />, disabled: false },
        { value: "markdown" as const, label: "Text", hint: "Markdown, LaTeX formulas and live values", icon: <FileText />, disabled: false },
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
    ];
    const canSubmit =
        type === "model"
            ? canAddModel
            : type === "chart"
              ? chosen.length > 0
              : type === "markdown" || type === "picture"
                ? true
                : type === "alarms"
                ? canAddAlarms
                : type === "approvals"
                  ? canAddApprovals
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
                  : type === "alarms"
                  ? "Alarms"
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
                    if (type === "video" || type === "photo") onAdd({ type: "image", display: type, source, title });
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
                {type === "markdown" && <Hint>The text opens in its editor: markdown, LaTeX formulas ($…$) and values of the NATS messages as they arrive ({"{{dtm2sim.rotorRpm}}"}).</Hint>}
                {(type === "alarms" || type === "approvals") && (
                    <Hint>
                        {type === "alarms"
                            ? "The alarms of this digital twin that are not normal now, and its latest alarm events (from the alarm history)."
                            : "The approval requests of this digital twin that wait for a decision, and the latest decisions (from the approval history)."}
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
    // the slides (arrows, tabs, filters) above the panels
    slideBar?: ReactNode;
    // shown over the slide bar and the panels (e.g. all the slides)
    overlay?: ReactNode;
}

const panelIcon = (panel: WorkspacePanel) =>
    panel.type === "model" ? (
        <Box aria-hidden="true" />
    ) : panel.type === "alarms" ? (
        <BellRing aria-hidden="true" />
    ) : panel.type === "approvals" ? (
        <ClipboardCheck aria-hidden="true" />
    ) : panel.type === "markdown" ? (
        <FileText aria-hidden="true" />
    ) : panel.type === "picture" ? (
        <FileImage aria-hidden="true" />
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
    slideBar,
    overlay,
}) => {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [adding, setAdding] = useState(false);
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

    const panels = layout.panels;
    const activePhonePanel = phone ? panels.find((p) => p.id === phoneTab) ?? panels[0] ?? null : null;
    const fullId = phone ? activePhonePanel?.id ?? null : panels.some((p) => p.id === maximizedId) ? maximizedId : null;
    const editable = editing && !phone && !fullId;

    // a full page panel: scrolled to the top so that it covers the visible area
    useEffect(() => {
        if (fullId && scrollerRef.current) scrollerRef.current.scrollTop = 0;
    }, [fullId]);

    const rowHeight = rowHeightFor(size.height);

    const addFromDialog = (spec: NewPanel) => {
        setAdding(false);
        const next = addPanel(layout, spec);
        onLayoutChange(next);
        // a new chart goes straight to the panel editor
        if ((spec.type === "chart" || spec.type === "markdown" || spec.type === "picture") && next !== layout) onEditPanel?.(next.panels[next.panels.length - 1].id);
    };

    const openAdd = () => {
        if (!editing) onStartEdit();
        setAdding(true);
    };

    return (
        <Area style={{ ...style, display: hidden ? "none" : "flex" }} data-testid="viewer-workspace">
            {editing && (
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

            <Scroller
                ref={scrollerRef}
                $locked={!!fullId}
                style={{ ["--ws-height" as string]: `${size.height}px` } as CSSProperties}
            >
                {panels.length === 0 && (
                    <Empty>
                        <span>There are no panels on this slide.</span>
                        <TextButton type="button" $primary onClick={openAdd}>
                            <Plus aria-hidden="true" />
                            Add panel
                        </TextButton>
                    </Empty>
                )}
                {size.width > 0 && panels.length > 0 && (
                    <GridLayout
                        width={size.width}
                        layout={toGridItems(layout, editable)}
                        gridConfig={{
                            cols: GRID_COLS,
                            rowHeight,
                            margin: [GRID_MARGIN, GRID_MARGIN],
                            containerPadding: [0, 0],
                            maxRows: MAX_ROWS,
                        }}
                        dragConfig={{ enabled: editable, handle: ".ws-drag-handle", cancel: ".ws-no-drag", bounded: false }}
                        resizeConfig={{ enabled: editable, handles: ["se", "e", "s"] }}
                        onLayoutChange={(items) => {
                            if (!editable) return;
                            const next = applyGridItems(layout, items);
                            if (next !== layout) onLayoutChange(next);
                        }}
                    >
                        {panels.map((panel) => {
                            const isFull = fullId === panel.id;
                            const className = fullId ? (isFull ? "ws-max" : "ws-hidden") : undefined;
                            return (
                                <div key={panel.id} className={className} aria-hidden={fullId && !isFull ? true : undefined}>
                                    <WorkspacePanelView
                                        panel={panel}
                                        editing={editable}
                                        isFull={isFull}
                                        phone={phone}
                                        meta={panelMeta?.(panel)}
                                        onMaximize={() => onMaximize(isFull ? null : panel.id)}
                                        onRemove={() => onLayoutChange(removePanel(layout, panel.id))}
                                        onRename={(title) => onLayoutChange(renamePanel(layout, panel.id, title))}
                                        onEdit={(panel.type === "chart" || panel.type === "markdown" || panel.type === "picture") && onEditPanel && !phone ? () => onEditPanel(panel.id) : undefined}
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

            {adding && (
                <AddPanelDialog
                    canAddModel={canAddModelPanel(layout, hasModel)}
                    canAddAlarms={canAddPanelType(layout, "alarms", hasModel)}
                    canAddApprovals={canAddPanelType(layout, "approvals", hasModel)}
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
    onMaximize: () => void;
    onRemove: () => void;
    onRename: (title: string) => void;
    onEdit?: () => void;
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
    onMaximize,
    onRemove,
    onRename,
    onEdit,
    source,
    children,
}) => {
    const title = panelTitle(panel);
    const sourceText =
        panel.type === "image" && panel.title ? imageSourceLabel(panel.source) : null;
    return (
        <Panel
            $editing={editing}
            aria-label={title}
            style={{ height: "100%", ...(panel.options?.transparent === true && !editing ? { background: "transparent", borderColor: "transparent" } : {}) }}
        >
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
                {onEdit && (
                    <IconButton type="button" className="ws-no-drag" aria-label={`Edit ${title}`} title="Edit the panel" onClick={onEdit}>
                        <Pencil aria-hidden="true" />
                    </IconButton>
                )}
                {!phone && (
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
            {source && <SourceStrip className="ws-no-drag">{source}</SourceStrip>}
            <PanelBody>{children}</PanelBody>
        </Panel>
    );
};

export default ViewerWorkspace;
