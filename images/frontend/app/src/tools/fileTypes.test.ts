import { describe, expect, it } from "vitest";
import { acceptLabel, matchesAccept } from "./fileTypes";
import {
    isFemResultsDocument,
    isPipelineDocument,
    isSimulationFormatDocument,
} from "../components/PlatformAssistant/GroupAdminOptions/digitalTwinFileTargets";

const file = (name: string, type = "") => new File(["x"], name, { type });

describe("file types", () => {
    it("matches files by extension or MIME type", () => {
        expect(matchesAccept(file("Portal.GLTF"), ".gltf")).toBe(true);
        expect(matchesAccept(file("p.yaml"), ".yml, .yaml")).toBe(true);
        expect(matchesAccept(file("p.yml"), ".gltf")).toBe(false);
        expect(matchesAccept(file("w.bin"), [".json", ".bin"])).toBe(true);
        expect(matchesAccept(file("i.png", "image/png"), "image/*")).toBe(true);
        expect(acceptLabel(".yml, .yaml")).toBe(".yml or .yaml files");
    });

    it("tells digital twin documents apart by their content", () => {
        const sim = JSON.stringify({ load: { label: "Load", units: "N", minValue: 0, maxValue: 20, step: 1, defaultValue: 10 } });
        const fem = JSON.stringify({ metadata: { resultFields: [] } });
        expect(isSimulationFormatDocument(sim)).toBe(true);
        expect(isSimulationFormatDocument(fem)).toBe(false);
        expect(isFemResultsDocument(fem)).toBe(true);
        expect(isFemResultsDocument(sim)).toBe(false);
        expect(isPipelineDocument("nodes:\n  - name: Listen\n")).toBe(true);
        expect(isPipelineDocument("load:\n  label: Load\n")).toBe(false);
    });
});
