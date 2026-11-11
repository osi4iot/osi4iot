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
        const { onLayoutChange, onSave } = setup({ editing: true });
        expect(screen.getByRole("region", { name: "Edit layout" })).toHaveTextContent("Editing the layout of the group");
        fireEvent.click(screen.getByRole("button", { name: "Remove the panel Video" }));
        expect(onLayoutChange.mock.calls[0][0].panels.map((p: any) => p.id)).toEqual(["model"]);

        fireEvent.click(screen.getByRole("button", { name: "Add panel" }));
        const dialog = screen.getByRole("dialog", { name: "Add panel" });
        expect(within(dialog).getByRole("radio", { name: /3D model/ })).toBeDisabled();
        expect(within(dialog).getByRole("combobox")).toHaveValue("dtm2sim");
        fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Detections" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Add panel" }));
        const added = onLayoutChange.mock.calls[1][0].panels.at(-1);
        expect(added).toMatchObject({ type: "image", source: "dtm2sim", title: "Detections" });

        fireEvent.click(screen.getByRole("button", { name: "Save for the group" }));
        expect(onSave).toHaveBeenCalled();
    });

    it("adds a chart of the asset's sensor fields", () => {
        width = 1200;
        const chartOptions = chartSeriesOptions(
            [{ id: 1, assetId: 7, sensorRef: "sensor_1", sensorTypeId: 1, description: "Thermometer", measurements: { temperature: { type: "number", label: "Temperature", units: "°C" } } }],
            [],
            7,
        );
        const onEditPanel = vi.fn();
        const { onLayoutChange } = setup({ editing: true, chartOptions, onEditPanel });
        fireEvent.click(screen.getByRole("button", { name: "Add panel" }));
        const dialog = screen.getByRole("dialog", { name: "Add panel" });
        fireEvent.click(within(dialog).getByRole("radio", { name: /Chart/ }));
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

    it("tells the others their changes are only theirs", () => {
        width = 1200;
        const { onDone, onRestore } = setup({ editing: true, canSave: false, origin: "local" });
        expect(screen.getByRole("region", { name: "Edit layout" })).toHaveTextContent("Your changes are only for you");
        expect(screen.queryByRole("button", { name: "Save for the group" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Group layout" }));
        expect(onRestore).toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Done" }));
        expect(onDone).toHaveBeenCalled();
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
