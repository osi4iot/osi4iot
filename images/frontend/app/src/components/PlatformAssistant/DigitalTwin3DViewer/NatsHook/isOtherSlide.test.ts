import { describe, expect, it } from "vitest";
import { isOtherSlide } from "./useNatsSubcription";

describe("a message for the 3D model of another slide", () => {
    it("is one that names another slide; one of no slide is for every model", () => {
        expect(isOtherSlide('{"load":1,"$slide":"s-b"}', "s-a")).toBe(true);
        expect(isOtherSlide('{"load":1,"$slide":"s-a"}', "s-a")).toBe(false);
        expect(isOtherSlide('{"load":1}', "s-a")).toBe(false);
        expect(isOtherSlide('{"load":1,"$slide":"s-b"}', undefined)).toBe(false);
        expect(isOtherSlide("not json $slide", "s-a")).toBe(false);
    });
});
