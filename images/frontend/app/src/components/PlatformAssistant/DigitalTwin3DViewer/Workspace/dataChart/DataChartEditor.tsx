// The editor of a Data chart panel (dataChart.ts): its kind, and
//   - a 2D chart or 3D points: its series, each a pair (or a trio) of fields of a source — a topic or the asset's
//     state — whose values are lists of numbers (a "*" takes a field of every item of a list); axes, ranges, legend
//   - a heat map or a 3D surface: a formula z = f(x, y) with its parameters (fixed, or values of the NATS messages)
//     over a range of x and y, or a grid of values that a message (or the asset's state) carries
// The preview draws the chart as it is being edited, with the last data.
import { FC, ReactNode, useEffect, useId, useMemo, useState } from "react";
import styled from "styled-components";
import { ChartScatter, Plus, Trash2, X } from "lucide-react";
import { scrollbarStyle } from "../../../../Tools/FormTools";
import { EditorParts } from "../MarkdownPanel";
import { LiveTopic, LiveValueStore, useLiveTick } from "../liveValues";
import { WorkspacePanel } from "../workspaceLayout";
import { SURFACE_EXPRESSION_MAX_LENGTH, compileSurfaceExpression, isReservedSurfaceName } from "../surface/surfaceExpression";
import {
    CONTOUR_LEVELS_DEFAULT,
    CONTOUR_LEVELS_MAX,
    CONTOUR_LEVELS_MIN,
    SURFACE_COLORS,
    SURFACE_DATA_MAX,
    SURFACE_DEFAULT_STEPS,
    SURFACE_LABEL_MAX,
    SURFACE_MAX_PARAMS,
    SURFACE_STEPS_MAX,
    SURFACE_STEPS_MIN,
    SurfaceOptions,
    SurfaceParam,
    defaultSurface,
} from "../surface/surfacePanel";
import { DataChartView } from "./DataChartPanel";
import {
    ASSET_STATE_SOURCE,
    DATA_CHART_KINDS,
    DATA_CHART_KIND_LABELS,
    DATA_CHART_LABEL_MAX,
    DATA_CHART_MAX_SERIES,
    DATA_CHART_STYLES,
    DATA_PATH,
    DataChartKind,
    DataChartOptions,
    DataFormula,
    DataSeries,
    DATA_FORMULA_POINTS_DEFAULT,
    DATA_FORMULA_POINTS_MAX,
    FORMULA_SOURCE,
    dataFieldPaths,
    defaultDataChart,
    isGridKind,
} from "./dataChart";

const { Backdrop, Dialog, Head, Body, Column, Preview, Help, Actions, Secondary, Primary, Close } = EditorParts;

const Settings = styled.div`
    min-height: 0;
    overflow-y: auto;
    padding-right: 6px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    ${scrollbarStyle}

    fieldset {
        margin: 0;
        padding: 10px 12px 12px;
        border: 1px solid #262a2f;
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    legend {
        padding: 0 6px;
        color: #c7cbd1;
        font-size: 13px;
        font-weight: 600;
    }
    .row {
        display: flex;
        gap: 8px;
        align-items: flex-end;
        flex-wrap: wrap;
    }
    .row > label {
        flex: 1;
        min-width: 90px;
    }
    input,
    select {
        width: 100%;
    }
    input[type="checkbox"],
    input[type="radio"] {
        width: auto;
        height: auto;
    }
    .check {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #d5d9de;
        font-size: 13px;
    }
    .error {
        margin: 0;
        color: #ef8a8a;
        font-size: 12px;
    }
    .hint {
        margin: 0;
        color: #8d949c;
        font-size: 12px;
        line-height: 1.45;
    }
`;

const Modes = styled.div`
    display: flex;
    gap: 6px;

    label {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border: 1px solid #2c3137;
        border-radius: 8px;
        color: #d5d9de;
        font-size: 13px;
        cursor: pointer;
    }
    label:has(input:checked) {
        border-color: #3d82f0;
        background: rgba(61, 130, 240, 0.12);
    }
`;

const ParamRow = styled.div`
    display: grid;
    grid-template-columns: 70px 80px minmax(0, 1fr) minmax(0, 1fr) 32px;
    gap: 6px;
    align-items: center;

    button {
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 1px solid #2c3137;
        border-radius: 8px;
        color: #c7cbd1;
        cursor: pointer;
    }
    svg {
        width: 15px;
        height: 15px;
    }
`;

const SmallButton = styled.button`
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    background: #1b1e22;
    border: 1px solid #2c3137;
    border-radius: 8px;
    color: #d5d9de;
    font-size: 13px;
    cursor: pointer;

    svg {
        width: 14px;
        height: 14px;
    }
`;

// A number typed freely ("-", "1e") and given only when it is one
const NumberInput: FC<{
    label: string;
    value: number | undefined;
    onChange: (value: number | undefined) => void;
    optional?: boolean;
    step?: string;
}> = ({ label, value, onChange, optional, step = "any" }) => {
    const [text, setText] = useState(value === undefined ? "" : String(value));
    useEffect(() => {
        setText((current) => (Number(current) === value || (current === "" && value === undefined) ? current : value === undefined ? "" : String(value)));
    }, [value]);
    return (
        <input
            aria-label={label}
            type="number"
            step={step}
            value={text}
            onChange={(e) => {
                setText(e.target.value);
                const n = e.target.value.trim() === "" ? NaN : Number(e.target.value);
                if (Number.isFinite(n)) onChange(n);
                else if (optional && e.target.value.trim() === "") onChange(undefined);
            }}
        />
    );
};

const SeriesCard = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid #2c3137;
    border-radius: 8px;

    .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: #c7cbd1;
        font-size: 13px;
        font-weight: 600;
    }
    .top button {
        height: 28px;
        width: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 1px solid #2c3137;
        border-radius: 8px;
        color: #c7cbd1;
        cursor: pointer;
    }
    .top svg {
        width: 14px;
        height: 14px;
    }
    input[type="color"] {
        height: 32px;
        padding: 2px;
    }
`;

const KindModes = styled(Modes)`
    flex-wrap: wrap;

    label {
        flex: 1 1 40%;
    }
`;

// what is wrong with the series of a 2D chart or of 3D points (nothing: they can be applied)
export const seriesProblems = (kind: DataChartKind, series: DataSeries[]): string[] => {
    const problems: string[] = [];
    if (series.length === 0) problems.push("Add a series");
    series.forEach((s, i) => {
        const name = s.name || `Series ${i + 1}`;
        if (s.source === FORMULA_SOURCE) {
            if (kind !== "xy") problems.push(`${name}: a formula is only for 2D charts`);
            const f = s.formula;
            if (!f) problems.push(`${name}: write its formula`);
            else {
                const asSurface: SurfaceOptions = {
                    mode: "function",
                    expression: f.expression,
                    params: f.params,
                    xMin: f.xMin,
                    xMax: f.xMax,
                    yMin: 0,
                    yMax: 1,
                };
                for (const problem of surfaceProblems(asSurface)) problems.push(`${name}: ${problem.replace(": z = f(x, y)", ": y = f(x)")}`);
                if (f.points !== undefined && !(Number.isInteger(f.points) && f.points >= 2 && f.points <= DATA_FORMULA_POINTS_MAX)) {
                    problems.push(`${name}: from 2 to ${DATA_FORMULA_POINTS_MAX} points`);
                }
            }
            return;
        }
        const fields: [string, string | undefined, boolean][] = [
            ["x", s.x, kind === "points3d"],
            ["y", s.y, true],
            ["z", s.z, kind === "points3d"],
        ];
        for (const [axis, path, required] of fields) {
            if (!path) {
                if (required) problems.push(`${name}: choose the field of ${axis}`);
            } else if (!DATA_PATH.test(path)) problems.push(`${name}: "${path}" is not a field (names and * separated by dots)`);
        }
    });
    return problems;
};

const rangeProblems = (chart: DataChartOptions) => {
    const problems: string[] = [];
    if (chart.xMin !== undefined && chart.xMax !== undefined && !(chart.xMin < chart.xMax)) problems.push("x: the minimum must be below the maximum");
    if (chart.yMin !== undefined && chart.yMax !== undefined && !(chart.yMin < chart.yMax)) problems.push("y: the minimum must be below the maximum");
    return problems;
};

export interface DataChartEditorProps {
    panel: WorkspacePanel;
    store?: LiveValueStore;
    // the topics whose data can be used (dev2pdb with their sensors' fields, dtm2sim, dev2sim)
    topics: LiveTopic[];
    // the twin has an asset whose state can be used
    assetState?: boolean;
    onApply: (panel: WorkspacePanel) => void;
    onDiscard: () => void;
}

// what is wrong with the settings (nothing: they can be applied)
export const surfaceProblems = (s: SurfaceOptions): string[] => {
    const problems: string[] = [];
    if (!(s.xMin < s.xMax)) problems.push("x: the minimum must be below the maximum");
    if (!(s.yMin < s.yMax)) problems.push("y: the minimum must be below the maximum");
    if ((s.zMin === undefined) !== (s.zMax === undefined) || (s.zMin !== undefined && s.zMax !== undefined && !(s.zMin < s.zMax))) {
        problems.push("z: a fixed range needs a minimum below its maximum");
    }
    if (s.mode === "function") {
        const names = new Set<string>();
        for (const p of s.params ?? []) {
            if (!/^[A-Za-z_][A-Za-z0-9_]{0,19}$/.test(p.name)) problems.push(`"${p.name}" is not a valid name for a parameter (letters, digits and _)`);
            else if (isReservedSurfaceName(p.name)) problems.push(`"${p.name}" is a name of the formulas: choose another`);
            else if (names.has(p.name)) problems.push(`The parameter ${p.name} is twice`);
            names.add(p.name);
            if (p.topicRef !== undefined && !p.path) problems.push(`${p.name}: choose the field of ${p.topicRef}`);
        }
        const compiled = compileSurfaceExpression(
            s.expression ?? "",
            (s.params ?? []).map((p) => p.name),
        );
        if ("error" in compiled) problems.push(compiled.error);
    } else if (!s.topicRef || !s.path) problems.push("Choose the source and the field of the grid");
    return problems;
};

export const DataChartEditor: FC<DataChartEditorProps> = ({ panel, store, topics, assetState = true, onApply, onDiscard }) => {
    const titleId = useId();
    const initial = panel.data ?? defaultDataChart();
    const [title, setTitle] = useState(panel.title ?? "");
    const [kind, setKind] = useState<DataChartKind>(initial.kind);
    // the settings of each family are kept while the kind changes
    const [draft, setDraft] = useState<SurfaceOptions>(() => initial.surface ?? defaultSurface());
    const [chart, setChart] = useState<DataChartOptions>(() =>
        isGridKind(initial.kind) ? defaultDataChart("xy", topics.find((t) => t.ref === "dtm2sim")?.ref ?? "dtm2sim") : initial,
    );
    const set = (change: Partial<SurfaceOptions>) => setDraft((d) => ({ ...d, ...change }));
    const setAxes = (change: Partial<DataChartOptions>) => setChart((c) => ({ ...c, ...change }));
    const series = chart.series ?? [];
    const setSeries = (index: number, change: Partial<DataSeries>) =>
        setAxes({
            series: series.map((s, i) => (i === index ? { ...s, ...change } : s)),
        });
    const params = draft.params ?? [];
    const setParam = (index: number, change: Partial<SurfaceParam>) =>
        set({
            params: params.map((p, i) => (i === index ? { ...p, ...change } : p)),
        });
    const grid = isGridKind(kind);
    const problems = useMemo(
        () => (grid ? surfaceProblems(draft) : [...seriesProblems(kind, series), ...rangeProblems(chart)]),
        [grid, kind, draft, series, chart],
    );
    const compiled = useMemo(
        () =>
            draft.mode === "function"
                ? compileSurfaceExpression(
                      draft.expression ?? "",
                      params.map((p) => p.name),
                  )
                : null,
        [draft.mode, draft.expression, params],
    );
    const unknown = compiled && "error" in compiled ? /^Unknown name "([A-Za-z_][A-Za-z0-9_]*)"/.exec(compiled.error)?.[1] : undefined;
    // the sources: the topics and, when the twin has an asset, its state
    const sources = useMemo<LiveTopic[]>(
        () =>
            assetState
                ? [
                      ...topics,
                      {
                          ref: ASSET_STATE_SOURCE,
                          label: "Asset state (iot_data.assetState)",
                      },
                  ]
                : topics,
        [topics, assetState],
    );
    // the fields of a source: its sensors' (dev2pdb), or those seen in its data (with the lists as "*")
    const tick = useLiveTick(
        store,
        sources.map((t) => t.ref),
        1000,
    );
    const fieldsOf = useMemo(
        () => (topicRef: string) => {
            const known = topics.find((t) => t.ref === topicRef)?.fields;
            if (known && known.length)
                return known.map((f) => ({
                    path: f.path,
                    label: `${f.label}${f.units && f.units !== "-" ? ` (${f.units})` : ""}`,
                }));
            return dataFieldPaths(store?.get(topicRef)?.payload).map((path) => ({
                path,
                label: path,
            }));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [topics, store, tick],
    );
    const firstTopic = topics.find((t) => t.ref === "dtm2sim")?.ref ?? topics[0]?.ref ?? "dtm2sim";
    const result = useMemo<DataChartOptions>(() => (grid ? { kind, surface: draft } : { ...chart, kind }), [grid, kind, draft, chart]);
    const preview = problems.length === 0 ? result : undefined;

    const fieldInput = (
        topicRef: string,
        path: string | undefined,
        onChange: (path: string) => void,
        label: string,
        placeholder = "field (e.g. load or fem.grid)",
    ) => {
        const listId = `${titleId}-${label.replace(/\W+/g, "_")}`;
        const fields = fieldsOf(topicRef);
        return (
            <>
                <input aria-label={label} list={listId} value={path ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value.trim())} />
                <datalist id={listId}>
                    {fields.map((f) => (
                        <option key={f.path} value={f.path}>
                            {f.label}
                        </option>
                    ))}
                </datalist>
            </>
        );
    };

    return (
        <Backdrop>
            <Dialog
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.stopPropagation();
                        onDiscard();
                    }
                }}
                onSubmit={(e) => {
                    e.preventDefault();
                    if (problems.length) return;
                    let data: DataChartOptions;
                    if (grid) {
                        const surface: SurfaceOptions = { ...draft };
                        if (surface.mode === "function") {
                            delete surface.topicRef;
                            delete surface.path;
                        } else {
                            delete surface.expression;
                            delete surface.params;
                            delete surface.steps;
                        }
                        if (kind === "heatmap") {
                            delete surface.opacity;
                            delete surface.wireframe;
                        } else {
                            delete surface.contours;
                            delete surface.contourLevels;
                        }
                        data = { kind, surface };
                    } else {
                        data = {
                            ...chart,
                            kind,
                            series: series.map((s) => cleanSeries(kind, s)),
                        };
                        if (kind === "points3d") {
                            delete data.xLog;
                            delete data.yLog;
                            delete data.xMin;
                            delete data.xMax;
                            delete data.yMin;
                            delete data.yMax;
                        } else delete data.zLabel;
                    }
                    const next: WorkspacePanel = { ...panel, data };
                    delete next.surface;
                    if (title.trim()) next.title = title.trim().slice(0, 80);
                    else delete next.title;
                    onApply(next);
                }}
            >
                <Head>
                    <h2 id={titleId}>
                        <ChartScatter aria-hidden="true" />
                        Edit Data chart
                    </h2>
                    <Close type="button" aria-label="Discard the changes" onClick={onDiscard}>
                        <X aria-hidden="true" />
                    </Close>
                </Head>
                <label>
                    <span>Title (optional)</span>
                    <input value={title} maxLength={80} placeholder="Data chart" onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
                </label>
                <Body style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.15fr)" }}>
                    <Settings>
                        <KindModes role="radiogroup" aria-label="Kind of chart">
                            {DATA_CHART_KINDS.map((k) => (
                                <label key={k}>
                                    <input type="radio" name={`${titleId}-kind`} checked={kind === k} onChange={() => setKind(k)} />
                                    {DATA_CHART_KIND_LABELS[k]}
                                </label>
                            ))}
                        </KindModes>

                        {grid ? (
                            <>
                                <Modes role="radiogroup" aria-label="Source of the grid">
                                    <label>
                                        <input
                                            type="radio"
                                            name={`${titleId}-mode`}
                                            checked={draft.mode === "function"}
                                            onChange={() =>
                                                set({
                                                    mode: "function",
                                                    expression: draft.expression ?? "A*sin(k*x)*cos(k*y)",
                                                    params: draft.params ?? defaultSurface().params,
                                                    steps: draft.steps ?? SURFACE_DEFAULT_STEPS,
                                                })
                                            }
                                        />
                                        A formula z = f(x, y)
                                    </label>
                                    <label>
                                        <input
                                            type="radio"
                                            name={`${titleId}-mode`}
                                            checked={draft.mode === "data"}
                                            onChange={() =>
                                                set({
                                                    mode: "data",
                                                    topicRef: draft.topicRef ?? firstTopic,
                                                })
                                            }
                                        />
                                        A grid of a message
                                    </label>
                                </Modes>

                                {draft.mode === "function" ? (
                                    <>
                                        <fieldset>
                                            <legend>Formula</legend>
                                            <label>
                                                <span>z =</span>
                                                <input
                                                    aria-label="Formula"
                                                    value={draft.expression ?? ""}
                                                    maxLength={SURFACE_EXPRESSION_MAX_LENGTH}
                                                    spellCheck={false}
                                                    style={{
                                                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                                    }}
                                                    onChange={(e) => set({ expression: e.target.value })}
                                                />
                                            </label>
                                            {compiled && "error" in compiled && (
                                                <p className="error" role="alert">
                                                    {compiled.error}
                                                    {compiled.at !== undefined ? ` (at character ${compiled.at + 1})` : ""}
                                                </p>
                                            )}
                                            {unknown && !isReservedSurfaceName(unknown) && params.length < SURFACE_MAX_PARAMS && (
                                                <SmallButton
                                                    type="button"
                                                    onClick={() =>
                                                        set({
                                                            params: [...params, { name: unknown, value: 1 }],
                                                        })
                                                    }
                                                >
                                                    <Plus aria-hidden="true" />
                                                    Add the parameter {unknown}
                                                </SmallButton>
                                            )}
                                            <p className="hint">
                                                + − * / ^, parentheses and products like 2x or 3(x+1); sin cos tan asin acos atan atan2 sinh cosh tanh exp log
                                                (natural) log10 log2 sqrt cbrt abs floor ceil round sign pow mod hypot min max; pi and e.
                                            </p>
                                        </fieldset>
                                        <fieldset>
                                            <legend>Parameters</legend>
                                            {params.length > 0 && (
                                                <ParamRow
                                                    aria-hidden="true"
                                                    style={{
                                                        color: "#9aa1aa",
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    <span>Name</span>
                                                    <span>Value</span>
                                                    <span>Live value of (optional)</span>
                                                    <span>Field</span>
                                                    <span />
                                                </ParamRow>
                                            )}
                                            {params.map((p, i) => (
                                                <ParamRow key={i}>
                                                    <input
                                                        aria-label={`Name of parameter ${i + 1}`}
                                                        value={p.name}
                                                        maxLength={20}
                                                        onChange={(e) => setParam(i, { name: e.target.value.trim() })}
                                                    />
                                                    <NumberInput
                                                        label={`Value of ${p.name || `parameter ${i + 1}`}`}
                                                        value={p.value}
                                                        onChange={(v) => setParam(i, { value: v ?? 0 })}
                                                    />
                                                    <select
                                                        aria-label={`Topic of ${p.name || `parameter ${i + 1}`}`}
                                                        value={p.topicRef ?? ""}
                                                        onChange={(e) =>
                                                            setParam(
                                                                i,
                                                                e.target.value
                                                                    ? {
                                                                          topicRef: e.target.value,
                                                                          path: p.path ?? "",
                                                                      }
                                                                    : { topicRef: undefined, path: undefined },
                                                            )
                                                        }
                                                    >
                                                        <option value="">Fixed</option>
                                                        {sources.map((t) => (
                                                            <option key={t.ref} value={t.ref}>
                                                                {t.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {p.topicRef ? (
                                                        fieldInput(
                                                            p.topicRef,
                                                            p.path,
                                                            (path) => setParam(i, { path }),
                                                            `Field of ${p.name || `parameter ${i + 1}`}`,
                                                        )
                                                    ) : (
                                                        <span />
                                                    )}
                                                    <button
                                                        type="button"
                                                        aria-label={`Remove ${p.name || `parameter ${i + 1}`}`}
                                                        onClick={() => set({ params: params.filter((_, j) => j !== i) })}
                                                    >
                                                        <Trash2 aria-hidden="true" />
                                                    </button>
                                                </ParamRow>
                                            ))}
                                            {params.length < SURFACE_MAX_PARAMS && (
                                                <SmallButton
                                                    type="button"
                                                    onClick={() =>
                                                        set({
                                                            params: [...params, { name: nextParamName(params), value: 1 }],
                                                        })
                                                    }
                                                >
                                                    <Plus aria-hidden="true" />
                                                    Add parameter
                                                </SmallButton>
                                            )}
                                            <p className="hint">
                                                A parameter with a live value follows the messages of its topic; until the first one arrives it has its own
                                                value.
                                            </p>
                                        </fieldset>
                                    </>
                                ) : (
                                    <fieldset>
                                        <legend>Grid of a message or of the asset state</legend>
                                        <div className="row">
                                            <label>
                                                <span>Topic</span>
                                                <select
                                                    aria-label="Topic of the grid"
                                                    value={draft.topicRef ?? ""}
                                                    onChange={(e) => set({ topicRef: e.target.value })}
                                                >
                                                    {sources.map((t) => (
                                                        <option key={t.ref} value={t.ref}>
                                                            {t.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label>
                                                <span>Field</span>
                                                {fieldInput(draft.topicRef ?? firstTopic, draft.path, (path) => set({ path }), "Field of the grid")}
                                            </label>
                                        </div>
                                        <p className="hint">
                                            The field holds a list of rows, one for each y with a value for each x: <code>[[1, 2, 3], [4, 5, 6]]</code>, or an
                                            object with its axes: <code>{"{ z: [[…], …], x: [0, 0.5, 1], y: [0, 1] }"}</code>. Without x and y, the ranges below
                                            are used. At most {SURFACE_DATA_MAX} × {SURFACE_DATA_MAX} values; a value that is not a number leaves a hole.
                                        </p>
                                    </fieldset>
                                )}

                                <fieldset>
                                    <legend>{draft.mode === "function" ? "Ranges" : "Ranges (when the message has no x and y)"}</legend>
                                    <div className="row">
                                        <label>
                                            <span>x from</span>
                                            <NumberInput label="x from" value={draft.xMin} onChange={(v) => v !== undefined && set({ xMin: v })} />
                                        </label>
                                        <label>
                                            <span>to</span>
                                            <NumberInput label="x to" value={draft.xMax} onChange={(v) => v !== undefined && set({ xMax: v })} />
                                        </label>
                                        <label>
                                            <span>y from</span>
                                            <NumberInput label="y from" value={draft.yMin} onChange={(v) => v !== undefined && set({ yMin: v })} />
                                        </label>
                                        <label>
                                            <span>to</span>
                                            <NumberInput label="y to" value={draft.yMax} onChange={(v) => v !== undefined && set({ yMax: v })} />
                                        </label>
                                    </div>
                                    {draft.mode === "function" && (
                                        <label>
                                            <span>
                                                Resolution: {draft.steps ?? SURFACE_DEFAULT_STEPS} × {draft.steps ?? SURFACE_DEFAULT_STEPS} points
                                            </span>
                                            <input
                                                aria-label="Resolution"
                                                type="range"
                                                min={SURFACE_STEPS_MIN}
                                                max={SURFACE_STEPS_MAX}
                                                step={5}
                                                value={draft.steps ?? SURFACE_DEFAULT_STEPS}
                                                onChange={(e) => set({ steps: Number(e.target.value) })}
                                            />
                                        </label>
                                    )}
                                    <label className="check">
                                        <input
                                            type="checkbox"
                                            checked={draft.zMin !== undefined}
                                            onChange={(e) => set(e.target.checked ? { zMin: -1, zMax: 1 } : { zMin: undefined, zMax: undefined })}
                                        />
                                        Fixed range of z (else it follows the surface)
                                    </label>
                                    {draft.zMin !== undefined && (
                                        <div className="row">
                                            <label>
                                                <span>z from</span>
                                                <NumberInput label="z from" value={draft.zMin} onChange={(v) => v !== undefined && set({ zMin: v })} />
                                            </label>
                                            <label>
                                                <span>to</span>
                                                <NumberInput label="z to" value={draft.zMax} onChange={(v) => v !== undefined && set({ zMax: v })} />
                                            </label>
                                        </div>
                                    )}
                                </fieldset>

                                <fieldset>
                                    <legend>Axes</legend>
                                    <div className="row">
                                        {(["xLabel", "yLabel", "zLabel"] as const).map((key) => (
                                            <label key={key}>
                                                <span>Name of {key[0]}</span>
                                                <input
                                                    aria-label={`Name of the ${key[0]} axis`}
                                                    value={draft[key] ?? ""}
                                                    maxLength={SURFACE_LABEL_MAX}
                                                    placeholder={key[0]}
                                                    onChange={(e) => set({ [key]: e.target.value || undefined })}
                                                />
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>

                                <fieldset>
                                    <legend>Look</legend>
                                    <div className="row">
                                        <label>
                                            <span>Colours</span>
                                            <select
                                                aria-label="Colours"
                                                value={draft.colors ?? "viridis"}
                                                onChange={(e) =>
                                                    set({
                                                        colors: e.target.value as SurfaceOptions["colors"],
                                                    })
                                                }
                                            >
                                                {SURFACE_COLORS.map((c) => (
                                                    <option key={c} value={c}>
                                                        {c}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        {kind === "surface" && (
                                            <label>
                                                <span>Opacity: {Math.round((draft.opacity ?? 1) * 100)}%</span>
                                                <input
                                                    aria-label="Opacity"
                                                    type="range"
                                                    min={0.1}
                                                    max={1}
                                                    step={0.05}
                                                    value={draft.opacity ?? 1}
                                                    onChange={(e) => set({ opacity: Number(e.target.value) })}
                                                />
                                            </label>
                                        )}
                                    </div>
                                    {kind === "surface" && (
                                        <label className="check">
                                            <input type="checkbox" checked={draft.wireframe !== false} onChange={(e) => set({ wireframe: e.target.checked })} />
                                            Wireframe
                                        </label>
                                    )}
                                    {kind === "heatmap" && (
                                        <div className="row">
                                            <label className="check">
                                                <input
                                                    type="checkbox"
                                                    checked={draft.contours !== false}
                                                    onChange={(e) => set({ contours: e.target.checked })}
                                                />
                                                Contour lines
                                            </label>
                                            {draft.contours !== false && (
                                                <label>
                                                    <span>Levels (about)</span>
                                                    <input
                                                        aria-label="Contour levels"
                                                        type="number"
                                                        min={CONTOUR_LEVELS_MIN}
                                                        max={CONTOUR_LEVELS_MAX}
                                                        step={1}
                                                        value={draft.contourLevels ?? CONTOUR_LEVELS_DEFAULT}
                                                        onChange={(e) => {
                                                            const n = Math.round(Number(e.target.value));
                                                            if (Number.isFinite(n))
                                                                set({ contourLevels: Math.min(CONTOUR_LEVELS_MAX, Math.max(CONTOUR_LEVELS_MIN, n)) });
                                                        }}
                                                    />
                                                </label>
                                            )}
                                        </div>
                                    )}
                                </fieldset>
                            </>
                        ) : (
                            <>
                                <fieldset>
                                    <legend>Series</legend>
                                    {series.map((s, i) => (
                                        <SeriesCard key={i}>
                                            <div className="top">
                                                <span>{s.name || `Series ${i + 1}`}</span>
                                                {series.length > 1 && (
                                                    <button
                                                        type="button"
                                                        aria-label={`Remove series ${i + 1}`}
                                                        onClick={() =>
                                                            setAxes({
                                                                series: series.filter((_, j) => j !== i),
                                                            })
                                                        }
                                                    >
                                                        <Trash2 aria-hidden="true" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="row">
                                                <label>
                                                    <span>Source</span>
                                                    <select
                                                        aria-label={`Source of series ${i + 1}`}
                                                        value={s.source}
                                                        onChange={(e) =>
                                                            setSeries(
                                                                i,
                                                                e.target.value === FORMULA_SOURCE
                                                                    ? {
                                                                          source: FORMULA_SOURCE,
                                                                          formula: s.formula ?? defaultFormula(),
                                                                          x: undefined,
                                                                          y: undefined,
                                                                      }
                                                                    : { source: e.target.value, formula: undefined, y: s.y ?? "" },
                                                            )
                                                        }
                                                    >
                                                        {sources.map((t) => (
                                                            <option key={t.ref} value={t.ref}>
                                                                {t.label}
                                                            </option>
                                                        ))}
                                                        {kind === "xy" && <option value={FORMULA_SOURCE}>Formula y = f(x)</option>}
                                                    </select>
                                                </label>
                                                <label>
                                                    <span>Name (optional)</span>
                                                    <input
                                                        aria-label={`Name of series ${i + 1}`}
                                                        value={s.name ?? ""}
                                                        maxLength={DATA_CHART_LABEL_MAX}
                                                        onChange={(e) =>
                                                            setSeries(i, {
                                                                name: e.target.value || undefined,
                                                            })
                                                        }
                                                    />
                                                </label>
                                            </div>
                                            {s.source === FORMULA_SOURCE ? (
                                                <FormulaFields
                                                    index={i}
                                                    formula={s.formula ?? defaultFormula()}
                                                    sources={sources}
                                                    fieldInput={fieldInput}
                                                    onChange={(formula) => setSeries(i, { formula })}
                                                />
                                            ) : (
                                                <div className="row">
                                                    {(kind === "points3d" ? (["x", "y", "z"] as const) : (["x", "y"] as const)).map((axis) => (
                                                        <label key={axis}>
                                                            <span>
                                                                {axis}
                                                                {axis === "x" && kind === "xy" ? " (optional: 0, 1, 2…)" : ""}
                                                            </span>
                                                            {fieldInput(
                                                                s.source,
                                                                s[axis],
                                                                (path) => setSeries(i, { [axis]: path || undefined }),
                                                                `Field ${axis} of series ${i + 1}`,
                                                                axis === "y" ? "e.g. amplitude or points.*.y" : "e.g. freq",
                                                            )}
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="row">
                                                <label>
                                                    <span>Drawn as</span>
                                                    <select
                                                        aria-label={`Style of series ${i + 1}`}
                                                        value={s.style ?? (kind === "points3d" ? "scatter" : "line")}
                                                        onChange={(e) =>
                                                            setSeries(i, {
                                                                style: e.target.value as DataSeries["style"],
                                                            })
                                                        }
                                                    >
                                                        {(kind === "points3d" ? (["scatter", "line"] as const) : DATA_CHART_STYLES).map((style) => (
                                                            <option key={style} value={style}>
                                                                {STYLE_LABELS[style]}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="check" style={{ flex: "0 0 auto" }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={!!s.color}
                                                        onChange={(e) =>
                                                            setSeries(i, {
                                                                color: e.target.checked ? "#5794f2" : undefined,
                                                            })
                                                        }
                                                    />
                                                    Own colour
                                                </label>
                                                {s.color && (
                                                    <label style={{ flex: "0 0 60px", minWidth: 60 }}>
                                                        <span>Colour</span>
                                                        <input
                                                            aria-label={`Colour of series ${i + 1}`}
                                                            type="color"
                                                            value={s.color}
                                                            onChange={(e) => setSeries(i, { color: e.target.value })}
                                                        />
                                                    </label>
                                                )}
                                            </div>
                                        </SeriesCard>
                                    ))}
                                    {series.length < DATA_CHART_MAX_SERIES && (
                                        <SmallButton
                                            type="button"
                                            onClick={() =>
                                                setAxes({
                                                    series: [
                                                        ...series,
                                                        {
                                                            source: series[series.length - 1]?.source ?? firstTopic,
                                                            y: "",
                                                            ...(kind === "points3d" ? { x: "", z: "" } : {}),
                                                        },
                                                    ],
                                                })
                                            }
                                        >
                                            <Plus aria-hidden="true" />
                                            Add series
                                        </SmallButton>
                                    )}
                                    <p className="hint">
                                        Each field holds a list of numbers — <code>{"{ freq: [10, 20, …], amplitude: [0.1, 0.4, …] }"}</code> — or one number.
                                        With a list of objects, <code>points.*.f</code> takes the field <code>f</code> of each one. The data is the last message
                                        of the topic or the current state of the asset; at most {kind === "points3d" ? "5,000" : "10,000"} points a series.
                                        {kind === "xy"
                                            ? " A series can also be a formula y = f(x) — a theoretical curve beside the measured one — with parameters fixed or live."
                                            : ""}
                                    </p>
                                </fieldset>
                                <fieldset>
                                    <legend>Axes</legend>
                                    <div className="row">
                                        {(kind === "points3d" ? (["xLabel", "yLabel", "zLabel"] as const) : (["xLabel", "yLabel"] as const)).map((key) => (
                                            <label key={key}>
                                                <span>Name of {key[0]}</span>
                                                <input
                                                    aria-label={`Name of the ${key[0]} axis`}
                                                    value={chart[key] ?? ""}
                                                    maxLength={DATA_CHART_LABEL_MAX}
                                                    placeholder={key[0]}
                                                    onChange={(e) => setAxes({ [key]: e.target.value || undefined })}
                                                />
                                            </label>
                                        ))}
                                    </div>
                                    {kind === "xy" && (
                                        <>
                                            {(["x", "y"] as const).map((axis) => {
                                                const lo = `${axis}Min` as const;
                                                const hi = `${axis}Max` as const;
                                                const log = `${axis}Log` as const;
                                                return (
                                                    <div className="row" key={axis}>
                                                        <label className="check" style={{ flex: "0 0 auto" }}>
                                                            <input
                                                                type="checkbox"
                                                                aria-label={`Logarithmic ${axis} axis`}
                                                                checked={!!chart[log]}
                                                                onChange={(e) =>
                                                                    setAxes({
                                                                        [log]: e.target.checked || undefined,
                                                                    })
                                                                }
                                                            />
                                                            Log {axis}
                                                        </label>
                                                        <label className="check" style={{ flex: "0 0 auto" }}>
                                                            <input
                                                                type="checkbox"
                                                                aria-label={`Fixed range of ${axis}`}
                                                                checked={chart[lo] !== undefined}
                                                                onChange={(e) =>
                                                                    setAxes(
                                                                        e.target.checked
                                                                            ? {
                                                                                  [lo]: chart[log] ? 1 : 0,
                                                                                  [hi]: chart[log] ? 1000 : 1,
                                                                              }
                                                                            : { [lo]: undefined, [hi]: undefined },
                                                                    )
                                                                }
                                                            />
                                                            Fixed range
                                                        </label>
                                                        {chart[lo] !== undefined && (
                                                            <>
                                                                <label>
                                                                    <span>{axis} from</span>
                                                                    <NumberInput
                                                                        label={`${axis} from`}
                                                                        value={chart[lo]}
                                                                        onChange={(v) => v !== undefined && setAxes({ [lo]: v })}
                                                                    />
                                                                </label>
                                                                <label>
                                                                    <span>to</span>
                                                                    <NumberInput
                                                                        label={`${axis} to`}
                                                                        value={chart[hi]}
                                                                        onChange={(v) => v !== undefined && setAxes({ [hi]: v })}
                                                                    />
                                                                </label>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            <p className="hint">A logarithmic axis leaves out the values of 0 or less.</p>
                                        </>
                                    )}
                                    <label className="check">
                                        <input type="checkbox" checked={chart.legend !== false} onChange={(e) => setAxes({ legend: e.target.checked })} />
                                        Legend (with more than one series)
                                    </label>
                                </fieldset>
                            </>
                        )}
                    </Settings>
                    <Column>
                        <span className="label">
                            Preview (with the last data
                            {kind === "surface" || kind === "points3d" ? "; turn it with the mouse" : ""})
                        </span>
                        <Preview aria-label="Preview">
                            {preview ? (
                                <DataChartView data={preview} store={store} label="Preview of the Data chart" />
                            ) : (
                                <p style={{ margin: 12, color: "#d6a35c", fontSize: 13 }}>{problems[0]}</p>
                            )}
                        </Preview>
                    </Column>
                </Body>
                {problems.length > 0 && (
                    <Help role="status" style={{ color: "#ef8a8a" }}>
                        {problems.join(" · ")}
                    </Help>
                )}
                <Actions>
                    <Secondary type="button" onClick={onDiscard}>
                        Discard
                    </Secondary>
                    <Primary type="submit" disabled={problems.length > 0} style={problems.length ? { opacity: 0.5, cursor: "not-allowed" } : undefined}>
                        Apply
                    </Primary>
                </Actions>
            </Dialog>
        </Backdrop>
    );
};

const STYLE_LABELS: Record<string, string> = {
    line: "Line",
    scatter: "Points",
    bar: "Bars",
    area: "Area",
};

// a series as it is saved: only its fields
const cleanSeries = (kind: DataChartKind, s: DataSeries): DataSeries => {
    if (s.source === FORMULA_SOURCE && s.formula) {
        const formula: DataFormula = { expression: s.formula.expression, xMin: s.formula.xMin, xMax: s.formula.xMax };
        if (s.formula.params?.length) formula.params = s.formula.params;
        if (s.formula.points !== undefined) formula.points = s.formula.points;
        if (s.formula.range) formula.range = s.formula.range;
        const out: DataSeries = { source: FORMULA_SOURCE, formula };
        if (s.name?.trim()) out.name = s.name.trim();
        if (s.style) out.style = s.style;
        if (s.color) out.color = s.color;
        return out;
    }
    const out: DataSeries = { source: s.source, y: s.y };
    if (s.x) out.x = s.x;
    if (kind === "points3d" && s.z) out.z = s.z;
    if (s.name?.trim()) out.name = s.name.trim();
    if (s.style) out.style = kind === "points3d" && s.style !== "line" ? "scatter" : s.style;
    if (s.color) out.color = s.color;
    return out;
};

const defaultFormula = (): DataFormula => ({
    expression: "A*sin(k*x)",
    params: [
        { name: "A", value: 1 },
        { name: "k", value: 1 },
    ],
    xMin: 0,
    xMax: 10,
});

// The formula of a series y = f(x): its expression, its parameters (fixed, or live values of a source), the range of
// x and how many points
const FormulaFields: FC<{
    index: number;
    formula: DataFormula;
    sources: LiveTopic[];
    fieldInput: (topicRef: string, path: string | undefined, onChange: (path: string) => void, label: string) => ReactNode;
    onChange: (formula: DataFormula) => void;
}> = ({ index, formula, sources, fieldInput, onChange }) => {
    const n = index + 1;
    const params = formula.params ?? [];
    const set = (change: Partial<DataFormula>) => onChange({ ...formula, ...change });
    const setParam = (k: number, change: Partial<SurfaceParam>) => set({ params: params.map((p, j) => (j === k ? { ...p, ...change } : p)) });
    const compiled = compileSurfaceExpression(
        formula.expression,
        params.map((p) => p.name),
    );
    const unknown = "error" in compiled ? /^Unknown name "([A-Za-z_][A-Za-z0-9_]*)"/.exec(compiled.error)?.[1] : undefined;
    return (
        <>
            <label>
                <span>y =</span>
                <input
                    aria-label={`Formula of series ${n}`}
                    value={formula.expression}
                    maxLength={SURFACE_EXPRESSION_MAX_LENGTH}
                    spellCheck={false}
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    onChange={(e) => set({ expression: e.target.value })}
                />
            </label>
            {"error" in compiled && (
                <p className="error" role="alert">
                    {compiled.error.replace(": z = f(x, y)", ": y = f(x)")}
                </p>
            )}
            {unknown && !isReservedSurfaceName(unknown) && params.length < SURFACE_MAX_PARAMS && (
                <SmallButton type="button" onClick={() => set({ params: [...params, { name: unknown, value: 1 }] })}>
                    <Plus aria-hidden="true" />
                    Add the parameter {unknown}
                </SmallButton>
            )}
            {params.map((p, k) => (
                <ParamRow key={k}>
                    <input
                        aria-label={`Name of parameter ${k + 1} of series ${n}`}
                        value={p.name}
                        maxLength={20}
                        onChange={(e) => setParam(k, { name: e.target.value.trim() })}
                    />
                    <NumberInput
                        label={`Value of ${p.name || `parameter ${k + 1}`} of series ${n}`}
                        value={p.value}
                        onChange={(v) => setParam(k, { value: v ?? 0 })}
                    />
                    <select
                        aria-label={`Source of ${p.name || `parameter ${k + 1}`} of series ${n}`}
                        value={p.topicRef ?? ""}
                        onChange={(e) =>
                            setParam(k, e.target.value ? { topicRef: e.target.value, path: p.path ?? "" } : { topicRef: undefined, path: undefined })
                        }
                    >
                        <option value="">Fixed</option>
                        {sources.map((t) => (
                            <option key={t.ref} value={t.ref}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                    {p.topicRef ? (
                        fieldInput(p.topicRef, p.path, (path) => setParam(k, { path }), `Field of ${p.name || `parameter ${k + 1}`} of series ${n}`)
                    ) : (
                        <span />
                    )}
                    <button
                        type="button"
                        aria-label={`Remove ${p.name || `parameter ${k + 1}`} of series ${n}`}
                        onClick={() => set({ params: params.filter((_, j) => j !== k) })}
                    >
                        <Trash2 aria-hidden="true" />
                    </button>
                </ParamRow>
            ))}
            {params.length < SURFACE_MAX_PARAMS && (
                <SmallButton type="button" onClick={() => set({ params: [...params, { name: nextParamName(params), value: 1 }] })}>
                    <Plus aria-hidden="true" />
                    Add parameter
                </SmallButton>
            )}
            <div className="row">
                <label>
                    <span>x from</span>
                    <NumberInput label={`x from of series ${n}`} value={formula.xMin} onChange={(v) => v !== undefined && set({ xMin: v })} />
                </label>
                <label>
                    <span>to</span>
                    <NumberInput label={`x to of series ${n}`} value={formula.xMax} onChange={(v) => v !== undefined && set({ xMax: v })} />
                </label>
                <label>
                    <span>Points</span>
                    <NumberInput
                        label={`Points of series ${n}`}
                        step="1"
                        optional
                        value={formula.points ?? DATA_FORMULA_POINTS_DEFAULT}
                        onChange={(v) => set({ points: v === undefined ? undefined : Math.round(v) })}
                    />
                </label>
            </div>
        </>
    );
};

// A, B, C… the first letter not used yet
const nextParamName = (params: SurfaceParam[]) => {
    const used = new Set(params.map((p) => p.name));
    for (const letter of "ABCDFGHJKLMNPQRSTUVW") if (!used.has(letter)) return letter;
    return `p${params.length + 1}`;
};
