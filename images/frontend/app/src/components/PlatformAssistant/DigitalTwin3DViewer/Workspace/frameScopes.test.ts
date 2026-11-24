// The 3D model and the simulator of each frame of a canvas: their scope ("<slide>:<frame>")
import { vi, describe, expect, it } from "vitest";
vi.hoisted(() => {
    const node = globalThis as unknown as { process: { getBuiltinModule: (id: string) => { Blob: unknown } } };
    (globalThis as { Blob: unknown }).Blob = node.process.getBuiltinModule("node:buffer").Blob;
});
import { strFromU8, unzipSync } from "fflate";
import {
    WorkspaceSlide,
    addPanel,
    canAddPanelType,
    panelInUse,
    sanitizeWorkspaceLayout,
    scopeOf,
    setSimulatorFormat,
    setSlideCanvas,
    slideOfScope,
    withPanelFrames,
} from "./workspaceLayout";
import { createLiveValueStore, scopeReaches, scopedToSlide } from "./liveValues";
import { lostModels, movedModels, removedModelSlides } from "./slideModelFiles";
import { panelFrames, panelLink } from "./canvas/canvasPanels";
import { buildViewerDataZip, readViewerDataFiles } from "./viewerData";
import { createMissedMessages, isOtherSlide } from "../NatsHook/useNatsSubcription";
import { createLiveSeriesBuffer } from "./charts/chartSources";

const model = (id: string, frame?: string) => ({ id, type: "model" as const, x: 0, y: 0, w: 8, h: 8, ...(frame ? { frame } : {}) });
const simulator = (id: string, frame?: string) => ({ id, type: "simulator" as const, x: 8, y: 0, w: 8, h: 8, ...(frame ? { frame } : {}) });
const canvasSlide = (panels: WorkspaceSlide["panels"]): WorkspaceSlide => ({ id: "s1", title: "S", tag: "T", canvas: { style: "clean" }, panels });

describe("scopes", () => {
    it("are a slide or a frame of its canvas; a slide's messages reach its frames", () => {
        expect(scopeOf("s1", "f1")).toBe("s1:f1");
        expect(scopeOf("s1", null)).toBe("s1");
        expect(slideOfScope("s1:f1")).toBe("s1");
        expect(scopeReaches("s1", "s1:f1")).toBe(true);
        expect(scopeReaches("s1:f1", "s1:f1")).toBe(true);
        expect(scopeReaches("s1:f1", "s1:f2")).toBe(false);
        expect(scopeReaches("s1:f1", "s1")).toBe(false);
        expect(scopeReaches("s1", "s10:f1")).toBe(false);
    });

    it("decide which messages move the model shown", () => {
        expect(isOtherSlide('{"a":1,"$slide":"s1:f2"}', "s1:f1")).toBe(true);
        expect(isOtherSlide('{"a":1,"$slide":"s1:f1"}', "s1:f1")).toBe(false);
        expect(isOtherSlide('{"a":1,"$slide":"s1"}', "s1:f1")).toBe(false);
        expect(isOtherSlide('{"a":1,"$slide":"s1:f1"}', "s1")).toBe(true);
    });

    it("keep the last message of each topic missed by a model not shown", () => {
        const missed = createMissedMessages();
        missed.keep("s1:f2", { topic: "dtm2sim", message: '{"v":1}' });
        missed.keep("s1:f2", { topic: "dtm2sim", message: '{"v":2}' });
        missed.keep("s1", { topic: "dev2pdb_1", message: '{"t":3}' });
        expect(missed.take("s1:f2").map((m) => m.message)).toEqual(['{"v":2}', '{"t":3}']);
        expect(missed.take("s1:f2").map((m) => m.message)).toEqual(['{"t":3}']);
    });
});

describe("the live values of a frame", () => {
    it("are those of the frame, of its slide and of no slide, the newest", () => {
        const store = createLiveValueStore();
        const frame = scopedToSlide(store, "s1:f1");
        const other = scopedToSlide(store, "s1:f2");
        store.publish("dtm2sim", { x: 1, $slide: "s1:f1" }, 1);
        expect(frame.get("dtm2sim")?.payload).toMatchObject({ x: 1 });
        expect(other.get("dtm2sim")).toBeUndefined();
        store.publish("dtm2sim", { x: 2, $slide: "s1" }, 2);
        expect(frame.get("dtm2sim")?.payload).toMatchObject({ x: 2 });
        expect(other.get("dtm2sim")?.payload).toMatchObject({ x: 2 });
        const heard = vi.fn();
        const off = frame.subscribe("dtm2sim", heard);
        store.publish("dtm2sim", { x: 3, $slide: "s1:f1" }, 3);
        store.publish("dtm2sim", { x: 4, $slide: "s1:f2" }, 4);
        expect(heard).toHaveBeenCalledTimes(1);
        off();
    });

    it("of the charts' live series too", () => {
        const buffer = createLiveSeriesBuffer();
        buffer.record("dtm2sim", { x: 1, $slide: "s1:f1" }, 10);
        buffer.record("dtm2sim", { x: 2, $slide: "s1" }, 11);
        buffer.record("dtm2sim", { x: 3, $slide: "s1:f2" }, 12);
        expect(buffer.values("dtm2sim", "x", "s1:f1", 0, 100)).toEqual([
            [10, 1],
            [11, 2],
        ]);
        expect(buffer.values("dtm2sim", "x", "s1", 0, 100)).toEqual([[11, 2]]);
    });
});

describe("the panels of the frames of a canvas", () => {
    it("can have a 3D model and a simulator in each frame", () => {
        let slide = canvasSlide([model("m1", "f1"), simulator("sim1", "f1")]);
        expect(canAddPanelType(slide, "model", true, "f1")).toBe(false);
        expect(canAddPanelType(slide, "model", true, "f2")).toBe(true);
        expect(canAddPanelType(slide, "simulator", true, "f2")).toBe(true);
        slide = addPanel(slide, { type: "model", frame: "f2" });
        expect(slide.panels.find((p) => p.id !== "m1" && p.type === "model")?.frame).toBe("f2");
        expect(addPanel(slide, { type: "model", frame: "f2" })).toBe(slide);
        // without a canvas, one per slide
        const plain = { panels: [model("m1")] };
        expect(canAddPanelType(plain, "model", true, "f2")).toBe(false);
    });

    it("are read with their frames (one model, one simulator per frame); without a canvas, frames go", () => {
        const layout = sanitizeWorkspaceLayout(
            {
                version: 2,
                slides: [
                    canvasSlide([model("m1", "f1"), model("m2", "f2"), model("m3", "f2"), simulator("sim1", "f1"), simulator("sim2")]),
                    { id: "s2", title: "B", tag: "T", panels: [model("m1", "f1"), model("m2", "f2")] },
                ],
            },
            { hasModel: true },
        );
        expect(layout?.slides[0].panels.map((p) => `${p.id}:${p.frame ?? "-"}`)).toEqual(["m1:f1", "m2:f2", "sim1:f1", "sim2:-"]);
        expect(layout?.slides[1].panels.map((p) => `${p.id}:${p.frame ?? "-"}`)).toEqual(["m1:-"]);
    });

    it("take their frames from the scene; a second model in a frame stays out of it", () => {
        const slide = canvasSlide([model("m1"), model("m2"), simulator("sim1")]);
        const elements = [
            { id: "f1", type: "frame", x: 0, y: 0, width: 100, height: 100, isDeleted: false },
            { id: "e1", type: "embeddable", link: panelLink("m1"), frameId: "f1", isDeleted: false },
            { id: "e2", type: "embeddable", customData: { osi4iotPanel: "m2" }, frameId: "f1", isDeleted: false },
            { id: "e3", type: "embeddable", link: panelLink("sim1"), frameId: "gone", isDeleted: false },
        ];
        const frames = panelFrames(elements);
        expect(frames).toEqual({ m1: "f1", m2: "f1" });
        const placed = withPanelFrames(slide, frames);
        expect(placed.panels.map((p) => p.frame ?? "-")).toEqual(["f1", "-", "-"]);
        expect(withPanelFrames(placed, frames)).toBe(placed);
        expect(setSlideCanvas(placed, null).panels.some((p) => p.frame)).toBe(false);
    });

    it("in use are those of the frame shown, else the slide's own", () => {
        const slide = canvasSlide([model("m0"), model("m1", "f1"), simulator("sim2", "f2")]);
        expect(panelInUse(slide, "model", "f1")?.id).toBe("m1");
        expect(panelInUse(slide, "model", "f2")?.id).toBe("m0");
        expect(panelInUse(slide, "simulator", "f1")).toBeUndefined();
        expect(panelInUse(slide, "simulator", "f2")?.id).toBe("sim2");
        const formatted = setSimulatorFormat(canvasSlide([simulator("a", "f1"), simulator("b", "f2")]), {}, "b");
        expect(formatted.panels.map((p) => !!p.format)).toEqual([false, true]);
    });
});

describe("the files of the models of the frames", () => {
    const L = (panels: WorkspaceSlide["panels"]) => ({ slides: [canvasSlide(panels)] });

    it("go with a model moved to another frame; those left go", () => {
        const before = L([model("m1", "f1"), model("m2", "f2")]);
        const swapped = L([model("m1", "f2"), model("m2", "f1")]);
        expect(movedModels(before, swapped)).toEqual([
            { from: "s1:f1", to: "s1:f2" },
            { from: "s1:f2", to: "s1:f1" },
        ]);
        expect(removedModelSlides(before, swapped, ["s1:f1", "s1:f2"])).toEqual([]);
        const moved = L([model("m1", "f3")]);
        expect(removedModelSlides(before, moved, ["s1:f1", "s1:f2"])).toEqual(["s1:f1", "s1:f2"]);
        // the moved one is not lost
        const lost = lostModels(before, moved, moved, {
            "s1:f1": { gltfFileName: "a.glb", gltfFileDate: "", gltfFileSize: 1, femResults: 0 },
            "s1:f2": { gltfFileName: "b.glb", gltfFileDate: "", gltfFileSize: 1, femResults: 0 },
        } as never);
        expect(lost.map((l) => `${l.slideId} ${l.title}`)).toEqual(["s1:f2 S (a frame of its canvas)"]);
        // a slide removed: its frames' files too
        expect(removedModelSlides(before, { slides: [] }, ["s1:f1", "s1"])).toEqual(["s1:f1", "s1"]);
    });

    it("are in the .zip of the viewer data under the frame, and read back with its scope", async () => {
        const zip = await buildViewerDataZip(
            {
                slides: [
                    { slideId: "s1:f1", model: { name: "a.glb", data: new Blob([new Uint8Array([1, 2])]) }, fem: [{ name: "r.json", data: new Blob(["{}"]) }] },
                ],
            },
            { digitalTwinUid: "dt" },
        );
        const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
        expect(Object.keys(files).sort()).toEqual(["manifest.json", "slides/s1/frames/f1/fem/r.json", "slides/s1/frames/f1/models/a.glb"]);
        expect(JSON.parse(strFromU8(files["manifest.json"])).parts.slides).toEqual({ "s1:f1": { model: "a.glb", fem: ["r.json"] } });
        const set = await readViewerDataFiles([{ name: "viewer_data.zip", data: zip }], { looseModel: false });
        expect(set.items.map((i) => `${i.part} ${i.slideId}`)).toEqual(["model s1:f1", "fem s1:f1"]);
    });
});
