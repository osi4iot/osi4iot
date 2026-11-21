// The panels of a group's control room (controlRoom.ts): the Asset state panel as a table of all the assets of the
// group, the Health panel (each digital twin's pipeline, the last data of each asset, its devices and S3 archives)
// and the Pipeline logs panel (what the pipelines of the group's digital twins logged in the last days and log now;
// only for the editors and administrators of the group). The data comes from admin_api (every 30 s, and at once when
// pipelines says that a state changed); the pipelines' status and logs, by NATS while the page is open; the kept
// logs, from admin_api when the panel opens or its level changes.
import { FC, Fragment, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { ChevronDown, ChevronRight } from "lucide-react";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { TONE_COLORS, timeAgo, clockTime } from "./historyPanels";
import {
    AssetStateSettings,
    descriptionOf,
    formatStateValue,
    isStale,
    projectedEntries,
    statusColors,
    statusOf,
    valueAtStatePath,
} from "./assetStatePanel";
import { AssetStateContent, AssetStateEditor, AssetStateEditorProps } from "./AssetStatePanel";
import {
    ControlRoomData,
    ControlRoomLoader,
    ControlRoomLogsLoader,
    LogLevelFilter,
    PipelineLogEvent,
    PipelineStatusSeen,
    addLogEvent,
    devicesAlive,
    formatBytes,
    groupStatePaths,
    isDataStale,
    logEventOf,
    mergeLogEvents,
    passesLevel,
    pipelineStatusText,
    serverLevelsOf,
    sortByAttention,
} from "./controlRoom";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

// reads again this often (and at once when pipelines says a state changed)
export const CONTROL_ROOM_REFRESH_MS = 30_000;

// subscribes to a subject (wildcards allowed) with the decoded JSON of each message; returns how to stop
export type SubjectListener = (subject: string, onMessage: (data: unknown) => void) => () => void;

export interface ControlRoomLive {
    groupUid?: string;
    listen?: SubjectListener;
}

// The data of the control room, the pipelines' status and logs
export const useControlRoom = (
    load: ControlRoomLoader | undefined,
    groupId: number,
    digitalTwinId: number,
    paused = false,
    live?: ControlRoomLive,
    { statuses = false, logs = false }: { statuses?: boolean; logs?: boolean } = {},
) => {
    const [data, setData] = useState<ControlRoomData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [changes, setChanges] = useState(0);
    const [statusMap, setStatusMap] = useState<Record<number, PipelineStatusSeen>>({});
    const [events, setEvents] = useState<PipelineLogEvent[]>([]);
    const since = useRef(Date.now());
    const nextId = useRef(1);
    const listen = live?.listen;
    const groupUid = live?.groupUid;

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
                setData(result);
                setError(null);
            } catch (err: any) {
                if (cancelled || err?.name === "CanceledError" || err?.name === "AbortError") return;
                setError(err?.response?.data?.message || err?.message || "The control room could not be read");
            }
        };
        read();
        const timer = window.setInterval(read, CONTROL_ROOM_REFRESH_MS);
        return () => {
            cancelled = true;
            controller?.abort();
            window.clearInterval(timer);
        };
    }, [load, groupId, digitalTwinId, paused, changes]);

    // a state changed: read again (once for a burst of changes)
    useEffect(() => {
        if (paused || !listen || !groupUid) return;
        let timer: number | undefined;
        const stop = listen(`assetstate.Group_${groupUid}.*`, () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setChanges((n) => n + 1), 500);
        });
        return () => {
            window.clearTimeout(timer);
            stop();
        };
    }, [paused, listen, groupUid]);

    const twins = useMemo(
        () => (data?.assets ?? []).flatMap((a) => a.digitalTwins.map((t) => ({ twin: t, asset: a.description }))),
        [data],
    );
    const statusKey = twins.map((t) => `${t.twin.id}=${t.twin.statusSubject}`).join("|");
    const logKey = twins.map((t) => `${t.twin.id}=${t.twin.logSubject}`).join("|");

    useEffect(() => {
        if (!statuses || paused || !listen || !statusKey) return;
        const stops = twins
            .filter((t) => t.twin.statusSubject)
            .map(({ twin }) =>
                listen(twin.statusSubject, (message) => {
                    const status = (message as { pipelineStatus?: unknown } | null)?.pipelineStatus;
                    if (typeof status !== "string") return;
                    setStatusMap((m) => ({ ...m, [twin.id]: { status, at: Date.now() } }));
                }),
            );
        return () => stops.forEach((stop) => stop());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statuses, paused, listen, statusKey]);

    useEffect(() => {
        if (!logs || paused || !listen || !logKey) return;
        const stops = twins
            .filter((t) => t.twin.logSubject)
            .map(({ twin, asset }) =>
                listen(twin.logSubject, (message) => {
                    const event = logEventOf(message, twin, asset, nextId.current++, Date.now());
                    if (event) setEvents((list) => addLogEvent(list, event));
                }),
            );
        return () => stops.forEach((stop) => stop());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [logs, paused, listen, logKey]);

    return { data, error, statuses: statusMap, events, since: since.current };
};

// the clock of the panels: "… ago" moves on
const useNow = (paused: boolean, every = 5_000) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (paused) return;
        const timer = window.setInterval(() => setNow(Date.now()), every);
        return () => window.clearInterval(timer);
    }, [paused, every]);
    return now;
};

// ---------------------------------------------------------------------------------------------------------
// Shared styles

const Wrap = styled.div`
    position: absolute;
    inset: 0;
    overflow: auto;
    padding: 8px 10px 10px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font: 400 13px ${font};
    color: #e6e8eb;
    ${scrollbarStyle}
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;

    th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: #181b1f;
        color: #9aa1aa;
        font-size: 11px;
        font-weight: 600;
        text-align: left;
        padding: 6px 8px;
        border-bottom: 1px solid #2c3137;
        white-space: nowrap;
    }
    td {
        padding: 6px 8px;
        border-bottom: 1px solid #22262b;
        vertical-align: top;
    }
    tr.row {
        cursor: pointer;
    }
    tr.row:hover td {
        background: rgba(255, 255, 255, 0.03);
    }
    td.detail {
        position: relative;
        height: 280px;
        padding: 0;
        background: #111316;
    }
    .muted {
        color: #7d848d;
    }
    .nowrap {
        white-space: nowrap;
    }
    svg {
        width: 14px;
        height: 14px;
        vertical-align: -2px;
    }
`;

const Pill = styled.span`
    display: inline-block;
    padding: 1px 8px;
    border-radius: 10px;
    border: 1px solid;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
`;

const Muted = styled.p<{ $error?: boolean }>`
    margin: 0;
    font-size: 12px;
    color: ${({ $error }) => ($error ? "#ff7383" : "#7d848d")};
`;

const tonePill = (tone: keyof typeof TONE_COLORS, text: string) => {
    const c = TONE_COLORS[tone];
    return <Pill style={{ color: c.fg, background: c.bg, borderColor: c.border }}>{text}</Pill>;
};

const Waiting: FC<{ error: string | null }> = ({ error }) => (
    <Wrap>{error ? <Muted $error>{error}</Muted> : <Muted>Reading the control room…</Muted>}</Wrap>
);

// ---------------------------------------------------------------------------------------------------------
// Asset state, as a table of the group

export const GroupAssetStateTable: FC<{ data: ControlRoomData; settings: AssetStateSettings; now: number; error?: string | null }> = ({
    data,
    settings,
    now,
    error,
}) => {
    const [open, setOpen] = useState<number | null>(null);
    const fields = settings.stateFields ?? [];
    const assets = sortByAttention(data.assets);
    if (assets.length === 0) return <Wrap><Muted>The group has no assets yet.</Muted></Wrap>;
    const columns = 5 + fields.length;
    return (
        <Wrap>
            {error && <Muted $error>{error} (showing the last data read)</Muted>}
            <Table aria-label="Assets of the group">
                <thead>
                    <tr>
                        <th aria-label="Details" />
                        <th>Asset</th>
                        <th>Status</th>
                        <th>Description</th>
                        {fields.map((f) => (
                            <th key={f.path} title={f.path}>
                                {f.label || f.path}
                            </th>
                        ))}
                        <th>Alarms</th>
                        <th>Updated</th>
                    </tr>
                </thead>
                <tbody>
                    {assets.map((a) => {
                        const status = statusOf(a.state);
                        const c = statusColors(status, settings.statusColors);
                        const stale = isStale(a.lastUpdated, settings.staleMinutes, now);
                        const alarms = projectedEntries(a.state, "alarms").length;
                        const expanded = open === a.id;
                        return (
                            <Fragment key={a.id}>
                                <tr
                                    className="row"
                                    onClick={() => setOpen(expanded ? null : a.id)}
                                    aria-expanded={expanded}
                                >
                                    <td>{expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</td>
                                    <td className="nowrap" title={a.assetType}>
                                        {a.description}
                                    </td>
                                    <td>
                                        <Pill style={{ color: c.fg, background: c.bg, borderColor: c.border }}>{status}</Pill>
                                    </td>
                                    <td>{descriptionOf(a.state) || <span className="muted">—</span>}</td>
                                    {fields.map((f) => {
                                        const value = valueAtStatePath(a.state, f.path);
                                        return (
                                            <td key={f.path} className="nowrap">
                                                {formatStateValue(value)}
                                                {f.unit && value !== undefined && <span className="muted"> {f.unit}</span>}
                                            </td>
                                        );
                                    })}
                                    <td>{alarms > 0 ? tonePill("danger", String(alarms)) : <span className="muted">0</span>}</td>
                                    <td
                                        className="nowrap"
                                        style={{ color: stale ? TONE_COLORS.warning.fg : undefined }}
                                        title={a.lastUpdated ? clockTime(a.lastUpdated, now) : undefined}
                                    >
                                        {a.lastUpdated ? timeAgo(a.lastUpdated, now) : <span className="muted">never</span>}
                                    </td>
                                </tr>
                                {expanded && (
                                    <tr>
                                        <td className="detail" colSpan={columns + 1}>
                                            <AssetStateContent
                                                view={{ assetUid: a.assetUid, description: a.description, state: a.state, lastUpdated: a.lastUpdated }}
                                                settings={settings}
                                                now={now}
                                            />
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </Table>
        </Wrap>
    );
};

export interface ControlRoomPanelProps {
    groupId: number;
    digitalTwinId: number;
    load: ControlRoomLoader;
    paused?: boolean;
    live?: ControlRoomLive;
    // the kept pipeline logs (the Pipeline logs panel)
    loadLogs?: ControlRoomLogsLoader;
}

export const GroupAssetStatePanel: FC<ControlRoomPanelProps & { settings: AssetStateSettings }> = ({
    groupId,
    digitalTwinId,
    load,
    paused = false,
    live,
    settings,
}) => {
    const { data, error } = useControlRoom(load, groupId, digitalTwinId, paused, live);
    const now = useNow(paused);
    if (!data) return <Waiting error={error} />;
    return <GroupAssetStateTable data={data} settings={settings} now={now} error={error} />;
};

// The editor of the Asset state panel of a control room: the paths offered are those of the states of all the group's
// assets, and the preview is the table itself (the digital twin's asset is the virtual one, which has no state)
export const GroupAssetStateEditor: FC<
    Omit<AssetStateEditorProps, "load" | "group"> & { load: ControlRoomLoader; live?: ControlRoomLive }
> = ({ load, live, ...props }) => {
    const { data, error } = useControlRoom(load, props.groupId, props.digitalTwinId, false, live);
    const now = useNow(false);
    const paths = useMemo(() => groupStatePaths(data?.assets ?? []), [data]);
    const preview = (settings: AssetStateSettings) =>
        data ? <GroupAssetStateTable data={data} settings={settings} now={now} error={error} /> : <Waiting error={error} />;
    return <AssetStateEditor {...props} group={{ paths, preview }} />;
};

// ---------------------------------------------------------------------------------------------------------
// Health

export const HealthTable: FC<{
    data: ControlRoomData;
    statuses: Record<number, PipelineStatusSeen>;
    now: number;
    since: number;
    error?: string | null;
}> = ({ data, statuses, now, since, error }) => {
    if (data.assets.length === 0) return <Wrap><Muted>The group has no assets yet.</Muted></Wrap>;
    return (
        <Wrap>
            {error && <Muted $error>{error} (showing the last data read)</Muted>}
            <Table aria-label="Health of the group">
                <thead>
                    <tr>
                        <th>Asset</th>
                        <th>Digital twin</th>
                        <th>Pipeline</th>
                        <th>Last data</th>
                        <th>Devices</th>
                        <th>S3</th>
                    </tr>
                </thead>
                <tbody>
                    {data.assets.map((a) => {
                        const stale = isDataStale(a.lastData, now);
                        const alive = devicesAlive(a.devices, now);
                        const twins = a.digitalTwins.length ? a.digitalTwins : [null];
                        return twins.map((twin, i) => {
                            const pipeline = twin ? pipelineStatusText(twin, statuses[twin.id], now, since) : null;
                            return (
                                <tr key={`${a.id}-${twin?.id ?? 0}`}>
                                    {i === 0 && (
                                        <td rowSpan={twins.length} className="nowrap">
                                            {a.description}
                                        </td>
                                    )}
                                    <td>{twin ? twin.description : <span className="muted">No digital twin</span>}</td>
                                    <td>{pipeline ? tonePill(pipeline.tone, pipeline.text) : <span className="muted">—</span>}</td>
                                    {i === 0 && (
                                        <>
                                            <td
                                                rowSpan={twins.length}
                                                className="nowrap"
                                                style={{ color: stale ? TONE_COLORS.warning.fg : undefined }}
                                                title={a.lastData ? clockTime(a.lastData, now) : undefined}
                                            >
                                                {a.lastData ? timeAgo(a.lastData, now) : `none in ${data.lastDataDays} days`}
                                            </td>
                                            <td rowSpan={twins.length} className="nowrap">
                                                {a.devices.length === 0 ? (
                                                    <span className="muted">—</span>
                                                ) : (
                                                    tonePill(alive === a.devices.length ? "ok" : alive === 0 ? "danger" : "warning", `${alive}/${a.devices.length}`)
                                                )}
                                            </td>
                                            <td rowSpan={twins.length} className="nowrap">
                                                {a.s3.folders === 0 ? (
                                                    <span className="muted">—</span>
                                                ) : (
                                                    <span title={a.s3.lastStorage ? `Last stored ${clockTime(a.s3.lastStorage, now)}` : undefined}>
                                                        {formatBytes(a.s3.bytes)} · {a.s3.folders} folder{a.s3.folders === 1 ? "" : "s"}
                                                    </span>
                                                )}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        });
                    })}
                </tbody>
            </Table>
            <Muted>Devices: the topics that sent data within the hour. Pipelines say their status every second while they run.</Muted>
        </Wrap>
    );
};

export const HealthPanel: FC<ControlRoomPanelProps> = ({ groupId, digitalTwinId, load, paused = false, live }) => {
    const { data, error, statuses, since } = useControlRoom(load, groupId, digitalTwinId, paused, live, { statuses: true });
    const now = useNow(paused, 2_000);
    if (!data) return <Waiting error={error} />;
    return <HealthTable data={data} statuses={statuses} now={now} since={since} error={error} />;
};

// ---------------------------------------------------------------------------------------------------------
// Pipeline logs

const Toolbar = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #9aa1aa;

    select {
        background: #0b0c0e;
        color: #c7d0d9;
        border: 1px solid #2c3235;
        border-radius: 6px;
        padding: 2px 6px;
        font-size: 12px;
    }
`;

const LEVEL_TONE: Record<string, keyof typeof TONE_COLORS> = { error: "danger", warning: "warning", warn: "warning", info: "info" };

// The kept logs of the group for a level (admin_api, the last days): read when the panel opens and when the level
// asks for others; the new ones come live
export const usePipelineLogHistory = (
    loadLogs: ControlRoomLogsLoader | undefined,
    groupId: number,
    digitalTwinId: number,
    levels: "important" | "all",
    enabled: boolean,
) => {
    const [kept, setKept] = useState<PipelineLogEvent[]>([]);
    const [days, setDays] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (!enabled || !loadLogs) return;
        const controller = new AbortController();
        setLoading(true);
        loadLogs(groupId, digitalTwinId, levels, controller.signal)
            .then((result) => {
                setKept(result.events);
                setDays(result.days);
                setError(null);
            })
            .catch((err: any) => {
                if (err?.name === "CanceledError" || err?.name === "AbortError") return;
                setError(err?.response?.data?.message || err?.message || "The kept logs could not be read");
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [loadLogs, groupId, digitalTwinId, levels, enabled]);
    return { kept, days, error, loading };
};

export const PipelineLogsList: FC<{
    events: PipelineLogEvent[];
    now: number;
    twins: { id: number; description: string }[];
    level: LogLevelFilter;
    onLevel: (level: LogLevelFilter) => void;
    // what the list holds: "since the page opened" or "in the last 7 days"
    span: string;
    note?: string | null;
}> = ({ events, now, twins, level, onLevel, span, note }) => {
    const [twin, setTwin] = useState(0);
    const shown = events.filter((e) => passesLevel(e, level) && (!twin || e.digitalTwinId === twin));
    return (
        <Wrap>
            <Toolbar>
                <label>
                    Level{" "}
                    <select aria-label="Level" value={level} onChange={(e) => onLevel(e.target.value as LogLevelFilter)}>
                        <option value="important">Warnings, errors and pipeline events</option>
                        <option value="error">Errors</option>
                        <option value="all">All</option>
                    </select>
                </label>
                <label>
                    Digital twin{" "}
                    <select aria-label="Digital twin" value={twin} onChange={(e) => setTwin(Number(e.target.value))}>
                        <option value={0}>All</option>
                        {twins.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.description}
                            </option>
                        ))}
                    </select>
                </label>
                <span style={{ marginLeft: "auto" }}>
                    {shown.length} events {span}
                </span>
            </Toolbar>
            {note && <Muted>{note}</Muted>}
            {shown.length === 0 ? (
                <Muted>Nothing logged. The events of the pipelines appear here as they happen.</Muted>
            ) : (
                <Table aria-label="Pipeline logs">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Level</th>
                            <th>Digital twin</th>
                            <th>Event</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((e) => (
                            <tr key={e.id}>
                                <td className="nowrap" title={new Date(e.at).toLocaleString()}>
                                    {timeAgo(new Date(e.at).toISOString(), now)}
                                </td>
                                <td>{tonePill(LEVEL_TONE[e.level.toLowerCase()] ?? "muted", e.level)}</td>
                                <td className="nowrap" title={e.asset}>
                                    {e.digitalTwin}
                                </td>
                                <td>
                                    {e.name && <b>{e.name}: </b>}
                                    {e.message}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            )}
        </Wrap>
    );
};

export const PipelineLogsPanel: FC<ControlRoomPanelProps> = ({ groupId, digitalTwinId, load, paused = false, live, loadLogs }) => {
    const { data, error, events } = useControlRoom(load, groupId, digitalTwinId, paused, live, { logs: true });
    const now = useNow(paused);
    const [level, setLevel] = useState<LogLevelFilter>("important");
    const canSeeLogs = !!data?.canSeeLogs;
    const history = usePipelineLogHistory(loadLogs, groupId, digitalTwinId, serverLevelsOf(level), canSeeLogs && !paused);
    const all = useMemo(() => mergeLogEvents(events, history.kept), [events, history.kept]);
    const twins = useMemo(() => (data?.assets ?? []).flatMap((a) => a.digitalTwins.map((t) => ({ id: t.id, description: t.description }))), [data]);
    if (!data) return <Waiting error={error} />;
    if (!canSeeLogs) {
        return (
            <Wrap>
                <Muted>The pipeline logs are only for the editors and administrators of the group.</Muted>
            </Wrap>
        );
    }
    const span = loadLogs && history.days !== null ? `in the last ${history.days} days` : "since the page opened";
    const note = history.error
        ? `${history.error} (showing only the events since the page opened)`
        : history.loading && history.days === null
          ? "Reading the kept logs…"
          : null;
    return <PipelineLogsList events={all} now={now} twins={twins} level={level} onLevel={setLevel} span={span} note={note} />;
};

// the panels of an organization overview come with its indicators
// a panel of a group in the organization overview, or the organization's panel elsewhere
export const OrganizationScopeNotice: FC<{ organizationPanel?: boolean }> = ({ organizationPanel = false }) => (
    <Wrap>
        <Muted>
            {organizationPanel
                ? "This panel shows the indicators of the organization: it works only in the organization overview."
                : "This panel shows a group's data. In the organization overview, the Organization overview panel shows the indicators of every group."}
        </Muted>
    </Wrap>
);
