import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import { StringCodec } from "../../../../tools/natsCodec";
import { acknowledgeAlarms, AlarmSummary, alarmsAcknowledgedActive, alarmsToAttend, describeAlarmError, listAlarms, resetAlarms, shelveAlarms, shelveLabel } from "./alarmCommands";
import { AlarmNode, alarmStateText } from "./AlarmNodeView";

vi.mock("../../../../contexts/authContext/authContext", () => ({ useLoggedUserLogin: () => "ana.p" }));

const sc = StringCodec();

const ALARMS: AlarmSummary[] = [
    { key: "S2", name: "Temp (S2)", level: "Alarm", state: "active_unack", value: "90 °C", threshold: "85 °C", canAck: true, shelved: false, raisedAt: "2026-11-05T09:00:00Z" },
    { key: "S1", name: "Temp (S1)", level: "Warning", state: "active_ack", value: "72 °C", threshold: "70 °C", canAck: false, shelved: false, ackBy: "luis" },
    { key: "S3", name: "Temp (S3)", level: "Alarm", state: "shelved", value: "99 °C", canAck: true, shelved: true, shelvedUntil: "2026-11-05T12:00:00Z" },
];

// a NATS client that answers "list" with the alarms and anything else with ok
const fakeNats = (alarms: AlarmSummary[] = ALARMS) => {
    const request = vi.fn(async (_subject: string, data: Uint8Array) => {
        const body = JSON.parse(sc.decode(data));
        return { data: sc.encode(JSON.stringify(body.action === "list" ? { ok: true, alarms } : { ok: true })) };
    });
    return { client: { request } as any, request };
};

const bodies = (request: ReturnType<typeof fakeNats>["request"]) => request.mock.calls.map((c: any[]) => JSON.parse(sc.decode(c[1])));

describe("alarm commands from the viewer", () => {
    it("ask on the user's own copy of the approval topic, naming the node", async () => {
        const { client, request } = fakeNats();
        const list = await listAlarms(client, "ana.p", "approval.Group_g.Topic_t", "NODE");
        expect(list).toHaveLength(3);
        const [subject, , opts] = request.mock.calls[0] as any[];
        expect(subject).toBe("user.ana_2ep.approval.Group_g.Topic_t");
        expect(opts.headers.get("Alarm-Node")).toBe("NODE");
        expect(opts.headers.get("Approval-Node")).toBeFalsy();
    });

    it("acknowledge and shelve one alarm or all of them", async () => {
        const { client, request } = fakeNats();
        await acknowledgeAlarms(client, "ana", "s", "N");
        await acknowledgeAlarms(client, "ana", "s", "N", "");
        await shelveAlarms(client, "ana", "s", "N", 60, "S1");
        await shelveAlarms(client, "ana", "s", "N", 0);
        await resetAlarms(client, "ana", "s", "N", "S1");
        expect(bodies(request)).toEqual([
            { action: "ack" },
            { action: "ack", key: "" },
            { action: "shelve", minutes: 60, key: "S1" },
            { action: "shelve", minutes: 0 },
            { action: "reset", key: "S1" },
        ]);
    });

    it("report failures in words", async () => {
        const request = vi.fn(async () => ({ data: sc.encode(JSON.stringify({ ok: false, error: "unknown action" })) }));
        await expect(acknowledgeAlarms({ request } as any, "a", "s", "N")).rejects.toThrow(/unknown action/);
        expect(describeAlarmError(new Error("503 no responders"))).toMatch(/not running/);
        expect(describeAlarmError(new Error("TIMEOUT"))).toMatch(/administrators/);
        expect(shelveLabel(60)).toBe("1 h");
        expect(shelveLabel(15)).toBe("15 min");
    });

    it("count only the alarms waiting for someone", () => {
        expect(alarmsToAttend(ALARMS)).toBe(1);
        expect(alarmsToAttend(null)).toBe(0);
        expect(alarmStateText(ALARMS[1])).toBe("active, acknowledged by luis");
    });
});

describe("the Alarm node view", () => {
    const renderNode = (client: any) =>
        render(
            <ReactFlowProvider>
                <AlarmNode
                    selected={false}
                    data={{
                        nodeUid: "NODE",
                        label: "Temp alarm",
                        numOutputs: 2,
                        natsClient: client,
                        natsSubjectsData: [{ topicRef: "approval", natsSubject: "approval.Group_g.Topic_t" }],
                    }}
                />
            </ReactFlowProvider>,
        );

    it("shows a badge with the alarms to attend and acts on them", async () => {
        const { client, request } = fakeNats();
        renderNode(client);
        await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
        await act(async () => fireEvent.click(screen.getByLabelText("Alarms")));
        expect(await screen.findAllByTestId("alarm-item")).toHaveLength(3);
        expect(screen.getByText(/shelved until/)).toBeTruthy();
        expect(screen.getAllByText("Acknowledge")).toHaveLength(2);

        await act(async () => fireEvent.click(screen.getAllByText("Acknowledge")[0]));
        await act(async () => fireEvent.click(screen.getByText("Unshelve")));
        fireEvent.change(screen.getByLabelText("Shelve for"), { target: { value: "240" } });
        await act(async () => fireEvent.click(screen.getByText("Shelve all")));
        const actions = bodies(request).filter((b: any) => b.action !== "list");
        expect(actions).toEqual([
            { action: "ack", key: "S2" },
            { action: "shelve", minutes: 0, key: "S3" },
            { action: "shelve", minutes: 240 },
        ]);
    });

    it("resets a latched alarm and shows a grey badge with the acknowledged ones still active", async () => {
        const latched: AlarmSummary = {
            key: "", name: "Trip", level: "Alarm", state: "latched", value: "12 A", canAck: false, canReset: true,
            latched: true, acked: true, shelved: false, ackBy: "ana",
        };
        const { client, request } = fakeNats([latched, ALARMS[1]]);
        renderNode(client);
        // nothing to acknowledge, two still active: grey badge
        await waitFor(() => expect(screen.getByTitle("Active alarms, already acknowledged").textContent).toBe("2"));
        await act(async () => fireEvent.click(screen.getByLabelText("Alarms")));
        expect(await screen.findByText(/waiting for a reset \(acknowledged by ana\)/)).toBeTruthy();
        await act(async () => fireEvent.click(screen.getByText("Reset")));
        expect(bodies(request).filter((b: any) => b.action !== "list")).toEqual([{ action: "reset", key: "" }]);
        expect(alarmsAcknowledgedActive([latched, ALARMS[1], ALARMS[0]])).toBe(2);
        expect(alarmStateText({ ...latched, acked: false })).toBe("back to normal, waiting for a reset, unacknowledged");
    });

    it("is disabled without the approval topic", () => {
        render(
            <ReactFlowProvider>
                <AlarmNode selected={false} data={{ nodeUid: "N", numOutputs: 1, natsClient: {}, natsSubjectsData: [] }} />
            </ReactFlowProvider>,
        );
        expect((screen.getByLabelText("Alarms") as HTMLButtonElement).disabled).toBe(true);
    });
});
