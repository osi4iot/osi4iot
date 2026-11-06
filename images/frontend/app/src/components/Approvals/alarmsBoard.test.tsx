import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StringCodec } from "../../tools/natsCodec";
import AlarmsBoard, { alarmSituation } from "./AlarmsBoard";
import { alarmNodesOfPipeline, buildApprovalTargets, groupsWithApprovalNodes, approvalNodesOfPipeline } from "./approvalsData";
import { countAlarms } from "./useApprovals";

vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const sc = StringCodec();

const DTS = [
    {
        id: 1, groupId: 10, assetId: 100, digitalTwinUid: "dtA", description: "Pump twin",
        pipelineFileData: JSON.stringify([
            { nodeUid: "AL1", type: "Alarm", name: "Motor temperature", settings: { latched: false } },
            { nodeUid: "AL2", type: "Alarm", name: "Overload trip", settings: { latched: true } },
        ]),
    },
    {
        id: 2, groupId: 10, assetId: 101, digitalTwinUid: "dtB", description: "Line twin",
        pipelineFileData: JSON.stringify([{ nodeUid: "AL3", type: "Alarm", name: "Vibration" }]),
    },
];
const GROUPS = [{ id: 10, name: "Plant", acronym: "PLT" }];
const ASSETS = [
    { id: 100, assetUid: "a", description: "Pump P-101" },
    { id: 101, assetUid: "b", description: "Line 2" },
];
const TOPICS = { 10: { DT_dtA: { approval: "approval/Group_g/Topic_1" }, DT_dtB: { approval: "approval/Group_g/Topic_2" } } };
const targets = buildApprovalTargets(DTS, GROUPS, ASSETS, TOPICS, alarmNodesOfPipeline);

const fakeNats = () => {
    const alarms: Record<string, any[]> = {
        AL1: [
            { key: "", name: "Motor temperature", level: "Warning", state: "active_ack", value: "72 °C", threshold: "70 °C", canAck: false, shelved: false, ackBy: "luis", raisedAt: "2026-11-06T06:00:00Z" },
        ],
        AL2: [
            { key: "", name: "Overload trip", level: "Alarm", state: "latched", value: "12 A", canAck: false, canReset: true, latched: true, acked: true, shelved: false, ackBy: "ana", latchedAt: "2026-11-06T06:30:00Z" },
        ],
        AL3: [
            { key: "S1", name: "Vibration (S1)", level: "Alarm", state: "active_unack", value: "9 mm/s", threshold: "7.1 mm/s", canAck: true, shelved: false },
            { key: "S2", name: "Vibration (S2)", level: "Warning", state: "shelved", value: "5 mm/s", canAck: true, shelved: true, shelvedUntil: "2026-11-06T12:00:00Z" },
        ],
    };
    const request = vi.fn(async (_s: string, data: Uint8Array, opts: any) => {
        const node = opts.headers.get("Alarm-Node");
        const body = JSON.parse(sc.decode(data));
        if (body.action === "list") return { data: sc.encode(JSON.stringify({ ok: true, alarms: alarms[node] ?? [] })) };
        if (body.action === "reset") alarms[node] = alarms[node].filter((a) => a.key !== body.key);
        if (body.action === "ack") alarms[node] = alarms[node].map((a) => (a.key === body.key ? { ...a, canAck: false, state: "active_ack", ackBy: "ana" } : a));
        return { data: sc.encode(JSON.stringify({ ok: true })) };
    });
    return { client: { request } as any, request };
};

describe("the Alarms page data", () => {
    it("finds every Alarm node, and their groups with the approvals'", () => {
        expect(targets.map((t) => t.key).sort()).toEqual(["dtA/AL1", "dtA/AL2", "dtB/AL3"]);
        expect(groupsWithApprovalNodes(DTS, [approvalNodesOfPipeline, alarmNodesOfPipeline])).toEqual([10]);
        expect(groupsWithApprovalNodes(DTS)).toEqual([]);
    });

    it("says each situation", () => {
        expect(alarmSituation({ state: "latched", canAck: false } as any).text).toBe("Latched · waiting for a reset");
        expect(alarmSituation({ state: "latched", canAck: true } as any).tone).toBe("attend");
        expect(alarmSituation({ state: "active_ack", canAck: false } as any).text).toBe("Active · acknowledged");
        expect(alarmSituation({ state: "shelved", shelved: true } as any).text).toBe("Shelved");
    });

    it("counts the alarms to acknowledge and the acknowledged ones still active", async () => {
        const { client } = fakeNats();
        expect(await countAlarms(client, "ana", targets)).toEqual({ toAttend: 1, active: 2 });
    });
});

describe("the Alarms board", () => {
    it("shows all the alarms that are not normal, the ones to attend first, and acts on them", async () => {
        const { client, request } = fakeNats();
        render(<AlarmsBoard natsClient={client} isNatsConnected={true} userName="ana" targets={targets} />);
        const rows = await screen.findAllByTestId("alarm-row");
        expect(rows).toHaveLength(4);
        expect(screen.getByLabelText("Alarms to acknowledge").textContent).toBe("1");
        expect(screen.getByLabelText("Summary").textContent).toContain("2 active, acknowledged");
        // the asset with an alarm to acknowledge comes first
        const cards = screen.getAllByRole("region");
        expect(within(cards[0]).getByText("Line 2")).toBeTruthy();
        expect(within(rows[0]).getByText("Active · to acknowledge")).toBeTruthy();
        // an acknowledged alarm is still listed, with who acknowledged it
        expect(screen.getByText("Active · acknowledged")).toBeTruthy();
        expect(screen.getByText(/acknowledged by luis/)).toBeTruthy();

        const latched = rows.find((r) => within(r).queryByText("Latched · waiting for a reset"))!;
        await act(async () => fireEvent.click(within(latched).getByText("Reset")));
        await act(async () => fireEvent.click(within(rows[0]).getByText("Acknowledge")));
        const actions = request.mock.calls.map((c: any[]) => [c[2].headers.get("Alarm-Node"), JSON.parse(sc.decode(c[1]))]).filter(([, b]) => b.action !== "list");
        expect(actions).toEqual([
            ["AL2", { action: "reset", key: "" }],
            ["AL3", { action: "ack", key: "S1" }],
        ]);
        await waitFor(() => expect(screen.getAllByTestId("alarm-row")).toHaveLength(3));
        expect(screen.getByLabelText("Alarms to acknowledge").textContent).toBe("0");
        // the shelving uses the time chosen
        fireEvent.change(screen.getByLabelText("Shelve for"), { target: { value: "240" } });
        const motor = screen.getAllByTestId("alarm-row").find((r) => within(r).queryByText("Motor temperature"))!;
        await act(async () => fireEvent.click(within(motor).getByText("Shelve")));
        const shelves = request.mock.calls.map((c: any[]) => JSON.parse(sc.decode(c[1]))).filter((b: any) => b.action === "shelve");
        expect(shelves).toEqual([{ action: "shelve", minutes: 240, key: "" }]);
    });
});
