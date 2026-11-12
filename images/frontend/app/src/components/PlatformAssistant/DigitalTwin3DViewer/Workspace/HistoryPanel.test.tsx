import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HistoryPanel, { HistoryActions, alarmActionsOf } from "./HistoryPanel";
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

    describe("managed from the panel (group administrators)", () => {
        const actions = (): HistoryActions => ({
            acknowledge: vi.fn().mockResolvedValue(undefined),
            shelve: vi.fn().mockResolvedValue(undefined),
            reset: vi.fn().mockResolvedValue(undefined),
            decide: vi.fn().mockResolvedValue(undefined),
        });

        it("acknowledges, shelves and resets an alarm, and reads the history again", async () => {
            const a = api({
                load: vi.fn().mockResolvedValue({
                    now: [alarm({ alarmKey: "acc" }), alarm({ eventId: "e2", nodeUid: "n2", alarmName: "Rotor speed", alarmKey: "rpm", state: "latched", ackBy: "ana" })],
                    events: [],
                }),
            });
            const act$ = actions();
            render(<HistoryPanel kind="alarms" groupId={3} digitalTwinId={9} api={a} now={() => NOW} actions={act$} />);
            await screen.findByText("Tower acceleration");
            fireEvent.click(screen.getByText("Tower acceleration"));
            const bar = screen.getByLabelText("Manage the alarm Tower acceleration");
            fireEvent.change(within(bar).getByRole("combobox", { name: "Shelve for" }), { target: { value: "240" } });
            await act(async () => {
                fireEvent.click(within(bar).getByRole("button", { name: "Acknowledge" }));
            });
            expect(act$.acknowledge).toHaveBeenCalledWith("n1", "acc");
            await waitFor(() => expect(a.load).toHaveBeenCalledTimes(2));
            await act(async () => {
                fireEvent.click(within(bar).getByRole("button", { name: "Shelve for" }));
            });
            expect(act$.shelve).toHaveBeenCalledWith("n1", "acc", 240);
            // the latched one, already acknowledged: reset, no acknowledge
            fireEvent.click(screen.getByText("Rotor speed · rpm"));
            const latched = screen.getByLabelText("Manage the alarm Rotor speed · rpm");
            expect(within(latched).queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
            await act(async () => {
                fireEvent.click(within(latched).getByRole("button", { name: "Reset" }));
            });
            expect(act$.reset).toHaveBeenCalledWith("n2", "rpm");
        });

        it("acknowledges all the alarms of the twin", async () => {
            const act$ = actions();
            render(<HistoryPanel kind="alarms" groupId={3} digitalTwinId={9} api={api()} now={() => NOW} actions={act$} />);
            await screen.findByText("Tower acceleration");
            await act(async () => {
                fireEvent.click(screen.getByRole("button", { name: "Acknowledge all" }));
            });
            expect(act$.acknowledge).toHaveBeenCalledWith("n1");
            expect(act$.acknowledge).toHaveBeenCalledTimes(1);
        });

        it("approves or rejects a request with a comment", async () => {
            const a = api({
                load: vi.fn().mockResolvedValue({
                    now: [{ eventId: "r1", nodeUid: "n7", requestId: "q1", event: "requested", title: "Stop the turbine?", channel: "web", requestedAt: "2026-11-09T11:55:00Z", expiresAt: null, time: "2026-11-09T11:55:00Z" }],
                    events: [],
                }),
            });
            const act$ = actions();
            render(<HistoryPanel kind="approvals" groupId={3} digitalTwinId={9} api={a} now={() => NOW} actions={act$} />);
            fireEvent.click(await screen.findByText("Stop the turbine?"));
            const bar = screen.getByLabelText("Decide the request Stop the turbine?");
            fireEvent.change(within(bar).getByRole("textbox", { name: "Comment" }), { target: { value: "Wind above 25 m/s" } });
            await act(async () => {
                fireEvent.click(within(bar).getByRole("button", { name: "Reject" }));
            });
            expect(act$.decide).toHaveBeenCalledWith("n7", "q1", false, "Wind above 25 m/s");
        });

        it("shows no actions to those who are not administrators, nor in the events", async () => {
            render(<HistoryPanel kind="alarms" groupId={3} digitalTwinId={9} api={api()} now={() => NOW} />);
            fireEvent.click(await screen.findByText("Tower acceleration"));
            expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
            expect(screen.queryByRole("button", { name: "Acknowledge all" })).not.toBeInTheDocument();
            expect(alarmActionsOf(alarm({ state: "shelved", shelved: true }))).toEqual({ acknowledge: false, reset: false, unshelve: true });
        });
    });
});
