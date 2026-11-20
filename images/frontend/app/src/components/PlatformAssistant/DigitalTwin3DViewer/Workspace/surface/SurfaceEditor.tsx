// The editor of a 3D Surface panel: a formula z = f(x, y) with its parameters (fixed, or values of the NATS
// messages) over a range of x and y, or a grid of values that a message carries; the names of the axes and how it
// looks. The preview draws the surface as it is being edited, with the last values of the messages.
import { FC, useEffect, useId, useMemo, useState } from "react";
import styled from "styled-components";
import { Axis3d, Plus, Trash2, X } from "lucide-react";
import { scrollbarStyle } from "../../../../Tools/FormTools";
import { EditorParts } from "../MarkdownPanel";
import { LiveTopic, LiveValueStore, useLiveTick } from "../liveValues";
import { WorkspacePanel } from "../workspaceLayout";
import { SURFACE_EXPRESSION_MAX_LENGTH, compileSurfaceExpression, isReservedSurfaceName } from "./surfaceExpression";
import {
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
} from "./surfacePanel";
import { SurfaceView } from "./SurfacePanel";

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
const NumberInput: FC<{ label: string; value: number | undefined; onChange: (value: number | undefined) => void; optional?: boolean; step?: string }> = ({
    label,
    value,
    onChange,
    optional,
    step = "any",
}) => {
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

export interface SurfaceEditorProps {
    panel: WorkspacePanel;
    store?: LiveValueStore;
    // the topics whose values can be followed (dev2pdb with their sensors' fields, dtm2sim, dev2sim)
    topics: LiveTopic[];
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
        const compiled = compileSurfaceExpression(s.expression ?? "", (s.params ?? []).map((p) => p.name));
        if ("error" in compiled) problems.push(compiled.error);
    } else if (!s.topicRef || !s.path) problems.push("Choose the topic and the field of the grid");
    return problems;
};

export const SurfaceEditor: FC<SurfaceEditorProps> = ({ panel, store, topics, onApply, onDiscard }) => {
    const titleId = useId();
    const [title, setTitle] = useState(panel.title ?? "");
    const [draft, setDraft] = useState<SurfaceOptions>(() => panel.surface ?? defaultSurface());
    const set = (change: Partial<SurfaceOptions>) => setDraft((d) => ({ ...d, ...change }));
    const params = draft.params ?? [];
    const setParam = (index: number, change: Partial<SurfaceParam>) =>
        set({ params: params.map((p, i) => (i === index ? { ...p, ...change } : p)) });
    const problems = useMemo(() => surfaceProblems(draft), [draft]);
    const compiled = useMemo(() => (draft.mode === "function" ? compileSurfaceExpression(draft.expression ?? "", params.map((p) => p.name)) : null), [draft.mode, draft.expression, params]);
    const unknown = compiled && "error" in compiled ? /^Unknown name "([A-Za-z_][A-Za-z0-9_]*)"/.exec(compiled.error)?.[1] : undefined;
    // the fields of a topic: its sensors' (dev2pdb), or those seen in its messages
    const tick = useLiveTick(store, topics.map((t) => t.ref), 1000);
    const fieldsOf = useMemo(
        () => (topicRef: string) => {
            const known = topics.find((t) => t.ref === topicRef)?.fields;
            return known && known.length ? known.map((f) => ({ path: f.path, label: `${f.label}${f.units && f.units !== "-" ? ` (${f.units})` : ""}` })) : (store?.fields(topicRef) ?? []).map((path) => ({ path, label: path }));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [topics, store, tick],
    );
    const firstTopic = topics.find((t) => t.ref === "dtm2sim")?.ref ?? topics[0]?.ref ?? "dtm2sim";
    const preview = problems.length === 0 ? draft : undefined;

    const fieldInput = (topicRef: string, path: string | undefined, onChange: (path: string) => void, label: string) => {
        const listId = `${titleId}-${label.replace(/\W+/g, "_")}`;
        const fields = fieldsOf(topicRef);
        return (
            <>
                <input aria-label={label} list={listId} value={path ?? ""} placeholder="field (e.g. load or fem.grid)" onChange={(e) => onChange(e.target.value.trim())} />
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
                    const surface: SurfaceOptions = { ...draft };
                    if (surface.mode === "function") {
                        delete surface.topicRef;
                        delete surface.path;
                    } else {
                        delete surface.expression;
                        delete surface.params;
                        delete surface.steps;
                    }
                    const next: WorkspacePanel = { ...panel, surface };
                    if (title.trim()) next.title = title.trim().slice(0, 80);
                    else delete next.title;
                    onApply(next);
                }}
            >
                <Head>
                    <h2 id={titleId}>
                        <Axis3d aria-hidden="true" />
                        Edit 3D Surface
                    </h2>
                    <Close type="button" aria-label="Discard the changes" onClick={onDiscard}>
                        <X aria-hidden="true" />
                    </Close>
                </Head>
                <label>
                    <span>Title (optional)</span>
                    <input value={title} maxLength={80} placeholder="3D Surface" onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
                </label>
                <Body style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.15fr)" }}>
                    <Settings>
                        <Modes role="radiogroup" aria-label="Kind of surface">
                            <label>
                                <input type="radio" name={`${titleId}-mode`} checked={draft.mode === "function"} onChange={() => set({ mode: "function", expression: draft.expression ?? "A*sin(k*x)*cos(k*y)", params: draft.params ?? defaultSurface().params, steps: draft.steps ?? SURFACE_DEFAULT_STEPS })} />
                                A formula z = f(x, y)
                            </label>
                            <label>
                                <input type="radio" name={`${titleId}-mode`} checked={draft.mode === "data"} onChange={() => set({ mode: "data", topicRef: draft.topicRef ?? firstTopic })} />
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
                                            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
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
                                        <SmallButton type="button" onClick={() => set({ params: [...params, { name: unknown, value: 1 }] })}>
                                            <Plus aria-hidden="true" />
                                            Add the parameter {unknown}
                                        </SmallButton>
                                    )}
                                    <p className="hint">
                                        + − * / ^, parentheses and products like 2x or 3(x+1); sin cos tan asin acos atan atan2 sinh cosh tanh exp log (natural) log10 log2 sqrt cbrt abs floor
                                        ceil round sign pow mod hypot min max; pi and e.
                                    </p>
                                </fieldset>
                                <fieldset>
                                    <legend>Parameters</legend>
                                    {params.length > 0 && (
                                        <ParamRow aria-hidden="true" style={{ color: "#9aa1aa", fontSize: 12, fontWeight: 600 }}>
                                            <span>Name</span>
                                            <span>Value</span>
                                            <span>Live value of (optional)</span>
                                            <span>Field</span>
                                            <span />
                                        </ParamRow>
                                    )}
                                    {params.map((p, i) => (
                                        <ParamRow key={i}>
                                            <input aria-label={`Name of parameter ${i + 1}`} value={p.name} maxLength={20} onChange={(e) => setParam(i, { name: e.target.value.trim() })} />
                                            <NumberInput label={`Value of ${p.name || `parameter ${i + 1}`}`} value={p.value} onChange={(v) => setParam(i, { value: v ?? 0 })} />
                                            <select
                                                aria-label={`Topic of ${p.name || `parameter ${i + 1}`}`}
                                                value={p.topicRef ?? ""}
                                                onChange={(e) => setParam(i, e.target.value ? { topicRef: e.target.value, path: p.path ?? "" } : { topicRef: undefined, path: undefined })}
                                            >
                                                <option value="">Fixed</option>
                                                {topics.map((t) => (
                                                    <option key={t.ref} value={t.ref}>
                                                        {t.label}
                                                    </option>
                                                ))}
                                            </select>
                                            {p.topicRef ? fieldInput(p.topicRef, p.path, (path) => setParam(i, { path }), `Field of ${p.name || `parameter ${i + 1}`}`) : <span />}
                                            <button type="button" aria-label={`Remove ${p.name || `parameter ${i + 1}`}`} onClick={() => set({ params: params.filter((_, j) => j !== i) })}>
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
                                    <p className="hint">
                                        A parameter with a live value follows the messages of its topic; until the first one arrives it has its own value.
                                    </p>
                                </fieldset>
                            </>
                        ) : (
                            <fieldset>
                                <legend>Grid of a message</legend>
                                <div className="row">
                                    <label>
                                        <span>Topic</span>
                                        <select aria-label="Topic of the grid" value={draft.topicRef ?? ""} onChange={(e) => set({ topicRef: e.target.value })}>
                                            {topics.map((t) => (
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
                                    The field holds a list of rows, one for each y with a value for each x: <code>[[1, 2, 3], [4, 5, 6]]</code>, or an object with its axes:{" "}
                                    <code>{"{ z: [[…], …], x: [0, 0.5, 1], y: [0, 1] }"}</code>. Without x and y, the ranges below are used. At most {SURFACE_DATA_MAX} × {SURFACE_DATA_MAX}{" "}
                                    values; a value that is not a number leaves a hole.
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
                                <input type="checkbox" checked={draft.zMin !== undefined} onChange={(e) => set(e.target.checked ? { zMin: -1, zMax: 1 } : { zMin: undefined, zMax: undefined })} />
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
                                    <select aria-label="Colours" value={draft.colors ?? "viridis"} onChange={(e) => set({ colors: e.target.value as SurfaceOptions["colors"] })}>
                                        {SURFACE_COLORS.map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    <span>Opacity: {Math.round((draft.opacity ?? 1) * 100)}%</span>
                                    <input aria-label="Opacity" type="range" min={0.1} max={1} step={0.05} value={draft.opacity ?? 1} onChange={(e) => set({ opacity: Number(e.target.value) })} />
                                </label>
                            </div>
                            <label className="check">
                                <input type="checkbox" checked={draft.wireframe !== false} onChange={(e) => set({ wireframe: e.target.checked })} />
                                Wireframe
                            </label>
                        </fieldset>
                    </Settings>
                    <Column>
                        <span className="label">Preview (with the last values; turn it with the mouse)</span>
                        <Preview aria-label="Preview">
                            {preview ? <SurfaceView surface={preview} store={store} label="Preview of the 3D Surface" /> : <p style={{ margin: 12, color: "#d6a35c", fontSize: 13 }}>{problems[0]}</p>}
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

// A, B, C… the first letter not used yet
const nextParamName = (params: SurfaceParam[]) => {
    const used = new Set(params.map((p) => p.name));
    for (const letter of "ABCDFGHJKLMNPQRSTUVW") if (!used.has(letter)) return letter;
    return `p${params.length + 1}`;
};
