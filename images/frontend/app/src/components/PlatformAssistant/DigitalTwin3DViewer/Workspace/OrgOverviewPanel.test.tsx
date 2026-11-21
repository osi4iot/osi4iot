import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrgOverviewEditor, OrgOverviewPanel } from "./OrgOverviewPanel";
import { OrgOverviewData } from "./orgOverview";

const data: OrgOverviewData = {
    orgId: 7,
    period: "30d",
    from: "2026-10-22T00:00:00.000Z",
    to: "2026-11-21T00:00:00.000Z",
    bucket: "day",
    unavailableStatuses: ["Alarm"],
    totals: {
        groups: 2,
        assets: 5,
        assetsWithHistory: 3,
        inactiveAssets: 1,
        availability: 0.974,
        mtbfHours: 50,
        mttrHours: 3.4,
        failures: 2,
        alarmsRaised: 12,
        mttaMinutes: 6,
        activeAlarms: 3,
        activeAlarmsByLevel: { Alarm: 1, Warning: 2 },
        approvalsPending: 2,
        s3: { folders: 3, bytes: 5 * 1024 ** 3, lastStorage: "2026-11-20T10:00:00.000Z" },
        pipelines: { deployed: 2, failures: 1, nodeErrors: 4 },
    },
    ai: {
        month: "2026-11",
        monthTokens: 4_100_000,
        monthlyTokenLimit: 10_000_000,
        warningPercent: 80,
        byModel: [{ model: "gpt-4.1-mini", providerType: "openai", tokens: 2_400_000 }],
    },
    pipelineLogDays: 7,
    groups: [
        {
            id: 1, name: "Pumping station", assets: 3, assetsWithHistory: 3, inactiveAssets: 1, availability: 0.941, mtbfHours: 55, mttrHours: 3.4,
            failures: 2, alarmsRaised: 10, mttaMinutes: 9, activeAlarms: 3, activeAlarmsByLevel: { Alarm: 1, Warning: 2 }, approvalsPending: 0,
            statusTime: [{ status: "OK", seconds: 4_000_000 }, { status: "Alarm", seconds: 100_000 }], noDataSeconds: 2_592_000,
            ai: { monthTokens: 2_100_000, monthlyTokenLimit: 2_500_000 },
            s3: { folders: 3, bytes: 5 * 1024 ** 3, lastStorage: "2026-11-20T10:00:00.000Z" },
            pipelines: {
                deployed: 2, failures: 1, nodeErrors: 4,
                statusSubjects: [
                    { digitalTwinId: 11, description: "Pump 1 twin", subject: "state2sim.Group_g1.Topic_s11" },
                    { digitalTwinId: 12, description: "Pump 2 twin", subject: "state2sim.Group_g1.Topic_s12" },
                ],
            },
        },
        {
            id: 2, name: "Wind tunnel", assets: 2, assetsWithHistory: 0, inactiveAssets: 0, availability: null, mtbfHours: null, mttrHours: null,
            failures: 0, alarmsRaised: 2, mttaMinutes: null, activeAlarms: 0, activeAlarmsByLevel: {}, approvalsPending: 2, statusTime: [], noDataSeconds: 0,
            ai: { monthTokens: 0, monthlyTokenLimit: 0 },
            s3: { folders: 0, bytes: 0, lastStorage: null },
            pipelines: { deployed: 0, failures: 0, nodeErrors: 0, statusSubjects: [] },
        },
    ],
    series: [
        { start: "2026-11-19T00:00:00.000Z", availability: 0.99, alarms: { Alarm: 1 } },
        { start: "2026-11-20T00:00:00.000Z", availability: 0.95, alarms: { Warning: 2 } },
    ],
    topAlarms: [{ groupId: 1, group: "Pumping station", name: "Pressure high", asset: "Pump 2", node: "Alarm", count: 7 }],
};

const panel = { id: "o", type: "orgOverview", x: 0, y: 0, w: 12, h: 24 } as any;

describe("Organization overview panel", () => {
    it("shows the indicators, the groups and the charts, and reads the period chosen", async () => {
        const load = vi.fn().mockResolvedValue(data);
        render(<OrgOverviewPanel panel={panel} groupId={4} digitalTwinId={9} load={load} />);
        expect(await screen.findByText("97.4%")).toBeInTheDocument();
        expect(load).toHaveBeenLastCalledWith(4, 9, "30d", ["Alarm"], expect.anything());
        expect(screen.getByRole("table", { name: "Groups of the organization" })).toBeInTheDocument();
        // the group with an active alarm of the Alarm level first
        const rows = screen.getAllByRole("row");
        expect(rows[1]).toHaveTextContent("Pumping station");
        expect(screen.getByText("3 of 3 assets with history · 1 with no data recorded")).toBeInTheDocument();
        expect(screen.getByText("Pressure high")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: /Availability by day/ })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: /Pumping station: OK/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "90d" }));
        await waitFor(() => expect(load).toHaveBeenLastCalledWith(4, 9, "90d", ["Alarm"], expect.anything()));
    });

    it("shows the AI tokens, the S3 archives and the pipelines' status as they say it", async () => {
        const handlers: Record<string, (d: unknown) => void> = {};
        const listen = (subject: string, on: (d: unknown) => void) => {
            handlers[subject] = on;
            return () => delete handlers[subject];
        };
        render(<OrgOverviewPanel panel={panel} groupId={4} digitalTwinId={9} load={vi.fn().mockResolvedValue(data)} live={{ listen }} />);
        expect(await screen.findByText("4.1M")).toBeInTheDocument();
        expect(screen.getByText("2.1M / 2.5M")).toBeInTheDocument();
        expect(screen.getAllByText("5.0 GB").length).toBeGreaterThan(0);
        expect(screen.getByText("gpt-4.1-mini")).toBeInTheDocument();
        expect(screen.getByText("1 failures · 4 node errors")).toBeInTheDocument();
        await waitFor(() => expect(Object.keys(handlers)).toHaveLength(2));
        await act(async () => {
            handlers["state2sim.Group_g1.Topic_s11"]({ pipelineStatus: "running" });
            handlers["state2sim.Group_g1.Topic_s12"]({ pipelineStatus: "error" });
            handlers["state2sim.Group_g1.Topic_s12"]({ chatMessages: [] });
        });
        expect(await screen.findByText("1/2 running · 1 error")).toBeInTheDocument();
        expect(screen.getByText("1 error")).toBeInTheDocument();
    });

    it("asks with the statuses of the panel and tells who may see it", async () => {
        const load = vi.fn().mockRejectedValue({ response: { status: 403, data: { message: "no" } } });
        render(<OrgOverviewPanel panel={{ ...panel, unavailableStatuses: ["Alarm", "Stopped"], period: "7d" }} groupId={4} digitalTwinId={9} load={load} />);
        expect(await screen.findByText(/only for the administrators of the organization/)).toBeInTheDocument();
        expect(load).toHaveBeenCalledWith(4, 9, "7d", ["Alarm", "Stopped"], expect.anything());
    });

    it("edits the unavailable statuses and the period it opens with", () => {
        const onApply = vi.fn();
        render(<OrgOverviewEditor panel={panel} onApply={onApply} onDiscard={() => {}} />);
        expect(screen.getByLabelText("Unavailable status 1")).toHaveValue("Alarm");
        fireEvent.click(screen.getByText("Add status"));
        fireEvent.change(screen.getByLabelText("Unavailable status 2"), { target: { value: "Stopped" } });
        fireEvent.change(screen.getByLabelText("Opens with the period"), { target: { value: "90d" } });
        fireEvent.click(screen.getByText("Apply"));
        expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ unavailableStatuses: ["Alarm", "Stopped"], period: "90d" }));
    });

    it("does not store the defaults", () => {
        const onApply = vi.fn();
        render(<OrgOverviewEditor panel={{ ...panel, unavailableStatuses: ["Alarm", "Fault"], period: "7d" }} onApply={onApply} onDiscard={() => {}} />);
        fireEvent.click(screen.getByLabelText("Remove status 2"));
        fireEvent.change(screen.getByLabelText("Opens with the period"), { target: { value: "30d" } });
        fireEvent.click(screen.getByText("Apply"));
        const applied = onApply.mock.calls[0][0];
        expect(applied.unavailableStatuses).toBeUndefined();
        expect(applied.period).toBeUndefined();
    });
});
