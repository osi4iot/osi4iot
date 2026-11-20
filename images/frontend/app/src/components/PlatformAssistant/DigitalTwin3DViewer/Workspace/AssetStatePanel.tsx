// The "Asset state" panel of the Viewer page (assetStatePanel.ts): the current state of the digital twin's asset,
// read again every 5 s while the page is visible, and its editor (the fields shown, the colours of the statuses
// and after how long the state is old).
import { FC, ReactNode, useEffect, useId, useMemo, useState } from "react";
import styled from "styled-components";
import { Activity, Plus, Trash2, X } from "lucide-react";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { EditorParts } from "./MarkdownPanel";
import { TONE_COLORS, timeAgo, clockTime } from "./historyPanels";
import {
    ASSET_STATE_LABEL_MAX,
    ASSET_STATE_MAX_COLORS,
    ASSET_STATE_MAX_FIELDS,
    ASSET_STATE_MAX_STALE_MINUTES,
    ASSET_STATE_REFRESH_MS,
    AssetStateField,
    AssetStateSettings,
    AssetStateView,
    assetStateSettingsProblems,
    descriptionOf,
    formatStateValue,
    isStale,
    projectedEntries,
    statePaths,
    statusColors,
    statusOf,
    valueAtStatePath,
} from "./assetStatePanel";
import { AssetStateLoader } from "./assetStateApi";
import { WorkspacePanel } from "./workspaceLayout";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

// ---------------------------------------------------------------------------------------------------------
// Reading the state

// The state of the twin's asset, read now and every ASSET_STATE_REFRESH_MS while the page is visible
export const useAssetState = (load: AssetStateLoader | undefined, groupId: number, digitalTwinId: number, paused = false) => {
    const [view, setView] = useState<AssetStateView | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (paused || !load) return;
        let controller: AbortController | null = null;
        let cancelled = false;
        const read = async () => {
            if (typeof document !== "undefined" && document.hidden) return;
            controller?.abort();
            controller = new AbortController();
            try {
                const result = await load(groupId, digitalTwinId, controller.signal);
                if (cancelled) return;
                setView(result);
                setError(null);
            } catch (err: any) {
                if (cancelled || err?.name === "CanceledError" || err?.name === "AbortError") return;
                setError(err?.response?.data?.message || err?.message || "The state could not be read");
            }
        };
        read();
        const timer = window.setInterval(read, ASSET_STATE_REFRESH_MS);
        const onVisible = () => {
            if (!document.hidden) read();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelled = true;
            controller?.abort();
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [load, groupId, digitalTwinId, paused]);
    return { view, error };
};

// ---------------------------------------------------------------------------------------------------------
// The panel

const Wrap = styled.div`
    position: absolute;
    inset: 0;
    overflow-y: auto;
    padding: 10px 12px 12px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font: 400 13px ${font};
    color: #e6e8eb;
    ${scrollbarStyle}
`;

const Top = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
`;

const Badge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 0 12px;
    border-radius: 14px;
    border: 1px solid;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.02em;
`;

const Dot = styled.span`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
`;

const Updated = styled.span<{ $stale: boolean }>`
    margin-left: auto;
    font-size: 12px;
    color: ${({ $stale }) => ($stale ? TONE_COLORS.warning.fg : "#7d848d")};
    white-space: nowrap;
`;

const Description = styled.p`
    margin: 0;
    color: #c7cbd1;
    line-height: 1.4;
`;

const Fields = styled.dl`
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;

    div {
        min-width: 0;
        padding: 8px 10px;
        background: #141619;
        border: 1px solid #262a2f;
        border-radius: 8px;
    }
    dt {
        margin-bottom: 4px;
        color: #9aa1aa;
        font-size: 11px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    dd {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        word-break: break-word;
    }
    dd small {
        margin-left: 4px;
        color: #9aa1aa;
        font-size: 12px;
        font-weight: 500;
    }
`;

const Section = styled.section`
    h3 {
        margin: 0 0 6px;
        color: #9aa1aa;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    li {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px;
        background: #141619;
        border: 1px solid #262a2f;
        border-radius: 8px;
    }
    li > span:first-child {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    li small {
        color: #9aa1aa;
        font-size: 12px;
        white-space: nowrap;
    }
`;

const Pill = styled.span`
    flex: none;
    padding: 1px 8px;
    border-radius: 10px;
    border: 1px solid;
    font-size: 11px;
    font-weight: 700;
`;

const Raw = styled.details`
    summary {
        color: #7d848d;
        font-size: 12px;
        cursor: pointer;
    }
    pre {
        margin: 6px 0 0;
        padding: 8px;
        max-height: 260px;
        overflow: auto;
        background: #0e1013;
        border: 1px solid #262a2f;
        border-radius: 8px;
        color: #c7cbd1;
        font: 400 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
        ${scrollbarStyle}
    }
`;

const Muted = styled.p<{ $error?: boolean }>`
    margin: 0;
    font-size: 12px;
    color: ${({ $error }) => ($error ? "#ff7383" : "#7d848d")};
`;

const StatusBadge: FC<{ status: string; colors?: Record<string, string>; small?: boolean }> = ({ status, colors, small }) => {
    const c = statusColors(status, colors);
    const style = { color: c.fg, background: c.bg, borderColor: c.border };
    return small ? (
        <Pill style={style}>{status}</Pill>
    ) : (
        <Badge style={style}>
            <Dot aria-hidden="true" />
            {status}
        </Badge>
    );
};

export interface AssetStateContentProps {
    view: AssetStateView | null;
    error?: string | null;
    settings: AssetStateSettings;
    now?: number;
}

// What the panel shows of a state (also the preview of the editor)
export const AssetStateContent: FC<AssetStateContentProps> = ({ view, error, settings, now = Date.now() }) => {
    if (!view) return <Wrap>{error ? <Muted $error>{error}</Muted> : <Muted>Reading the state…</Muted>}</Wrap>;
    const { state } = view;
    const status = statusOf(state);
    const description = descriptionOf(state);
    const alarms = projectedEntries(state, "alarms");
    const machines = projectedEntries(state, "machines");
    const stale = isStale(view.lastUpdated, settings.staleMinutes, now);
    const fields = settings.stateFields ?? [];
    return (
        <Wrap>
            <Top>
                <StatusBadge status={status} colors={settings.statusColors} />
                {view.description && <span style={{ color: "#9aa1aa" }}>{view.description}</span>}
                <Updated $stale={stale} title={view.lastUpdated ? clockTime(view.lastUpdated, now) : undefined}>
                    {view.lastUpdated ? `${stale ? "No changes since " : "Updated "}${timeAgo(view.lastUpdated, now)}` : "Never written"}
                </Updated>
            </Top>
            {description && <Description>{description}</Description>}
            {error && <Muted $error>{error} (showing the last state read)</Muted>}
            {fields.length > 0 && (
                <Fields>
                    {fields.map((f) => {
                        const value = valueAtStatePath(state, f.path);
                        return (
                            <div key={f.path} title={f.path}>
                                <dt>{f.label || f.path}</dt>
                                <dd>
                                    {formatStateValue(value)}
                                    {f.unit && value !== undefined && <small>{f.unit}</small>}
                                </dd>
                            </div>
                        );
                    })}
                </Fields>
            )}
            {alarms.length > 0 && (
                <Section aria-label="Alarms">
                    <h3>Alarms ({alarms.length})</h3>
                    <ul>
                        {alarms.map((a) => (
                            <li key={a.id}>
                                <span title={a.name}>{a.name}</span>
                                {a.value && <small>{a.value}</small>}
                                {a.level && <StatusBadge status={a.level} small />}
                            </li>
                        ))}
                    </ul>
                </Section>
            )}
            {machines.length > 0 && (
                <Section aria-label="Machines">
                    <h3>Machines</h3>
                    <ul>
                        {machines.map((m) => (
                            <li key={m.id}>
                                <span title={m.name}>{m.name}</span>
                                {m.since && <small>since {clockTime(m.since, now)}</small>}
                                {m.state && <Pill style={{ color: "#c7cbd1", borderColor: "#3a4048" }}>{m.state}</Pill>}
                            </li>
                        ))}
                    </ul>
                </Section>
            )}
            <Raw>
                <summary>Full state (JSON)</summary>
                <pre>{JSON.stringify(state, null, 2)}</pre>
            </Raw>
        </Wrap>
    );
};

export interface AssetStatePanelProps {
    panel: WorkspacePanel;
    groupId: number;
    digitalTwinId: number;
    load: AssetStateLoader;
    paused?: boolean;
}

export const settingsOfPanel = (panel: WorkspacePanel): AssetStateSettings => ({
    stateFields: panel.stateFields,
    statusColors: panel.statusColors,
    staleMinutes: panel.staleMinutes,
});

const AssetStatePanel: FC<AssetStatePanelProps> = ({ panel, groupId, digitalTwinId, load, paused = false }) => {
    const { view, error } = useAssetState(load, groupId, digitalTwinId, paused);
    // "updated … ago" moves on between readings
    const [, setTick] = useState(0);
    useEffect(() => {
        if (paused) return;
        const timer = window.setInterval(() => setTick((n) => n + 1), ASSET_STATE_REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [paused]);
    return <AssetStateContent view={view} error={error} settings={settingsOfPanel(panel)} now={Date.now()} />;
};

export default AssetStatePanel;

// ---------------------------------------------------------------------------------------------------------
// The editor

const { Backdrop, Dialog, Head, Body, Column, Preview, Help, Actions, Secondary, Primary, Close } = EditorParts;

const Settings = styled.div`
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-right: 4px;
    ${scrollbarStyle}
`;

const Rows = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const Row = styled.div<{ $cols: string }>`
    display: grid;
    grid-template-columns: ${({ $cols }) => $cols};
    gap: 6px;
    align-items: center;

    input {
        width: 100%;
        min-width: 0;
    }
`;

const IconButton = styled.button`
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid #2c3137;
    border-radius: 8px;
    color: #c7cbd1;
    cursor: pointer;

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    svg {
        width: 15px;
        height: 15px;
    }
`;

const AddButton = styled.button`
    align-self: flex-start;
    height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    background: #1b1e22;
    border: 1px solid #2c3137;
    border-radius: 8px;
    color: #d5d9de;
    font: 500 12px ${font};
    cursor: pointer;

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    svg {
        width: 14px;
        height: 14px;
    }
`;

const Problems = styled.ul`
    margin: 0;
    padding-left: 18px;
    color: #ff8a95;
    font-size: 12px;
`;

const Group: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
    <div>
        <span className="label">{title}</span>
        {children}
    </div>
);

export interface AssetStateEditorProps {
    panel: WorkspacePanel;
    groupId: number;
    digitalTwinId: number;
    load: AssetStateLoader;
    onApply: (panel: WorkspacePanel) => void;
    onDiscard: () => void;
}

interface ColorRow {
    status: string;
    color: string;
}

export const AssetStateEditor: FC<AssetStateEditorProps> = ({ panel, groupId, digitalTwinId, load, onApply, onDiscard }) => {
    const titleId = useId();
    const pathsId = useId();
    const [title, setTitle] = useState(panel.title ?? "");
    const [fields, setFields] = useState<AssetStateField[]>(panel.stateFields ?? []);
    const [colors, setColors] = useState<ColorRow[]>(() => Object.entries(panel.statusColors ?? {}).map(([status, color]) => ({ status, color })));
    const [stale, setStale] = useState(panel.staleMinutes ? String(panel.staleMinutes) : "");
    // the current state: the preview, and the paths it has to choose the fields
    const { view, error } = useAssetState(load, groupId, digitalTwinId);
    const offered = useMemo(() => (view ? statePaths(view.state) : []), [view]);

    const settings: AssetStateSettings = useMemo(() => {
        const s: AssetStateSettings = {};
        const chosen = fields.map((f) => ({ ...f, path: f.path.trim() })).filter((f) => f.path);
        if (chosen.length) s.stateFields = chosen;
        const c = Object.fromEntries(colors.filter((r) => r.status.trim()).map((r) => [r.status.trim(), r.color.trim()]));
        if (Object.keys(c).length) s.statusColors = c;
        if (stale.trim()) s.staleMinutes = Number(stale);
        return s;
    }, [fields, colors, stale]);
    const problems = useMemo(() => {
        const list = assetStateSettingsProblems(settings);
        const names = colors.map((r) => r.status.trim()).filter(Boolean);
        if (new Set(names).size !== names.length) list.push("A status has two colours");
        return list;
    }, [settings, colors]);

    const setField = (i: number, change: Partial<AssetStateField>) =>
        setFields((list) => list.map((f, j) => (j === i ? { ...f, ...change } : f)));
    const setColor = (i: number, change: Partial<ColorRow>) => setColors((list) => list.map((r, j) => (j === i ? { ...r, ...change } : r)));

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
                    const next: WorkspacePanel = { ...panel };
                    delete next.stateFields;
                    delete next.statusColors;
                    delete next.staleMinutes;
                    Object.assign(next, settings);
                    if (!next.staleMinutes) delete next.staleMinutes;
                    if (title.trim()) next.title = title.trim().slice(0, 80);
                    else delete next.title;
                    onApply(next);
                }}
            >
                <Head>
                    <h2 id={titleId}>
                        <Activity aria-hidden="true" />
                        Edit asset state
                    </h2>
                    <Close type="button" aria-label="Discard the changes" onClick={onDiscard}>
                        <X aria-hidden="true" />
                    </Close>
                </Head>
                <label>
                    <span>Title (optional)</span>
                    <input value={title} maxLength={80} placeholder="Asset state" onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
                </label>
                <Body style={{ gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)" }}>
                    <Settings>
                        <Group title={`Fields (${fields.length}/${ASSET_STATE_MAX_FIELDS})`}>
                            <Rows>
                                {fields.map((f, i) => (
                                    <Row key={i} $cols="minmax(0, 1.4fr) minmax(0, 1fr) 80px 34px">
                                        <input
                                            aria-label={`Path of field ${i + 1}`}
                                            placeholder="production.speed"
                                            list={pathsId}
                                            value={f.path}
                                            maxLength={200}
                                            onChange={(e) => setField(i, { path: e.target.value })}
                                        />
                                        <input
                                            aria-label={`Label of field ${i + 1}`}
                                            placeholder="Label"
                                            value={f.label ?? ""}
                                            maxLength={ASSET_STATE_LABEL_MAX}
                                            onChange={(e) => setField(i, { label: e.target.value })}
                                        />
                                        <input
                                            aria-label={`Unit of field ${i + 1}`}
                                            placeholder="Unit"
                                            value={f.unit ?? ""}
                                            maxLength={ASSET_STATE_LABEL_MAX}
                                            onChange={(e) => setField(i, { unit: e.target.value })}
                                        />
                                        <IconButton type="button" aria-label={`Remove field ${i + 1}`} onClick={() => setFields((list) => list.filter((_, j) => j !== i))}>
                                            <Trash2 aria-hidden="true" />
                                        </IconButton>
                                    </Row>
                                ))}
                                <AddButton type="button" disabled={fields.length >= ASSET_STATE_MAX_FIELDS} onClick={() => setFields((list) => [...list, { path: "" }])}>
                                    <Plus aria-hidden="true" />
                                    Add field
                                </AddButton>
                            </Rows>
                            <datalist id={pathsId}>
                                {offered.map((p) => (
                                    <option key={p} value={p} />
                                ))}
                            </datalist>
                            <Help style={{ marginTop: 6 }}>
                                A path of the state: keys separated by dots, and the position of an item of a list (<code>lots.0.id</code>).
                                {offered.length > 0 ? " The paths of the current state are offered as you type." : ""}
                            </Help>
                        </Group>
                        <Group title={`Status colours (${colors.length}/${ASSET_STATE_MAX_COLORS})`}>
                            <Rows>
                                {colors.map((r, i) => (
                                    <Row key={i} $cols="minmax(0, 1fr) 34px minmax(0, 1fr) 34px">
                                        <input aria-label={`Status ${i + 1}`} placeholder="Running" value={r.status} maxLength={40} onChange={(e) => setColor(i, { status: e.target.value })} />
                                        <input
                                            type="color"
                                            aria-label={`Colour picker of status ${i + 1}`}
                                            value={/^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : "#3d82f0"}
                                            onChange={(e) => setColor(i, { color: e.target.value })}
                                            style={{ padding: 2 }}
                                        />
                                        <input aria-label={`Colour of status ${i + 1}`} placeholder="#3d82f0" value={r.color} maxLength={40} onChange={(e) => setColor(i, { color: e.target.value })} />
                                        <IconButton type="button" aria-label={`Remove colour ${i + 1}`} onClick={() => setColors((list) => list.filter((_, j) => j !== i))}>
                                            <Trash2 aria-hidden="true" />
                                        </IconButton>
                                    </Row>
                                ))}
                                <AddButton
                                    type="button"
                                    disabled={colors.length >= ASSET_STATE_MAX_COLORS}
                                    onClick={() => setColors((list) => [...list, { status: "", color: "#3d82f0" }])}
                                >
                                    <Plus aria-hidden="true" />
                                    Add colour
                                </AddButton>
                            </Rows>
                            <Help style={{ marginTop: 6 }}>
                                By default <code>OK</code> is green, <code>Warning</code> amber, <code>Alarm</code> red and any other status grey. Give a colour to
                                the statuses your pipelines set (e.g. <code>Running</code>, <code>Stopped</code>).
                            </Help>
                        </Group>
                        <label>
                            <span>Old after (minutes, empty: never)</span>
                            <input
                                type="number"
                                min={0}
                                max={ASSET_STATE_MAX_STALE_MINUTES}
                                step={1}
                                value={stale}
                                onChange={(e) => setStale(e.target.value)}
                                style={{ width: 140 }}
                            />
                        </label>
                        <Help>When the state has not been written for longer, the panel says since when it has not changed.</Help>
                        {problems.length > 0 && (
                            <Problems>
                                {problems.map((p) => (
                                    <li key={p}>{p}</li>
                                ))}
                            </Problems>
                        )}
                    </Settings>
                    <Column>
                        <span className="label">Preview (the current state)</span>
                        <Preview>
                            <AssetStateContent view={view} error={error} settings={problems.length ? settingsOfPanel(panel) : settings} />
                        </Preview>
                    </Column>
                </Body>
                <Actions>
                    <Secondary type="button" onClick={onDiscard}>
                        Cancel
                    </Secondary>
                    <Primary type="submit" disabled={problems.length > 0} style={problems.length ? { opacity: 0.5, cursor: "not-allowed" } : undefined}>
                        Apply
                    </Primary>
                </Actions>
            </Dialog>
        </Backdrop>
    );
};
