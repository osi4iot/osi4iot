// @ts-nocheck
// The Alarm node in the pipeline editor: a signal-node look with a button that shows its alarms that are not normal,
// to acknowledge or shelve them (only the group's administrators can: see alarmCommands.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Handle, Position } from "@xyflow/react";
import { Bell, Siren } from "lucide-react";
import { toast } from "react-toastify";
import { useLoggedUserLogin } from "../../../../contexts/authContext/authContext";
import { approvalSubject } from "./approvalRequests";
import {
    acknowledgeAlarms,
    AlarmSummary,
    alarmsToAttend,
    describeAlarmError,
    listAlarms,
    SHELVE_OPTIONS_MINUTES,
    shelveAlarms,
    shelveLabel,
} from "./alarmCommands";

const POLL_OPEN_MS = 3_000;
const POLL_CLOSED_MS = 15_000;

const LEVEL_COLORS = { Alarm: "#f2495c", Warning: "#ff9830", Normal: "#73bf69" };

const Wrapper = styled.div`
    position: relative;
`;

const Box = styled.div<{ selected?: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px 2px 4px;
    min-width: 80px;
    min-height: 34px;
    border-radius: 5px;
    background-color: #a0605a;
    border: ${(p) => (p.selected ? "2px solid #3b82f6" : "2px solid #a09c98ff")};
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;

    &:hover {
        background-color: #b8766f;
    }
`;

const Label = styled.div`
    color: #e7e3df;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    padding-right: 6px;
`;

const AlarmsButton = styled.button<{ $active?: boolean }>`
    position: relative;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1px solid #e7e3df80;
    border-radius: 5px;
    background: ${(p) => (p.$active ? "#6e3f3a" : "transparent")};
    cursor: pointer;

    &:disabled {
        cursor: default;
    }
`;

const Badge = styled.span<{ $color: string }>`
    position: absolute;
    top: -7px;
    right: -8px;
    min-width: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: ${(p) => p.$color};
    color: #fff;
    font-size: 10px;
    line-height: 16px;
    text-align: center;
`;

const Panel = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 10;
    width: 330px;
    max-height: 380px;
    overflow-y: auto;
    padding: 8px;
    border-radius: 6px;
    background: #202226;
    border: 1px solid #4b5563;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.45);
    color: #e5e7eb;
    font-size: 12px;
    cursor: default;
`;

const Toolbar = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 8px;
    margin-bottom: 4px;
    border-bottom: 1px solid #374151;
`;

const Item = styled.div`
    padding: 6px 0 8px;
    border-bottom: 1px solid #374151;

    &:last-child {
        border-bottom: none;
    }
`;

const Title = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const Level = styled.span<{ $color: string }>`
    flex: none;
    padding: 0 6px;
    border-radius: 3px;
    background: ${(p) => p.$color};
    color: #111;
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
`;

const Meta = styled.div`
    margin-top: 2px;
    color: #9ca3af;
    font-size: 11px;
`;

const Actions = styled.div`
    display: flex;
    gap: 6px;
    margin-top: 6px;
`;

const Act = styled.button<{ $kind: "ack" | "shelve" | "unshelve" }>`
    flex: none;
    padding: 3px 8px;
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 11px;
    cursor: pointer;
    background: ${(p) => ({ ack: "#2f855a", shelve: "#4a5568", unshelve: "#2b6cb0" })[p.$kind]};

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

const Minutes = styled.select`
    padding: 2px 4px;
    border-radius: 4px;
    border: 1px solid #4b5563;
    background: #111827;
    color: #e5e7eb;
    font-size: 11px;
`;

const StyledHandle = styled(Handle)`
    width: 8px;
    height: 8px;
    background: #e7e3df;
    border: 1px solid #555;
`;

const handleTop = (index: number, total: number) => `${((index + 1) * 100) / (total + 1)}%`;

const OUTPUT_TITLES = ["events", "status (for an Asset state node)"];

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

export const alarmStateText = (a: AlarmSummary): string => {
    switch (a.state) {
        case "active_unack":
            return "active, unacknowledged";
        case "active_ack":
            return a.ackBy ? `active, acknowledged by ${a.ackBy}` : "active, acknowledged";
        case "rtn_unack":
            return "back to normal, unacknowledged";
        case "shelved":
            return `shelved until ${when(a.shelvedUntil)}`;
    }
    return a.state;
};

// The worst level among the alarms waiting for someone (for the badge colour)
const worstToAttend = (alarms: AlarmSummary[]): string =>
    alarms.some((a) => a.canAck && !a.shelved && a.level === "Alarm") ? LEVEL_COLORS.Alarm : LEVEL_COLORS.Warning;

export function AlarmNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 1;
    const userName = useLoggedUserLogin();
    const subject = approvalSubject(data?.natsSubjectsData);
    const natsClient = data?.natsClient;
    const usable = !!natsClient && !!subject && !!userName;
    const [open, setOpen] = useState(false);
    const [alarms, setAlarms] = useState<AlarmSummary[] | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [minutes, setMinutes] = useState(60);
    const alive = useRef(true);
    useEffect(() => () => void (alive.current = false), []);

    const refresh = useCallback(async () => {
        if (!usable) return;
        try {
            const list = await listAlarms(natsClient, userName, subject, data.nodeUid);
            if (!alive.current) return;
            setAlarms(list);
            setError("");
        } catch (e) {
            if (!alive.current) return;
            setAlarms(null);
            setError(describeAlarmError(e));
        }
    }, [usable, natsClient, userName, subject, data?.nodeUid]);

    // the badge stays up to date; faster while the list is open
    useEffect(() => {
        if (!usable) return;
        refresh();
        const timer = setInterval(refresh, open ? POLL_OPEN_MS : POLL_CLOSED_MS);
        return () => clearInterval(timer);
    }, [usable, open, refresh]);

    const act = async (what: () => Promise<void>, done: string) => {
        setBusy(true);
        try {
            await what();
            toast.success(done);
        } catch (e) {
            toast.error(`Not done: ${describeAlarmError(e)}`);
        } finally {
            setBusy(false);
            refresh();
        }
    };
    const ack = (key?: string) =>
        act(() => acknowledgeAlarms(natsClient, userName, subject, data.nodeUid, key), key === undefined ? "Alarms acknowledged" : "Alarm acknowledged");
    const shelve = (m: number, key?: string) =>
        act(
            () => shelveAlarms(natsClient, userName, subject, data.nodeUid, m, key),
            m === 0 ? "Alarm unshelved" : `Shelved for ${shelveLabel(m)}`,
        );

    const list = alarms ?? [];
    const toAttend = alarmsToAttend(alarms);
    let title = "Alarms: acknowledge and shelve";
    if (!subject) title = "The digital twin has no approval topic yet: save the pipeline and reload the viewer";
    else if (!natsClient) title = "Not connected";

    return (
        <Wrapper>
            <Box selected={selected}>
                <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
                <AlarmsButton
                    className="nodrag"
                    aria-label="Alarms"
                    $active={open}
                    title={title}
                    disabled={!usable}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (usable) setOpen(!open);
                    }}
                >
                    {usable ? <Bell size={14} color="#e7e3df" /> : <Siren size={14} color="#e7e3df" />}
                    {toAttend > 0 && <Badge $color={worstToAttend(list)}>{toAttend > 99 ? "99+" : toAttend}</Badge>}
                </AlarmsButton>
                <Label>{data?.label || "Alarm"}</Label>
                {Array.from({ length: numOutputs }, (_, index) => (
                    <StyledHandle
                        key={index}
                        type="source"
                        position={Position.Right}
                        id={`${data.nodeUid}-${index}`}
                        title={OUTPUT_TITLES[index]}
                        style={{ top: handleTop(index, numOutputs), right: "-1px" }}
                    />
                ))}
            </Box>
            {open && (
                <Panel className="nodrag nowheel" onClick={(e) => e.stopPropagation()}>
                    {error && <Meta style={{ color: "#ffb3b3" }}>Not available: {error}</Meta>}
                    {!error && list.length > 0 && (
                        <Toolbar>
                            <Act $kind="ack" disabled={busy || toAttend === 0} onClick={() => ack()}>
                                Acknowledge all
                            </Act>
                            <Minutes
                                aria-label="Shelve for"
                                value={minutes}
                                onChange={(e) => setMinutes(Number(e.target.value))}
                            >
                                {SHELVE_OPTIONS_MINUTES.map((m) => (
                                    <option key={m} value={m}>
                                        {shelveLabel(m)}
                                    </option>
                                ))}
                            </Minutes>
                            <Act $kind="shelve" disabled={busy} onClick={() => shelve(minutes)}>
                                Shelve all
                            </Act>
                        </Toolbar>
                    )}
                    {!error && alarms !== null && list.length === 0 && <Meta>No active alarms</Meta>}
                    {list.map((a) => (
                        <Item key={a.key} data-testid="alarm-item">
                            <Title>
                                <Level $color={LEVEL_COLORS[a.level] ?? LEVEL_COLORS.Normal}>{a.level}</Level>
                                <span>{a.name}</span>
                            </Title>
                            <Meta>
                                {a.value}
                                {a.threshold ? ` (level ${a.threshold})` : ""} · {alarmStateText(a)}
                            </Meta>
                            {a.raisedAt && <Meta>since {when(a.raisedAt)}</Meta>}
                            <Actions>
                                {a.canAck && (
                                    <Act $kind="ack" disabled={busy} onClick={() => ack(a.key)}>
                                        Acknowledge
                                    </Act>
                                )}
                                {a.shelved ? (
                                    <Act $kind="unshelve" disabled={busy} onClick={() => shelve(0, a.key)}>
                                        Unshelve
                                    </Act>
                                ) : (
                                    <Act $kind="shelve" disabled={busy} onClick={() => shelve(minutes, a.key)}>
                                        Shelve {shelveLabel(minutes)}
                                    </Act>
                                )}
                            </Actions>
                        </Item>
                    ))}
                </Panel>
            )}
        </Wrapper>
    );
}
