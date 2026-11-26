import { describe, expect, it } from "vitest";
import { layoutHasSlides, openingViewer } from "./openingViewer";

const base = { fromCamera: false, scope: "asset", hasModels: false, hasImage: false, layoutLoaded: true, hasSlides: false };

describe("where a twin's viewer opens", () => {
    it("opens a twin of panels without a model (a presentation) on its Viewer page, once its layout is known", () => {
        expect(openingViewer({ ...base, layoutLoaded: false, hasSlides: false })).toBe("wait");
        expect(openingViewer({ ...base, hasSlides: true })).toBe("3D");
    });
    it("opens a twin with nothing to see on its pipeline", () => {
        expect(openingViewer(base)).toBe("pipeline");
    });
    it("leaves a twin with a model or a camera as the user left it, and opens cameras and control rooms on the Viewer", () => {
        expect(openingViewer({ ...base, hasModels: true })).toBeNull();
        expect(openingViewer({ ...base, hasImage: true })).toBeNull();
        expect(openingViewer({ ...base, fromCamera: true })).toBe("3D");
        expect(openingViewer({ ...base, scope: "group", layoutLoaded: false })).toBe("3D");
    });
    it("counts a slide with panels or a Canvas", () => {
        expect(layoutHasSlides(null)).toBe(false);
        expect(layoutHasSlides({ version: 2, slides: [{ id: "a", title: "A", panels: [] }] } as never)).toBe(false);
        expect(layoutHasSlides({ version: 2, slides: [{ id: "a", title: "A", panels: [], canvas: { style: "clean" } }] } as never)).toBe(true);
        expect(layoutHasSlides({ version: 2, slides: [{ id: "a", title: "A", panels: [{ id: "p", type: "text", x: 0, y: 0, w: 4, h: 4 }] }] } as never)).toBe(
            true,
        );
    });
});
