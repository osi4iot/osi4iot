import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AssetSwitcher from "./AssetSwitcher";
import { buildSwitcherEntries } from "./assetSwitcherData";

const entries = () =>
    buildSwitcherEntries(
        {
            assets: [
                { id: 1, orgId: 10, groupId: 100, assetUid: "a1", description: "OC4 tower", assetType: "Wind turbine" },
                { id: 2, orgId: 10, groupId: 100, assetUid: "a2", description: "Pump", assetType: "Pump" },
            ] as any,
            digitalTwins: [
                { id: 11, assetId: 1, description: "OC4 floating turbine", digitalTwinUid: "dt11", type: "Glb 3D model" },
                { id: 12, assetId: 1, description: "OC4 rotor study", digitalTwinUid: "dt12", type: "Gltf 3D model" },
                { id: 21, assetId: 2, description: "Pump dashboard", digitalTwinUid: "dt21", type: "Grafana dashboard" },
            ] as any,
            groups: [{ id: 100, name: "Wind lab", acronym: "WL", orgId: 10, floorNumber: 0 }] as any,
            orgs: [{ id: 10, name: "Lab", acronym: "LAB", buildingId: 5 }] as any,
            buildings: [{ id: 5, name: "Main building" }] as any,
            floors: [{ id: 50, buildingId: 5, floorNumber: 0 }] as any,
            digitalTwinsState: [],
            sensorsState: [{ orgId: 10, groupId: 100, assetId: 2, sensorId: 7, state: "alerting" }],
        },
        { "12": 1000 },
    );

describe("Asset switcher", () => {
    it("lists the assets by place and opens the last used twin with Enter", () => {
        const onOpen = vi.fn();
        render(<AssetSwitcher open entries={entries()} currentDigitalTwinId={null} onClose={() => {}} onOpenTwin={onOpen} />);
        const dialog = screen.getByRole("dialog", { name: "Go to an asset" });
        const list = within(dialog).getByRole("listbox", { name: "Assets" });
        expect(within(list).getByRole("group", { name: "Main building · Floor 0" })).toBeInTheDocument();
        // the asset with an alarm comes first
        const options = within(list).getAllByRole("option");
        expect(options[0]).toHaveAccessibleName("Pump, Alerting");

        const input = screen.getByRole("combobox", { name: "Search assets and digital twins" });
        fireEvent.change(input, { target: { value: "tower" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onOpen.mock.calls[0][1].digitalTwin.id).toBe(12);
    });

    it("moves to the twins with the right arrow and opens the chosen one", () => {
        const onOpen = vi.fn();
        render(<AssetSwitcher open entries={entries()} currentDigitalTwinId={21} onClose={() => {}} onOpenTwin={onOpen} />);
        const input = screen.getByRole("combobox");
        // starts on the asset being viewed (Pump); down goes to the tower
        expect(screen.getByRole("option", { selected: true })).toHaveAccessibleName("Pump, Alerting");
        fireEvent.keyDown(input, { key: "ArrowDown" });
        expect(screen.getByRole("option", { selected: true })).toHaveAccessibleName("OC4 tower, OK");
        fireEvent.keyDown(input, { key: "ArrowRight" });
        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onOpen.mock.calls[0][1].digitalTwin.id).toBe(11);
    });

    it("filters by alarms and closes with Escape", () => {
        const onClose = vi.fn();
        render(<AssetSwitcher open entries={entries()} currentDigitalTwinId={null} onClose={onClose} onOpenTwin={() => {}} />);
        fireEvent.click(screen.getByRole("button", { name: /With alarms/ }));
        expect(screen.getAllByRole("option")).toHaveLength(1);
        fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("opens a twin by clicking it in the side list", () => {
        const onOpen = vi.fn();
        render(<AssetSwitcher open entries={entries()} currentDigitalTwinId={null} onClose={() => {}} onOpenTwin={onOpen} />);
        fireEvent.mouseMove(screen.getByRole("option", { name: "OC4 tower, OK" }));
        const side = screen.getByRole("complementary", { name: "Digital twins of the asset" });
        fireEvent.click(within(side).getByRole("button", { name: /OC4 floating turbine/ }));
        expect(onOpen.mock.calls[0][1].digitalTwin.id).toBe(11);
    });

    it("renders nothing when closed", () => {
        render(<AssetSwitcher open={false} entries={entries()} currentDigitalTwinId={null} onClose={() => {}} onOpenTwin={() => {}} />);
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
