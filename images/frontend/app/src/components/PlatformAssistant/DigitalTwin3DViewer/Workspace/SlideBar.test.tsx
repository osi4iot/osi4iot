import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SlideBar, { SlideBarProps } from "./SlideBar";
import { WorkspaceSlide } from "./workspaceLayout";

const slides: WorkspaceSlide[] = [
    { id: "a", title: "Overview", tag: "Monitoring", panels: [] },
    { id: "b", title: "Vision", tag: "Vision", panels: [] },
    { id: "c", title: "Trends", tag: "Monitoring", panels: [] },
];

const setup = (props: Partial<SlideBarProps> = {}) => {
    const handlers = {
        onGo: vi.fn(),
        onStep: vi.fn(),
        onAdd: vi.fn(),
        onDuplicate: vi.fn(),
        onRemove: vi.fn(),
        onMove: vi.fn(),
        onUpdate: vi.fn(),
    };
    render(
        <SlideBar
            slides={slides}
            allSlides={slides}
            current={slides[1]}
            tags={["Monitoring", "Vision"]}
            editing={false}
            {...handlers}
            {...props}
        />,
    );
    return handlers;
};

describe("slide bar", () => {
    it("changes the slide with the arrows, the tabs and PageUp / PageDown", () => {
        const { onStep, onGo } = setup();
        expect(screen.getByText("Slide 2 of 3")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
        fireEvent.click(screen.getByRole("button", { name: "Previous slide" }));
        expect(onStep.mock.calls).toEqual([[1], [-1]]);
        const tabs = screen.getByRole("tablist", { name: "Slide" });
        expect(within(tabs).getByRole("tab", { name: "Vision" })).toHaveAttribute("aria-selected", "true");
        fireEvent.click(within(tabs).getByRole("tab", { name: "Trends" }));
        expect(onGo).toHaveBeenCalledWith("c");
        fireEvent.keyDown(window, { key: "PageDown" });
        expect(onStep).toHaveBeenLastCalledWith(1);
        fireEvent.keyDown(within(tabs).getByRole("tab", { name: "Vision" }), { key: "ArrowLeft" });
        expect(onStep).toHaveBeenLastCalledWith(-1);
    });

    it("tells how many slides are hidden and opens all the slides", () => {
        const onOverview = vi.fn();
        setup({ slides: [slides[0], slides[2]], current: slides[0], onOverview });
        expect(screen.getByText("Slide 1 of 2 (3 in all)")).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Vision" })).not.toBeInTheDocument();
        expect(screen.queryByRole("group", { name: "Show the slides of" })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "All slides" }));
        expect(onOverview).toHaveBeenCalled();
    });

    it("has the slide icons: New, Duplicate, Edit, Delete (confirmed) and All slides", () => {
        const onEdit = vi.fn();
        const onOverview = vi.fn();
        const { onAdd, onDuplicate, onRemove } = setup({ canEdit: true, canSave: true, onEdit, onOverview });
        const bar = screen.getByRole("toolbar", { name: "Slide" });
        fireEvent.click(within(bar).getByRole("button", { name: "New slide" }));
        fireEvent.click(within(bar).getByRole("button", { name: "Duplicate slide" }));
        fireEvent.click(within(bar).getByRole("button", { name: "Edit slide" }));
        fireEvent.click(within(bar).getByRole("button", { name: "Delete the slide Vision" }));
        expect(onRemove).not.toHaveBeenCalled();
        fireEvent.click(within(bar).getByRole("button", { name: "Confirm: delete the slide Vision" }));
        fireEvent.click(within(bar).getByRole("button", { name: "All slides" }));
        expect([
            onAdd.mock.calls.length,
            onDuplicate.mock.calls.length,
            onEdit.mock.calls.length,
            onRemove.mock.calls.length,
            onOverview.mock.calls.length,
        ]).toEqual([1, 1, 1, 1, 1]);
        expect(within(bar).queryByRole("button", { name: "Add panel" })).toBeNull();
    });

    it("while editing: Add panel, Cancel and Save for the group (Done for the others)", () => {
        const handlers = { onAddPanel: vi.fn(), onCancel: vi.fn(), onSave: vi.fn(), onDone: vi.fn(), onRestore: vi.fn() };
        setup({ canEdit: true, canSave: true, editing: true, restoreLabel: "Automatic layout", onOverview: vi.fn(), ...handlers });
        const bar = screen.getByRole("toolbar", { name: "Edit slide" });
        expect(within(bar).queryByRole("button", { name: "New slide" })).toBeNull();
        expect(within(bar).queryByRole("button", { name: "All slides" })).toBeNull();
        fireEvent.click(within(bar).getByRole("button", { name: "Add panel" }));
        fireEvent.click(within(bar).getByRole("button", { name: "Back to the automatic layout" }));
        fireEvent.click(within(bar).getByRole("button", { name: "Cancel" }));
        fireEvent.click(within(bar).getByRole("button", { name: "Save for the group" }));
        expect(Object.values(handlers).map((h) => h.mock.calls.length)).toEqual([1, 1, 1, 0, 1]);
    });

    it("renames the current slide and its tag from a double click on its tab, while editing", () => {
        const { onUpdate } = setup({ canEdit: true, editing: true });
        fireEvent.doubleClick(screen.getByRole("tab", { name: "Vision" }));
        const dialog = screen.getByRole("dialog", { name: "Slide title and tag" });
        fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Cameras" } });
        const tag = within(dialog).getByLabelText("Tag");
        fireEvent.change(tag, { target: { value: "bad<tag>" } });
        expect(tag).toHaveAttribute("aria-invalid", "true");
        fireEvent.keyDown(tag, { key: "Enter" });
        expect(onUpdate).toHaveBeenCalledWith({ title: "Cameras" });
        expect(screen.queryByRole("dialog", { name: "Slide title and tag" })).toBeNull();
        // not out of the editing
        setup({ canEdit: true, editing: false });
        fireEvent.doubleClick(screen.getAllByRole("tab", { name: "Vision" })[1]);
        expect(screen.queryByRole("dialog", { name: "Slide title and tag" })).toBeNull();
    });

    it("has nothing to step through with one slide", () => {
        setup({ slides: [slides[0]], allSlides: [slides[0]], current: slides[0], tags: ["Monitoring"] });
        expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
        expect(screen.queryByRole("group", { name: "Show the slides of" })).toBeNull();
    });
});
