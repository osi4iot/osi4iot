import { describe, expect, it } from "vitest";
import {
    alarmState,
    alarmSummary,
    alarmTitle,
    approvalSummary,
    countAlarmStates,
    detailEntries,
    eventText,
    expiresText,
    formatAlarmValue,
    formatDuration,
    timeAgo,
    triggerPayloadText,
} from "./historyPanels";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const alarm = (over: Record<string, unknown> = {}): any => ({
    time: "2026-11-09T11:58:00Z", eventId: "e1", nodeUid: "n1", nodeName: "Tower alarm", alarmName: "Tower acceleration",
    alarmKey: "", event: "raised", level: "Alarm", state: "active_unack", shelved: false, raisedAt: "2026-11-09T11:50:00Z",
    value: 2.345678, threshold: "2", units: "m/s^2", ackBy: "", ackAt: null, userName: "", message: "", ...over,
});

describe("history panels", () => {
    it("names alarms, states and events", () => {
        expect(alarmTitle(alarm())).toBe("Tower acceleration");
        expect(alarmTitle(alarm({ alarmKey: "sensor_2" }))).toBe("Tower acceleration · sensor_2");
        expect(alarmTitle(alarm({ alarmName: "", nodeName: "" }))).toBe("n1");
        expect(alarmState("active_unack")).toEqual({ text: "Unacknowledged", tone: "danger" });
        expect(alarmState("weird").text).toBe("weird");
        expect(eventText("acked")).toBe("Acknowledged");
        expect(eventText("raised")).toBe("Raised");
    });

    it("shows the value against its limit", () => {
        expect(formatAlarmValue(2.345678, "m/s^2")).toBe("2.3457 m/s^2");
        expect(formatAlarmValue({ a: 1 }, "-")).toBe('{"a":1}');
        expect(formatAlarmValue(null, "")).toBe("");
        expect(alarmSummary(alarm())).toBe("2.3457 m/s^2 (limit 2)");
        expect(alarmSummary(alarm({ value: null, message: "Door open" }))).toBe("Door open");
    });

    it("counts the alarms by state", () => {
        const rows = [alarm(), alarm({ state: "rtn_unack" }), alarm({ state: "active_ack" }), alarm({ state: "shelved" })];
        expect(countAlarmStates(rows)).toEqual({ unacked: 2, acked: 1, shelved: 1 });
    });

    it("describes approvals and their time limit", () => {
        const base: any = { event: "approved", decidedBy: "ana", via: "telegram", waitSeconds: 95, channel: "telegram" };
        expect(approvalSummary(base)).toBe("by ana · via telegram · after 2 min");
        expect(approvalSummary({ ...base, event: "rejected", decidedBy: "", via: "node", waitSeconds: null })).toBe("by the pipeline");
        expect(approvalSummary({ ...base, event: "requested" })).toBe("Asked by telegram");
        expect(expiresText(null, NOW)).toEqual({ text: "No time limit", soon: false });
        expect(expiresText("2026-11-09T12:03:00Z", NOW)).toEqual({ text: "Expires in 3 min", soon: true });
        expect(expiresText("2026-11-09T13:00:00Z", NOW)).toEqual({ text: "Expires in 1 h", soon: false });
        expect(expiresText("2026-11-09T11:00:00Z", NOW).text).toBe("Expired");
    });

    it("writes durations and times ago", () => {
        expect(formatDuration(45_000)).toBe("45 s");
        expect(formatDuration(90 * 60_000)).toBe("1 h 30 min");
        expect(formatDuration(26 * 3600_000)).toBe("1 d 2 h");
        expect(timeAgo("2026-11-09T11:59:50Z", NOW)).toBe("just now");
        expect(timeAgo("2026-11-09T11:50:00Z", NOW)).toBe("10 min ago");
        expect(timeAgo(null, NOW)).toBe("");
    });

    it("lists the detail fields that have a value", () => {
        const entries = detailEntries({ description: "Too high", value: 3, units: "kN", ackBy: "", threshold: "2" }, "alarms");
        expect(entries).toEqual([["Description", "Too high"], ["Value", "3 kN"], ["Limit", "2"]]);
        expect(detailEntries({ comment: "ok", via: "chat" }, "approvals")).toEqual([["Comment", "ok"], ["Via", "chat"]]);
        expect(triggerPayloadText({ a: 1 })).toBe('{\n  "a": 1\n}');
        expect(triggerPayloadText("x".repeat(10), 5)).toBe("xxxxx\n…");
        expect(triggerPayloadText(null)).toBe("");
    });
});
