// Hooks of the Approvals and Alarms pages and of the home page's buttons: the Approval and Alarm nodes to ask
// (admin_api), the NATS connection, and the numbers of pending requests and of alarms.
import { useEffect, useState } from "react";
import { type NatsConnection } from "@nats-io/nats-core";
import { AxiosError } from "axios";
import { useAuthDispatch, useAuthState } from "../../contexts/authContext";
import { useLoggedUserLogin } from "../../contexts/authContext/authContext";
import { getAxiosInstance } from "../../tools/axiosIntance";
import axiosErrorHandler from "../../tools/axiosErrorHandler";
import NatsConnect from "../../tools/Natsconnection";
import { axiosAuth, getDomainName, getProtocol } from "../../tools/tools";
import { listApprovalRequests } from "../PlatformAssistant/DigitalTwin3DViewer/Pipeline/approvalRequests";
import { AlarmSummary, alarmsToAttend, listAlarms } from "../PlatformAssistant/DigitalTwin3DViewer/Pipeline/alarmCommands";
import {
    alarmNodesOfPipeline,
    approvalNodesOfPipeline,
    ApprovalTarget,
    ApprovalsAsset,
    ApprovalsDigitalTwin,
    ApprovalsGroup,
    buildApprovalTargets,
    DigitalTwinMqttTopics,
    groupsWithApprovalNodes,
} from "./approvalsData";

const domainName = getDomainName();
const protocol = getProtocol();

export const PENDING_COUNT_POLL_MS = 30_000;

export interface PlatformTargets {
    approvals: ApprovalTarget[] | null; // null while loading
    alarms: ApprovalTarget[] | null;
}

// The Approval and Alarm nodes of the user's digital twins. quiet: without error toasts (home page).
export const usePlatformTargets = (enabled = true, quiet = false): PlatformTargets => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [targets, setTargets] = useState<PlatformTargets>({ approvals: null, alarms: null });

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        const config = axiosAuth(accessToken);
        const api = getAxiosInstance(refreshToken, authDispatch);
        const get = (path: string) => api.get(`${protocol}://${domainName}/admin_api/${path}`, config).then((r) => r.data);
        (async () => {
            try {
                const [digitalTwins, groups, assets] = (await Promise.all([
                    get("digital_twins/user_managed"),
                    get("groups/user_managed"),
                    get("assets/user_managed"),
                ])) as [ApprovalsDigitalTwin[], ApprovalsGroup[], ApprovalsAsset[]];
                const topicsByGroup: Record<number, DigitalTwinMqttTopics> = {};
                await Promise.all(
                    groupsWithApprovalNodes(digitalTwins, [approvalNodesOfPipeline, alarmNodesOfPipeline]).map(async (groupId) => {
                        topicsByGroup[groupId] = await get(`digital_twin_mqtt_topics_in_group/${groupId}`);
                    }),
                );
                if (!cancelled)
                    setTargets({
                        approvals: buildApprovalTargets(digitalTwins, groups, assets, topicsByGroup, approvalNodesOfPipeline),
                        alarms: buildApprovalTargets(digitalTwins, groups, assets, topicsByGroup, alarmNodesOfPipeline),
                    });
            } catch (error) {
                if (cancelled) return;
                setTargets({ approvals: [], alarms: [] });
                if (!quiet) axiosErrorHandler(error as AxiosError, authDispatch);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [enabled, quiet, accessToken, refreshToken, authDispatch]);

    return targets;
};

// The Approval nodes of the user's digital twins (null while loading)
export const useApprovalTargets = (enabled = true, quiet = false): ApprovalTarget[] | null => usePlatformTargets(enabled, quiet).approvals;

// The Alarm nodes of the user's digital twins (null while loading)
export const useAlarmTargets = (enabled = true, quiet = false): ApprovalTarget[] | null => usePlatformTargets(enabled, quiet).alarms;

// A NATS connection of the logged user while enabled (closed when no longer needed)
export const useNatsClient = (enabled = true): { natsClient: NatsConnection | null; isNatsConnected: boolean } => {
    const { accessToken } = useAuthState();
    const userName = useLoggedUserLogin();
    const [natsClient, setNatsClient] = useState<NatsConnection | null>(null);
    const [isNatsConnected, setIsNatsConnected] = useState(false);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        let client: NatsConnection | null = null;
        const setConnected = (value: boolean | ((prev: boolean) => boolean)) => {
            if (!cancelled) setIsNatsConnected(value);
        };
        NatsConnect(setConnected, userName, accessToken)
            .then((nc) => {
                if (cancelled) {
                    nc.close();
                    return;
                }
                client = nc;
                setNatsClient(nc);
            })
            .catch((err) => console.log("Could not connect to NATS:", err));
        return () => {
            cancelled = true;
            client?.close();
            setNatsClient(null);
            setIsNatsConnected(false);
        };
    }, [enabled, userName, accessToken]);

    return { natsClient, isNatsConnected };
};

// The pending requests of all the targets; null when none of their pipelines answers
export const countPendingApprovals = async (
    natsClient: NatsConnection,
    userName: string,
    targets: ApprovalTarget[],
): Promise<number | null> => {
    const answers = await Promise.allSettled(targets.map((t) => listApprovalRequests(natsClient, userName, t.subject, t.nodeUid)));
    const ok = answers.filter((a): a is PromiseFulfilledResult<Awaited<ReturnType<typeof listApprovalRequests>>> => a.status === "fulfilled");
    if (ok.length === 0) return null;
    return ok.reduce((n, a) => n + a.value.length, 0);
};

export interface AlarmCounts {
    toAttend: number; // unacknowledged (active or back to normal), not shelved
    active: number; // active or latched, already acknowledged, not shelved
}

// The alarms of all the targets; null when none of their pipelines answers
export const countAlarms = async (natsClient: NatsConnection, userName: string, targets: ApprovalTarget[]): Promise<AlarmCounts | null> => {
    const answers = await Promise.allSettled(targets.map((t) => listAlarms(natsClient, userName, t.subject, t.nodeUid)));
    const lists = answers.filter((a): a is PromiseFulfilledResult<AlarmSummary[]> => a.status === "fulfilled").map((a) => a.value);
    if (lists.length === 0) return null;
    const all = lists.flat();
    const toAttend = alarmsToAttend(all);
    return { toAttend, active: all.filter((a) => !a.shelved).length - toAttend };
};

export interface PlatformCounts {
    approvals: number | null;
    alarms: AlarmCounts | null;
}

// For the home page: pending requests and alarms, every 30 s (null: unknown or nothing to ask)
export const usePlatformCounts = (enabled: boolean): PlatformCounts => {
    const userName = useLoggedUserLogin();
    const { approvals, alarms } = usePlatformTargets(enabled, true);
    const hasTargets = enabled && ((approvals?.length ?? 0) > 0 || (alarms?.length ?? 0) > 0);
    const { natsClient, isNatsConnected } = useNatsClient(hasTargets);
    const [counts, setCounts] = useState<PlatformCounts>({ approvals: null, alarms: null });

    useEffect(() => {
        if (!hasTargets || !natsClient || !isNatsConnected) return;
        let cancelled = false;
        const update = async () => {
            const [a, b] = await Promise.all([
                approvals && approvals.length > 0 ? countPendingApprovals(natsClient, userName, approvals) : Promise.resolve(null),
                alarms && alarms.length > 0 ? countAlarms(natsClient, userName, alarms) : Promise.resolve(null),
            ]).catch(() => [null, null] as const);
            if (!cancelled) setCounts({ approvals: a, alarms: b });
        };
        update();
        const timer = setInterval(update, PENDING_COUNT_POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [hasTargets, natsClient, isNatsConnected, userName, approvals, alarms]);

    return hasTargets ? counts : { approvals: null, alarms: null };
};

// The number of pending approval requests (see usePlatformCounts)
export const usePendingApprovalsCount = (enabled: boolean): number | null => usePlatformCounts(enabled).approvals;
