import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ViewerConfigFileField from "./ViewerConfigFileField";
import { isFemResultsDocument, isSimulationFormatDocument, isViewerConfigDocument } from "./digitalTwinFileTargets";

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
});
