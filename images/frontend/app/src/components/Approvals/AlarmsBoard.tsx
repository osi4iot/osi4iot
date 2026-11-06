// The alarms that are not normal of the Alarm nodes of the user's digital twins, grouped by asset: the ones that
// wait for someone first, then the active ones already acknowledged, the latched ones and the shelved ones; with
// Acknowledge, Shelve and Reset (latched alarms). The alarms are asked to pipelines every few seconds
// (alarmCommands.ts); acting goes on the user's own NATS subject, so pipelines knows who did it, and only the
// group's administrators can.
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NatsConnection } from "@nats-io/nats-core";
import styled, { css } from "styled-components";
import { toast } from "react-toastify";
import { BellRing, Check, RefreshCw, RotateCcw, VolumeX } from "lucide-react";
import {
    acknowledgeAlarms,
    AlarmSummary,
    alarmsToAttend,
    describeAlarmError,
    listAlarms,
    resetAlarms,
    SHELVE_OPTIONS_MINUTES,
    shelveAlarms,
    shelveLabel,
} from "../PlatformAssistant/DigitalTwin3DViewer/Pipeline/alarmCommands";
import {
    AssetCard,
    AssetHead,
    Count,
    Empty,
    Head,
    IconButton,
    Meta,
    Notice,
    Page,
    Requests,
    Select,
    Title,
    Tools,
    Unreachable,
} from "./boardStyles";
import { ApprovalTarget, relativeTime } from "./approvalsData";

export const ALARMS_POLL_MS = 10_000;

const LEVEL_COLORS: Record<string, string> = { Alarm: "#f2495c", Warning: "#ff9830", Normal: "#73bf69" };

const Item = styled.article<{ $level: string; $quiet: boolean }>`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px 20px;
    padding: 12px 18px 12px 15px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    border-left: 3px solid ${({ $level }) => LEVEL_COLORS[$level] ?? LEVEL_COLORS.Normal};
    opacity: ${({ $quiet }) => ($quiet ? 0.75 : 1)};

    &:last-child {
        border-bottom: none;
    }

    @media (max-width: 700px) {
        grid-template-columns: 1fr;
    }
`;

const Name = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    color: #eef2f7;
    font-size: 14px;
    font-weight: 500;
`;

const Level = styled.span<{ $level: string }>`
    padding: 0 7px;
    border-radius: 4px;
    background: ${({ $level }) => LEVEL_COLORS[$level] ?? LEVEL_COLORS.Normal};
    color: #111;
    font-size: 11px;
    font-weight: 600;
    line-height: 18px;
`;

const Chip = styled.span<{ $tone: "attend" | "acked" | "latched" | "shelved" }>`
    padding: 0 7px;
    border-radius: 9px;
    font-size: 11px;
    line-height: 18px;
    color: ${({ $tone }) => ({ attend: "#ffd2d7", acked: "#c3c9d1", latched: "#ffe3b0", shelved: "#b9c2cf" })[$tone]};
    background: ${({ $tone }) =>
        ({
            attend: "rgba(242, 73, 92, 0.18)",
            acked: "#2a2d33",
            latched: "rgba(183, 121, 31, 0.25)",
            shelved: "#252a33",
        })[$tone]};
`;

const Value = styled.div`
    margin-top: 4px;
    color: #c4c9d0;
    font-size: 13px;
`;

const Buttons = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;

    @media (max-width: 700px) {
        justify-content: flex-start;
    }
`;

const press = (color: string, hover: string, shadow: string) => css`
    background-color: ${color};
    box-shadow: 0 3px ${shadow};

    &:hover {
        background-color: ${hover};
    }

    &:active {
        box-shadow: 0 1px ${shadow};
        transform: translateY(2px);
    }
`;

const KIND_STYLE = {
    ack: press("#2f855a", "#276749", "#1c4532"),
    reset: press("#b7791f", "#975a16", "#5f370e"),
    shelve: press("#4a5568", "#3e4757", "#1f2733"),
    unshelve: press("#2b6cb0", "#2c5282", "#1a365d"),
};

const Act = styled.button<{ $kind: keyof typeof KIND_STYLE }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid #2c3235;
    border-radius: 10px;
    color: white;
    font-size: 13px;
    cursor: pointer;
    ${({ $kind }) => KIND_STYLE[$kind]}

    &:disabled {
        cursor: not-allowed;
        background-color: #3c3d40;
        box-shadow: 0 3px #19191a;
        color: #c3c9d1;
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 2px;
    }
`;

const Legend = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    color: #9ca3af;
    font-size: 12px;
`;

// the order of the list: what waits for someone first
export const alarmRank = (a: AlarmSummary): number => {
    let r = a.shelved ? 300 : a.canAck ? 0 : a.state === "latched" ? 200 : 100;
    if (a.level !== "Alarm") r += 10;
    return r;
};

type Tone = "attend" | "acked" | "latched" | "shelved";

// the alarm's situation in words, and its chip
export const alarmSituation = (a: AlarmSummary): { text: string; tone: Tone } => {
    if (a.shelved) return { text: "Shelved", tone: "shelved" };
    switch (a.state) {
        case "active_unack":
            return { text: "Active · to acknowledge", tone: "attend" };
        case "rtn_unack":
            return { text: "Back to normal · to acknowledge", tone: "attend" };
        case "latched":
            return a.canAck
                ? { text: "Latched · to acknowledge and reset", tone: "attend" }
                : { text: "Latched · waiting for a reset", tone: "latched" };
    }
    return { text: a.latched ? "Active · latched · acknowledged" : "Active · acknowledged", tone: "acked" };
};

interface TargetResult {
    alarms: AlarmSummary[];
    error?: string;
}

interface Row {
    t: ApprovalTarget;
    a: AlarmSummary;
}

interface AlarmsBoardProps {
    natsClient: NatsConnection | null;
    isNatsConnected: boolean;
    userName: string;
    targets: ApprovalTarget[];
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

const AlarmsBoard: FC<AlarmsBoardProps> = ({ natsClient, isNatsConnected, userName, targets }) => {
    const [results, setResults] = useState<Record<string, TargetResult>>({});
    const [loaded, setLoaded] = useState(false);
    const [updatedAt, setUpdatedAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [groupFilter, setGroupFilter] = useState<number | "all">("all");
    const [minutes, setMinutes] = useState(60);
    const [busy, setBusy] = useState(false);
    const alive = useRef(true);
    useEffect(
        () => () => {
            alive.current = false;
        },
        [],
    );

    const refresh = useCallback(async () => {
        if (!natsClient || !isNatsConnected) return;
        const answers = await Promise.all(
            targets.map(async (t): Promise<[string, TargetResult]> => {
                try {
                    return [t.key, { alarms: await listAlarms(natsClient, userName, t.subject, t.nodeUid) }];
                } catch (e) {
                    return [t.key, { alarms: [], error: describeAlarmError(e) }];
                }
            }),
        );
        if (!alive.current) return;
        setResults(Object.fromEntries(answers));
        setLoaded(true);
        setUpdatedAt(Date.now());
        setNow(Date.now());
    }, [natsClient, isNatsConnected, userName, targets]);

    useEffect(() => {
        refresh();
        const timer = setInterval(refresh, ALARMS_POLL_MS);
        return () => clearInterval(timer);
    }, [refresh]);

    const groups = useMemo(() => {
        const seen = new Map<number, string>();
        targets.forEach((t) => seen.set(t.groupId, t.groupLabel));
        return Array.from(seen.entries());
    }, [targets]);

    const visible = targets.filter((t) => groupFilter === "all" || t.groupId === groupFilter);

    const assets = useMemo(() => {
        const byAsset = new Map<string, { label: string; group: string; rows: Row[]; errors: ApprovalTarget[] }>();
        for (const t of visible) {
            const id = `${t.groupId}/${t.assetId}`;
            if (!byAsset.has(id)) byAsset.set(id, { label: t.assetLabel, group: t.groupLabel, rows: [], errors: [] });
            const entry = byAsset.get(id)!;
            const result = results[t.key];
            if (!result) continue;
            if (result.error) entry.errors.push(t);
            result.alarms.forEach((a) => entry.rows.push({ t, a }));
        }
        const best = (rows: Row[]) => Math.min(1000, ...rows.map((r) => alarmRank(r.a)));
        for (const entry of byAsset.values()) {
            entry.rows.sort(
                (x, y) => alarmRank(x.a) - alarmRank(y.a) || (x.a.raisedAt ?? "").localeCompare(y.a.raisedAt ?? ""),
            );
        }
        // the assets with alarms that wait for someone first; those whose pipelines do not answer, at the end
        return Array.from(byAsset.entries())
            .filter(([, e]) => e.rows.length > 0 || e.errors.length > 0)
            .sort(([, a], [, b]) => best(a.rows) - best(b.rows) || a.label.localeCompare(b.label));
    }, [visible, results]);

    const all = assets.flatMap(([, e]) => e.rows.map((r) => r.a));
    const toAttend = alarmsToAttend(all);
    const acked = all.filter((a) => !a.shelved && !a.canAck).length;
    const shelvedCount = all.filter((a) => a.shelved).length;

    const act = async (what: () => Promise<void>, done: string) => {
        setBusy(true);
        try {
            await what();
            toast.success(done);
        } catch (e) {
            toast.error(`Not done: ${describeAlarmError(e)}`);
        } finally {
            if (alive.current) setBusy(false);
            refresh();
        }
    };

    return (
        <Page>
            <Head>
                <Title>
                    <BellRing size={20} color="#a7b1be" />
                    Alarms
                    <Count $zero={toAttend === 0} aria-label="Alarms to acknowledge">
                        {toAttend}
                    </Count>
                </Title>
                <Tools>
                    {groups.length > 1 && (
                        <Select
                            aria-label="Group"
                            value={groupFilter}
                            onChange={(e) => setGroupFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                        >
                            <option value="all">All groups</option>
                            {groups.map(([id, label]) => (
                                <option key={id} value={id}>
                                    {label}
                                </option>
                            ))}
                        </Select>
                    )}
                    <Select
                        aria-label="Shelve for"
                        value={minutes}
                        onChange={(e) => setMinutes(Number(e.target.value))}
                    >
                        {SHELVE_OPTIONS_MINUTES.map((m) => (
                            <option key={m} value={m}>
                                Shelve {shelveLabel(m)}
                            </option>
                        ))}
                    </Select>
                    {updatedAt && <span>Updated {new Date(updatedAt).toLocaleTimeString()}</span>}
                    <IconButton type="button" aria-label="Refresh" title="Refresh" onClick={() => refresh()}>
                        <RefreshCw size={15} />
                    </IconButton>
                </Tools>
            </Head>

            {loaded && all.length > 0 && (
                <Legend aria-label="Summary">
                    <span>{toAttend} to acknowledge</span>
                    <span>{acked} active, acknowledged</span>
                    {shelvedCount > 0 && <span>{shelvedCount} shelved</span>}
                </Legend>
            )}

            {!isNatsConnected && <Notice $error>Connecting to the platform's message broker…</Notice>}

            {isNatsConnected && loaded && assets.length === 0 && (
                <Empty>
                    <BellRing size={30} color="#6f7a88" />
                    <strong>No active alarms</strong>
                    The alarms of the Alarm nodes of your digital twins appear here while they are not normal, also
                    after acknowledging them.
                </Empty>
            )}

            {assets.map(([id, entry]) => (
                <AssetCard key={id} aria-label={entry.label}>
                    <AssetHead>
                        <h3>{entry.label}</h3>
                        <span>{entry.group}</span>
                        {entry.rows.length > 0 && <span>{entry.rows.length} not normal</span>}
                    </AssetHead>
                    <Requests>
                        {entry.rows.map(({ t, a }) => {
                            const situation = alarmSituation(a);
                            const quiet = a.shelved || situation.tone === "acked";
                            return (
                                <Item key={`${t.key}/${a.key}`} data-testid="alarm-row" $level={a.level} $quiet={quiet}>
                                    <div>
                                        <Name>
                                            <Level $level={a.level}>{a.level}</Level>
                                            {a.name}
                                            <Chip $tone={situation.tone}>{situation.text}</Chip>
                                        </Name>
                                        <Value>
                                            {a.value}
                                            {a.threshold ? ` (level ${a.threshold})` : ""}
                                        </Value>
                                        <Meta>
                                            <b>{t.digitalTwinLabel}</b>
                                            {a.raisedAt && (
                                                <>
                                                    {" "}
                                                    · since{" "}
                                                    <span title={when(a.raisedAt)}>
                                                        {relativeTime(a.raisedAt, now)}
                                                    </span>
                                                </>
                                            )}
                                            {a.ackBy && <> · acknowledged by {a.ackBy}</>}
                                            {a.latchedAt && (
                                                <>
                                                    {" "}
                                                    · back to normal{" "}
                                                    <span title={when(a.latchedAt)}>
                                                        {relativeTime(a.latchedAt, now)}
                                                    </span>
                                                </>
                                            )}
                                            {a.shelved && a.shelvedUntil && (
                                                <> · shelved until {when(a.shelvedUntil)}</>
                                            )}
                                        </Meta>
                                    </div>
                                    <Buttons>
                                        {a.canAck && (
                                            <Act
                                                type="button"
                                                $kind="ack"
                                                disabled={busy}
                                                onClick={() =>
                                                    act(
                                                        () =>
                                                            acknowledgeAlarms(
                                                                natsClient as NatsConnection,
                                                                userName,
                                                                t.subject,
                                                                t.nodeUid,
                                                                a.key,
                                                            ),
                                                        "Alarm acknowledged",
                                                    )
                                                }
                                            >
                                                <Check size={14} /> Acknowledge
                                            </Act>
                                        )}
                                        {a.canReset && (
                                            <Act
                                                type="button"
                                                $kind="reset"
                                                disabled={busy}
                                                onClick={() =>
                                                    act(
                                                        () =>
                                                            resetAlarms(
                                                                natsClient as NatsConnection,
                                                                userName,
                                                                t.subject,
                                                                t.nodeUid,
                                                                a.key,
                                                            ),
                                                        "Alarm reset",
                                                    )
                                                }
                                            >
                                                <RotateCcw size={14} /> Reset
                                            </Act>
                                        )}
                                        {a.shelved ? (
                                            <Act
                                                type="button"
                                                $kind="unshelve"
                                                disabled={busy}
                                                onClick={() =>
                                                    act(
                                                        () =>
                                                            shelveAlarms(
                                                                natsClient as NatsConnection,
                                                                userName,
                                                                t.subject,
                                                                t.nodeUid,
                                                                0,
                                                                a.key,
                                                            ),
                                                        "Alarm unshelved",
                                                    )
                                                }
                                            >
                                                Unshelve
                                            </Act>
                                        ) : (
                                            <Act
                                                type="button"
                                                $kind="shelve"
                                                disabled={busy}
                                                title={`Silence it for ${shelveLabel(minutes)}`}
                                                onClick={() =>
                                                    act(
                                                        () =>
                                                            shelveAlarms(
                                                                natsClient as NatsConnection,
                                                                userName,
                                                                t.subject,
                                                                t.nodeUid,
                                                                minutes,
                                                                a.key,
                                                            ),
                                                        `Shelved for ${shelveLabel(minutes)}`,
                                                    )
                                                }
                                            >
                                                <VolumeX size={14} /> Shelve
                                            </Act>
                                        )}
                                    </Buttons>
                                </Item>
                            );
                        })}
                    </Requests>
                    {entry.errors.map((t) => (
                        <Unreachable key={t.key}>
                            {t.digitalTwinLabel} · {t.nodeName}: not available ({results[t.key]?.error})
                        </Unreachable>
                    ))}
                </AssetCard>
            ))}
        </Page>
    );
};

export default AlarmsBoard;
