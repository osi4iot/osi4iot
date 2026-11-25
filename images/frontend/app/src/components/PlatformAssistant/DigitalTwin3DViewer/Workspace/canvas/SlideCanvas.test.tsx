import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

const shown: number[] = [];
const restyled: string[] = [];
const added: number[] = [];
const formulas: unknown[] = [];
let selectFormula: ((s: unknown) => void) | null = null;
// Excalidraw needs a real canvas: the board says what it was asked to show
vi.mock("./CanvasBoard", () => ({
    default: ({ editing, startAt, onFrames, onControl, onFormulaSelected }: any) => {
        selectFormula = onFormulaSelected;
        useEffect(() => {
            onFrames(["f1", "f2", "f3"]);
            onControl({
                show: (i: number) => shown.push(i),
                restyleAll: (s: string) => restyled.push(s),
                addFrame: () => added.push(1),
                frameInView: () => "f2",
                insertFormula: (f: unknown) => formulas.push(["insert", f]),
                updateFormula: (id: string, f: unknown) => formulas.push(["update", id, f]),
                formulaDefaults: () => ({ tex: "", color: "#1971c2", size: 30 }),
            });
        }, []);
        return <div data-testid="board">{`${editing ? "editing" : "presenting"} from ${startAt}`}</div>;
    },
}));

// MathLive needs a real browser: the visual editor is a field of LaTeX here
vi.mock("./MathFieldEditor", () => ({
    default: ({ value, onChange }: any) => <input aria-label="Formula" value={value} onChange={(e) => onChange(e.target.value)} />,
}));

import { SlideCanvas } from "./SlideCanvas";

const props = (over: Record<string, unknown> = {}) => ({
    slideId: "s1",
    canvas: { style: "clean" as const },
    scene: { elements: [] },
    sceneKey: 1,
    layoutEditing: false,
    canvasEditing: false,
    onCanvasEditing: vi.fn(),
    onSceneChange: vi.fn(),
    onStyleChange: vi.fn(),
    onRemove: vi.fn(),
    onLeave: vi.fn(),
    ...over,
});

describe("Canvas of a slide", () => {
    it("says which frame its step shows (its 3D model and simulator are the ones in use)", async () => {
        const onShownFrame = vi.fn();
        render(<SlideCanvas {...props({ onShownFrame })} />);
        await waitFor(() => expect(onShownFrame).toHaveBeenLastCalledWith("f1"));
        fireEvent.click(screen.getByRole("button", { name: "Next step" }));
        expect(onShownFrame).toHaveBeenLastCalledWith("f2");
        shown.length = 0;
    });

    it("goes through its frames with its buttons and the keys, then leaves to the next slide", async () => {
        const p = props();
        render(<SlideCanvas {...p} />);
        expect(await screen.findByTestId("board")).toHaveTextContent("presenting from 0");
        expect(await screen.findByRole("group", { name: "Steps of the canvas" })).toHaveTextContent("1 / 3");
        fireEvent.click(screen.getByRole("button", { name: "Next step" }));
        expect(screen.getByRole("group", { name: "Steps of the canvas" })).toHaveTextContent("2 / 3");
        act(() => {
            fireEvent.keyDown(window, { key: "PageDown" });
        });
        expect(screen.getByRole("group", { name: "Steps of the canvas" })).toHaveTextContent("3 / 3");
        expect(shown).toEqual([1, 2]);
        // past the last one: the next slide
        act(() => {
            fireEvent.keyDown(window, { key: "ArrowRight" });
        });
        expect(p.onLeave).toHaveBeenCalledWith(1);
        // typing in a field: the keys are the field's
        const input = document.createElement("input");
        document.body.appendChild(input);
        fireEvent.keyDown(input, { key: "ArrowLeft" });
        expect(screen.getByRole("group", { name: "Steps of the canvas" })).toHaveTextContent("3 / 3");
        input.remove();
    });

    it("starts at its last step coming back from the next slide", async () => {
        render(<SlideCanvas {...props({ startAtEnd: true })} />);
        expect(await screen.findByTestId("board")).toHaveTextContent(`presenting from ${Number.MAX_SAFE_INTEGER}`);
        expect(await screen.findByRole("group", { name: "Steps of the canvas" })).toHaveTextContent("3 / 3");
    });

    it("offers its tools while the layout is edited", async () => {
        const onInsertPanel = vi.fn();
        const p = props({ layoutEditing: true, canvasEditing: true, onInsertPanel });
        render(<SlideCanvas {...p} />);
        expect(await screen.findByTestId("board")).toHaveTextContent("editing");
        fireEvent.click(screen.getByRole("button", { name: /Done/ }));
        expect(p.onCanvasEditing).toHaveBeenCalledWith(false);
        // while drawing: from frame to frame, never to another slide; a new frame
        expect(await screen.findByRole("group", { name: "Steps of the canvas" })).toHaveTextContent("1 / 3");
        fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
        expect(p.onLeave).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: /Add frame/ }));
        expect(added).toEqual([1]);
        expect(screen.getByRole("group", { name: "Steps of the canvas" })).toHaveTextContent("3 / 3");
        fireEvent.click(screen.getByRole("button", { name: /Insert panel/ }));
        expect(onInsertPanel).toHaveBeenCalledWith("f2");
        fireEvent.change(screen.getByLabelText("Style of the canvas"), { target: { value: "hand" } });
        expect(p.onStyleChange).toHaveBeenCalledWith("hand");
        fireEvent.click(screen.getByRole("button", { name: "Apply to all" }));
        expect(restyled).toEqual(["clean"]);
        fireEvent.click(screen.getByRole("button", { name: "Remove the canvas" }));
        expect(p.onRemove).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Click again to remove the canvas" }));
        expect(p.onRemove).toHaveBeenCalled();
    });

    it("says when its scene is being read", () => {
        render(<SlideCanvas {...props({ scene: undefined })} />);
        expect(screen.getByText("Loading the canvas…")).toBeInTheDocument();
    });

    it("puts the slide in full screen while presenting", async () => {
        const onFullscreen = vi.fn();
        const { rerender } = render(<SlideCanvas {...props({ onFullscreen })} />);
        fireEvent.click(await screen.findByRole("button", { name: "Full screen: the canvas and its panels" }));
        expect(onFullscreen).toHaveBeenCalled();
        rerender(<SlideCanvas {...props({ onFullscreen, fullscreen: true })} />);
        expect(screen.getByRole("button", { name: "Leave the full screen" })).toBeInTheDocument();
        // not while the layout is edited
        rerender(<SlideCanvas {...props({ onFullscreen, layoutEditing: true })} />);
        expect(screen.queryByRole("button", { name: /full screen/i })).toBeNull();
    });

    it("turns the laser pointer on and off while presenting (its button, K)", async () => {
        render(<SlideCanvas {...props()} />);
        expect(screen.queryByTestId("laser-pointer")).toBeNull();
        fireEvent.click(await screen.findByRole("button", { name: "Laser pointer (K)" }));
        // a layer over the canvas and its panels (Excalidraw's laser pans in its view mode)
        expect(screen.getByTestId("laser-pointer")).toBeInTheDocument();
        act(() => {
            fireEvent.keyDown(window, { key: "k" });
        });
        expect(screen.queryByTestId("laser-pointer")).toBeNull();
        expect(screen.getByRole("button", { name: "Laser pointer (K)" })).toHaveAttribute("aria-pressed", "false");
    });

    it("inserts a formula (LaTeX) and edits the one selected", async () => {
        render(<SlideCanvas {...props({ layoutEditing: true, canvasEditing: true })} />);
        fireEvent.click(await screen.findByRole("button", { name: "Insert formula" }));
        const dialog = screen.getByRole("dialog", { name: "Insert formula" });
        expect(screen.getByLabelText("Color")).toHaveValue("#1971c2");
        expect(screen.getByLabelText("Size")).toHaveValue(30);
        fireEvent.change(await screen.findByLabelText("Formula"), { target: { value: "E=mc" } });
        // the same formula in the LaTeX tab, with its preview
        fireEvent.click(screen.getByRole("tab", { name: "LaTeX" }));
        expect(screen.getByLabelText("LaTeX")).toHaveValue("E=mc");
        fireEvent.change(screen.getByLabelText("LaTeX"), { target: { value: "E=mc^2" } });
        // the preview: the picture that goes to the drawing
        expect(dialog.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
        fireEvent.click(screen.getByRole("button", { name: "Insert" }));
        expect(formulas).toEqual([["insert", { tex: "E=mc^2", color: "#1971c2", size: 30 }]]);
        expect(screen.queryByRole("dialog")).toBeNull();
        // one selected: Edit formula
        act(() => selectFormula?.({ id: "img1", formula: { tex: "a+b", color: "#e03131", size: 40 } }));
        fireEvent.click(screen.getByRole("button", { name: "Edit formula" }));
        expect(await screen.findByLabelText("Formula")).toHaveValue("a+b");
        fireEvent.change(screen.getByLabelText("Formula"), { target: { value: "a-b" } });
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        expect(formulas[1]).toEqual(["update", "img1", { tex: "a-b", color: "#e03131", size: 40 }]);
    });

    it("keeps PageUp / PageDown from Excalidraw while presenting (it would scroll the drawing away)", async () => {
        render(<SlideCanvas {...props()} />);
        await screen.findByRole("group", { name: "Steps of the canvas" });
        const heard = vi.fn();
        document.addEventListener("keydown", heard);
        act(() => {
            fireEvent.keyDown(document.body, { key: "PageDown" });
        });
        expect(heard).not.toHaveBeenCalled();
        expect(screen.getByRole("group", { name: "Steps of the canvas" })).toHaveTextContent("2 / 3");
        document.removeEventListener("keydown", heard);
        shown.length = 0;
    });
});
