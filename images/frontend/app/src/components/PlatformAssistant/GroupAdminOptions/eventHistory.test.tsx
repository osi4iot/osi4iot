import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("../../../tools/axiosIntance", () => ({ getAxiosInstance: () => ({ get }) }));
vi.mock("../../../contexts/authContext", () => ({
    useAuthState: () => ({ accessToken: "a", refreshToken: "r" }),
    useAuthDispatch: () => vi.fn(),
}));

import { defaultHistoryRange, formatSeconds, historyQuery, historyRangeProblem } from "./eventHistory";
import AlarmHistoryContainer, { alarmHistoryRow } from "./AlarmHistoryContainer";
import ApprovalHistoryContainer, { approvalHistoryRow } from "./ApprovalHistoryContainer";

const groups = [{ id: 3, name: "Pumps", acronym: "PMP" }] as any[];
const twins = [
    { id: 7, groupId: 3, description: "Pump twin", digitalTwinUid: "DT7" },
    { id: 8, groupId: 4, description: "Other group's twin", digitalTwinUid: "DT8" },
] as any[];

const alarmEvent = {
    time: "2026-11-01T10:00:00.000Z",
    eventId: "44f26636-29a1-4b2a-8d22-d04468eff9f9",
    digitalTwinId: 7,
    digitalTwinUid: "DT7",
    digitalTwinDescription: "Pump twin",
    assetUid: "A5",
    assetDescription: "Motor",
    nodeUid: "n1",
    nodeName: "Motor temperature",
    alarmName: "Motor temperature",
    alarmKey: "motor-1",
    event: "raised",
    level: "Alarm",
    state: "active_unack",
    shelved: false,
    raisedAt: "2026-11-01T10:00:00.000Z",
    value: 90.5,
    threshold: "> 85 °C",
    units: "°C",
    ackBy: "",
    ackAt: null,
    userName: "",
    message: "Motor temperature 90.5 °C",
};

describe("event history helpers", () => {
    it("checks the days as admin_api does", () => {
        expect(historyRangeProblem("2026-11-01", "2026-11-30")).toBe("");
        expect(historyRangeProblem("2026-11-30", "2026-11-01")).toMatch(/after/);
        expect(historyRangeProblem("2024-01-01", "2026-11-30")).toMatch(/730/);
        expect(historyRangeProblem("", "2026-11-30")).toMatch(/both/);
        expect(defaultHistoryRange(new Date("2026-11-08T10:00:00Z"))).toEqual({ from: "2026-10-10", to: "2026-11-08" });
        expect(historyQuery("2026-11-01", "2026-11-30", 7, { format: "csv" })).toBe(
            "from=2026-11-01&to=2026-11-30&format=csv&digitalTwinId=7",
        );
        expect(formatSeconds(45)).toBe("45 s");
        expect(formatSeconds(3720)).toBe("1 h 2 min");
        expect(formatSeconds(null)).toBe("");
    });

    it("shows the rows of the events", () => {
        const row = alarmHistoryRow({ ...alarmEvent, shelved: true });
        expect(row).toMatchObject({ alarm: "Motor temperature · motor-1", event: "raised (shelved)", valueString: "90.5 °C" });
        const approval = approvalHistoryRow({
            time: "2026-11-01T10:01:30.000Z",
            eventId: "e2",
            requestId: "req1",
            event: "approved",
            title: "Change setpoint",
            decidedBy: "ana",
            via: "viewer",
            waitSeconds: 90,
            requestedAt: "2026-11-01T10:00:00.000Z",
        } as any);
        expect(approval).toMatchObject({ decidedBy: "ana", wait: "1 min 30 s", requestId: "req1" });
    });
});

describe("alarm history", () => {
    it("loads the last 30 days of the group, filters by digital twin and opens an event", async () => {
        get.mockReset();
        get.mockImplementation((url: string) => {
            if (url.includes("alarm_history_event/3/")) {
                return Promise.resolve({ data: { ...alarmEvent, triggerPayload: { temperature: 90.5 } } });
            }
            return Promise.resolve({ data: { events: [alarmEvent], truncated: false } });
        });
        render(<AlarmHistoryContainer groupsManaged={groups} digitalTwins={twins} />);
        expect(await screen.findByText("Motor temperature · motor-1")).toBeTruthy();
        expect(get.mock.calls[0][0]).toMatch(/\/admin_api\/alarm_history\/3\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);

        // only the digital twins of the group
        const select = screen.getByLabelText("Digital twin") as HTMLSelectElement;
        expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["All", "Pump twin"]);
        fireEvent.change(select, { target: { value: "7" } });
        fireEvent.click(screen.getByText("Show"));
        await waitFor(() => expect(get.mock.calls.at(-1)![0]).toMatch(/digitalTwinId=7$/));

        fireEvent.click(await screen.findByText("View"));
        expect(await screen.findByText(/"temperature": 90.5/)).toBeTruthy();
    });

    it("does not ask for a range longer than the history", async () => {
        get.mockReset();
        get.mockResolvedValue({ data: { events: [], truncated: false } });
        render(<ApprovalHistoryContainer groupsManaged={groups} digitalTwins={twins} />);
        await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
        expect(get.mock.calls[0][0]).toMatch(/\/admin_api\/approval_history\/3\?/);
        fireEvent.change(screen.getByLabelText("From"), { target: { value: "2020-01-01" } });
        expect(screen.getByText(/At most 730 days/)).toBeTruthy();
        expect((screen.getByText("Show") as HTMLButtonElement).disabled).toBe(true);
    });
});
