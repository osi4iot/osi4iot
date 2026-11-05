// Hooks of the Approvals page and of the home page's "Approvals" button: the Approval nodes to ask (admin_api),
// the NATS connection, and the number of pending requests.
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
import {
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

// The Approval nodes of the user's digital twins (null while loading). quiet: without error toasts (home page).
export const useApprovalTargets = (enabled = true, quiet = false): ApprovalTarget[] | null => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [targets, setTargets] = useState<ApprovalTarget[] | null>(null);

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
                    groupsWithApprovalNodes(digitalTwins).map(async (groupId) => {
                        topicsByGroup[groupId] = await get(`digital_twin_mqtt_topics_in_group/${groupId}`);
                    }),
                );
                if (!cancelled) setTargets(buildApprovalTargets(digitalTwins, groups, assets, topicsByGroup));
            } catch (error) {
                if (cancelled) return;
                setTargets([]);
                if (!quiet) axiosErrorHandler(error as AxiosError, authDispatch);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [enabled, quiet, accessToken, refreshToken, authDispatch]);

    return targets;
};

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

// For the home page: the number of pending requests, every 30 s (null: unknown or nothing to ask)
export const usePendingApprovalsCount = (enabled: boolean): number | null => {
    const userName = useLoggedUserLogin();
    const targets = useApprovalTargets(enabled, true);
    const hasTargets = enabled && !!targets && targets.length > 0;
    const { natsClient, isNatsConnected } = useNatsClient(hasTargets);
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        if (!hasTargets || !natsClient || !isNatsConnected || !targets) return;
        let cancelled = false;
        const update = () =>
            countPendingApprovals(natsClient, userName, targets)
                .then((n) => {
                    if (!cancelled) setCount(n);
                })
                .catch(() => undefined);
        update();
        const timer = setInterval(update, PENDING_COUNT_POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [hasTargets, natsClient, isNatsConnected, userName, targets]);

    return hasTargets ? count : null;
};
