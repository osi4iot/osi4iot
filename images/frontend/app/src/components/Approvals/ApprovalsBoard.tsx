// The pending requests of the Approval nodes of the user's digital twins, grouped by asset, with Approve and Reject.
// The requests are asked to pipelines every few seconds (approvalRequests.ts); deciding goes on the user's own
// NATS subject, so pipelines knows who decided, and only the group's administrators can.
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NatsConnection } from "@nats-io/nats-core";
import styled, { css } from "styled-components";
import { toast } from "react-toastify";
import { Check, RefreshCw, UserCheck, X } from "lucide-react";
import {
    ApprovalRequestSummary,
    decideApprovalRequest,
    describeApprovalError,
    listApprovalRequests,
} from "../PlatformAssistant/DigitalTwin3DViewer/Pipeline/approvalRequests";
import { scrollbarStyle } from "../Tools/FormTools";
import { ApprovalTarget, relativeTime } from "./approvalsData";

export const APPROVALS_POLL_MS = 10_000;

const Page = styled.div`
    box-sizing: border-box;
    width: min(1080px, 100%);
    margin: 0 auto;
    padding: 18px 16px 32px;
    display: flex;
    flex-direction: column;
    gap: 14px;

    @media (max-width: 600px) {
        padding: 8px 8px 24px;
    }
`;

const Head = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
`;

const Title = styled.h2`
    margin: 0;
    font-weight: 500;
    font-size: 18px;
    color: white;
    display: flex;
    align-items: center;
    gap: 10px;
`;

const Count = styled.span<{ $zero: boolean }>`
    min-width: 22px;
    padding: 0 7px;
    border-radius: 11px;
    font-size: 12px;
    line-height: 22px;
    text-align: center;
    color: white;
    background: ${({ $zero }) => ($zero ? "#2a2d33" : "#f2495c")};
`;

const Tools = styled.div`
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #9ca3af;
    font-size: 12px;

    @media (max-width: 600px) {
        margin-left: 0;
        width: 100%;
    }
`;

const Select = styled.select`
    height: 32px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #202226;
    color: #e5e7eb;
    font-size: 13px;

    @media (max-width: 600px) {
        flex: 1;
        min-width: 0;
    }
`;

const IconButton = styled.button`
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #202226;
    color: #e5e7eb;
    cursor: pointer;

    &:hover {
        background: #2a2d33;
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 2px;
    }
`;

const Notice = styled.div<{ $error?: boolean }>`
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
    color: ${({ $error }) => ($error ? "#ffb3b3" : "#c3c9d1")};
    background: ${({ $error }) => ($error ? "rgba(242, 73, 92, 0.12)" : "#202226")};
    border: 1px solid ${({ $error }) => ($error ? "rgba(242, 73, 92, 0.35)" : "rgba(255, 255, 255, 0.08)")};
`;

const Empty = styled.div`
    padding: 48px 20px;
    border-radius: 14px;
    border: 1px dashed rgba(255, 255, 255, 0.14);
    text-align: center;
    color: #9ca3af;
    font-size: 14px;

    strong {
        display: block;
        margin: 10px 0 4px;
        color: #e5e7eb;
        font-weight: 500;
        font-size: 16px;
    }
`;

const AssetCard = styled.section`
    background-color: #202226;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    overflow: hidden;
`;

const AssetHead = styled.header`
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    padding: 12px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);

    h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 500;
        color: white;
    }

    span {
        color: #9ca3af;
        font-size: 12px;
    }
`;

const Requests = styled.div`
    max-height: 70vh;
    overflow-y: auto;
    ${scrollbarStyle}
`;

const Request = styled.article`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px 20px;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);

    &:last-child {
        border-bottom: none;
    }

    @media (max-width: 700px) {
        grid-template-columns: 1fr;
    }
`;

const RequestTitle = styled.div`
    color: #eef2f7;
    font-size: 14px;
    font-weight: 500;
`;

const Detail = styled.div`
    margin-top: 4px;
    color: #c4c9d0;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
`;

const Meta = styled.div`
    margin-top: 6px;
    color: #8b94a1;
    font-size: 12px;

    b {
        font-weight: 500;
        color: #a7b1be;
    }
`;

const Expiry = styled.span<{ $soon: boolean }>`
    color: ${({ $soon }) => ($soon ? "#ff9830" : "inherit")};
`;

const Decision = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;

    input {
        width: 220px;
        height: 34px;
        padding: 0 10px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: #0c0d0f;
        color: #e5e7eb;
        font-size: 13px;
    }

    @media (max-width: 700px) {
        flex-wrap: wrap;

        input {
            width: 100%;
        }
    }
`;

const decisionButton = (color: string, hover: string, shadow: string) => css`
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

const Act = styled.button<{ $kind: "approve" | "reject" }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    border: 1px solid #2c3235;
    border-radius: 10px;
    color: white;
    font-size: 14px;
    cursor: pointer;
    ${({ $kind }) => ($kind === "approve" ? decisionButton("#2f855a", "#276749", "#1c4532") : decisionButton("#c53030", "#9b2c2c", "#63171b"))}

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

    @media (max-width: 700px) {
        flex: 1;
        justify-content: center;
    }
`;

const Unreachable = styled.div`
    padding: 8px 18px 12px;
    color: #ffb3b3;
    font-size: 12px;
`;

interface TargetResult {
    requests: ApprovalRequestSummary[];
    error?: string;
}

interface ApprovalsBoardProps {
    natsClient: NatsConnection | null;
    isNatsConnected: boolean;
    userName: string;
    targets: ApprovalTarget[];
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

const ApprovalsBoard: FC<ApprovalsBoardProps> = ({ natsClient, isNatsConnected, userName, targets }) => {
    const [results, setResults] = useState<Record<string, TargetResult>>({});
    const [loaded, setLoaded] = useState(false);
    const [updatedAt, setUpdatedAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [groupFilter, setGroupFilter] = useState<number | "all">("all");
    const [comments, setComments] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState("");
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
                    return [t.key, { requests: await listApprovalRequests(natsClient, userName, t.subject, t.nodeUid) }];
                } catch (e) {
                    return [t.key, { requests: [], error: describeApprovalError(e) }];
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
        const timer = setInterval(refresh, APPROVALS_POLL_MS);
        return () => clearInterval(timer);
    }, [refresh]);

    const groups = useMemo(() => {
        const seen = new Map<number, string>();
        targets.forEach((t) => seen.set(t.groupId, t.groupLabel));
        return Array.from(seen.entries());
    }, [targets]);

    const visible = targets.filter((t) => groupFilter === "all" || t.groupId === groupFilter);

    // by asset: the requests of all its digital twins and nodes, oldest first
    const assets = useMemo(() => {
        const byAsset = new Map<string, { label: string; group: string; items: { t: ApprovalTarget; r: ApprovalRequestSummary }[]; errors: ApprovalTarget[] }>();
        for (const t of visible) {
            const id = `${t.groupId}/${t.assetId}`;
            if (!byAsset.has(id)) byAsset.set(id, { label: t.assetLabel, group: t.groupLabel, items: [], errors: [] });
            const entry = byAsset.get(id)!;
            const result = results[t.key];
            if (!result) continue;
            if (result.error) entry.errors.push(t);
            result.requests.forEach((r) => entry.items.push({ t, r }));
        }
        for (const entry of byAsset.values()) entry.items.sort((a, b) => a.r.created.localeCompare(b.r.created));
        // the assets with requests first; those whose pipelines do not answer, at the end
        return Array.from(byAsset.entries())
            .filter(([, e]) => e.items.length > 0 || e.errors.length > 0)
            .sort(([, a], [, b]) => Number(b.items.length > 0) - Number(a.items.length > 0));
    }, [visible, results]);

    const pending = assets.reduce((n, [, e]) => n + e.items.length, 0);

    const decide = async (t: ApprovalTarget, r: ApprovalRequestSummary, approve: boolean) => {
        const id = `${t.key}/${r.requestId}`;
        setBusy(id);
        try {
            await decideApprovalRequest(natsClient as NatsConnection, userName, t.subject, t.nodeUid, r.requestId, approve, comments[id] ?? "");
            toast.success(approve ? "Request approved" : "Request rejected");
            setComments((c) => {
                const next = { ...c };
                delete next[id];
                return next;
            });
        } catch (e) {
            toast.error(`The decision was not saved: ${describeApprovalError(e)}`);
        } finally {
            if (alive.current) setBusy("");
            refresh();
        }
    };

    return (
        <Page>
            <Head>
                <Title>
                    <UserCheck size={20} color="#a7b1be" />
                    Approvals
                    <Count $zero={pending === 0} aria-label="Pending requests">
                        {pending}
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
                    {updatedAt && <span>Updated {new Date(updatedAt).toLocaleTimeString()}</span>}
                    <IconButton type="button" aria-label="Refresh" title="Refresh" onClick={() => refresh()}>
                        <RefreshCw size={15} />
                    </IconButton>
                </Tools>
            </Head>

            {!isNatsConnected && <Notice $error>Connecting to the platform's message broker…</Notice>}

            {isNatsConnected && loaded && pending === 0 && assets.length === 0 && (
                <Empty>
                    <UserCheck size={30} color="#6f7a88" />
                    <strong>No pending requests</strong>
                    The requests of the Approval nodes of your digital twins appear here as soon as they are made.
                </Empty>
            )}

            {assets.map(([id, entry]) => (
                <AssetCard key={id} aria-label={entry.label}>
                    <AssetHead>
                        <h3>{entry.label}</h3>
                        <span>{entry.group}</span>
                        {entry.items.length > 0 && <span>{entry.items.length} pending</span>}
                    </AssetHead>
                    <Requests>
                        {entry.items.map(({ t, r }) => {
                            const rid = `${t.key}/${r.requestId}`;
                            const expiresSoon = !!r.expires && new Date(r.expires).getTime() - now < 5 * 60_000;
                            return (
                                <Request key={rid} data-testid="approval-request">
                                    <div>
                                        <RequestTitle>{r.title}</RequestTitle>
                                        {r.detail && <Detail>{r.detail}</Detail>}
                                        <Meta>
                                            <b>{t.digitalTwinLabel}</b> · {t.nodeName} · requested{" "}
                                            <span title={when(r.created)}>{relativeTime(r.created, now)}</span>
                                            {r.expires && (
                                                <>
                                                    {" "}
                                                    ·{" "}
                                                    <Expiry $soon={expiresSoon} title={when(r.expires)}>
                                                        expires {relativeTime(r.expires, now)}
                                                    </Expiry>
                                                </>
                                            )}
                                        </Meta>
                                    </div>
                                    <Decision>
                                        <input
                                            aria-label="Comment"
                                            placeholder="Comment (optional)"
                                            value={comments[rid] ?? ""}
                                            onChange={(e) => setComments({ ...comments, [rid]: e.target.value })}
                                        />
                                        <Act type="button" $kind="approve" disabled={busy !== ""} onClick={() => decide(t, r, true)}>
                                            <Check size={15} /> Approve
                                        </Act>
                                        <Act type="button" $kind="reject" disabled={busy !== ""} onClick={() => decide(t, r, false)}>
                                            <X size={15} /> Reject
                                        </Act>
                                    </Decision>
                                </Request>
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

export default ApprovalsBoard;
