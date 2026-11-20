import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AssetStatePanel, { AssetStateContent, AssetStateEditor } from "./AssetStatePanel";
import { AssetStateView } from "./assetStatePanel";
import { WorkspacePanel } from "./workspaceLayout";

const view: AssetStateView = {
    assetUid: "a1",
    description: "Water heater",
    lastUpdated: new Date(Date.now() - 60_000).toISOString(),
    state: {
        status: "Alarm",
        state_description: "Pressure too high",
        production: { speed: 3.5 },
        alarms: { "n|": { name: "Pressure", level: "Alarm", value: "9 bar" } },
    },
};

const panel: WorkspacePanel = { id: "s", type: "assetState", x: 0, y: 0, w: 4, h: 5, stateFields: [{ path: "production.speed", label: "Speed", unit: "m/s" }] };

describe("Asset state panel view", () => {
    it("shows the status, description, fields and alarms", () => {
        render(<AssetStateContent view={view} settings={{ stateFields: panel.stateFields }} />);
        expect(screen.getAllByText("Alarm").length).toBeGreaterThan(0);
        expect(screen.getByText("Pressure too high")).toBeTruthy();
        expect(screen.getByText("Speed")).toBeTruthy();
        expect(screen.getByText("m/s")).toBeTruthy();
        expect(screen.getByText("Pressure")).toBeTruthy();
        expect(screen.getByText(/Updated/)).toBeTruthy();
    });

    it("says the state is old after the minutes set", () => {
        const old = { ...view, lastUpdated: new Date(Date.now() - 3 * 3600_000).toISOString() };
        render(<AssetStateContent view={old} settings={{ staleMinutes: 30 }} />);
        expect(screen.getByText(/No changes since/)).toBeTruthy();
    });

    it("reads the state every 5 s and not while paused", async () => {
        vi.useFakeTimers();
        const load = vi.fn().mockResolvedValue(view);
        const { rerender } = render(<AssetStatePanel panel={panel} groupId={1} digitalTwinId={2} load={load} />);
        await act(async () => {});
        expect(load).toHaveBeenCalledTimes(1);
        expect(load.mock.calls[0].slice(0, 2)).toEqual([1, 2]);
        await act(async () => {
            vi.advanceTimersByTime(5000);
        });
        expect(load).toHaveBeenCalledTimes(2);
        rerender(<AssetStatePanel panel={panel} groupId={1} digitalTwinId={2} load={load} paused />);
        await act(async () => {
            vi.advanceTimersByTime(20000);
        });
        expect(load).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });

    it("edits the fields, colours and the minutes", async () => {
        const load = vi.fn().mockResolvedValue(view);
        const onApply = vi.fn();
        render(<AssetStateEditor panel={panel} groupId={1} digitalTwinId={2} load={load} onApply={onApply} onDiscard={() => {}} />);
        await act(async () => {});
        fireEvent.click(screen.getByText("Add colour"));
        fireEvent.change(screen.getByLabelText("Status 1"), { target: { value: "Running" } });
        fireEvent.change(screen.getByLabelText("Colour of status 1"), { target: { value: "#22aa77" } });
        fireEvent.change(screen.getByLabelText(/Old after/), { target: { value: "20" } });
        fireEvent.change(screen.getByLabelText("Path of field 1"), { target: { value: "bad/path" } });
        expect((screen.getByText("Apply") as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText("Path of field 1"), { target: { value: "production.speed" } });
        fireEvent.click(screen.getByText("Apply"));
        expect(onApply).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "assetState",
                stateFields: [{ path: "production.speed", label: "Speed", unit: "m/s" }],
                statusColors: { Running: "#22aa77" },
                staleMinutes: 20,
            }),
        );
    });
});
