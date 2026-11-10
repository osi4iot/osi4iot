import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HistoryPanel from "./HistoryPanel";
import { HistoryPanelApi } from "./historyPanelsApi";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const alarm = (over: Record<string, unknown>): any => ({
    time: "2026-11-09T11:58:00Z", eventId: "e1", nodeUid: "n1", nodeName: "", alarmName: "Tower acceleration", alarmKey: "",
    event: "raised", level: "Alarm", state: "active_unack", shelved: false, raisedAt: "2026-11-09T11:50:00Z", value: 2.5,
    threshold: "2", units: "m/s^2", ackBy: "", ackAt: null, userName: "", message: "", ...over,
});

const api = (over: Partial<HistoryPanelApi> = {}): HistoryPanelApi => ({
    load: vi.fn().mockResolvedValue({
        now: [alarm({}), alarm({ eventId: "e2", alarmName: "Rotor speed", level: "Warning", state: "active_ack", ackBy: "ana" })],
        events: [alarm({ eventId: "e3", event: "acked", ackBy: "ana", state: "active_ack" }), alarm({ eventId: "e4", event: "cleared", level: "Normal", state: "normal" })],
    }),
    detail: vi.fn().mockResolvedValue({ description: "Too high", value: 2.5, units: "m/s^2", triggerPayload: { acc: 2.5 } }),
    ...over,
});

describe("History panel", () => {
    it("shows the active alarms of the twin with their state", async () => {
        const a = api();
        render(<HistoryPanel kind="alarms" groupId={3} digitalTwinId={9} api={a} now={() => NOW} />);
        expect(await screen.findByText("Tower acceleration")).toBeInTheDocument();
        expect(a.load).toHaveBeenCalledWith("alarms", 3, 9, expect.anything());
        expect(screen.getByRole("tab", { name: /Active/ })).toHaveTextContent("2");
        expect(screen.getByText("1 unacknowledged · 1 acknowledged")).toBeInTheDocument();
        expect(screen.getByText("Unacknowledged")).toBeInTheDocument();
        expect(screen.getAllByText("10 min ago")).toHaveLength(2);
    });

    it("opens the detail of an event with the message that caused it", async () => {
        const a = api();
        render(<HistoryPanel kind="alarms" groupId={3} digitalTwinId={9} api={a} now={() => NOW} />);
        await screen.findByText("Tower acceleration");
        fireEvent.click(screen.getByRole("tab", { name: "Events" }));
        const list = screen.getByRole("list", { name: "Events" });
        expect(within(list).getByText("Acknowledged")).toBeInTheDocument();
        expect(within(list).getByText("Cleared")).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(within(list).getAllByRole("button")[0]);
        });
        expect(a.detail).toHaveBeenCalledWith("alarms", 3, "e3");
        expect(await screen.findByText("Too high")).toBeInTheDocument();
        expect(screen.getByLabelText("Message that caused the event")).toHaveTextContent('"acc": 2.5');
    });

    it("shows the requests waiting for a decision", async () => {
        const a = api({
            load: vi.fn().mockResolvedValue({
                now: [{ eventId: "r1", requestId: "q1", event: "requested", title: "Stop the turbine?", channel: "telegram", requestedAt: "2026-11-09T11:55:00Z", expiresAt: "2026-11-09T12:02:00Z", time: "2026-11-09T11:55:00Z" }],
                events: [],
            }),
        });
        render(<HistoryPanel kind="approvals" groupId={3} digitalTwinId={9} api={a} now={() => NOW} />);
        expect(await screen.findByText("Stop the turbine?")).toBeInTheDocument();
        expect(screen.getByText("Asked by telegram · Expires in 2 min")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("tab", { name: "Decisions" }));
        expect(screen.getByText("No approval requests in the last 30 days.")).toBeInTheDocument();
    });

    it("asks for nothing while paused and shows errors", async () => {
        const paused = api();
        const { unmount } = render(<HistoryPanel kind="alarms" groupId={3} digitalTwinId={9} api={paused} paused />);
        expect(paused.load).not.toHaveBeenCalled();
        unmount();
        const failing = api({ load: vi.fn().mockRejectedValue({ response: { data: { message: "You are not a group administrator" } } }) });
        render(<HistoryPanel kind="alarms" groupId={3} digitalTwinId={9} api={failing} />);
        await waitFor(() => expect(screen.getByText("You are not a group administrator")).toBeInTheDocument());
    });
});
