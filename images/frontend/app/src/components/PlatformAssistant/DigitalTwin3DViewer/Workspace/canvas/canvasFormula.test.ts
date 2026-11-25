import { describe, expect, it } from "vitest";
import { FORMULA_KEY, formulaElement, formulaFile, formulaOf, formulaPicture, formulaSpot, sanitizeFormula } from "./canvasFormula";

describe("formulas of a Canvas", () => {
    const formula = { tex: "\\Pi=\\tfrac12\\,k\\,u^2", color: "#1971c2", size: 28 };

    it("are pictures of the drawing (an SVG of paths), as big as a text of their size", () => {
        const p = formulaPicture(formula);
        expect(p.dataURL.startsWith("data:image/svg+xml;base64,")).toBe(true);
        const svg = atob(p.dataURL.split(",")[1]);
        expect(svg).toContain("#1971c2");
        expect(svg).not.toContain("currentColor");
        expect(p.error).toBe(false);
        const bigger = formulaPicture({ ...formula, size: 56 });
        expect(bigger.width / p.width).toBeCloseTo(2, 5);
        // the same formula, the same file
        expect(formulaPicture(formula).fileId).toBe(p.fileId);
        expect(formulaFile(p, 5)).toMatchObject({ id: p.fileId, mimeType: "image/svg+xml", created: 5 });
    });

    it("keep their LaTeX in their element, and keep the element when edited", () => {
        const p = formulaPicture(formula);
        const spot = formulaSpot({ id: "fr", type: "frame", x: 0, y: 0, width: 1600, height: 900 }, { x: 0, y: 0, width: 10, height: 10 });
        expect(spot).toEqual({ x: 800, y: 450, frameId: "fr" });
        const e = formulaElement(formula, p, spot);
        expect(e).toMatchObject({ type: "image", frameId: "fr", fileId: p.fileId, width: p.width });
        expect(Number(e.x) + p.width / 2).toBeCloseTo(800, 6);
        expect(formulaOf(e)).toEqual(formula);
        const next = { ...formula, tex: "x" };
        const p2 = formulaPicture(next);
        const edited = formulaElement(next, p2, spot, e);
        expect(edited).toMatchObject({ id: e.id, x: e.x, y: e.y, frameId: "fr", fileId: p2.fileId, version: Number(e.version) + 1 });
        expect((edited.customData as Record<string, unknown>)[FORMULA_KEY]).toEqual(next);
        expect(formulaOf({ id: "a", type: "image" })).toBeNull();
        expect(formulaOf({ ...e, isDeleted: true })).toBeNull();
    });

    it("are read safely", () => {
        expect(sanitizeFormula({ tex: "x", color: "red", size: 1000 })).toEqual({ tex: "x", color: "#1e1e1e", size: 200 });
        expect(sanitizeFormula({ tex: "  " })).toBeNull();
        expect(sanitizeFormula(null)).toBeNull();
    });
});
