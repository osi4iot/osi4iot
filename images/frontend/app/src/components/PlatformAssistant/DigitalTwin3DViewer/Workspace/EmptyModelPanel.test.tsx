import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EmptyModelPanel from "./EmptyModelPanel";

describe("an empty 3D Model panel", () => {
    it("offers the editors to load the slide's model", () => {
        const onLoad = vi.fn();
        render(<EmptyModelPanel onLoad={onLoad} />);
        expect(screen.getByText("This slide has no 3D model yet.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Load 3D model" }));
        expect(onLoad).toHaveBeenCalled();
    });

    it("shows the model being read, and why it could not be", () => {
        const { rerender } = render(<EmptyModelPanel loading={0.42} />);
        expect(screen.getByRole("status")).toHaveTextContent("Loading the 3D model… 42%");
        rerender(<EmptyModelPanel error="The 3D model pump.glb could not be loaded" />);
        expect(screen.getByRole("alert")).toHaveTextContent("pump.glb");
    });

    it("while the layout is edited, asks to save the slide first; the others only read", () => {
        const { rerender } = render(<EmptyModelPanel onLoad={vi.fn()} editing />);
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.getByText("Save the slide, then load its 3D model here.")).toBeInTheDocument();
        rerender(<EmptyModelPanel />);
        expect(screen.queryByRole("button")).toBeNull();
    });
});
