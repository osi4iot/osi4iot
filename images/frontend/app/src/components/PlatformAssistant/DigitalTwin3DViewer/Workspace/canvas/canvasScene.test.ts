import { describe, expect, it } from "vitest";
import {
    CanvasElement,
    emptyCanvasScene,
    frameAt,
    newFrame,
    framesInOrder,
    liveTemplates,
    nextCanvasStep,
    restyleElements,
    sanitizeCanvasScene,
    sceneToSave,
    sceneTopics,
    styleAppState,
    withLiveValues,
} from "./canvasScene";
import { LiveMessage } from "../liveValues";
import { WorkspaceLayout, WorkspacePage, addPanel, gridOf, sameLayout, sanitizeWorkspaceLayout, setPanelTranslucent, setSlideCanvas } from "../workspaceLayout";

const el = (id: string, type: string, extra: Record<string, unknown> = {}): CanvasElement => ({ id, type, ...extra });

describe("Canvas scenes", () => {
    it("draws in its style, and restyles every element on demand", () => {
        expect(styleAppState("clean")).toMatchObject({ currentItemRoughness: 0, currentItemFontFamily: 6 });
        expect(styleAppState("hand")).toMatchObject({ currentItemRoughness: 1, currentItemFontFamily: 5 });
        const restyled = restyleElements([el("a", "rectangle", { roughness: 1 }), el("t", "text", { roughness: 1, fontFamily: 5 }), el("f", "frame")], "clean");
        expect(restyled.map((e) => [e.roughness, e.fontFamily])).toEqual([
            [0, undefined],
            [0, 6],
            [undefined, undefined],
        ]);
    });

    it("keeps the elements, the pictures they use and the look of the scene", () => {
        const saved = sceneToSave(
            [el("a", "image", { fileId: "f1" }), el("b", "rectangle", { isDeleted: true })],
            { viewBackgroundColor: "#fff", theme: "light", zoom: { value: 2 }, selectedElementIds: { a: true } },
            { f1: { id: "f1" }, f2: { id: "f2" } },
        );
        expect(saved).toEqual({
            elements: [el("a", "image", { fileId: "f1" })],
            appState: { viewBackgroundColor: "#fff", theme: "light" },
            files: { f1: { id: "f1" } },
        });
        expect(sanitizeCanvasScene({ elements: [el("a", "text"), { type: "x" }, null], appState: [], files: { f: 1 } })).toEqual({
            elements: [el("a", "text")],
            appState: {},
            files: { f: 1 },
        });
        expect(sanitizeCanvasScene({ elements: "no" })).toBeNull();
    });

    it("shows the live values in its texts", () => {
        const elements = [
            el("t", "text", { text: "Load {{dtm2sim.load|1}} kN", originalText: "Load {{dtm2sim.load|1}} kN" }),
            el("u", "text", { text: "Plain" }),
            el("r", "rectangle"),
        ];
        const templates = liveTemplates(elements);
        expect([...templates.keys()]).toEqual(["t"]);
        expect(sceneTopics(elements)).toEqual(["dtm2sim"]);
        const get = (ref: string): LiveMessage | undefined => (ref === "dtm2sim" ? { payload: { load: 12.345 }, receivedAt: 1 } : undefined);
        const live = withLiveValues(elements, templates, get);
        expect(live[0]).toMatchObject({ text: "Load 12.3 kN", originalText: "Load 12.3 kN" });
        expect(live[1]).toBe(elements[1]);
        // the template is kept: the next values go in again
        expect(withLiveValues(live, templates, () => ({ payload: { load: 2 }, receivedAt: 2 }))[0].text).toBe("Load 2.0 kN");
    });

    it("adds 16:9 frames one after the other", () => {
        const first = emptyCanvasScene().elements;
        expect(first).toHaveLength(1);
        expect(first[0]).toMatchObject({ type: "frame", x: 0, y: 0, width: 1600, height: 900, name: "1 Step" });
        const second = newFrame(first);
        expect(second).toMatchObject({ x: 1800, y: 0, width: 1600, height: 900, name: "2 Step" });
        expect(frameAt([...first, second], 2000, 450)?.id).toBe(second.id);
        expect(frameAt([...first, second], 1700, 450)).toBeUndefined();
    });

    it("goes through its frames, then to the slides", () => {
        const frames = framesInOrder([
            el("c", "frame", { name: "10 End", x: 0, y: 0 }),
            el("a", "frame", { name: "2 How", x: 900, y: 0 }),
            el("b", "frame", { name: "1 Idea", x: 0, y: 500 }),
            el("d", "frame", { name: "x", isDeleted: true }),
            el("e", "rectangle"),
        ]);
        expect(frames.map((f) => f.id)).toEqual(["b", "a", "c"]);
        expect(
            framesInOrder([el("a", "frame", { x: 10, y: 0 }), el("b", "frame", { x: 0, y: 0 }), el("c", "frame", { x: 0, y: -5 })]).map((f) => f.id),
        ).toEqual(["c", "b", "a"]);
        expect(nextCanvasStep(0, 3, 1)).toBe(1);
        expect(nextCanvasStep(2, 3, 1)).toBe("slide");
        expect(nextCanvasStep(0, 3, -1)).toBe("slide");
        expect(nextCanvasStep(0, 0, 1)).toBe("slide");
    });
});

describe("slides with a canvas", () => {
    const layout = (): WorkspaceLayout => ({
        version: 2,
        slides: [
            {
                id: "s1",
                title: "S",
                tag: "S",
                panels: [
                    { id: "a", type: "markdown", x: 0, y: 0, w: 6, h: 4 },
                    { id: "b", type: "markdown", x: 6, y: 10, w: 6, h: 6 },
                ],
            },
        ],
    });

    it("puts the panels on the fine grid of one page, and back", () => {
        const slide = setSlideCanvas(layout().slides[0], { style: "clean" });
        expect(gridOf(slide)).toMatchObject({ cols: 48, rows: 48, maxRows: 48, compact: false });
        // below the page: kept inside it
        expect(slide.panels.map(({ x, y, w, h }) => [x, y, w, h])).toEqual([
            [0, 0, 24, 16],
            [24, 24, 24, 24],
        ]);
        const back = setSlideCanvas({ ...slide, panels: [{ ...slide.panels[0], x: 3, w: 9 }, slide.panels[1]] }, null);
        expect(back.canvas).toBeUndefined();
        expect(back.panels.map(({ x, y, w, h }) => [x, y, w, h])).toEqual([
            [1, 0, 2, 4],
            [6, 6, 6, 6],
        ]);
    });

    it("reads a slide with a canvas, and adds panels in its grid (one page, overlaps allowed)", () => {
        const read = sanitizeWorkspaceLayout(
            {
                version: 2,
                slides: [
                    {
                        id: "s1",
                        title: "S",
                        tag: "S",
                        canvas: { style: "hand", extra: 1 },
                        panels: [{ id: "a", type: "markdown", x: 40, y: 47, w: 20, h: 4 }],
                    },
                    { id: "s2", title: "T", tag: "T", canvas: { style: "neon" }, panels: [] },
                ],
            },
            { hasModel: false },
        )!;
        expect(read.slides[0].canvas).toEqual({ style: "hand" });
        expect(read.slides[0].panels[0]).toMatchObject({ x: 28, y: 44, w: 20, h: 4 });
        expect(read.slides[1].canvas).toBeUndefined();
        const added = addPanel(read.slides[0], { type: "markdown" });
        expect(added.panels[1]).toMatchObject({ w: 16, h: 16 });
        expect(added.panels[1].y + added.panels[1].h).toBeLessThanOrEqual(48);
        const withCanvas = { ...layout(), slides: [setSlideCanvas(layout().slides[0], { style: "clean" })] };
        expect(sameLayout(withCanvas, { ...withCanvas, slides: [{ ...withCanvas.slides[0], canvas: { style: "hand" } }] })).toBe(false);
    });

    it("gives a panel a translucent background (not the 3D model)", () => {
        const slide: WorkspacePage = {
            panels: [
                { id: "t", type: "markdown", x: 0, y: 0, w: 4, h: 4 },
                { id: "model", type: "model", x: 4, y: 0, w: 4, h: 4 },
            ],
        };
        const glass = setPanelTranslucent(setPanelTranslucent(slide, "t", true), "model", true);
        expect(glass.panels.map((p) => p.translucent)).toEqual([true, undefined]);
        expect(setPanelTranslucent(glass, "t", false).panels[0].translucent).toBeUndefined();
        const read = sanitizeWorkspaceLayout(
            { version: 2, slides: [{ id: "s", title: "S", tag: "S", panels: [{ ...glass.panels[0] }, { ...glass.panels[1], translucent: true }] }] },
            { hasModel: true },
        )!;
        expect(read.slides[0].panels.map((p) => p.translucent)).toEqual([true, undefined]);
    });
});
