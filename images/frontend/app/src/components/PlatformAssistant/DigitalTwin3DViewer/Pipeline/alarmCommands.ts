// The viewer's side of the Alarm nodes' buttons (pipelines' nodes/alarmNode.go): the alarms of a node that are
// not normal, and acknowledging or shelving them. They are NATS requests on the user's own copy of the digital
// twin's "approval" topic, the same as the Approval nodes' (approvalRequests.ts): only the group's administrators
// may publish there (auth_callout), and pipelines takes the user who presses from that subject. The Alarm-Node
// header says which node is asked.
import { headers, NatsConnection } from "@nats-io/nats-core";
import { natsUserChatSubject } from "../../../../tools/natsInbox";
import { StringCodec } from "../../../../tools/natsCodec";

const sc = StringCodec();

export const ALARM_NODE_HEADER = "Alarm-Node";
const ALARM_REQUEST_TIMEOUT_MS = 5000;

export const SHELVE_OPTIONS_MINUTES = [15, 60, 240, 480, 1440];

export interface AlarmSummary {
    key: string;
    name: string;
    level: "Normal" | "Warning" | "Alarm";
    state: "active_unack" | "active_ack" | "rtn_unack" | "latched" | "shelved";
    value: string;
    threshold?: string;
    raisedAt?: string;
    ackBy?: string;
    ackAt?: string;
    canAck: boolean;
    canReset?: boolean; // latched and its value already back to normal
    latched?: boolean;
    latchedAt?: string;
    active?: boolean; // its value is beyond the level now
    acked?: boolean;
    shelved: boolean;
    shelvedUntil?: string;
    maxLevel?: string;
}

interface AlarmAnswer {
    ok: boolean;
    error?: string;
    alarms?: AlarmSummary[];
}

// A NATS failure in words for the person who presses
export const describeAlarmError = (error: unknown): string => {
    const text = error instanceof Error ? error.message : String(error);
    if (/no responders|503/i.test(text)) return "the pipeline is not running";
    if (/timeout/i.test(text)) return "no answer: only the group's administrators can act on alarms, and the pipeline must be running";
    return text;
};

export const shelveLabel = (minutes: number): string => (minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`);

const ask = async (
    natsClient: NatsConnection,
    userName: string,
    subject: string,
    nodeUid: string,
    body: Record<string, unknown>,
): Promise<AlarmAnswer> => {
    const h = headers();
    h.set("Content-Type", "application/json");
    h.set(ALARM_NODE_HEADER, nodeUid);
    const reply = await natsClient.request(natsUserChatSubject(userName, subject), sc.encode(JSON.stringify(body)), {
        timeout: ALARM_REQUEST_TIMEOUT_MS,
        headers: h,
    });
    return JSON.parse(sc.decode(reply.data)) as AlarmAnswer;
};

const check = (answer: AlarmAnswer, what: string) => {
    if (!answer.ok) throw new Error(answer.error || `${what} failed`);
};

export const listAlarms = async (natsClient: NatsConnection, userName: string, subject: string, nodeUid: string): Promise<AlarmSummary[]> => {
    const answer = await ask(natsClient, userName, subject, nodeUid, { action: "list" });
    check(answer, "reading the alarms");
    return answer.alarms ?? [];
};

// key undefined: all the alarms of the node
export const acknowledgeAlarms = async (
    natsClient: NatsConnection,
    userName: string,
    subject: string,
    nodeUid: string,
    key?: string,
): Promise<void> => {
    const body: Record<string, unknown> = { action: "ack" };
    if (key !== undefined) body.key = key;
    check(await ask(natsClient, userName, subject, nodeUid, body), "the acknowledgement");
};

// minutes 0: unshelve; key undefined: all the alarms of the node
export const shelveAlarms = async (
    natsClient: NatsConnection,
    userName: string,
    subject: string,
    nodeUid: string,
    minutes: number,
    key?: string,
): Promise<void> => {
    const body: Record<string, unknown> = { action: "shelve", minutes };
    if (key !== undefined) body.key = key;
    check(await ask(natsClient, userName, subject, nodeUid, body), "the shelving");
};

// key undefined: all the latched alarms of the node whose value is back to normal
export const resetAlarms = async (
    natsClient: NatsConnection,
    userName: string,
    subject: string,
    nodeUid: string,
    key?: string,
): Promise<void> => {
    const body: Record<string, unknown> = { action: "reset" };
    if (key !== undefined) body.key = key;
    check(await ask(natsClient, userName, subject, nodeUid, body), "the reset");
};

// The alarms that are still active (or latched) but already acknowledged, not shelved
export const alarmsAcknowledgedActive = (alarms: AlarmSummary[] | null): number =>
    (alarms ?? []).filter((a) => !a.shelved && !a.canAck).length;

// What the badge counts: the alarms waiting for someone (unacknowledged and not shelved)
export const alarmsToAttend = (alarms: AlarmSummary[] | null): number => (alarms ?? []).filter((a) => a.canAck && !a.shelved).length;
