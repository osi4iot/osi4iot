// The history of alarms and approvals of a digital twin, from admin_api: what is happening now
// (alarm_history_active, approval_history_pending), the latest events (alarm_history, approval_history) and the
// detail of one event (with the copy of the message that caused it).
import { axiosAuth } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import { DOMAIN_NAME, PROTOCOL } from "../Utils/constants";
import { ApiAuth } from "./viewerLayoutApi";
import { AlarmRow, ApprovalRow, HISTORY_PANEL_EVENTS, HistoryPanelKind } from "./historyPanels";

const base = (kind: HistoryPanelKind) =>
    `${PROTOCOL}://${DOMAIN_NAME}/admin_api/${kind === "alarms" ? "alarm_history" : "approval_history"}`;

export const nowUrl = (kind: HistoryPanelKind, groupId: number, digitalTwinId: number) =>
    `${base(kind)}${kind === "alarms" ? "_active" : "_pending"}/${groupId}?digitalTwinId=${digitalTwinId}`;

export const eventsUrl = (kind: HistoryPanelKind, groupId: number, digitalTwinId: number, limit = HISTORY_PANEL_EVENTS) =>
    `${base(kind)}/${groupId}?digitalTwinId=${digitalTwinId}&limit=${limit}`;

export const eventUrl = (kind: HistoryPanelKind, groupId: number, eventId: string) =>
    `${base(kind)}_event/${groupId}/${encodeURIComponent(eventId)}`;

export interface HistoryPanelData {
    // alarms not normal, or requests waiting
    now: (AlarmRow | ApprovalRow)[];
    // the latest events, newest first
    events: (AlarmRow | ApprovalRow)[];
}

export interface HistoryPanelApi {
    load: (kind: HistoryPanelKind, groupId: number, digitalTwinId: number, signal: AbortSignal) => Promise<HistoryPanelData>;
    detail: (kind: HistoryPanelKind, groupId: number, eventId: string) => Promise<Record<string, unknown>>;
}

export const historyPanelApi = (auth: ApiAuth): HistoryPanelApi => {
    const get = async (url: string, signal?: AbortSignal) => {
        const config = { ...(axiosAuth(auth.accessToken) as object), signal };
        const response = await getAxiosInstance(auth.refreshToken, auth.authDispatch).get(url, config as any);
        return response.data;
    };
    return {
        load: async (kind, groupId, digitalTwinId, signal) => {
            const [now, events] = await Promise.all([
                get(nowUrl(kind, groupId, digitalTwinId), signal),
                get(eventsUrl(kind, groupId, digitalTwinId), signal),
            ]);
            return {
                now: (kind === "alarms" ? now?.alarms : now?.requests) ?? [],
                events: events?.events ?? [],
            };
        },
        detail: (kind, groupId, eventId) => get(eventUrl(kind, groupId, eventId)),
    };
};
