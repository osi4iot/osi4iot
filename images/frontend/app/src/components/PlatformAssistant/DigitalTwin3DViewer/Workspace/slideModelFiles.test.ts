import { describe, expect, it } from "vitest";
import { describeLostModel, lostModels, removedModelSlides } from "./slideModelFiles";

const slide = (id: string, model: boolean, title = id) => ({
    id,
    title,
    tag: "t",
    panels: model ? [{ id: "m", type: "model" as const, x: 0, y: 0, w: 6, h: 6 }] : [],
});

describe("the files of the slides' 3D models when the layout is saved", () => {
    it("go with a slide removed, or its 3D Model panel; not with a slide kept", () => {
        const previous = { slides: [slide("slide-1", true), slide("s-a", true), slide("s-b", true)] };
        const next = { slides: [slide("slide-1", true), slide("s-b", false)] };
        expect(removedModelSlides(previous, next, ["slide-1", "s-a", "s-b"])).toEqual(["s-a", "s-b"]);
    });

    it("go with a slide never saved (a new slide whose editing was cancelled)", () => {
        const previous = { slides: [slide("slide-1", true)] };
        expect(removedModelSlides(previous, previous, ["slide-1", "s-new"])).toEqual(["s-new"]);
    });

    it("stay for a slide that had no 3D Model panel (a model moved there from an older version)", () => {
        const previous = { slides: [slide("slide-1", false)] };
        expect(removedModelSlides(previous, previous, ["slide-1"])).toEqual([]);
    });

    it("the automatic layout keeps only its first slide", () => {
        expect(removedModelSlides(null, { slides: [slide("slide-1", true), slide("s-a", true)] }, ["slide-1"])).toEqual([]);
        expect(removedModelSlides({ slides: [slide("slide-1", true), slide("s-a", true)] }, null, ["slide-1", "s-a"])).toEqual(["s-a"]);
    });

    it("says what is lost, by the slide's title", () => {
        const previous = { slides: [slide("slide-1", true, "Pump"), slide("s-a", true, "Tank")] };
        const next = { slides: [slide("slide-1", true, "Pump")] };
        const lost = lostModels(previous, next, previous, {
            "slide-1": { gltfFileName: "pump.glb", gltfFileDate: "", gltfFileSize: 1, femResults: 0 },
            "s-a": { gltfFileName: "tank.glb", gltfFileDate: "", gltfFileSize: 1, femResults: 2 },
        });
        expect(lost.map(describeLostModel)).toEqual(["Tank: the 3D model tank.glb and 2 FEM result files"]);
    });
});
