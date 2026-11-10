import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AllSlides from "./AllSlides";
import { WorkspaceSlide } from "./workspaceLayout";

const slides: WorkspaceSlide[] = [
    { id: "a", title: "Overview", tag: "Monitoring", panels: [{ id: "m", type: "model", x: 0, y: 0, w: 8, h: 12 }] },
    { id: "b", title: "Visión", tag: "Vision", panels: [{ id: "i", type: "image", source: "camera", title: "Detections", x: 0, y: 0, w: 12, h: 6 }] },
    { id: "c", title: "Trends", tag: "Monitoring", panels: [] },
] as WorkspaceSlide[];

const setup = (hiddenTags: string[] = []) => {
    const handlers = { onOpen: vi.fn(), onReorder: vi.fn(), onClose: vi.fn() };
    render(<AllSlides slides={slides} currentId="b" hiddenTags={hiddenTags} {...handlers} />);
    return handlers;
};

const dataTransfer = () => ({ setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" });

describe("all slides", () => {
    it("shows every slide, opens one and closes with Escape", () => {
        const { onOpen, onClose } = setup(["Vision"]);
        const list = screen.getByRole("list", { name: "Slides" });
        expect(within(list).getAllByRole("listitem")).toHaveLength(3);
        const vision = screen.getByRole("button", { name: "Open slide 2: Visión (hidden by the filters)" });
        expect(vision).toHaveAttribute("aria-current", "true");
        fireEvent.click(screen.getByRole("button", { name: "Open slide 3: Trends" }));
        expect(onOpen).toHaveBeenCalledWith("c");
        fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search slides" }), { key: "Escape" });
        expect(onClose).toHaveBeenCalled();
    });

    it("searches titles, tags and panel titles without accents or case", () => {
        setup();
        const search = screen.getByRole("searchbox", { name: "Search slides" });
        fireEvent.change(search, { target: { value: "vision" } });
        expect(screen.getAllByRole("listitem")).toHaveLength(1);
        fireEvent.change(search, { target: { value: "DETECT" } });
        expect(screen.getByRole("button", { name: /Open slide 2/ })).toBeInTheDocument();
        fireEvent.change(search, { target: { value: "monitoring" } });
        expect(screen.getAllByRole("listitem")).toHaveLength(2);
        // while searching the order cannot change
        expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("draggable", "false");
        fireEvent.change(search, { target: { value: "nothing" } });
        expect(screen.getByText(/No slide has/)).toBeInTheDocument();
    });

    it("reorders by dragging and with Alt + arrows", () => {
        const { onReorder } = setup();
        const items = screen.getAllByRole("listitem");
        const dt = dataTransfer();
        // the last slide dropped before the first one
        fireEvent.dragStart(items[2], { dataTransfer: dt });
        fireEvent.dragOver(items[0], { dataTransfer: dt, clientX: 0 });
        fireEvent.drop(items[0], { dataTransfer: dt });
        expect(onReorder).toHaveBeenLastCalledWith("c", 0);
        // dropped on itself: nothing changes
        onReorder.mockClear();
        fireEvent.dragStart(items[1], { dataTransfer: dt });
        fireEvent.dragOver(items[1], { dataTransfer: dt });
        fireEvent.drop(items[1], { dataTransfer: dt });
        expect(onReorder).not.toHaveBeenCalled();
        fireEvent.keyDown(screen.getByRole("button", { name: /Open slide 1/ }), { key: "ArrowRight", altKey: true });
        expect(onReorder).toHaveBeenLastCalledWith("a", 1);
        fireEvent.keyDown(screen.getByRole("button", { name: /Open slide 1/ }), { key: "ArrowLeft", altKey: true });
        expect(onReorder).toHaveBeenCalledTimes(1);
    });
});
