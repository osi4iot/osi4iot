import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupAssetStateEditor, GroupAssetStateTable, HealthPanel, PipelineLogsPanel } from "./ControlRoomPanels";
import { ControlRoomData } from "./controlRoom";

const now = Date.now();
const data: ControlRoomData = {
    context: "group",
    groupId: 3,
    groupUid: "g3",
    lastDataDays: 7,
    canSeeLogs: true,
    assets: [
        {
            id: 1,
            assetUid: "a1",
            description: "Boiler",
            assetType: "Machine",
            state: { status: "OK", state_description: "No active alarms", mode: "auto" },
            lastUpdated: new Date(now - 60_000).toISOString(),
            lastData: new Date(now - 30_000).toISOString(),
            devices: [{ topicRef: "dev2pdb_1", topicType: "dev2pdb", lastMessage: new Date(now - 30_000).toISOString() }],
            digitalTwins: [{ id: 11, digitalTwinUid: "dt11", description: "Boiler twin", type: "Gltf 3D model", hasPipeline: true, statusSubject: "state2sim.Group_g3.Topic_s11", logSubject: "dtmlog.Group_g3.Topic_l11" }],
            s3: { folders: 1, bytes: 2048, lastStorage: null },
        },
        {
            id: 2,
            assetUid: "a2",
            description: "Pump",
            assetType: "Machine",
            state: { status: "Alarm", state_description: "Pressure high", alarms: { "n|": { name: "Pressure", level: "Alarm" } } },
            lastUpdated: new Date(now - 5_000).toISOString(),
            lastData: null,
            devices: [],
            digitalTwins: [],
            s3: { folders: 0, bytes: 0, lastStorage: null },
        },
    ],
};

describe("Control room panels", () => {
    it("shows the assets of the group, what needs attention first, with their fields", () => {
        render(<GroupAssetStateTable data={data} settings={{ stateFields: [{ path: "mode", label: "Mode" }] }} now={now} />);
        const rows = screen.getAllByRole("row");
        expect(rows[1]).toHaveTextContent("Pump");
        expect(rows[1]).toHaveTextContent("Alarm");
        expect(rows[2]).toHaveTextContent("Boiler");
        expect(screen.getByText("Mode")).toBeInTheDocument();
        expect(screen.getByText("auto")).toBeInTheDocument();
        fireEvent.click(rows[1]);
        expect(screen.getByText("Pressure high", { selector: "p" })).toBeInTheDocument();
    });

    it("shows the health: the pipeline's status as it comes, the last data, devices and S3", async () => {
        const handlers: Record<string, (d: unknown) => void> = {};
        const listen = vi.fn((subject: string, on: (d: unknown) => void) => {
            handlers[subject] = on;
            return () => delete handlers[subject];
        });
        render(<HealthPanel groupId={3} digitalTwinId={99} load={vi.fn().mockResolvedValue(data)} live={{ groupUid: "g3", listen }} />);
        await screen.findByText("Boiler twin");
        expect(listen).toHaveBeenCalledWith("assetstate.Group_g3.*", expect.any(Function));
        await act(async () => {
            handlers["state2sim.Group_g3.Topic_s11"]?.({ pipelineStatus: "running" });
        });
        expect(screen.getByText("running")).toBeInTheDocument();
        expect(screen.getByText("1/1")).toBeInTheDocument();
        expect(screen.getByText(/2.0 KB · 1 folder|2 KB · 1 folder/)).toBeInTheDocument();
        expect(screen.getByText("No digital twin")).toBeInTheDocument();
        expect(screen.getByText("none in 7 days")).toBeInTheDocument();
    });

    it("lists the pipelines' logs as they come, filtered by level", async () => {
        const handlers: Record<string, (d: unknown) => void> = {};
        const listen = (subject: string, on: (d: unknown) => void) => {
            handlers[subject] = on;
            return () => delete handlers[subject];
        };
        render(<PipelineLogsPanel groupId={3} digitalTwinId={99} load={vi.fn().mockResolvedValue(data)} live={{ groupUid: "g3", listen }} />);
        await screen.findByText(/Nothing logged/);
        await act(async () => {
            handlers["dtmlog.Group_g3.Topic_l11"]?.({ level: "info", component: "pipeline", name: "DT: Boiler", message: "Started" });
            handlers["dtmlog.Group_g3.Topic_l11"]?.({ level: "info", component: "node", name: "Fn", message: "Computed" });
            handlers["dtmlog.Group_g3.Topic_l11"]?.({ level: "error", component: "node", name: "Agent", message: "Model failed" });
        });
        // by default the warnings, errors and the events of the pipelines
        expect(screen.getByText("Started")).toBeInTheDocument();
        expect(screen.queryByText("Computed")).not.toBeInTheDocument();
        expect(screen.getByText("Model failed")).toBeInTheDocument();
        expect(screen.getByText(/since the page opened/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Level"), { target: { value: "all" } });
        expect(screen.getByText("Computed")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Level"), { target: { value: "error" } });
        expect(screen.queryByText("Started")).not.toBeInTheDocument();
        expect(screen.getByText("Model failed")).toBeInTheDocument();
    });

    it("shows the kept logs first, and reads the others when the level asks for them", async () => {
        const at = new Date(now - 3_600_000).toISOString();
        const loadLogs = vi.fn().mockImplementation(async (_g: number, _d: number, levels: string) => ({
            days: 7,
            events: [
                { id: -1, at: Date.parse(at), digitalTwinId: 11, digitalTwin: "Boiler twin", asset: "Boiler", level: "warning", component: "node", name: "Fn", message: "Kept warning" },
                ...(levels === "all"
                    ? [{ id: -2, at: Date.parse(at) - 1000, digitalTwinId: 11, digitalTwin: "Boiler twin", asset: "Boiler", level: "info", component: "node", name: "Fn", message: "Kept info" }]
                    : []),
            ],
        }));
        render(<PipelineLogsPanel groupId={3} digitalTwinId={99} load={vi.fn().mockResolvedValue(data)} loadLogs={loadLogs} />);
        expect(await screen.findByText("Kept warning")).toBeInTheDocument();
        expect(screen.getByText(/in the last 7 days/)).toBeInTheDocument();
        expect(loadLogs).toHaveBeenLastCalledWith(3, 99, "important", expect.anything());
        fireEvent.change(screen.getByLabelText("Level"), { target: { value: "all" } });
        expect(await screen.findByText("Kept info")).toBeInTheDocument();
        expect(loadLogs).toHaveBeenLastCalledWith(3, 99, "all", expect.anything());
    });

    it("tells a viewer that the logs are for editors and administrators", async () => {
        const loadLogs = vi.fn();
        render(
            <PipelineLogsPanel
                groupId={3}
                digitalTwinId={99}
                load={vi.fn().mockResolvedValue({ ...data, canSeeLogs: false })}
                loadLogs={loadLogs}
            />,
        );
        expect(await screen.findByText(/only for the editors and administrators/)).toBeInTheDocument();
        expect(loadLogs).not.toHaveBeenCalled();
    });
    it("edits the Asset state table with the paths and the preview of the group's assets", async () => {
        const onApply = vi.fn();
        const { container } = render(
            <GroupAssetStateEditor
                panel={{ id: "p1", type: "assetState", x: 0, y: 0, w: 6, h: 4 } as any}
                groupId={3}
                digitalTwinId={99}
                load={vi.fn().mockResolvedValue(data)}
                onApply={onApply}
                onDiscard={() => {}}
            />,
        );
        // the preview is the table of the group
        expect(await screen.findByText("Boiler")).toBeInTheDocument();
        expect(screen.getByText("Pump")).toBeInTheDocument();
        expect(screen.getByText("Preview (the assets of the group)")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Add field"));
        const options = [...container.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"));
        expect(options).toContain("mode");
        fireEvent.change(screen.getByLabelText("Path of field 1"), { target: { value: "mode" } });
        // the new column shows in the preview
        expect(await screen.findByText("auto")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Apply"));
        expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ stateFields: [{ path: "mode" }] }));
    });
});