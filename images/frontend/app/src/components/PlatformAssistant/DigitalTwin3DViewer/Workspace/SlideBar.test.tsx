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
        <SlideBar slides={slides} allSlides={slides} current={slides[1]} tags={["Monitoring", "Vision"]} editing={false} {...handlers} {...props} />,
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

    it("edits the current slide while the layout is edited", () => {
        const { onUpdate, onMove, onDuplicate, onRemove, onAdd } = setup({ editing: true });
        const tools = screen.getByRole("region", { name: "This slide" });
        const title = within(tools).getByLabelText("Title");
        fireEvent.change(title, { target: { value: "Cameras" } });
        fireEvent.blur(title);
        expect(onUpdate).toHaveBeenCalledWith({ title: "Cameras" });
        const tag = within(tools).getByLabelText("Tag");
        fireEvent.change(tag, { target: { value: "bad<tag>" } });
        expect(tag).toHaveAttribute("aria-invalid", "true");
        fireEvent.blur(tag);
        expect(tag).toHaveValue("Vision");
        fireEvent.change(tag, { target: { value: "Monitoring" } });
        fireEvent.blur(tag);
        expect(onUpdate).toHaveBeenLastCalledWith({ tag: "Monitoring" });
        fireEvent.click(within(tools).getByRole("button", { name: "Move the slide before" }));
        fireEvent.click(within(tools).getByRole("button", { name: "Duplicate" }));
        fireEvent.click(within(tools).getByRole("button", { name: "Remove the slide Vision" }));
        fireEvent.click(within(tools).getByRole("button", { name: "New slide" }));
        expect([onMove.mock.calls[0][0], onDuplicate.mock.calls.length, onRemove.mock.calls.length, onAdd.mock.calls.length]).toEqual([-1, 1, 1, 1]);
    });

    it("has nothing to step through with one slide", () => {
        setup({ slides: [slides[0]], allSlides: [slides[0]], current: slides[0], tags: ["Monitoring"] });
        expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
        expect(screen.queryByRole("group", { name: "Show the slides of" })).toBeNull();
    });
});
