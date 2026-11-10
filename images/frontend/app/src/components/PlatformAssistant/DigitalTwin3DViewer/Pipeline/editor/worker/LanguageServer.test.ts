import { describe, expect, it } from "vitest";
import { getDiagnostics } from "./LanguageServer";

describe("diagnostics of a Function script", () => {
    it("accepts properties added later to an object literal (valid JavaScript)", () => {
        const script = `function process(msg) {
    const state = {};
    state.buttonX = 1;
    if (state.buttonX > 0) state.updatedAt = msg.topic;
    return msg;
}`;
        expect(getDiagnostics(script)).toEqual([]);
    });

    it("still reports a method that does not exist and syntax errors", () => {
        const typo = getDiagnostics("function process(msg) {\n    const img = msg.GetImagee();\n    return msg;\n}");
        expect(typo.map((d) => d.message)).toEqual([expect.stringContaining("GetImagee")]);
        expect(getDiagnostics("function process(msg) {\n    return msg\n").length).toBeGreaterThan(0);
    });
});
