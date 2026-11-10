import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ViewerConfigDialog from "./ViewerConfigDialog";
import WorkspaceControls from "./WorkspaceControls";
import { parseViewerConfig } from "./viewerConfig";

const file = JSON.stringify({
    format: "osi4iot-viewer-config",
    version: 1,
    exportedAt: "2026-11-10T19:30:00.000Z",
    source: { digitalTwinUid: "OC4" },
    viewerSettings: { lighting: { lightingPreset: "night" } },
    layout: { version: 2, slides: [{ id: "slide-1", title: "Slide 1", tag: "Slide_1", panels: [{ id: "m", type: "model", x: 0, y: 0, w: 12, h: 12 }] }] },
});

describe("viewer configuration in the viewer", () => {
    it("downloads, and loads a file for group administrators only", async () => {
        const onDownloadConfig = vi.fn();
        const onLoadConfig = vi.fn();
        const { rerender } = render(
            <WorkspaceControls visible canSave origin="group" onEdit={vi.fn()} onRestore={vi.fn()} onDownloadConfig={onDownloadConfig} onLoadConfig={onLoadConfig} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Viewer configuration" }));
        fireEvent.click(screen.getByRole("menuitem", { name: /Download/ }));
        expect(onDownloadConfig).toHaveBeenCalled();
        const input = screen.getByTestId("viewer-config-file") as HTMLInputElement;
        fireEvent.change(input, { target: { files: [new File([file], "oc4.json", { type: "application/json" })] } });
        await waitFor(() => expect(onLoadConfig).toHaveBeenCalledWith("oc4.json", file));

        rerender(<WorkspaceControls visible canSave={false} origin="group" onEdit={vi.fn()} onRestore={vi.fn()} onDownloadConfig={onDownloadConfig} onLoadConfig={onLoadConfig} />);
        fireEvent.click(screen.getByRole("button", { name: "Viewer configuration" }));
        expect(screen.queryByRole("menuitem", { name: /Load/ })).not.toBeInTheDocument();
    });

    it("tells what a file brings and what to check", () => {
        const onLoad = vi.fn();
        render(<ViewerConfigDialog fileName="oc4.json" result={parseViewerConfig(file)} refWarnings={["The twin has no sensor temp (Slide 1 › Chart)."]} onLoad={onLoad} onClose={vi.fn()} />);
        expect(screen.getByText(/1 slide, 1 panel · lighting "night"/)).toBeInTheDocument();
        expect(screen.getByText(/from OC4/)).toBeInTheDocument();
        expect(screen.getByText("The twin has no sensor temp (Slide 1 › Chart).")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Load" }));
        expect(onLoad).toHaveBeenCalled();
    });

    it("shows why a file cannot be loaded", () => {
        render(<ViewerConfigDialog fileName="x.json" result={parseViewerConfig("[]")} refWarnings={[]} onLoad={vi.fn()} onClose={vi.fn()} />);
        expect(screen.getByRole("alert")).toHaveTextContent("This is not a viewer configuration");
        expect(screen.queryByRole("button", { name: "Load" })).not.toBeInTheDocument();
    });
});
