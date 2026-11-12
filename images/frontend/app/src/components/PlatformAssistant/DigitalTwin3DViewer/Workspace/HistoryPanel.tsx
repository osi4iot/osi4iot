// The Alarms and Approvals panels of the Viewer page: what is happening now (alarms that are not normal,
// requests waiting for a decision) and the latest events of the digital twin, from the history tables. A row
// opens its detail, with the copy of the message that caused the event. For the group's administrators
// (`actions`) the rows of "now" also manage them, as the Alarms and Approvals pages: acknowledge, shelve and reset
// an alarm (or acknowledge all), approve or reject a request with a comment. The pipeline does it (and checks
// who asks); the panel reads the history again after each action.
import { FC, useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { Check, ChevronDown, ChevronRight, RotateCcw, ThumbsDown, ThumbsUp, VolumeX } from "lucide-react";
import { toast } from "react-toastify";
import {
    AlarmRow,
    ApprovalRow,
    HISTORY_PANEL_REFRESH_MS,
    HistoryPanelKind,
    TONE_COLORS,
    Tone,
    alarmState,
    alarmSummary,
    alarmTitle,
    approvalSummary,
    clockTime,
    countAlarmStates,
    detailEntries,
    eventText,
    eventTone,
    expiresText,
    levelTone,
    timeAgo,
    triggerPayloadText,
} from "./historyPanels";
import { HistoryPanelApi, HistoryPanelData } from "./historyPanelsApi";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

const Wrap = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    font-family: ${font};
    font-size: 13px;
    color: #e6e8eb;
`;

const Toolbar = styled.div`
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 6px 12px;
    flex-wrap: wrap;
`;

const Tabs = styled.div`
    display: flex;
    gap: 2px;
    padding: 2px;
    background: #0e1013;
    border: 1px solid #262a2f;
    border-radius: 8px;
`;

const Tab = styled.button<{ $on: boolean }>`
    height: 26px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: none;
    border-radius: 6px;
    background: ${({ $on }) => ($on ? "#23324a" : "transparent")};
    color: ${({ $on }) => ($on ? "#e6efff" : "#9aa1aa")};
    font: ${({ $on }) => ($on ? 600 : 500)} 12px ${font};
    cursor: pointer;

    &:focus-visible {
        outline: 2px solid #3d82f0;
    }
`;

const Count = styled.span<{ $tone: Tone }>`
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    font-size: 11px;
    font-weight: 700;
    color: ${({ $tone }) => TONE_COLORS[$tone].fg};
    background: ${({ $tone }) => TONE_COLORS[$tone].bg};
`;

const Summary = styled.span`
    color: #9aa1aa;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Status = styled.span<{ $error?: boolean }>`
    margin-left: auto;
    font-size: 12px;
    color: ${({ $error }) => ($error ? "#ff7383" : "#7d848d")};
    white-space: nowrap;
`;

const List = styled.ul`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    ${scrollbarStyle}
    margin: 0;
    padding: 0 6px 8px;
    list-style: none;

`;

const RowButton = styled.button`
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
        background: #1b1e22;
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: -2px;
    }

    > svg {
        width: 14px;
        height: 14px;
        flex: none;
        color: #7d848d;
    }
`;

const Dot = styled.span<{ $tone: Tone }>`
    width: 9px;
    height: 9px;
    flex: none;
    border-radius: 50%;
    background: ${({ $tone }) => TONE_COLORS[$tone].fg};
`;

const Text = styled.span`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;

    strong,
    small {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    strong {
        font-weight: 600;
        color: #f2f3f5;
    }

    small {
        font-size: 12px;
        color: #9aa1aa;
    }
`;

const Badge = styled.span<{ $tone: Tone }>`
    flex: none;
    max-width: 45%;
    padding: 2px 7px;
    border-radius: 5px;
    border: 1px solid ${({ $tone }) => TONE_COLORS[$tone].border};
    background: ${({ $tone }) => TONE_COLORS[$tone].bg};
    color: ${({ $tone }) => TONE_COLORS[$tone].fg};
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const When = styled.span<{ $soon?: boolean }>`
    flex: none;
    min-width: 58px;
    text-align: right;
    font-size: 12px;
    color: ${({ $soon }) => ($soon ? "#ffb35c" : "#8b929b")};
`;

const Detail = styled.div`
    margin: 0 8px 8px 32px;
    padding: 10px 12px;
    background: #0e1013;
    border: 1px solid #262a2f;
    border-radius: 8px;
    font-size: 12px;

    dl {
        margin: 0;
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 4px 12px;
    }

    dt {
        color: #8b929b;
    }

    dd {
        margin: 0;
        color: #e6e8eb;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
    }

    pre {
        margin: 8px 0 0;
        max-height: 180px;
        overflow: auto;
        ${scrollbarStyle}
        padding: 8px;
        background: #090a0c;
        border-radius: 6px;
        color: #c7cbd1;
        font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
`;

const Empty = styled.p<{ $error?: boolean }>`
    margin: 0;
    padding: 24px 12px;
    text-align: center;
    color: ${({ $error }) => ($error ? "#ff7383" : "#9aa1aa")};
`;

// What the group's administrators can do from the panels (by the pipeline of the twin, on NATS)
export interface HistoryActions {
    // key undefined: all the alarms of the node
    acknowledge: (nodeUid: string, key?: string) => Promise<void>;
    // minutes 0: unshelve
    shelve: (nodeUid: string, key: string, minutes: number) => Promise<void>;
    reset: (nodeUid: string, key: string) => Promise<void>;
    decide: (nodeUid: string, requestId: string, approve: boolean, comment: string) => Promise<void>;
}

export const SHELVE_MINUTES = [15, 60, 240, 480, 1440];
const shelveText = (minutes: number) => (minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`);

// what can be done with an alarm of "now", from its state in the history
export const alarmActionsOf = (a: AlarmRow) => ({
    acknowledge: !a.shelved && (a.state === "active_unack" || a.state === "rtn_unack" || (a.state === "latched" && !a.ackBy)),
    reset: a.state === "latched",
    unshelve: a.shelved || a.state === "shelved",
});

const ActionBar = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid #262a2f;

    select,
    input {
        height: 28px;
        box-sizing: border-box;
        padding: 0 8px;
        background: #16181c;
        border: 1px solid #2c3137;
        border-radius: 7px;
        color: #e6e8eb;
        font: 400 12px ${font};
    }
    input {
        flex: 1 1 160px;
        min-width: 0;
    }
`;

const ActionButton = styled.button<{ $tone?: "primary" | "danger" | "plain" }>`
    height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    border-radius: 7px;
    font: 500 12px ${font};
    cursor: pointer;
    background: ${({ $tone }) => ($tone === "primary" ? "#3d82f0" : $tone === "danger" ? "rgba(242, 73, 92, 0.16)" : "#1b1e22")};
    border: 1px solid ${({ $tone }) => ($tone === "primary" ? "#3d82f0" : $tone === "danger" ? "rgba(242, 73, 92, 0.5)" : "#2c3137")};
    color: ${({ $tone }) => ($tone === "primary" ? "#fff" : $tone === "danger" ? "#ff8a95" : "#d5d9de")};

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
    svg {
        width: 13px;
        height: 13px;
    }
`;

export interface HistoryPanelProps {
    kind: HistoryPanelKind;
    groupId: number;
    digitalTwinId: number;
    api: HistoryPanelApi;
    // the page is not shown (the Pipeline view): no requests
    paused?: boolean;
    now?: () => number;
    // the group's administrators: manage the alarms and requests of "now"
    actions?: HistoryActions;
}

type View = "now" | "events";

const HistoryPanel: FC<HistoryPanelProps> = ({ kind, groupId, digitalTwinId, api, paused = false, now = Date.now, actions }) => {
    const [view, setView] = useState<View>("now");
    const [data, setData] = useState<HistoryPanelData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadedAt, setLoadedAt] = useState<number | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [details, setDetails] = useState<Record<string, Record<string, unknown> | "loading" | "error">>({});
    // a new reading after an action
    const [reloads, setReloads] = useState(0);
    const [busy, setBusy] = useState<string | null>(null);
    const [minutes, setMinutes] = useState(60);
    const [comments, setComments] = useState<Record<string, string>>({});
    const clock = now();

    useEffect(() => {
        if (paused) return;
        let controller: AbortController | null = null;
        let cancelled = false;
        const load = async () => {
            if (typeof document !== "undefined" && document.hidden) return;
            controller?.abort();
            controller = new AbortController();
            try {
                const result = await api.load(kind, groupId, digitalTwinId, controller.signal);
                if (cancelled) return;
                setData(result);
                setError(null);
                setLoadedAt(now());
            } catch (err: any) {
                if (cancelled || err?.name === "CanceledError" || err?.name === "AbortError") return;
                setError(err?.response?.data?.message || err?.message || "The history could not be read");
            }
        };
        load();
        const timer = window.setInterval(load, HISTORY_PANEL_REFRESH_MS);
        const onVisible = () => {
            if (!document.hidden) load();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelled = true;
            controller?.abort();
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kind, groupId, digitalTwinId, api, paused, reloads]);

    // an action of the panel: one at a time, its error told, and the history read again (the pipeline writes it)
    const act = useCallback(async (id: string, run: () => Promise<void>, done: string) => {
        setBusy(id);
        try {
            await run();
            toast.success(done);
        } catch (err: any) {
            toast.error(err?.message || "The action could not be done");
        } finally {
            setBusy(null);
            window.setTimeout(() => setReloads((n) => n + 1), 400);
        }
    }, []);

    const toggle = useCallback(
        async (eventId: string) => {
            if (open === eventId) {
                setOpen(null);
                return;
            }
            setOpen(eventId);
            if (details[eventId] && details[eventId] !== "error") return;
            setDetails((d) => ({ ...d, [eventId]: "loading" }));
            try {
                const detail = await api.detail(kind, groupId, eventId);
                setDetails((d) => ({ ...d, [eventId]: detail }));
            } catch {
                setDetails((d) => ({ ...d, [eventId]: "error" }));
            }
        },
        [open, details, api, kind, groupId],
    );

    const rows = data ? (view === "now" ? data.now : data.events) : [];
    const alarms = kind === "alarms";
    const counts = alarms && data ? countAlarmStates(data.now as AlarmRow[]) : null;
    const nowLabel = alarms ? "Active" : "Pending";
    const eventsLabel = alarms ? "Events" : "Decisions";
    const nowTone: Tone = alarms ? (counts && counts.unacked > 0 ? "danger" : "warning") : "info";

    const renderActions = (row: AlarmRow | ApprovalRow) => {
        if (!actions) return null;
        const working = busy !== null;
        if (alarms) {
            const a = row as AlarmRow;
            const can = alarmActionsOf(a);
            const name = alarmTitle(a);
            return (
                <ActionBar aria-label={`Manage the alarm ${name}`}>
                    {can.acknowledge && (
                        <ActionButton type="button" $tone="primary" disabled={working} onClick={() => act(a.eventId, () => actions.acknowledge(a.nodeUid, a.alarmKey), `${name}: acknowledged`)}>
                            <Check aria-hidden="true" />
                            Acknowledge
                        </ActionButton>
                    )}
                    {can.reset && (
                        <ActionButton type="button" disabled={working} title="Only when its value is back to normal" onClick={() => act(a.eventId, () => actions.reset(a.nodeUid, a.alarmKey), `${name}: reset`)}>
                            <RotateCcw aria-hidden="true" />
                            Reset
                        </ActionButton>
                    )}
                    {can.unshelve ? (
                        <ActionButton type="button" disabled={working} onClick={() => act(a.eventId, () => actions.shelve(a.nodeUid, a.alarmKey, 0), `${name}: unshelved`)}>
                            <VolumeX aria-hidden="true" />
                            Unshelve
                        </ActionButton>
                    ) : (
                        <>
                            <ActionButton type="button" disabled={working} onClick={() => act(a.eventId, () => actions.shelve(a.nodeUid, a.alarmKey, minutes), `${name}: shelved for ${shelveText(minutes)}`)}>
                                <VolumeX aria-hidden="true" />
                                Shelve for
                            </ActionButton>
                            <select aria-label="Shelve for" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                                {SHELVE_MINUTES.map((m) => (
                                    <option key={m} value={m}>
                                        {shelveText(m)}
                                    </option>
                                ))}
                            </select>
                        </>
                    )}
                    {busy === a.eventId && <span style={{ color: "#9aa1aa" }}>Working…</span>}
                </ActionBar>
            );
        }
        const r = row as ApprovalRow;
        const comment = comments[r.eventId] ?? "";
        const what = r.title || r.nodeName || "The request";
        return (
            <ActionBar aria-label={`Decide the request ${what}`}>
                <input
                    aria-label="Comment"
                    placeholder="Comment (optional)"
                    value={comment}
                    maxLength={500}
                    onChange={(e) => setComments((c) => ({ ...c, [r.eventId]: e.target.value }))}
                />
                <ActionButton type="button" $tone="primary" disabled={working} onClick={() => act(r.eventId, () => actions.decide(r.nodeUid, r.requestId, true, comment), `${what}: approved`)}>
                    <ThumbsUp aria-hidden="true" />
                    Approve
                </ActionButton>
                <ActionButton type="button" $tone="danger" disabled={working} onClick={() => act(r.eventId, () => actions.decide(r.nodeUid, r.requestId, false, comment), `${what}: rejected`)}>
                    <ThumbsDown aria-hidden="true" />
                    Reject
                </ActionButton>
                {busy === r.eventId && <span style={{ color: "#9aa1aa" }}>Working…</span>}
            </ActionBar>
        );
    };

    const renderRow = (row: AlarmRow | ApprovalRow) => {
        let dotTone: Tone;
        let title: string;
        let sub: string;
        let badge: { text: string; tone: Tone };
        let when: { text: string; soon?: boolean; title?: string };
        if (alarms) {
            const a = row as AlarmRow;
            dotTone = view === "now" ? levelTone(a.level) : eventTone(a.event);
            title = alarmTitle(a);
            const user = a.ackBy || a.userName;
            sub = [view === "now" ? a.level : a.level && a.level !== "Normal" ? a.level : "", alarmSummary(a), view === "events" && user ? user : ""]
                .filter(Boolean)
                .join(" · ");
            badge = view === "now" ? alarmState(a.state) : { text: eventText(a.event), tone: eventTone(a.event) };
            when =
                view === "now"
                    ? { text: timeAgo(a.raisedAt ?? a.time, clock), title: `Since ${new Date(a.raisedAt ?? a.time).toLocaleString()}` }
                    : { text: clockTime(a.time, clock), title: new Date(a.time).toLocaleString() };
        } else {
            const r = row as ApprovalRow;
            dotTone = eventTone(r.event);
            title = r.title || r.nodeName || r.requestId;
            sub = approvalSummary(r);
            badge = { text: eventText(r.event), tone: eventTone(r.event) };
            if (view === "now") {
                const expires = expiresText(r.expiresAt, clock);
                sub = [sub, expires.text].filter(Boolean).join(" · ");
                when = { text: timeAgo(r.requestedAt, clock), soon: expires.soon, title: `Requested ${new Date(r.requestedAt).toLocaleString()}` };
            } else when = { text: clockTime(r.time, clock), title: new Date(r.time).toLocaleString() };
        }
        const expanded = open === row.eventId;
        const detail = details[row.eventId];
        return (
            <li key={row.eventId}>
                <RowButton type="button" aria-expanded={expanded} onClick={() => toggle(row.eventId)}>
                    {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                    <Dot $tone={dotTone} aria-hidden="true" />
                    <Text>
                        <strong>{title}</strong>
                        {sub && <small>{sub}</small>}
                    </Text>
                    <Badge $tone={badge.tone}>{badge.text}</Badge>
                    <When $soon={when.soon} title={when.title}>
                        {when.text}
                    </When>
                </RowButton>
                {expanded && (
                    <Detail>
                        {actions && view === "now" && renderActions(row)}
                        {detail === "loading" || detail === undefined ? (
                            "Loading…"
                        ) : detail === "error" ? (
                            <span style={{ color: "#ff7383" }}>The detail could not be read.</span>
                        ) : (
                            <>
                                <dl>
                                    {detailEntries(detail, kind).map(([label, value]) => (
                                        <div key={label} style={{ display: "contents" }}>
                                            <dt>{label}</dt>
                                            <dd>{value}</dd>
                                        </div>
                                    ))}
                                </dl>
                                {triggerPayloadText(detail.triggerPayload) && (
                                    <pre aria-label="Message that caused the event">{triggerPayloadText(detail.triggerPayload)}</pre>
                                )}
                            </>
                        )}
                    </Detail>
                )}
            </li>
        );
    };

    let empty: { text: string; error?: boolean } | null = null;
    if (!data) empty = error ? { text: error, error: true } : paused ? null : { text: "Loading…" };
    else if (rows.length === 0) {
        empty = {
            text:
                view === "now"
                    ? alarms
                        ? "No active alarms."
                        : "No requests waiting for a decision."
                    : alarms
                      ? "No alarm events in the last 30 days."
                      : "No approval requests in the last 30 days.",
        };
    }

    return (
        <Wrap>
            <Toolbar>
                <Tabs role="tablist" aria-label={alarms ? "Alarms" : "Approvals"} className="ws-no-drag">
                    <Tab type="button" role="tab" aria-selected={view === "now"} $on={view === "now"} onClick={() => setView("now")}>
                        {nowLabel}
                        {data && data.now.length > 0 && <Count $tone={nowTone}>{data.now.length}</Count>}
                    </Tab>
                    <Tab type="button" role="tab" aria-selected={view === "events"} $on={view === "events"} onClick={() => setView("events")}>
                        {eventsLabel}
                    </Tab>
                </Tabs>
                {counts && view === "now" && data && data.now.length > 0 && (
                    <Summary>
                        {[
                            counts.unacked ? `${counts.unacked} unacknowledged` : "",
                            counts.acked ? `${counts.acked} acknowledged` : "",
                            counts.shelved ? `${counts.shelved} shelved` : "",
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                    </Summary>
                )}
                {actions && alarms && view === "now" && data && counts && counts.unacked > 0 && (
                    <ActionButton
                        type="button"
                        className="ws-no-drag"
                        $tone="primary"
                        disabled={busy !== null}
                        title="Acknowledge every unacknowledged alarm of the twin"
                        onClick={() => {
                            const nodes = Array.from(new Set((data.now as AlarmRow[]).filter((a) => alarmActionsOf(a).acknowledge).map((a) => a.nodeUid)));
                            act("all", async () => {
                                for (const node of nodes) await actions.acknowledge(node);
                            }, "Alarms acknowledged");
                        }}
                    >
                        <Check aria-hidden="true" />
                        Acknowledge all
                    </ActionButton>
                )}
                <Status $error={!!error && !!data} title={error ?? undefined}>
                    {error && data ? "Not updated" : loadedAt ? `Updated ${clockTime(new Date(loadedAt).toISOString(), clock)}` : ""}
                </Status>
            </Toolbar>
            {empty ? (
                <Empty $error={empty.error}>{empty.text}</Empty>
            ) : (
                <List className="ws-no-drag" aria-label={view === "now" ? nowLabel : eventsLabel}>
                    {rows.map(renderRow)}
                </List>
            )}
        </Wrap>
    );
};

export default HistoryPanel;
