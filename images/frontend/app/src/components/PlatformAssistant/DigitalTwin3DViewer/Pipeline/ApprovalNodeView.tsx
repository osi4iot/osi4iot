// @ts-nocheck
// The Approval node in the pipeline editor: a signal-node look with a button that shows its pending requests,
// to approve or reject them (only the group's administrators can: see approvalRequests.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Handle, Position } from "@xyflow/react";
import { UserCheck, Bell } from "lucide-react";
import { toast } from "react-toastify";
import { useLoggedUserLogin } from "../../../../contexts/authContext/authContext";
import {
    ApprovalRequestSummary,
    approvalSubject,
    decideApprovalRequest,
    describeApprovalError,
    listApprovalRequests,
} from "./approvalRequests";

const APPROVAL_POLL_MS = 5_000;

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
    background-color: #8a6d3b;
    border: ${(p) => (p.selected ? "2px solid #3b82f6" : "2px solid #a09c98ff")};
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;

    &:hover {
        background-color: #a3844f;
    }
`;

const Label = styled.div`
    color: #e7e3df;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    padding-right: 6px;
`;

const PendingButton = styled.button<{ $active?: boolean }>`
    position: relative;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1px solid #e7e3df80;
    border-radius: 5px;
    background: ${(p) => (p.$active ? "#5c4825" : "transparent")};
    cursor: pointer;
`;

const Badge = styled.span`
    position: absolute;
    top: -7px;
    right: -8px;
    min-width: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #f2495c;
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
    width: 300px;
    max-height: 340px;
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

const Request = styled.div`
    padding: 6px 0 8px;
    border-bottom: 1px solid #374151;

    &:last-child {
        border-bottom: none;
    }
`;

const Detail = styled.div`
    margin: 3px 0;
    color: #c4c9d0;
    white-space: pre-wrap;
    word-break: break-word;
`;

const Meta = styled.div`
    color: #9ca3af;
    font-size: 11px;
`;

const Actions = styled.div`
    display: flex;
    gap: 6px;
    margin-top: 6px;

    input {
        flex: 1;
        min-width: 0;
        padding: 3px 6px;
        border-radius: 4px;
        border: 1px solid #4b5563;
        background: #111827;
        color: #e5e7eb;
        font-size: 11px;
    }
`;

const Act = styled.button<{ $kind: "approve" | "reject" }>`
    flex: none;
    padding: 3px 8px;
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 11px;
    cursor: pointer;
    background: ${(p) => (p.$kind === "approve" ? "#2f855a" : "#c53030")};

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

const StyledHandle = styled(Handle)`
    width: 8px;
    height: 8px;
    background: #e7e3df;
    border: 1px solid #555;
`;

const handleTop = (index: number, total: number) => `${((index + 1) * 100) / (total + 1)}%`;

const OUTPUT_TITLES = ["approved", "rejected", "expired", "new requests"];

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

export function ApprovalNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 4;
    const userName = useLoggedUserLogin();
    const channel = data?.settings?.channel ?? "viewer";
    const subject = approvalSubject(data?.natsSubjectsData);
    const natsClient = data?.natsClient;
    const usable = channel !== "telegram" && !!natsClient && !!subject && !!userName;
    const [open, setOpen] = useState(false);
    const [requests, setRequests] = useState<ApprovalRequestSummary[] | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState("");
    const [comments, setComments] = useState<Record<string, string>>({});
    const alive = useRef(true);
    useEffect(() => () => void (alive.current = false), []);

    const refresh = useCallback(async () => {
        if (!usable) return;
        try {
            const list = await listApprovalRequests(natsClient, userName, subject, data.nodeUid);
            if (!alive.current) return;
            setRequests(list);
            setError("");
        } catch (e) {
            if (!alive.current) return;
            setRequests(null);
            setError(describeApprovalError(e));
        }
    }, [usable, natsClient, userName, subject, data?.nodeUid]);

    // once when shown (for the badge), and every few seconds while the list is open
    useEffect(() => {
        if (!usable) return;
        refresh();
        if (!open) return;
        const timer = setInterval(refresh, APPROVAL_POLL_MS);
        return () => clearInterval(timer);
    }, [usable, open, refresh]);

    const decide = async (requestId: string, approve: boolean) => {
        setBusy(requestId);
        try {
            await decideApprovalRequest(natsClient, userName, subject, data.nodeUid, requestId, approve, comments[requestId] ?? "");
            toast.success(approve ? "Request approved" : "Request rejected");
        } catch (e) {
            toast.error(`The decision was not saved: ${describeApprovalError(e)}`);
        } finally {
            setBusy("");
            refresh();
        }
    };

    const pending = requests?.length ?? 0;
    let title = "Pending requests";
    if (channel === "telegram") title = "Decided from Telegram";
    else if (!subject) title = "The digital twin has no approval topic yet: save the pipeline and reload the viewer";
    else if (!natsClient) title = "Not connected";

    return (
        <Wrapper>
            <Box selected={selected}>
                <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
                <PendingButton
                    className="nodrag"
                    $active={open}
                    title={title}
                    disabled={!usable}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (usable) setOpen(!open);
                    }}
                >
                    {usable ? <Bell size={14} color="#e7e3df" /> : <UserCheck size={14} color="#e7e3df" />}
                    {pending > 0 && <Badge>{pending > 99 ? "99+" : pending}</Badge>}
                </PendingButton>
                <Label>{data?.label || "Approval"}</Label>
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
                    {!error && requests !== null && requests.length === 0 && <Meta>No pending requests</Meta>}
                    {(requests ?? []).map((r) => (
                        <Request key={r.requestId}>
                            <div>{r.title}</div>
                            {r.detail && <Detail>{r.detail}</Detail>}
                            <Meta>
                                {when(r.created)}
                                {r.expires ? ` · expires ${when(r.expires)}` : ""}
                            </Meta>
                            <Actions>
                                <input
                                    aria-label="Comment"
                                    placeholder="comment (optional)"
                                    value={comments[r.requestId] ?? ""}
                                    onChange={(e) => setComments({ ...comments, [r.requestId]: e.target.value })}
                                />
                                <Act $kind="approve" disabled={busy !== ""} onClick={() => decide(r.requestId, true)}>
                                    Approve
                                </Act>
                                <Act $kind="reject" disabled={busy !== ""} onClick={() => decide(r.requestId, false)}>
                                    Reject
                                </Act>
                            </Actions>
                        </Request>
                    ))}
                </Panel>
            )}
        </Wrapper>
    );
}
