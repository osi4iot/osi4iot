import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StringCodec } from "../../tools/natsCodec";
import ApprovalsBoard from "./ApprovalsBoard";
import { approvalNodesOfPipeline, buildApprovalTargets, groupsWithApprovalNodes, relativeTime } from "./approvalsData";
import { countPendingApprovals } from "./useApprovals";
import { ApprovalNode } from "../PlatformAssistant/DigitalTwin3DViewer/Pipeline/ApprovalNodeView";
import { ReactFlowProvider } from "@xyflow/react";

vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const sc = StringCodec();

const pipeline = (nodes: any[]) => JSON.stringify(nodes);

const DTS = [
    {
        id: 1, groupId: 10, assetId: 100, digitalTwinUid: "dtA", description: "Pump twin",
        pipelineFileData: pipeline([
            { nodeUid: "LISTEN", type: "Listen", name: "Listen", settings: {} },
            { nodeUid: "APV1", type: "Approval", name: "Setpoint approval", settings: { channel: "viewer", title: "Setpoint" } },
            { nodeUid: "APV2", type: "Approval", name: "Telegram only", settings: { channel: "telegram" } },
        ]),
    },
    {
        id: 2, groupId: 20, assetId: 200, digitalTwinUid: "dtB", description: "",
        pipelineFileData: pipeline([{ nodeUid: "APV3", type: "Approval", name: "Valve", settings: { channel: "both" } }]),
    },
    { id: 3, groupId: 20, assetId: 201, digitalTwinUid: "dtC", description: "No approvals", pipelineFileData: "" },
    // its pipeline was not saved since the node was added: no approval topic yet
    { id: 4, groupId: 20, assetId: 202, digitalTwinUid: "dtD", description: "New", pipelineFileData: pipeline([{ nodeUid: "APV4", type: "Approval", name: "x" }]) },
];
const GROUPS = [
    { id: 10, name: "Pumping station", acronym: "PUMP" },
    { id: 20, name: "VALV", acronym: "VALV" },
];
const ASSETS = [
    { id: 100, assetUid: "a100", description: "Pump P-101" },
    { id: 200, assetUid: "a200", description: "" },
];
const TOPICS = {
    10: { DT_dtA: { approval: "approval/Group_g10/Topic_t1", sim2llm: "sim2llm/Group_g10/Topic_t2" } },
    20: { DT_dtB: { approval: "approval/Group_g20/Topic_t3" } },
};

describe("the Approvals page data", () => {
    it("finds the Approval nodes decided from the platform", () => {
        expect(approvalNodesOfPipeline(DTS[0].pipelineFileData).map((n) => n.nodeUid)).toEqual(["APV1"]);
        expect(approvalNodesOfPipeline("not json")).toEqual([]);
        expect(approvalNodesOfPipeline("")).toEqual([]);
        expect(groupsWithApprovalNodes(DTS)).toEqual([10, 20]);
    });

    it("builds one target per node with its subject and names", () => {
        const targets = buildApprovalTargets(DTS, GROUPS, ASSETS, TOPICS);
        expect(targets.map((t) => [t.key, t.subject, t.assetLabel, t.groupLabel, t.digitalTwinLabel])).toEqual([
            ["dtA/APV1", "approval.Group_g10.Topic_t1", "Pump P-101", "PUMP · Pumping station", "Pump twin"],
            ["dtB/APV3", "approval.Group_g20.Topic_t3", "Asset_a200", "VALV", "DT_dtB"],
        ]);
    });

    it("says times in words", () => {
        const now = Date.parse("2026-11-05T12:00:00Z");
        expect(relativeTime("2026-11-05T12:25:00Z", now)).toBe("in 25 min");
        expect(relativeTime("2026-11-05T09:00:00Z", now)).toBe("3 h ago");
        expect(relativeTime(undefined, now)).toBe("");
    });
});

// pipelines' answers: APV1 has two requests, APV3 is not running
const fakeNats = () => {
    const pending: Record<string, any[]> = {
        APV1: [
            { requestId: "R2", title: "Setpoint", detail: "Cambiar la consigna a 90 rpm", created: "2026-11-05T10:05:00Z", expires: "2026-11-05T10:35:00Z" },
            { requestId: "R1", title: "Setpoint", detail: "Cambiar la consigna a 80 rpm", created: "2026-11-05T10:00:00Z" },
        ],
    };
    const request = vi.fn(async (subject: string, data: Uint8Array, opts: any) => {
        const node = opts.headers.get("Approval-Node");
        const body = JSON.parse(sc.decode(data));
        if (node === "APV3") throw new Error("503 no responders");
        if (body.action === "list") return { data: sc.encode(JSON.stringify({ ok: true, requests: pending[node] ?? [] })) };
        pending[node] = pending[node].filter((r) => r.requestId !== body.requestId);
        return { data: sc.encode(JSON.stringify({ ok: true })) };
    });
    return { client: { request } as any, request };
};

describe("the Approvals board", () => {
    it("lists the requests by asset and decides them as the user", async () => {
        const { client, request } = fakeNats();
        const targets = buildApprovalTargets(DTS, GROUPS, ASSETS, TOPICS);
        render(<ApprovalsBoard natsClient={client} isNatsConnected={true} userName="ana.p" targets={targets} />);

        const items = await screen.findAllByTestId("approval-request");
        expect(items).toHaveLength(2);
        // oldest first
        expect(within(items[0]).getByText("Cambiar la consigna a 80 rpm")).toBeTruthy();
        expect(screen.getByLabelText("Pending requests").textContent).toBe("2");
        expect(screen.getByText("Pump P-101")).toBeTruthy();
        // the pipeline that does not answer is said, under its asset
        expect(screen.getByText(/Valve: not available \(the pipeline is not running\)/)).toBeTruthy();
        // on the user's own copy of the subject
        expect(request.mock.calls[0][0]).toBe("user.ana_2ep.approval.Group_g10.Topic_t1");

        fireEvent.change(within(items[1]).getByLabelText("Comment"), { target: { value: "ok, turno de mañana" } });
        await act(async () => fireEvent.click(within(items[1]).getByText("Approve")));
        const decision = request.mock.calls.map((c: any[]) => JSON.parse(sc.decode(c[1]))).find((b: any) => b.action !== "list");
        expect(decision).toEqual({ action: "approve", requestId: "R2", comment: "ok, turno de mañana" });
        await waitFor(() => expect(screen.getAllByTestId("approval-request")).toHaveLength(1));
        expect(screen.getByLabelText("Pending requests").textContent).toBe("1");
    });

    it("filters by group and says when there is nothing pending", async () => {
        const { client } = fakeNats();
        const targets = buildApprovalTargets(DTS, GROUPS, ASSETS, TOPICS);
        render(<ApprovalsBoard natsClient={client} isNatsConnected={true} userName="ana" targets={targets} />);
        await screen.findAllByTestId("approval-request");
        fireEvent.change(screen.getByLabelText("Group"), { target: { value: "20" } });
        expect(screen.queryAllByTestId("approval-request")).toHaveLength(0);
        expect(screen.getByLabelText("Pending requests").textContent).toBe("0");
    });
});

describe("the count of the home page", () => {
    it("adds the requests of the pipelines that answer", async () => {
        const { client } = fakeNats();
        const targets = buildApprovalTargets(DTS, GROUPS, ASSETS, TOPICS);
        expect(await countPendingApprovals(client, "ana", targets)).toBe(2);
        expect(await countPendingApprovals(client, "ana", targets.filter((t) => t.nodeUid === "APV3"))).toBeNull();
    });
});

describe("the Approval node in the editor", () => {
    it("has no decisions any more: it points to the Approvals page", () => {
        render(
            <ReactFlowProvider>
                <ApprovalNode selected={false} data={{ nodeUid: "N", label: "Setpoint approval", numOutputs: 4, settings: { channel: "both" } }} />
            </ReactFlowProvider>,
        );
        expect(screen.getByText("Setpoint approval")).toBeTruthy();
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.getByTitle(/Approvals page \(home page\) and in Telegram/)).toBeTruthy();
    });
});
