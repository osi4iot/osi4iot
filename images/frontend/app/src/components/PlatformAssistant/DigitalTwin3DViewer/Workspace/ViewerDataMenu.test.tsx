import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ViewerDataMenu, { ViewerDataStatus } from "./ViewerDataMenu";
import ViewerDataLoadDialog from "./ViewerDataLoadDialog";
import { readViewerDataFiles } from "./viewerData";

const status: ViewerDataStatus = { configImages: 0 };

const props = () => ({
    canEdit: true,
    busy: null,
    status,
    onLoadFiles: vi.fn(),
    onDownloadAll: vi.fn(),
    onDownloadPart: vi.fn(),
    onOpenConfigFile: vi.fn(),
});

describe("Viewer data menu", () => {
    it("loads files, downloads all and the configuration; the model, the FEM results, the pipeline and the simulator are elsewhere", () => {
        const p = props();
        render(<ViewerDataMenu {...p} />);
        fireEvent.click(screen.getByRole("button", { name: "Viewer data" }));
        expect(screen.queryByText("3D model")).toBeNull();
        expect(screen.queryByText("FEM results")).toBeNull();
        expect(screen.queryByText("Pipeline")).toBeNull();
        expect(screen.queryByText("Simulator format")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Download the viewer configuration" }));
        expect(p.onDownloadPart).toHaveBeenCalledWith("config");

        fireEvent.click(screen.getByRole("button", { name: "Viewer data" }));
        fireEvent.click(screen.getByText("Download all (.zip)"));
        expect(p.onDownloadAll).toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Viewer data" }));
        fireEvent.click(screen.getByText("Load files…"));
        expect(p.onLoadFiles).toHaveBeenCalled();
    });

    it("only downloads the configuration for someone who does not edit, and waits while busy", () => {
        const p = props();
        const { rerender } = render(<ViewerDataMenu {...p} canEdit={false} />);
        fireEvent.click(screen.getByRole("button", { name: "Viewer data" }));
        expect(screen.queryByText("Load files…")).toBeNull();
        expect(screen.queryByText("3D model")).toBeNull();
        expect(screen.getByRole("button", { name: "Download the viewer configuration" })).toBeEnabled();
        rerender(<ViewerDataMenu {...p} busy="Loading 3D model… 40%" />);
        expect(screen.getByRole("button", { name: "Viewer data" })).toHaveTextContent("Loading 3D model… 40%");
        expect(screen.getByText("Load files…").closest("button")).toBeDisabled();
    });
});

describe("Viewer data load dialog", () => {
    it("lists what the files bring and loads only what is ticked", async () => {
        const set = await readViewerDataFiles([
            { name: "pump.glb", data: new Blob(["x"]) },
            {
                name: "s.json",
                data: new Blob([JSON.stringify({ t: { label: "T", units: "C", minValue: 0, maxValue: 1, defaultValue: 0, step: 1 } })]),
            },
            { name: "odd.txt", data: new Blob(["?"]) },
        ]);
        const onLoad = vi.fn();
        render(<ViewerDataLoadDialog set={set} source="3 files" onLoad={onLoad} onClose={() => {}} />);
        expect(screen.getByText("Replaces the 3D model of its slide")).toBeInTheDocument();
        expect(screen.getByText(/odd\.txt: not a part of the viewer data/)).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText("Load 3D model: pump.glb"));
        fireEvent.click(screen.getByRole("button", { name: "Load 1 part" }));
        expect(onLoad).toHaveBeenCalledWith([set.items[1]]);
    });

    it("shows how each part went", async () => {
        const set = await readViewerDataFiles([{ name: "pump.glb", data: new Blob(["x"]) }]);
        const { rerender } = render(
            <ViewerDataLoadDialog
                set={set}
                source="pump.glb"
                states={[{ status: "loading", fraction: 0.4 }]}
                onLoad={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByText("40%")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
        rerender(<ViewerDataLoadDialog set={set} source="pump.glb" states={[{ status: "failed" }]} onLoad={vi.fn()} onClose={vi.fn()} />);
        expect(screen.getByText("Failed")).toBeInTheDocument();
    });
});
