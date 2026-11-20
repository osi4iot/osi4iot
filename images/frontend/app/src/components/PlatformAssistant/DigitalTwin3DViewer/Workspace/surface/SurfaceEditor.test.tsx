import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// the chart needs WebGL: here it only shows what it would draw
vi.mock("./SurfaceChart", () => ({
    default: ({ option, label }: { option: any; label: string }) => (
        <div data-testid="surface-chart" aria-label={label}>
            {`${option.series[0].dataShape.join("x")} z ${Number(option.zAxis3D.min.toFixed(2))}..${Number(option.zAxis3D.max.toFixed(2))} ${option.xAxis3D.name}/${option.yAxis3D.name}/${option.zAxis3D.name}`}
        </div>
    ),
}));

import { SurfaceEditor, surfaceProblems } from "./SurfaceEditor";
import { SurfaceView } from "./SurfacePanel";
import { createLiveValueStore } from "../liveValues";
import { WorkspacePanel } from "../workspaceLayout";
import { defaultSurface } from "./surfacePanel";

const topics = [
    { ref: "dtm2sim", label: "dtm2sim (pipeline)" },
    { ref: "dev2pdb_1", label: "dev2pdb_1 · Load cell", fields: [{ path: "load", label: "Load", units: "N", sensor: "cell" }] },
];

const panel: WorkspacePanel = { id: "s1", type: "surface", x: 0, y: 0, w: 6, h: 6, surface: defaultSurface() };

describe("3D Surface panel", () => {
    it("draws its surface and follows the live value of a parameter", async () => {
        const store = createLiveValueStore();
        const surface = { ...defaultSurface(), expression: "A", params: [{ name: "A", value: 1, topicRef: "dev2pdb_1", path: "load" }], steps: 5, zLabel: "Load (N)" };
        render(<SurfaceView surface={surface} store={store} />);
        expect(await screen.findByTestId("surface-chart")).toHaveTextContent("5x5 z 0..2 x/y/Load (N)");
        expect(screen.getByText("Waiting for the value of A: shown with its own value")).toBeInTheDocument();
        store.publish("dev2pdb_1", { load: 40 });
        await waitFor(() => expect(screen.getByTestId("surface-chart")).toHaveTextContent("z 39..41"));
        expect(screen.queryByText(/Waiting for the value/)).toBeNull();
    });

    it("says why there is nothing to draw", () => {
        render(<SurfaceView surface={{ mode: "data", topicRef: "dtm2sim", path: "grid", xMin: 0, xMax: 1, yMin: 0, yMax: 1 }} />);
        expect(screen.getByText("Waiting for a message of dtm2sim")).toBeInTheDocument();
    });

    it("edits the formula, adds the parameters it names and the names of the axes", async () => {
        const onApply = vi.fn();
        render(<SurfaceEditor panel={panel} topics={topics} onApply={onApply} onDiscard={vi.fn()} />);
        expect(await screen.findByTestId("surface-chart")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Formula"), { target: { value: "A*sin(k*x)*cos(k*y) + B" } });
        expect(screen.getByRole("alert")).toHaveTextContent('Unknown name "B": add it as a parameter');
        expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Add the parameter B" }));
        expect(screen.queryByRole("alert")).toBeNull();
        // B follows the load cell
        fireEvent.change(screen.getByLabelText("Topic of B"), { target: { value: "dev2pdb_1" } });
        expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Field of B"), { target: { value: "load" } });
        fireEvent.change(screen.getByLabelText("Name of the z axis"), { target: { value: "Deflection (mm)" } });
        fireEvent.change(screen.getByLabelText("Title (optional)"), { target: { value: "Plate" } });
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        const applied = onApply.mock.calls[0][0] as WorkspacePanel;
        expect(applied.title).toBe("Plate");
        expect(applied.surface).toMatchObject({
            mode: "function",
            expression: "A*sin(k*x)*cos(k*y) + B",
            zLabel: "Deflection (mm)",
            params: [
                { name: "A", value: 1 },
                { name: "k", value: 1 },
                { name: "B", value: 1, topicRef: "dev2pdb_1", path: "load" },
            ],
        });
    });

    it("switches to the grid of a message", () => {
        const onApply = vi.fn();
        render(<SurfaceEditor panel={panel} topics={topics} onApply={onApply} onDiscard={vi.fn()} />);
        fireEvent.click(screen.getByLabelText("A grid of a message"));
        expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Field of the grid"), { target: { value: "fem.grid" } });
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        const surface = onApply.mock.calls[0][0].surface;
        expect(surface).toMatchObject({ mode: "data", topicRef: "dtm2sim", path: "fem.grid" });
        expect(surface.expression).toBeUndefined();
        expect(surface.params).toBeUndefined();
    });

    it("tells what is wrong with the settings", () => {
        expect(surfaceProblems({ ...defaultSurface(), xMin: 2, xMax: 1, params: [{ name: "pi", value: 1 }, { name: "A", value: 1 }, { name: "A", value: 2 }] })).toEqual([
            "x: the minimum must be below the maximum",
            '"pi" is a name of the formulas: choose another',
            "The parameter A is twice",
            'Unknown name "k": add it as a parameter',
        ]);
    });
});
