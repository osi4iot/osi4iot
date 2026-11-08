import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_SHARE, SPLITTER_SIZE, STACK_BELOW, clampShare, effectiveLayout, shareAt, viewerRects } from "./viewerLayout";

const base = { width: 1440, height: 900, top: 76, right: 12, gap: 12, layout: "split" as const, hasModel: true, hasImage: true, modelShare: 0.62 };

describe("Viewer page layout", () => {
    it("shows what the twin has", () => {
        expect(effectiveLayout("split", true, true)).toBe("split");
        expect(effectiveLayout("image", true, true)).toBe("image");
        expect(effectiveLayout("split", true, false)).toBe("3d");
        expect(effectiveLayout("3d", false, true)).toBe("image");
        expect(effectiveLayout("split", false, false)).toBeNull();
    });

    it("puts both panels side by side below the top bar, left of the assistant panel", () => {
        const r = viewerRects({ ...base, right: 400 + 24 });
        expect(r.stacked).toBe(false);
        expect(r.model).toMatchObject({ left: 12, top: 76 });
        const areaW = 1440 - 12 - 424;
        expect(r.model!.width + SPLITTER_SIZE + r.image!.width).toBe(areaW);
        expect(r.image!.left + r.image!.width).toBe(1440 - 424);
        expect(r.model!.height).toBe(900 - 76 - 12);
        expect(r.splitter).toMatchObject({ left: r.model!.left + r.model!.width, width: SPLITTER_SIZE });
        expect(r.model!.width / (areaW - SPLITTER_SIZE)).toBeCloseTo(0.62, 2);
    });

    it("stacks them on narrow pages", () => {
        const r = viewerRects({ ...base, width: STACK_BELOW - 1 + 24 });
        expect(r.stacked).toBe(true);
        expect(r.model!.width).toBe(r.image!.width);
        expect(r.image!.top).toBe(r.model!.top + r.model!.height + SPLITTER_SIZE);
        expect(r.image!.top + r.image!.height).toBe(900 - 12);
    });

    it("gives the whole page to a panel full page, or to the only one", () => {
        expect(viewerRects({ ...base, layout: "3d" })).toMatchObject({ model: { left: 0, top: 0, width: 1440, height: 900 }, image: null, canSplit: true });
        expect(viewerRects({ ...base, layout: "image" })).toMatchObject({ model: null, image: { width: 1440 } });
        expect(viewerRects({ ...base, hasImage: false })).toMatchObject({ layout: "3d", canSplit: false, splitter: null });
        expect(viewerRects({ ...base, hasModel: false, hasImage: false })).toMatchObject({ layout: null, model: null, image: null });
    });

    it("moves the splitter within 20-80 %", () => {
        const r = viewerRects(base);
        const middle = r.model!.left + (r.model!.width + r.image!.width) / 2 + SPLITTER_SIZE / 2;
        expect(shareAt(r, middle, 300)).toBeCloseTo(0.5, 2);
        expect(shareAt(r, 0, 300)).toBe(0.2);
        expect(shareAt(r, 5000, 300)).toBe(0.8);
        expect(clampShare(Number.NaN)).toBe(DEFAULT_MODEL_SHARE);
    });
});
