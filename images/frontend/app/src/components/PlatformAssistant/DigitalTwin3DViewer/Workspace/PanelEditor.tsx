// The editor of a chart panel, full page as Grafana's: the preview on top (with "Table view"), the data
// below (the series: sensor field, aggregation per interval, name, colour, axis; and the query options:
// min interval, max data points, relative time, time shift), and the options on the right (the
// visualization and its sections, with a search). "Apply" gives the panel back to the layout; "Discard"
// forgets the changes.
import { FC, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { scrollbarStyle } from "../../../Tools/FormTools";
import {
    ArrowLeft,
    ChartBar,
    ChartColumn,
    ChartLine,
    ChevronDown,
    ChevronRight,
    Eye,
    EyeOff,
    Gauge,
    Hash,
    Plus,
    Search,
    Table2,
    Trash2,
    ChartPie,
    ChartGantt,
    ChartColumnBig,
} from "lucide-react";
import OverridesEditor from "./charts/OverridesEditor";
import { CHART_MAX_SERIES, ChartSeriesRef, WorkspacePanel, seriesKey } from "./workspaceLayout";
import { ChartSeriesOption, formatBucket } from "./chartSeries";
import { ChartSettings, SERIES_AGGS, VIZ_TYPES, VizType, changeViz, chartSettingsOf, drawSeries, getPath, newChartSettings, setPath, withChartSettings } from "./charts/chartConfig";
import { OPTION_SECTIONS, searchSections } from "./charts/optionsSchema";
import { ColorSelect, Input, OptionControl, Select } from "./charts/OptionControls";
import { TimeRange, isSpan } from "./charts/timeRange";
import { ChartBody, FetchSeries, useChartData } from "./ChartPanel";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

const VIZ_ICONS: Record<VizType, ReactNode> = {
    timeseries: <ChartLine aria-hidden="true" />,
    barchart: <ChartColumn aria-hidden="true" />,
    stat: <Hash aria-hidden="true" />,
    gauge: <Gauge aria-hidden="true" />,
    bargauge: <ChartBar aria-hidden="true" />,
    table: <Table2 aria-hidden="true" />,
    piechart: <ChartPie aria-hidden="true" />,
    statetimeline: <ChartGantt aria-hidden="true" />,
    histogram: <ChartColumnBig aria-hidden="true" />,
};

const Page = styled.div`
    position: absolute;
    inset: 0;
    z-index: 2500;
    display: flex;
    flex-direction: column;
    background: #0b0c0e;
    color: #e6e8eb;
    font-family: ${font};
    font-size: 13px;
`;

const Header = styled.header`
    flex: none;
    min-height: 52px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 8px 14px;
    background: #141619;
    border-bottom: 1px solid #262a2f;

    h1 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
    }
`;

export const Button = styled.button<{ $primary?: boolean }>`
    height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid ${({ $primary }) => ($primary ? "#3d82f0" : "#2c3137")};
    background: ${({ $primary }) => ($primary ? "#3d82f0" : "#1b1e22")};
    color: ${({ $primary }) => ($primary ? "#fff" : "#d5d9de")};
    font: ${({ $primary }) => ($primary ? 600 : 500)} 13px ${font};
    white-space: nowrap;
    cursor: pointer;

    &:hover:not(:disabled) {
        border-color: ${({ $primary }) => ($primary ? "#5c97f5" : "#3d82f0")};
    }

    &:disabled {
        opacity: 0.5;
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

const Body = styled.div`
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;

    @media (max-width: 900px) {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto auto;
        overflow-y: auto;
        ${scrollbarStyle}
    }
`;

const Main = styled.section`
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #262a2f;
`;

const PreviewBar = styled.div`
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px 8px;
    color: #9aa1aa;
    font-size: 12px;
`;

const Preview = styled.div<{ $transparent: boolean }>`
    flex: 1.25;
    min-height: 240px;
    margin: 0 14px;
    display: flex;
    flex-direction: column;
    background: ${({ $transparent }) => ($transparent ? "transparent" : "#141619")};
    border: 1px solid #262a2f;
    border-radius: 12px;
    overflow: hidden;

    > div:first-child {
        flex: none;
        height: 40px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        border-bottom: 1px solid #262a2f;
        font-weight: 600;
    }
`;

const PreviewPlot = styled.div`
    position: relative;
    flex: 1;
    min-height: 0;
    margin: 6px 10px 8px;
`;

const DataArea = styled.div`
    flex: 1;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    margin-top: 12px;
    border-top: 1px solid #262a2f;
`;

const Scroll = styled.div`
    flex: 1;
    min-height: 0;
    overflow: auto;
    ${scrollbarStyle}
    padding: 10px 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const QueryRow = styled.div`
    display: grid;
    grid-template-columns: 22px minmax(180px, 1.6fr) 110px minmax(120px, 1fr) 150px 120px 64px;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: #141619;
    border: 1px solid #262a2f;
    border-radius: 8px;

    @media (max-width: 1300px) {
        grid-template-columns: 22px minmax(0, 1fr) 110px minmax(0, 1fr);
    }
`;

const QueryOptions = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-end;
    padding-bottom: 4px;

    label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
        color: #9aa1aa;
    }
`;

const Side = styled.aside`
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #111316;
`;

const SideTop = styled.div`
    flex: none;
    padding: 12px 14px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const VizButton = styled.button`
    height: 44px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    background: #1b1e22;
    border: 1px solid #2c3137;
    border-radius: 9px;
    color: #f2f3f5;
    font: 600 14px ${font};
    text-align: left;
    cursor: pointer;

    > svg {
        width: 18px;
        height: 18px;
        color: #9cc2ff;
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
    }
`;

const VizChoice = styled.button<{ $on: boolean }>`
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 9px;
    background: ${({ $on }) => ($on ? "#1d2836" : "#181b1f")};
    border: 1px solid ${({ $on }) => ($on ? "#3d82f0" : "#2c3137")};
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    > svg {
        width: 22px;
        height: 22px;
        flex: none;
        color: #9cc2ff;
    }

    strong {
        display: block;
        font-size: 13px;
        color: #f2f3f5;
    }

    small {
        font-size: 12px;
        color: #9aa1aa;
    }
`;

const SearchBox = styled.label`
    height: 34px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    background: #0e1013;
    border: 1px solid #2c3137;
    border-radius: 8px;
    color: #9aa1aa;

    svg {
        width: 14px;
        height: 14px;
    }

    input {
        flex: 1;
        min-width: 0;
        background: transparent;
        border: none;
        outline: none;
        color: #e6e8eb;
        font: 400 13px ${font};
    }
`;

const Sections = styled.div`
    flex: 1;
    min-height: 0;
    overflow: auto;
    ${scrollbarStyle}
    padding: 0 14px 20px;
`;

const SectionHead = styled.button`
    width: 100%;
    height: 42px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    background: transparent;
    border: none;
    color: #f2f3f5;
    font: 600 13px ${font};
    text-align: left;
    cursor: pointer;

    svg {
        width: 14px;
        height: 14px;
        color: #9aa1aa;
    }
`;

const SectionBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 0 0 16px 20px;
`;

export interface PanelEditorProps {
    panel: WorkspacePanel;
    groupId: number;
    chartOptions: ChartSeriesOption[];
    fetchSeries: FetchSeries;
    pageRange: TimeRange;
    refreshTick: number;
    // the time picker of the page (the editor shows the same one)
    timeControls?: ReactNode;
    onApply: (panel: WorkspacePanel) => void;
    onDiscard: () => void;
    now?: () => number;
}

const LETTERS = "ABCDEFGH";

const PanelEditor: FC<PanelEditorProps> = ({ panel, groupId, chartOptions, fetchSeries, pageRange, refreshTick, timeControls, onApply, onDiscard, now }) => {
    const [draft, setDraft] = useState<WorkspacePanel>(panel);
    const settings = useMemo(() => chartSettingsOf(draft), [draft]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [closed, setClosed] = useState<Set<string>>(new Set(["axis", "mappings", "tooltip"]));
    const [tableView, setTableView] = useState(false);
    const plotRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(800);
    useEffect(() => {
        const el = plotRef.current;
        if (el?.clientWidth) setWidth(el.clientWidth);
    }, []);
    const state = useChartData(draft, chartOptions, groupId, pageRange, refreshTick, fetchSeries, width, false, now);
    const shownState = useMemo(
        () => (tableView ? { ...state, settings: { ...newChartSettings("table"), fieldConfig: { defaults: { ...newChartSettings("table").fieldConfig.defaults, unit: settings.fieldConfig.defaults.unit } } } as ChartSettings } : state),
        [state, tableView, settings],
    );

    const changed = JSON.stringify(draft) !== JSON.stringify(panel);
    const setSettings = (next: ChartSettings) => setDraft((d) => withChartSettings(d, next));
    const getValue = (path: string): unknown => {
        if (path.startsWith("panel.")) return (draft as unknown as Record<string, unknown>)[path.slice(6)];
        return getPath(settings, path);
    };
    const setValue = (path: string, value: unknown) => {
        if (path.startsWith("panel.")) {
            const key = path.slice(6);
            setDraft((d) => {
                const next = { ...d } as Record<string, unknown>;
                if (value === undefined || value === "") delete next[key];
                else next[key] = value;
                return next as unknown as WorkspacePanel;
            });
            return;
        }
        setSettings(setPath(settings, path, value));
    };

    const series = draft.series ?? [];
    const setSeries = (next: ChartSeriesRef[]) => setDraft((d) => ({ ...d, series: next }));
    const updateSeries = (i: number, patch: Partial<ChartSeriesRef>) =>
        setSeries(
            series.map((s, j) => {
                if (j !== i) return s;
                const merged = { ...s, ...patch } as Record<string, unknown>;
                for (const [k, v] of Object.entries(merged)) if (v === undefined || v === "" || v === false) delete merged[k];
                return merged as unknown as ChartSeriesRef;
            }),
        );
    const optionByKey = new Map(chartOptions.map((o) => [o.key, o]));
    const unused = chartOptions.filter((o) => !series.some((s) => seriesKey(s) === o.key));

    const sections = searchSections(OPTION_SECTIONS[settings.viz], search);
    const [optionsTab, setOptionsTab] = useState<"all" | "overrides">("all");
    // the names of the series, for the overrides "Fields with name"
    const seriesNames = useMemo(() => {
        if (state.sources.length) return drawSeries(state.sources, { ...settings, fieldConfig: { defaults: settings.fieldConfig.defaults } }).map((x) => x.name);
        return (draft.series ?? []).map((ref) => ref.alias || chartOptions.find((o) => o.key === seriesKey(ref))?.label || ref.field);
    }, [state.sources, settings, draft.series, chartOptions]);
    const viz = VIZ_TYPES.find((v) => v.id === settings.viz)!;
    const title = draft.title || "Chart";

    const spanField = (label: string, key: "interval" | "timeFrom" | "timeShift", placeholder: string, help: string) => {
        const value = draft[key] ?? "";
        const bad = value !== "" && !isSpan(value);
        return (
            <label title={help}>
                {label}
                <Input
                    value={value}
                    placeholder={placeholder}
                    aria-invalid={bad}
                    style={{ width: 110, borderColor: bad ? "#f2495c" : undefined }}
                    onChange={(e) => {
                        const v = e.target.value.trim();
                        setDraft((d) => {
                            const next = { ...d };
                            if (v === "") delete next[key];
                            else next[key] = v;
                            return next;
                        });
                    }}
                />
            </label>
        );
    };
    const spansValid = (["interval", "timeFrom", "timeShift"] as const).every((k) => !draft[k] || isSpan(draft[k] as string));

    return (
        <Page role="dialog" aria-modal="true" aria-label={`Edit panel ${title}`} onKeyDown={(e) => e.key === "Escape" && !pickerOpen && onDiscard()}>
            <Header>
                <Button type="button" onClick={onDiscard} aria-label="Back to the Viewer without the changes">
                    <ArrowLeft aria-hidden="true" />
                    Back
                </Button>
                <h1>Edit panel</h1>
                <span style={{ color: "#9aa1aa" }}>{title}</span>
                <span style={{ flex: 1 }} />
                {timeControls}
                <Button type="button" onClick={onDiscard}>
                    Discard
                </Button>
                <Button type="button" $primary disabled={!spansValid} onClick={() => onApply(draft)} title={changed ? "Back to the Viewer with the changes" : "Back to the Viewer"}>
                    Apply
                </Button>
            </Header>
            <Body>
                <Main aria-label="Preview and data">
                    <PreviewBar>
                        <span>Preview</span>
                        {state.data?.bucketSeconds && <span>· {formatBucket(state.data.bucketSeconds)} intervals</span>}
                        {state.data?.histogram && <span>· bins of {state.data.histogram.size}</span>}
                        <span style={{ flex: 1 }} />
                        <Button type="button" aria-pressed={tableView} onClick={() => setTableView((v) => !v)} style={tableView ? { background: "#23324a", borderColor: "#3d82f0", color: "#e6efff" } : undefined}>
                            Table view
                        </Button>
                    </PreviewBar>
                    <Preview $transparent={getPath(settings, "options.transparent") === true}>
                        <div>
                            {VIZ_ICONS[settings.viz]}
                            <span>{title}</span>
                        </div>
                        <PreviewPlot ref={plotRef}>
                            <ChartBody state={shownState} label={title} />
                        </PreviewPlot>
                    </Preview>
                    <DataArea>
                        <div role="tablist" aria-label="Data" style={{ flex: "none", display: "flex", padding: "0 14px", borderBottom: "1px solid #262a2f" }}>
                            <span role="tab" aria-selected="true" style={{ height: 40, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderBottom: "2px solid #3d82f0", fontWeight: 600 }}>
                                Query <span style={{ color: "#9aa1aa", fontWeight: 500 }}>{series.length}</span>
                            </span>
                        </div>
                        <Scroll>
                            <QueryOptions aria-label="Query options">
                                <span style={{ fontSize: 12, color: "#9aa1aa", alignSelf: "center" }}>
                                    Source: <b style={{ color: "#e6e8eb" }}>sensors of the asset</b>
                                </span>
                                {spanField("Min interval", "interval", "auto", "The smallest interval of time each point summarizes (e.g. 1m)")}
                                <label title="How many points a series may have at most">
                                    Max data points
                                    <Input
                                        type="number"
                                        min={10}
                                        max={2000}
                                        placeholder="auto"
                                        value={draft.maxDataPoints ?? ""}
                                        style={{ width: 110 }}
                                        onChange={(e) => {
                                            const v = Number(e.target.value);
                                            setDraft((d) => {
                                                const next = { ...d };
                                                if (e.target.value === "" || !Number.isFinite(v)) delete next.maxDataPoints;
                                                else next.maxDataPoints = Math.max(10, Math.min(2000, Math.round(v)));
                                                return next;
                                            });
                                        }}
                                    />
                                </label>
                                {spanField("Relative time", "timeFrom", "page", "This panel shows the last … (e.g. 24h) whatever the range of the page")}
                                {spanField("Time shift", "timeShift", "none", "The range moved back by … (e.g. 1d: the same hours of yesterday)")}
                            </QueryOptions>
                            {series.map((s, i) => {
                                const option = optionByKey.get(seriesKey(s));
                                return (
                                    <QueryRow key={`${seriesKey(s)}-${i}`} aria-label={`Series ${LETTERS[i]}`}>
                                        <span style={{ fontWeight: 700, color: "#9aa1aa" }}>{LETTERS[i]}</span>
                                        <Select
                                            aria-label={`Field of series ${LETTERS[i]}`}
                                            value={seriesKey(s)}
                                            onChange={(e) => {
                                                const o = optionByKey.get(e.target.value);
                                                if (o) updateSeries(i, { sensor: o.sensor, field: o.field, index: o.index });
                                            }}
                                        >
                                            {!option && <option value={seriesKey(s)}>{`${s.sensor} · ${s.field} (no longer exists)`}</option>}
                                            {chartOptions.map((o) => (
                                                <option key={o.key} value={o.key} disabled={o.key !== seriesKey(s) && series.some((x) => seriesKey(x) === o.key)}>
                                                    {o.sensorDescription} · {o.label}
                                                    {o.units !== "-" ? ` (${o.units})` : ""}
                                                </option>
                                            ))}
                                        </Select>
                                        <Select aria-label={`Aggregation of series ${LETTERS[i]}`} value={s.agg ?? "mean"} onChange={(e) => updateSeries(i, { agg: e.target.value === "mean" ? undefined : (e.target.value as ChartSeriesRef["agg"]) })}>
                                            {SERIES_AGGS.map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.name}
                                                </option>
                                            ))}
                                        </Select>
                                        <Input aria-label={`Display name of series ${LETTERS[i]}`} placeholder={option?.label ?? "Display name"} value={s.alias ?? ""} maxLength={80} onChange={(e) => updateSeries(i, { alias: e.target.value })} />
                                        <ColorSelect value={s.color} allowNone label={`Colour of series ${LETTERS[i]}`} onChange={(color) => updateSeries(i, { color: color || undefined })} />
                                        <Select aria-label={`Axis of series ${LETTERS[i]}`} value={s.axis ?? "left"} onChange={(e) => updateSeries(i, { axis: e.target.value === "right" ? "right" : undefined })}>
                                            <option value="left">Left axis</option>
                                            <option value="right">Right axis</option>
                                        </Select>
                                        <div style={{ display: "flex", gap: 2 }}>
                                            <Button type="button" style={{ width: 30, padding: 0, justifyContent: "center" }} aria-label={s.hide ? `Show series ${LETTERS[i]}` : `Hide series ${LETTERS[i]}`} aria-pressed={!!s.hide} onClick={() => updateSeries(i, { hide: !s.hide })}>
                                                {s.hide ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                                            </Button>
                                            <Button type="button" style={{ width: 30, padding: 0, justifyContent: "center" }} aria-label={`Remove series ${LETTERS[i]}`} onClick={() => setSeries(series.filter((_, j) => j !== i))}>
                                                <Trash2 aria-hidden="true" />
                                            </Button>
                                        </div>
                                    </QueryRow>
                                );
                            })}
                            <Button
                                type="button"
                                style={{ alignSelf: "flex-start", borderStyle: "dashed", background: "transparent" }}
                                disabled={unused.length === 0 || series.length >= CHART_MAX_SERIES}
                                onClick={() => {
                                    const o = unused[0];
                                    if (o) setSeries([...series, o.index === undefined ? { sensor: o.sensor, field: o.field } : { sensor: o.sensor, field: o.field, index: o.index }]);
                                }}
                            >
                                <Plus aria-hidden="true" />
                                Add series
                            </Button>
                            {chartOptions.length === 0 && <span style={{ color: "#9aa1aa" }}>The asset has no sensors with measurements.</span>}
                        </Scroll>
                    </DataArea>
                </Main>

                <Side aria-label="Panel options">
                    <SideTop>
                        <VizButton type="button" aria-expanded={pickerOpen} onClick={() => setPickerOpen((v) => !v)}>
                            {VIZ_ICONS[settings.viz]}
                            <span style={{ flex: 1 }}>{viz.name}</span>
                            <ChevronDown aria-hidden="true" style={{ width: 14, height: 14, color: "#9aa1aa" }} />
                        </VizButton>
                        {!pickerOpen && optionsTab === "all" && (
                            <SearchBox>
                                <Search aria-hidden="true" />
                                <input type="search" placeholder="Search options" aria-label="Search options" value={search} onChange={(e) => setSearch(e.target.value)} />
                            </SearchBox>
                        )}
                        {!pickerOpen && (
                            <div role="tablist" aria-label="Options" style={{ display: "flex", gap: 2, padding: 2, background: "#0e1013", border: "1px solid #262a2f", borderRadius: 8 }}>
                                {(["all", "overrides"] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        type="button"
                                        role="tab"
                                        aria-selected={optionsTab === tab}
                                        onClick={() => setOptionsTab(tab)}
                                        style={{
                                            flex: 1,
                                            height: 28,
                                            border: "none",
                                            borderRadius: 6,
                                            background: optionsTab === tab ? "#23324a" : "transparent",
                                            color: optionsTab === tab ? "#e6efff" : "#9aa1aa",
                                            font: `${optionsTab === tab ? 600 : 500} 12px ${font}`,
                                            cursor: "pointer",
                                        }}
                                    >
                                        {tab === "all" ? "All" : `Overrides${settings.fieldConfig.overrides?.length ? ` (${settings.fieldConfig.overrides.length})` : ""}`}
                                    </button>
                                ))}
                            </div>
                        )}
                    </SideTop>
                    <Sections>
                        {!pickerOpen && optionsTab === "overrides" ? (
                            <OverridesEditor
                                overrides={settings.fieldConfig.overrides ?? []}
                                seriesNames={seriesNames}
                                viz={settings.viz}
                                onChange={(overrides) => setSettings({ ...settings, fieldConfig: overrides.length ? { ...settings.fieldConfig, overrides } : { defaults: settings.fieldConfig.defaults } })}
                            />
                        ) : pickerOpen ? (
                            <div role="listbox" aria-label="Visualizations" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {VIZ_TYPES.map((v) => (
                                    <VizChoice
                                        key={v.id}
                                        type="button"
                                        role="option"
                                        aria-selected={v.id === settings.viz}
                                        $on={v.id === settings.viz}
                                        onClick={() => {
                                            setSettings(changeViz(settings, v.id));
                                            setPickerOpen(false);
                                        }}
                                    >
                                        {VIZ_ICONS[v.id]}
                                        <span>
                                            <strong>{v.name}</strong>
                                            <small>{v.description}</small>
                                        </span>
                                    </VizChoice>
                                ))}
                            </div>
                        ) : (
                            <>
                                {sections.map((section) => {
                                    const open = search !== "" || !closed.has(section.id);
                                    return (
                                        <div key={section.id} style={{ borderBottom: "1px solid #22262b" }}>
                                            <SectionHead
                                                type="button"
                                                aria-expanded={open}
                                                onClick={() =>
                                                    setClosed((c) => {
                                                        const next = new Set(c);
                                                        if (next.has(section.id)) next.delete(section.id);
                                                        else next.add(section.id);
                                                        return next;
                                                    })
                                                }
                                            >
                                                {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                                                {section.title}
                                            </SectionHead>
                                            {open && (
                                                <SectionBody>
                                                    {section.items
                                                        .filter((item) => !item.when || item.when(getValue))
                                                        .map((item) => (
                                                            <OptionControl key={item.path + item.label} item={item} value={getValue(item.path)} onChange={(v) => setValue(item.path, v)} />
                                                        ))}
                                                </SectionBody>
                                            )}
                                        </div>
                                    );
                                })}
                                {sections.length === 0 && <p style={{ color: "#9aa1aa" }}>No options match “{search}”.</p>}
                            </>
                        )}
                    </Sections>
                </Side>
            </Body>
        </Page>
    );
};

export default PanelEditor;
