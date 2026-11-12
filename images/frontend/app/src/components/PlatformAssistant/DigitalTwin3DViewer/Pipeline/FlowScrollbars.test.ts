import { describe, expect, it } from "vitest";
import { clampScroll, scrollGeometry, topLeftViewport } from "./FlowScrollbars";

describe("scrollbars of the pipeline editor", () => {
    it("measure the pipeline and what is shown of it", () => {
        // nodes from -650 to 400 px on screen, a view of 1000 px: 120 px of margin around
        expect(scrollGeometry(-650, 400, 1000)).toEqual({ total: 770 + 1000, offset: 770, view: 1000 });
        // everything shown: no bar
        expect(scrollGeometry(100, 800, 1000)).toBeNull();
    });

    it("do not scroll past the pipeline, but always back to it", () => {
        // content from -650 to 400 (view 1000): up to 770 px left, nothing right
        expect(clampScroll(-2000, -650, 400, 1000)).toBe(-770);
        expect(clampScroll(300, -650, 400, 1000)).toBe(0);
        // the view far to the right of the content: it can come back
        expect(clampScroll(-500, -3000, -2500, 1000)).toBe(-500);
    });

    it("open a pipeline at its top left corner, with a margin", () => {
        // the OC4 pipeline starts at x = -650, y = 30
        expect(topLeftViewport({ x: -650, y: 30 })).toEqual({ x: 690, y: 10, zoom: 1 });
    });
});
