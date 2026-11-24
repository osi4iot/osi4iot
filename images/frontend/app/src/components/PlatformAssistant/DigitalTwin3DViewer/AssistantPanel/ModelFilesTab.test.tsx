import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ModelFilesTab from "./ModelFilesTab";

const props = () => ({
    model: "pump.glb" as string | null,
    femCount: 2 as number | null,
    femMax: 3,
    busy: null as string | null,
    onShow: vi.fn(),
    onLoadFiles: vi.fn(),
    onDownloadModel: vi.fn(),
    onRemoveModel: vi.fn(),
    onDownloadFem: vi.fn(),
    onSetFemMax: vi.fn(),
});

describe("3D model settings: Files", () => {
    it("shows the model and its FEM results, downloads them and removes the model after confirming", () => {
        const p = props();
        render(<ModelFilesTab {...p} />);
        expect(p.onShow).toHaveBeenCalled();
        expect(screen.getByText("pump.glb")).toBeInTheDocument();
        expect(screen.getByText("2 files")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Download the 3D model" }));
        expect(p.onDownloadModel).toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Download the FEM results" }));
        expect(p.onDownloadFem).toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Remove the 3D model" }));
        expect(p.onRemoveModel).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Confirm: remove the 3D model" }));
        expect(p.onRemoveModel).toHaveBeenCalled();
    });

    it("loads the chosen files and saves how many FEM results are kept", () => {
        const p = props();
        render(<ModelFilesTab {...p} />);
        const file = new File(["x"], "new.glb");
        fireEvent.change(screen.getByTestId("model-file"), { target: { files: [file] } });
        expect(p.onLoadFiles).toHaveBeenCalledWith([file]);
        fireEvent.change(screen.getByLabelText("FEM result files kept"), { target: { value: "7" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(p.onSetFemMax).toHaveBeenCalledWith(7);
    });

    it("without a model there is nothing to download or remove; busy, every button waits", () => {
        const p = props();
        const { rerender } = render(<ModelFilesTab {...p} model={null} femCount={0} />);
        expect(screen.getByRole("button", { name: "Download the 3D model" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Remove the 3D model" })).toBeDisabled();
        rerender(<ModelFilesTab {...p} busy="Loading viewer data…" />);
        expect(screen.getByRole("status")).toHaveTextContent("Loading viewer data…");
        expect(screen.getByRole("button", { name: "Download the 3D model" })).toBeDisabled();
    });
});
