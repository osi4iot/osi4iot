import { describe, expect, it } from "vitest";
import { clipWeight } from "./clipWeight";

describe("clipWeight", () => {
    it("maps the range to the clip, also when the minimum is the larger value", () => {
        expect(clipWeight(0.03, "0.0", "0.06")).toBeCloseTo(0.5);
        expect(clipWeight(0.12, "0.12", "0.045")).toBe(0);
        expect(clipWeight(0.0825, "0.12", "0.045")).toBeCloseTo(0.5);
        expect(clipWeight(0.045, "0.12", "0.045")).toBe(1);
    });

    it("never runs past the ends of the clip", () => {
        expect(clipWeight(0.121, "0.12", "0.045")).toBe(0);
        expect(clipWeight(0.03, "0.12", "0.045")).toBe(1);
        expect(clipWeight(0.09, "0.0", "0.06")).toBe(1);
    });

    it("is 0 for a range or a value that cannot be used", () => {
        expect(clipWeight(1, 2, 2)).toBe(0);
        expect(clipWeight(NaN, 0, 1)).toBe(0);
        expect(clipWeight(1, "x", 2)).toBe(0);
    });
});
