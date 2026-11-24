import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeAll } from "vitest";
import ViewerWorkspace, { ViewerWorkspaceProps } from "./ViewerWorkspace";
import { defaultWorkspaceLayout, imageSourceOptions } from "./workspaceLayout";
import { chartSeriesOptions } from "./chartSeries";

// jsdom has no layout: the workspace measures its scroller with clientWidth / clientHeight
let width = 1200;
beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 700 });
});

const setup = (props: Partial<ViewerWorkspaceProps> = {}) => {
    const handlers = {
        onLayoutChange: vi.fn(),
        onMaximize: vi.fn(),
        onStartEdit: vi.fn(),
        onCancelEdit: vi.fn(),
        onSave: vi.fn(),
        onDone: vi.fn(),
        onRestore: vi.fn(),
    };
    const utils = render(
        <ViewerWorkspace
            layout={defaultWorkspaceLayout({ hasModel: true, hasCamera: true }).slides[0]}
            origin="automatic"
            editing={false}
            canSave
            hasModel
            imageSources={imageSourceOptions(["dtm2sim"], ["dtm2sim"])}
            maximizedId={null}
            renderPanel={(panel) => <div data-testid={`content-${panel.id}`} />}
            {...handlers}
            {...props}
        />,
    );
    return { ...utils, ...handlers };
};

describe("Viewer workspace", () => {
    it("shows every panel with its bar and a full page button", () => {
        width = 1200;
        const { onMaximize } = setup();
        expect(screen.getByRole("region", { name: "3D model" })).toBeInTheDocument();
        expect(screen.getByTestId("content-image")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Show Video full page" }));
        expect(onMaximize).toHaveBeenCalledWith("image");
        expect(screen.queryByRole("button", { name: /Remove the panel/ })).toBeNull();
    });

    it("shows a panel's own actions in its bar, out of the layout editing (the 3D model's settings)", () => {
        width = 1200;
        const onClick = vi.fn();
        const panelActions = (panel: { type: string }) =>
            panel.type === "model" ? [{ label: "3D model settings", icon: <span />, active: false, onClick }] : [];
        const { rerender } = setup({ panelActions });
        const button = within(screen.getByRole("region", { name: "3D model" })).getByRole("button", { name: "3D model settings" });
        expect(button).toHaveAttribute("aria-pressed", "false");
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(within(screen.getByRole("region", { name: "Video" })).queryByRole("button", { name: "3D model settings" })).toBeNull();
        rerender(
            <ViewerWorkspace
                layout={defaultWorkspaceLayout({ hasModel: true, hasCamera: true }).slides[0]}
                origin="automatic"
                editing
                canSave
                hasModel
                imageSources={imageSourceOptions(["dtm2sim"], ["dtm2sim"])}
                maximizedId={null}
                renderPanel={(panel) => <div data-testid={`content-${panel.id}`} />}
                onLayoutChange={vi.fn()}
                onMaximize={vi.fn()}
                onStartEdit={vi.fn()}
                onCancelEdit={vi.fn()}
                onSave={vi.fn()}
                onDone={vi.fn()}
                onRestore={vi.fn()}
                panelActions={panelActions}
            />,
        );
        expect(screen.queryByRole("button", { name: "3D model settings" })).toBeNull();
    });

    it("covers the page with the full page panel and keeps the others mounted", () => {
        width = 1200;
        const { onMaximize, container } = setup({ maximizedId: "image" });
        expect(container.querySelector(".ws-max")).toContainElement(screen.getByTestId("content-image"));
        expect(container.querySelector(".ws-hidden")).toContainElement(screen.getByTestId("content-model"));
        fireEvent.click(screen.getByRole("button", { name: "Back to the layout" }));
        expect(onMaximize).toHaveBeenCalledWith(null);
    });

    it("lets a group administrator remove, add and save panels", () => {
        width = 1200;
        // Add panel, Cancel and Save are icons of the slide bar now (SlideBar): it opens the dialog through addingPanel
        const onAddingPanelChange = vi.fn();
        const { onLayoutChange } = setup({ editing: true, addingPanel: true, onAddingPanelChange });
        expect(screen.queryByRole("region", { name: "Edit layout" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Remove the panel Video" }));
        expect(onLayoutChange.mock.calls[0][0].panels.map((p: any) => p.id)).toEqual(["model"]);

        const dialog = screen.getByRole("dialog", { name: "Add panel" });
        expect(within(dialog).getByRole("radio", { name: /3D model/ })).toBeDisabled();
        expect(within(dialog).getByRole("combobox")).toHaveValue("dtm2sim");
        fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Detections" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Add panel" }));
        const added = onLayoutChange.mock.calls[1][0].panels.at(-1);
        expect(added).toMatchObject({ type: "image", source: "dtm2sim", title: "Detections" });
        expect(onAddingPanelChange).toHaveBeenCalledWith(false);
    });

    it("adds a chart of the asset's sensor fields", () => {
        width = 1200;
        const chartOptions = chartSeriesOptions(
            [{ id: 1, assetId: 7, sensorRef: "sensor_1", sensorTypeId: 1, description: "Thermometer", measurements: { temperature: { type: "number", label: "Temperature", units: "°C" } } }],
            [],
            7,
        );
        const onEditPanel = vi.fn();
        const { onLayoutChange } = setup({ editing: true, chartOptions, onEditPanel, addingPanel: true, onAddingPanelChange: vi.fn() });
        const dialog = screen.getByRole("dialog", { name: "Add panel" });
        fireEvent.click(within(dialog).getByRole("radio", { name: /Time series chart/ }));
        const add = within(dialog).getByRole("button", { name: "Add panel" });
        expect(add).toBeDisabled();
        fireEvent.click(within(dialog).getByRole("checkbox", { name: /Temperature/ }));
        fireEvent.click(add);
        expect(onEditPanel).toHaveBeenCalledWith("chart-1");
        expect(onLayoutChange.mock.calls[0][0].panels.at(-1)).toMatchObject({
            type: "chart",
            viz: "timeseries",
            title: "Temperature",
            series: [{ sensor: "sensor_1", field: "temperature" }],
        });
    });

    it("opens a chart in the editor from its bar", () => {
        width = 1200;
        const onEditPanel = vi.fn();
        setup({
            layout: { id: "s1", title: "Slide 1", tag: "Slide_1", panels: [{ id: "chart-1", type: "chart", title: "Rotor", series: [{ sensor: "s", field: "f" }], options: { description: "Rotor speed" }, x: 0, y: 0, w: 6, h: 6 }] },
            onEditPanel,
        });
        fireEvent.click(screen.getByRole("button", { name: "Edit Rotor" }));
        expect(onEditPanel).toHaveBeenCalledWith("chart-1");
        expect(screen.getByLabelText("About: Rotor speed")).toBeInTheDocument();
    });

    it("shows one panel at a time with tabs on a phone", () => {
        width = 390;
        const onPhoneChange = vi.fn();
        const { container } = setup({ onPhoneChange });
        expect(onPhoneChange).toHaveBeenLastCalledWith(true);
        const tabs = screen.getByRole("navigation", { name: "Panels" });
        expect(container.querySelector(".ws-max")).toContainElement(screen.getByTestId("content-model"));
        fireEvent.click(within(tabs).getByRole("button", { name: "Video" }));
        expect(container.querySelector(".ws-max")).toContainElement(screen.getByTestId("content-image"));
    });

    it("offers to add a panel when there is none", () => {
        width = 1200;
        const { onStartEdit } = setup({ layout: { id: "s1", title: "Slide 1", tag: "Slide_1", panels: [] } });
        fireEvent.click(screen.getByRole("button", { name: "Add panel" }));
        expect(onStartEdit).toHaveBeenCalled();
    });
});

describe("Viewer workspace full screen", () => {
    it("puts a panel full screen with the Fullscreen API and leaves it with the floating button", async () => {
        width = 1200;
        const requestFullscreen = vi.fn(() => Promise.resolve());
        Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
        const original = HTMLElement.prototype.requestFullscreen;
        HTMLElement.prototype.requestFullscreen = requestFullscreen as any;
        try {
            setup();
            fireEvent.click(screen.getByRole("button", { name: "Show Video full screen" }));
            expect(requestFullscreen).toHaveBeenCalledTimes(1);
            expect(requestFullscreen.mock.instances[0]).toBe(screen.getByRole("region", { name: "Video" }));
            // the bar is hidden; a floating button leaves the full screen
            expect(screen.queryByRole("button", { name: "Show Video full page" })).toBeNull();
            fireEvent.click(screen.getByRole("button", { name: "Exit full screen" }));
            expect(screen.getByRole("button", { name: "Show Video full screen" })).toBeInTheDocument();
        } finally {
            HTMLElement.prototype.requestFullscreen = original;
        }
    });

    it("covers the page where there is no Fullscreen API (iPhone), also on a phone", () => {
        width = 400;
        Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: false });
        const { container } = setup();
        // on a phone the panels have no full page button, but they have the full screen one
        expect(screen.queryByRole("button", { name: /full page/ })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Show 3D model full screen" }));
        expect(container.querySelector(".ws-fs")).toContainElement(screen.getByTestId("content-model"));
        fireEvent.keyDown(document, { key: "Escape" });
        expect(container.querySelector(".ws-fs")).toBeNull();
    });
});

describe("Viewer workspace: floating panels (the simulator)", () => {
    const simSlide = (floating: boolean) => ({
        panels: [
            { id: "model", type: "model" as const, x: 0, y: 0, w: 8, h: 12 },
            { id: "sim", type: "simulator" as const, x: 8, y: 0, w: 4, h: 8, floating },
        ],
    });

    it("stays in its place of the grid; floating, it is shown over another panel in full page", () => {
        width = 1200;
        const { rerender } = setup({ layout: simSlide(true) as any });
        // in the grid, and nothing over it
        expect(screen.getByRole("region", { name: "Simulator" })).toBeInTheDocument();
        expect(screen.queryByTestId("floating-sim")).toBeNull();
        const float = screen.getByRole("button", { name: "Floating over the 3D model or a panel of the simulation in full screen: turn it off" });
        expect(float).toHaveAttribute("aria-pressed", "true");
        rerender(
            <ViewerWorkspace
                layout={simSlide(true) as any}
                origin="automatic"
                editing={false}
                canSave
                hasModel
                imageSources={imageSourceOptions(["dtm2sim"], ["dtm2sim"])}
                maximizedId="model"
                renderPanel={(panel) => <div data-testid={`content-${panel.id}`} />}
                onLayoutChange={vi.fn()}
                onMaximize={vi.fn()}
                onStartEdit={vi.fn()}
                onCancelEdit={vi.fn()}
                onSave={vi.fn()}
                onDone={vi.fn()}
                onRestore={vi.fn()}
            />,
        );
        const frame = screen.getByTestId("floating-sim");
        expect(within(frame).getByRole("region", { name: "Simulator" })).toBeInTheDocument();
        // not movable: no full page / full screen of its own there
        expect(within(frame).queryByRole("button", { name: /full page/ })).toBeNull();
    });

    it("does not float over a panel that does not show the simulation", () => {
        width = 1200;
        const layout = {
            panels: [
                { id: "model", type: "model" as const, x: 0, y: 0, w: 6, h: 12 },
                { id: "cam", type: "alarms" as const, x: 6, y: 0, w: 2, h: 6 },
                { id: "sim", type: "simulator" as const, x: 8, y: 0, w: 4, h: 8, floating: true },
            ],
        };
        setup({ layout: layout as any, maximizedId: "cam" });
        expect(screen.queryByTestId("floating-sim")).toBeNull();
    });

    it("over the panel in full page it moves by its bar and resizes from its corner, inside the area", () => {
        width = 1200;
        const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500, toJSON: () => ({}),
        } as DOMRect);
        try {
            setup({ layout: simSlide(true) as any, maximizedId: "model" });
            const frame = () => screen.getByTestId("floating-sim");
            const bar = () => within(frame()).getByRole("heading", { name: "Simulator" });
            const left0 = parseFloat(frame().style.left);
            fireEvent.pointerDown(bar(), { clientX: 500, clientY: 100 });
            fireEvent.pointerMove(document, { clientX: 400, clientY: 150 });
            fireEvent.pointerUp(document);
            expect(parseFloat(frame().style.left)).toBeCloseTo(left0 - 10, 5);
            // past the edge: kept inside
            fireEvent.pointerDown(bar(), { clientX: 0, clientY: 0 });
            fireEvent.pointerMove(document, { clientX: -5000, clientY: 0 });
            fireEvent.pointerUp(document);
            expect(frame().style.left).toBe("0%");
            // resized from its corner
            const w0 = parseFloat(frame().style.width);
            fireEvent.pointerDown(screen.getByTestId("resize-sim"), { clientX: 0, clientY: 0 });
            fireEvent.pointerMove(document, { clientX: 100, clientY: 0 });
            fireEvent.pointerUp(document);
            expect(parseFloat(frame().style.width)).toBeCloseTo(w0 + 10, 5);
        } finally {
            rect.mockRestore();
        }
    });

    it("its float icon is the user's own while not editing, and the layout's while an editor edits it", () => {
        width = 1200;
        const { onLayoutChange } = setup({ layout: simSlide(true) as any });
        fireEvent.click(screen.getByRole("button", { name: "Floating over the 3D model or a panel of the simulation in full screen: turn it off" }));
        expect(onLayoutChange).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Float over the 3D model or a panel of the simulation in full screen" })).toHaveAttribute("aria-pressed", "false");
    });

    it("while an editor edits the layout, the float icon changes the layout", () => {
        width = 1200;
        const { onLayoutChange } = setup({ layout: simSlide(false) as any, editing: true });
        fireEvent.click(screen.getByRole("button", { name: "Float over the 3D model or a panel of the simulation in full screen" }));
        expect(onLayoutChange.mock.calls[0][0].panels.find((p: any) => p.id === "sim")).toMatchObject({ floating: true });
    });
});
