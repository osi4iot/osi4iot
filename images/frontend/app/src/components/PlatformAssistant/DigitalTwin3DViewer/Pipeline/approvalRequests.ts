// The viewer's side of the Approval nodes (pipelines' nodes/approvalNode.go): the pending requests of a node and
// the decisions on them, as NATS requests on the user's own copy of the digital twin's "approval" topic. Only the
// NATS users who administer the group may publish there (auth_callout), and pipelines takes the user who decides
// from that subject; the Approval-Node header says which node is asked.
import { headers, NatsConnection } from "@nats-io/nats-core";
import { natsUserChatSubject } from "../../../../tools/natsInbox";
import { StringCodec } from "../../../../tools/natsCodec";

const sc = StringCodec();

export const APPROVAL_TOPIC_REF = "approval";
export const APPROVAL_NODE_HEADER = "Approval-Node";
const APPROVAL_REQUEST_TIMEOUT_MS = 5000;

export interface ApprovalRequestSummary {
    requestId: string;
    title: string;
    detail?: string;
    created: string;
    expires?: string;
}

interface ApprovalAnswer {
    ok: boolean;
    error?: string;
    requests?: ApprovalRequestSummary[];
}

export const approvalSubject = (natsSubjectsData: { topicRef: string; natsSubject: string }[] | undefined): string | undefined =>
    (natsSubjectsData ?? []).find((s) => s.topicRef === APPROVAL_TOPIC_REF)?.natsSubject;

// A NATS failure in words for the person who decides
export const describeApprovalError = (error: unknown): string => {
    const text = error instanceof Error ? error.message : String(error);
    if (/no responders|503/i.test(text)) return "the pipeline is not running";
    if (/timeout/i.test(text)) return "no answer: only the group's administrators can decide, and the pipeline must be running";
    return text;
};

const ask = async (
    natsClient: NatsConnection,
    userName: string,
    subject: string,
    nodeUid: string,
    body: Record<string, unknown>,
): Promise<ApprovalAnswer> => {
    const h = headers();
    h.set("Content-Type", "application/json");
    h.set(APPROVAL_NODE_HEADER, nodeUid);
    const reply = await natsClient.request(natsUserChatSubject(userName, subject), sc.encode(JSON.stringify(body)), {
        timeout: APPROVAL_REQUEST_TIMEOUT_MS,
        headers: h,
    });
    return JSON.parse(sc.decode(reply.data)) as ApprovalAnswer;
};

export const listApprovalRequests = async (
    natsClient: NatsConnection,
    userName: string,
    subject: string,
    nodeUid: string,
): Promise<ApprovalRequestSummary[]> => {
    const answer = await ask(natsClient, userName, subject, nodeUid, { action: "list" });
    if (!answer.ok) throw new Error(answer.error || "the requests could not be read");
    return answer.requests ?? [];
};

export const decideApprovalRequest = async (
    natsClient: NatsConnection,
    userName: string,
    subject: string,
    nodeUid: string,
    requestId: string,
    approve: boolean,
    comment: string,
): Promise<void> => {
    const answer = await ask(natsClient, userName, subject, nodeUid, {
        action: approve ? "approve" : "reject",
        requestId,
        comment: comment.trim(),
    });
    if (!answer.ok) throw new Error(answer.error || "the decision could not be saved");
};
