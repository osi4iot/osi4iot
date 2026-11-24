import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// the 3D chart needs WebGL, the 2D one a canvas: here they only show what they would draw
vi.mock("../surface/SurfaceChart", () => ({
    default: ({ option, label }: { option: any; label: string }) => (
        <div data-testid="chart-3d" aria-label={label}>
            {option.series[0].type === "surface"
                ? `${option.series[0].dataShape.join("x")} z ${Number(option.zAxis3D.min.toFixed(2))}..${Number(option.zAxis3D.max.toFixed(2))} ${option.xAxis3D.name}/${option.yAxis3D.name}/${option.zAxis3D.name}`
                : `${option.series[0].type} ${option.series[0].data.length}`}
        </div>
    ),
}));
vi.mock("../charts/EchartsView", () => ({
    default: ({ option, label }: { option: any; label: string }) => (
        <div data-testid="chart-2d" aria-label={label}>
            {option.series.map((s: any) => `${s.type}:${s.name ?? ""}:${JSON.stringify(s.data)}`).join(" | ")}
        </div>
    ),
}));

import { DataChartEditor, seriesProblems, surfaceProblems } from "./DataChartEditor";
import { DataChartView } from "./DataChartPanel";
import { createLiveValueStore } from "../liveValues";
import { WorkspacePanel } from "../workspaceLayout";
import { defaultSurface } from "../surface/surfacePanel";
import { ASSET_STATE_SOURCE, FORMULA_SOURCE } from "./dataChart";

const topics = [
    { ref: "dtm2sim", label: "dtm2sim (pipeline)" },
    {
        ref: "dev2pdb_1",
        label: "dev2pdb_1 · Load cell",
        fields: [{ path: "load", label: "Load", units: "N", sensor: "cell" }],
    },
];

const surfacePanel: WorkspacePanel = {
    id: "s1",
    type: "dataChart",
    x: 0,
    y: 0,
    w: 6,
    h: 6,
    data: { kind: "surface", surface: defaultSurface() },
};

describe("Data chart panel", () => {
    it("draws a surface and follows the live value of a parameter", async () => {
        const store = createLiveValueStore();
        const surface = {
            ...defaultSurface(),
            expression: "A",
            params: [{ name: "A", value: 1, topicRef: "dev2pdb_1", path: "load" }],
            steps: 5,
            zLabel: "Load (N)",
        };
        render(<DataChartView data={{ kind: "surface", surface }} store={store} />);
        expect(await screen.findByTestId("chart-3d")).toHaveTextContent("5x5 z 0..2 x/y/Load (N)");
        expect(screen.getByText("Waiting for the value of A: shown with its own value")).toBeInTheDocument();
        store.publish("dev2pdb_1", { load: 40 });
        await waitFor(() => expect(screen.getByTestId("chart-3d")).toHaveTextContent("z 39..41"));
        expect(screen.queryByText(/Waiting for the value/)).toBeNull();
    });

    it("says why there is nothing to draw", () => {
        render(
            <DataChartView
                data={{
                    kind: "heatmap",
                    surface: {
                        mode: "data",
                        topicRef: "dtm2sim",
                        path: "grid",
                        xMin: 0,
                        xMax: 1,
                        yMin: 0,
                        yMax: 1,
                    },
                }}
            />,
        );
        expect(screen.getByText("Waiting for a message of dtm2sim")).toBeInTheDocument();
    });

    it("draws the series of the last message and tells its time", async () => {
        const store = createLiveValueStore();
        render(
            <DataChartView
                data={{
                    kind: "xy",
                    series: [
                        {
                            source: "dtm2sim",
                            x: "freq",
                            y: "amp",
                            name: "PSD",
                            style: "bar",
                        },
                    ],
                }}
                store={store}
            />,
        );
        expect(screen.getByText("Waiting for the data of dtm2sim")).toBeInTheDocument();
        store.publish("dtm2sim", { freq: [1, 2], amp: [5, 6] }, new Date(2026, 0, 1, 10, 20, 30).getTime());
        await waitFor(() => expect(screen.getByTestId("chart-2d")).toHaveTextContent("bar:PSD:[[1,5],[2,6]]"));
        expect(screen.getByText(/^Data of 10:20:30/)).toBeInTheDocument();
    });

    it("edits the formula of a surface, adds the parameters it names and the names of the axes", async () => {
        const onApply = vi.fn();
        render(<DataChartEditor panel={surfacePanel} topics={topics} onApply={onApply} onDiscard={vi.fn()} />);
        expect(await screen.findByTestId("chart-3d")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Formula"), {
            target: { value: "A*sin(k*x)*cos(k*y) + B" },
        });
        expect(screen.getByRole("alert")).toHaveTextContent('Unknown name "B": add it as a parameter');
        expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Add the parameter B" }));
        fireEvent.change(screen.getByLabelText("Topic of B"), {
            target: { value: "dev2pdb_1" },
        });
        expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Field of B"), {
            target: { value: "load" },
        });
        fireEvent.change(screen.getByLabelText("Name of the z axis"), {
            target: { value: "Deflection (mm)" },
        });
        fireEvent.change(screen.getByLabelText("Title (optional)"), {
            target: { value: "Plate" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        const applied = onApply.mock.calls[0][0] as WorkspacePanel;
        expect(applied.title).toBe("Plate");
        expect(applied.data?.kind).toBe("surface");
        expect(applied.data?.surface).toMatchObject({
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

    it("turns a surface into a heat map of the grid of the asset state", () => {
        const onApply = vi.fn();
        render(<DataChartEditor panel={surfacePanel} topics={topics} onApply={onApply} onDiscard={vi.fn()} />);
        fireEvent.click(screen.getByLabelText("Heat map"));
        expect(screen.queryByLabelText("Wireframe")).toBeNull();
        fireEvent.click(screen.getByLabelText("A grid of a message"));
        fireEvent.change(screen.getByLabelText("Topic of the grid"), {
            target: { value: ASSET_STATE_SOURCE },
        });
        expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Field of the grid"), {
            target: { value: "fem.grid" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        const data = onApply.mock.calls[0][0].data;
        expect(data.kind).toBe("heatmap");
        expect(data.surface).toMatchObject({
            mode: "data",
            topicRef: ASSET_STATE_SOURCE,
            path: "fem.grid",
        });
        expect(data.surface.expression).toBeUndefined();
        expect(data.surface.wireframe).toBeUndefined();
    });

    it("edits the series of a 2D chart with the fields of the last message", () => {
        const store = createLiveValueStore();
        store.publish("dtm2sim", {
            psd: { f: [1, 2, 3], a: [4, 5, 6] },
            peaks: [{ f: 2, a: 5 }],
        });
        const onApply = vi.fn();
        const panel: WorkspacePanel = {
            id: "d1",
            type: "dataChart",
            x: 0,
            y: 0,
            w: 6,
            h: 6,
        };
        render(<DataChartEditor panel={panel} store={store} topics={topics} assetState={false} onApply={onApply} onDiscard={vi.fn()} />);
        expect(screen.queryByRole("option", { name: /Asset state/ })).toBeNull();
        const options = Array.from(document.querySelectorAll("datalist option")).map((o) => o.getAttribute("value"));
        expect(options).toEqual(expect.arrayContaining(["psd.f", "psd.a", "peaks.*.f", "peaks.*.a"]));
        fireEvent.change(screen.getByLabelText("Field x of series 1"), {
            target: { value: "psd.f" },
        });
        fireEvent.change(screen.getByLabelText("Field y of series 1"), {
            target: { value: "psd.a" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Add series" }));
        expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Field x of series 2"), {
            target: { value: "peaks.*.f" },
        });
        fireEvent.change(screen.getByLabelText("Field y of series 2"), {
            target: { value: "peaks.*.a" },
        });
        fireEvent.change(screen.getByLabelText("Style of series 2"), {
            target: { value: "scatter" },
        });
        fireEvent.change(screen.getByLabelText("Name of series 2"), {
            target: { value: "Peaks" },
        });
        fireEvent.click(screen.getByLabelText("Logarithmic y axis"));
        expect(screen.getByTestId("chart-2d")).toHaveTextContent("scatter:Peaks:[[2,5]]");
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        expect(onApply.mock.calls[0][0].data).toEqual({
            kind: "xy",
            series: [
                { source: "dtm2sim", x: "psd.f", y: "psd.a", style: "line" },
                {
                    source: "dtm2sim",
                    x: "peaks.*.f",
                    y: "peaks.*.a",
                    style: "scatter",
                    name: "Peaks",
                },
            ],
            xLabel: "x",
            yLabel: "y",
            legend: true,
            yLog: true,
        });
    });

    it("adds a formula series with its parameters", () => {
        const onApply = vi.fn();
        const panel: WorkspacePanel = { id: "d1", type: "dataChart", x: 0, y: 0, w: 6, h: 6 };
        render(<DataChartEditor panel={panel} topics={topics} assetState={false} onApply={onApply} onDiscard={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("Source of series 1"), { target: { value: FORMULA_SOURCE } });
        fireEvent.change(screen.getByLabelText("Formula of series 1"), { target: { value: "A*exp(-c*x)" } });
        expect(screen.getByRole("alert")).toHaveTextContent('Unknown name "c"');
        fireEvent.click(screen.getByRole("button", { name: "Add the parameter c" }));
        fireEvent.change(screen.getByLabelText("Source of c of series 1"), { target: { value: "dev2pdb_1" } });
        fireEvent.change(screen.getByLabelText("Field of c of series 1"), { target: { value: "load" } });
        fireEvent.change(screen.getByLabelText("Points of series 1"), { target: { value: "3" } });
        fireEvent.change(screen.getByLabelText("x to of series 1"), { target: { value: "2" } });
        expect(screen.getByTestId("chart-2d")).toHaveTextContent("line:y = A*exp(-c*x):[[0,1],[1,0.36787944117144233],[2,0.1353352832366127]]");
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        expect(onApply.mock.calls[0][0].data.series).toEqual([
            {
                source: FORMULA_SOURCE,
                formula: {
                    expression: "A*exp(-c*x)",
                    params: [
                        { name: "A", value: 1 },
                        { name: "k", value: 1 },
                        { name: "c", value: 1, topicRef: "dev2pdb_1", path: "load" },
                    ],
                    xMin: 0,
                    xMax: 2,
                    points: 3,
                },
                style: "line",
            },
        ]);
    });

    it("tells what is wrong with the settings", () => {
        expect(
            surfaceProblems({
                ...defaultSurface(),
                xMin: 2,
                xMax: 1,
                params: [
                    { name: "pi", value: 1 },
                    { name: "A", value: 1 },
                    { name: "A", value: 2 },
                ],
            }),
        ).toEqual([
            "x: the minimum must be below the maximum",
            '"pi" is a name of the formulas: choose another',
            "The parameter A is twice",
            'Unknown name "k": add it as a parameter',
        ]);
        expect(seriesProblems("points3d", [{ source: "dtm2sim", x: "a", y: "b.", z: "" }])).toEqual([
            'Series 1: "b." is not a field (names and * separated by dots)',
            "Series 1: choose the field of z",
        ]);
        expect(seriesProblems("xy", [])).toEqual(["Add a series"]);
    });
});
