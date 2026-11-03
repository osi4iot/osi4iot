import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SignalNodeSettings } from "./SignalNodesSettings";
import {
    SIGNAL_DEFAULT_SETTINGS,
    approvalProblems,
    degradationProblems,
    isSignalNode,
    oeeProblems,
    signalProblems,
    totalizerProblems,
} from "./signalNodes";
import { decideApprovalRequest, describeApprovalError, listApprovalRequests } from "./approvalRequests";
import { StringCodec } from "../../../../tools/natsCodec";

const sc = StringCodec();

describe("KPI and operation nodes", () => {
    it("are signal nodes with valid defaults (the Degradation threshold must be set)", () => {
        for (const type of ["Totalizer", "OEE", "Approval"] as const) {
            expect(isSignalNode(type)).toBe(true);
            expect(signalProblems(type, SIGNAL_DEFAULT_SETTINGS[type])).toEqual([]);
        }
        expect(signalProblems("Degradation", SIGNAL_DEFAULT_SETTINGS.Degradation)).toEqual(["The failure threshold is required."]);
        expect(signalProblems("Degradation", { ...SIGNAL_DEFAULT_SETTINGS.Degradation, threshold: 7.1 })).toEqual([]);
    });

    it("check their settings like pipelines", () => {
        expect(totalizerProblems({ items: [] })).toHaveLength(1);
        expect(totalizerProblems({ items: [{ name: "a", mode: "counter" }] })[0]).toMatch(/field is required/);
        expect(totalizerProblems({ items: [{ name: "a", mode: "events" }, { name: "a", mode: "events" }] })[0]).toMatch(/repeated/);
        expect(oeeProblems({ productionStates: ["R"], plannedStopStates: ["R"], totalField: "x", idealCycleSeconds: 1 })[0]).toMatch(/both/);
        expect(oeeProblems({ productionStates: ["R"], goodField: "g", idealCycleSeconds: 1 })[0]).toMatch(/only good pieces/);
        expect(oeeProblems({ productionStates: ["R"], totalField: "x", idealCycleSeconds: 1, breaks: ["11:00-10:00", "24:00-25:00"] })).toHaveLength(2);
        expect(oeeProblems({ productionStates: ["R"], totalField: "x", idealCycleSeconds: 1, breaks: ["23:00-24:00"], holidays: ["2026-12-25"] })).toEqual([]);
        expect(degradationProblems({ threshold: 1, bucket: "day", windowDays: 5, minPoints: 10 })[0]).toMatch(/fewer buckets/);
        expect(degradationProblems({ threshold: -1, model: "exponential" })[0]).toMatch(/greater than 0/);
        expect(approvalProblems({ channel: "telegram", chatId: "" })[0]).toMatch(/chat id/);
        expect(approvalProblems({ channel: "both", chatId: "-1001234" })).toEqual([]);
    });

    it("edits the Totalizer items", () => {
        const Harness = () => {
            const [s, setS] = useState<Record<string, any>>({ ...SIGNAL_DEFAULT_SETTINGS.Totalizer });
            return <SignalNodeSettings type="Totalizer" formData={s} onChange={(k, v) => setS((p) => ({ ...p, [k]: v }))} topicRefs={[]} />;
        };
        render(<Harness />);
        fireEvent.change(screen.getByLabelText("Item 1 mode"), { target: { value: "rate" } });
        expect(screen.getByLabelText("Item 1 rate time unit")).toBeTruthy();
        fireEvent.click(screen.getByText("+ Add item"));
        expect(screen.getByRole("alert").textContent).toMatch(/Item 2: the name is required/);
    });

    it("offers the stored topics as Degradation history", () => {
        render(<SignalNodeSettings type="Degradation" formData={{ ...SIGNAL_DEFAULT_SETTINGS.Degradation, threshold: 5 }} onChange={() => {}} topicRefs={["dev2pdb_1", "sim2dtm"]} />);
        const options = Array.from((screen.getByLabelText("History topic") as HTMLSelectElement).options).map((o) => o.value);
        expect(options).toEqual(["", "dev2pdb_1", "dtm2pdb"]);
    });
});

describe("approval requests from the viewer", () => {
    const fakeNats = (answer: object) => {
        const request = vi.fn(async () => ({ data: sc.encode(JSON.stringify(answer)) }));
        return { client: { request } as any, request };
    };

    it("asks on the user's own copy of the approval topic, naming the node", async () => {
        const { client, request } = fakeNats({ ok: true, requests: [{ requestId: "R1", title: "T", created: "2026-11-03T10:00:00.000Z" }] });
        const list = await listApprovalRequests(client, "ana.p", "approval.Group_g.Topic_t", "NODE");
        expect(list).toHaveLength(1);
        const [subject, data, opts] = request.mock.calls[0] as any[];
        expect(subject).toBe("user.ana_2ep.approval.Group_g.Topic_t");
        expect(JSON.parse(sc.decode(data))).toEqual({ action: "list" });
        expect(opts.headers.get("Approval-Node")).toBe("NODE");
    });

    it("reports a decision that was not taken", async () => {
        const { client } = fakeNats({ ok: false, error: "the request is no longer pending (decided or expired)" });
        await expect(decideApprovalRequest(client, "ana", "s", "N", "R1", true, " ok ")).rejects.toThrow(/no longer pending/);
        expect(describeApprovalError(new Error("503 no responders"))).toMatch(/not running/);
        expect(describeApprovalError(new Error("TIMEOUT"))).toMatch(/administrators/);
    });
});
