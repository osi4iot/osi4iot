import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ViewerConfigFileField from "./ViewerConfigFileField";
import { digitalTwinFileTargets, isFemResultsDocument, isSimulationFormatDocument, isViewerConfigDocument } from "./digitalTwinFileTargets";
import { buildViewerPackage } from "../DigitalTwin3DViewer/Workspace/viewerPackage";

const text = JSON.stringify({
    format: "osi4iot-viewer-config",
    version: 1,
    viewerSettings: { lighting: { lightingPreset: "outdoor" } },
    layout: { version: 2, slides: [{ id: "slide-1", title: "Slide 1", tag: "Slide_1", panels: [] }] },
});

describe("viewer configuration in the digital twin forms", () => {
    it("is told apart from the other json files", () => {
        expect(isViewerConfigDocument(text)).toBe(true);
        expect(isSimulationFormatDocument(text)).toBe(false);
        expect(isFemResultsDocument(text)).toBe(false);
        expect(isViewerConfigDocument(JSON.stringify({ metadata: {} }))).toBe(false);
    });

    it("reads a file and shows what it brings", async () => {
        const onChange = vi.fn();
        const { rerender } = render(<ViewerConfigFileField value={null} onChange={onChange} replaces />);
        expect(screen.getByText(/Saving the form replaces the current ones/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Viewer configuration file"), {
            target: { files: [new File([text], "oc4_viewer_config.json", { type: "application/json" })] },
        });
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        const value = onChange.mock.calls[0][0];
        expect(value.fileName).toBe("oc4_viewer_config.json");
        rerender(<ViewerConfigFileField value={value} onChange={onChange} />);
        expect(screen.getByText('1 slide, 0 panels · lighting "outdoor"')).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(onChange).toHaveBeenLastCalledWith(null);
    });

    it("reads a .zip with the configuration and its images", async () => {
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]);
        const zip = buildViewerPackage("viewer_config.json", text, [{ fileName: "plan.png", data: png }]);
        const onChange = vi.fn();
        const { rerender } = render(<ViewerConfigFileField value={null} onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("Viewer configuration file"), {
            target: { files: [new File([zip as BlobPart], "oc4_viewer_config.zip", { type: "application/zip" })] },
        });
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        const value = onChange.mock.calls[0][0];
        expect(value.images.map((i: { fileName: string }) => i.fileName)).toEqual(["plan.png"]);
        rerender(<ViewerConfigFileField value={value} onChange={onChange} />);
        expect(screen.getByText(/1 slide, 0 panels · lighting "outdoor" · 1 image/)).toBeInTheDocument();
        expect(screen.getByText(/Its images are uploaded to the twin when the form is saved/)).toBeInTheDocument();
    });

    it("sends a .zip dropped with the other files to the viewer configuration", () => {
        const noop = { clear: vi.fn(), loadFiles: vi.fn(async () => {}) };
        const targets = digitalTwinFileTargets({
            digitalTwinType: "Glb 3D model",
            pipeline: noop,
            clearPipeline: vi.fn(),
            gltf: noop,
            clearGltf: vi.fn(),
            femResults: noop,
            clearFemResults: vi.fn(),
            loadSimulationFormat: vi.fn(),
            loadViewerConfig: vi.fn(),
        });
        const viewerConfig = targets.find((t) => t.key === "viewerConfig")!;
        expect(viewerConfig.accept).toContain(".zip");
        expect(viewerConfig.test!("PK\u0003\u0004…", new File(["x"], "twin.zip"))).toBe(true);
        expect(viewerConfig.test!("{}", new File(["{}"], "other.json"))).toBe(false);
    });
});
