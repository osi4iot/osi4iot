import { vi, describe, expect, it } from "vitest";
// jsdom's Blob has no stream() (every browser's has): Node's is used instead
vi.hoisted(() => {
    const node = globalThis as unknown as { process: { getBuiltinModule: (id: string) => { Blob: unknown } } };
    (globalThis as { Blob: unknown }).Blob = node.process.getBuiltinModule("node:buffer").Blob;
});
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import YAML from "yaml";
import {
    DataFile,
    VIEWER_DATA_FORMAT,
    buildViewerDataZip,
    classifyFile,
    pipelineNodesOf,
    pipelineYamlOf,
    readViewerDataFiles,
    simulatorFormatOf,
} from "./viewerData";
import { VIEWER_CONFIG_FORMAT } from "./viewerConfig";

const text = (name: string, value: string): DataFile => ({ name, data: new Blob([value]) });
const blobOf = (bytes: Uint8Array) => new Blob([bytes as BlobPart]);
const json = (name: string, value: unknown): DataFile => text(name, JSON.stringify(value));

const config = { format: VIEWER_CONFIG_FORMAT, version: 1, layout: { version: 2, slides: [] } };
const fem = { metadata: { resultFields: [] }, results: [] };
const simulator = { temperature: { label: "Temperature", units: "ºC", minValue: 0, maxValue: 100, defaultValue: 20, step: 1 } };
const pipeline = { nodes: [{ name: "Inject", nodeUid: "n1", type: "inject", x: 0, y: 0, numOutputs: 1, settings: { a: 1 }, wires: [[]] }] };

describe("Viewer data", () => {
    it("tells what each file is", async () => {
        const files = [
            text("model.glb", "binary"),
            text("model.gltf", "{}"),
            text("pipeline.yml", YAML.stringify(pipeline)),
            json("viewer_config.json", config),
            json("results.json", fem),
            json("simulator.json", simulator),
        ];
        const kinds: string[] = [];
        for (const f of files) {
            const r = await classifyFile(f);
            kinds.push(r && "item" in r ? r.item.part : r && "ignored" in r ? "ignored" : "none");
        }
        expect(kinds).toEqual(["model", "model", "pipeline", "config", "fem", "simulator"]);
        const other = await classifyFile(json("other.json", { a: [1] }));
        expect(other && "ignored" in other).toBe(true);
        expect(await classifyFile(json("manifest.json", { format: VIEWER_DATA_FORMAT }))).toBeNull();
        const summary = await classifyFile(json("simulator.json", simulator));
        expect(summary && "item" in summary && summary.item.summary).toBe("1 parameter");
    });

    it("reads the zip of all the viewer data, in the order it loads, with the model and FEM results of each slide", async () => {
        const zip = await buildViewerDataZip(
            {
                config: json("viewer_config.json", config),
                slides: [
                    { slideId: "slide-1", model: text("pump.glb", "binary model"), fem: [json("r1.json", fem), json("r2.json", fem)] },
                    { slideId: "s-tank", model: text("tank.glb", "tank model"), fem: [] },
                ],
                simulator,
                pipelineYaml: YAML.stringify(pipeline),
            },
            { digitalTwinUid: "abc", description: "Pump", now: new Date("2026-11-22T10:00:00Z") },
        );
        const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
        expect(Object.keys(entries).sort()).toEqual(
            [
                "slides/slide-1/fem/r1.json",
                "slides/slide-1/fem/r2.json",
                "slides/slide-1/models/pump.glb",
                "slides/s-tank/models/tank.glb",
                "manifest.json",
                "pipeline/pipeline.yml",
                "simulator/simulator_format.json",
                "viewer_config.json",
            ].sort(),
        );
        const manifest = JSON.parse(strFromU8(entries["manifest.json"]));
        expect(manifest).toMatchObject({
            format: VIEWER_DATA_FORMAT,
            version: 2,
            digitalTwinUid: "abc",
            parts: { slides: { "slide-1": { model: "pump.glb", fem: ["r1.json", "r2.json"] }, "s-tank": { model: "tank.glb" } } },
        });

        const set = await readViewerDataFiles([{ name: "viewer_data.zip", data: zip }], { loosePipeline: false, looseModel: false });
        expect(set.items.map((i) => `${i.part}:${i.slideId ?? ""}`)).toEqual([
            "model:s-tank",
            "model:slide-1",
            "fem:slide-1",
            "fem:slide-1",
            "simulator:",
            "config:",
            "pipeline:",
        ]);
        expect(set.ignored).toEqual([]);
        // the model is stored in the zip: what is loaded is exactly its bytes
        const pump = set.items.find((i) => i.file.name === "pump.glb");
        expect(await pump?.file.data.text()).toBe("binary model");
    });

    it("still reads a zip of version 1 (one model, in models/ and fem/), without a slide", async () => {
        const v1 = zipSync({
            "models/pump.glb": strToU8("binary model"),
            "fem/r1.json": strToU8(JSON.stringify(fem)),
            "manifest.json": strToU8(JSON.stringify({ format: VIEWER_DATA_FORMAT, version: 1 })),
        });
        const set = await readViewerDataFiles([{ name: "old.zip", data: new Blob([v1]) }], { looseModel: false });
        expect(set.items.map((i) => `${i.part}:${i.slideId ?? ""}`)).toEqual(["model:", "fem:"]);
    });

    it("the Viewer data menu leaves a loose model and FEM results to the 3D Model panels", async () => {
        const set = await readViewerDataFiles([text("pump.glb", "x"), json("r.json", fem)], { looseModel: false });
        expect(set.items).toEqual([]);
        expect(set.ignored.join(" ")).toMatch(/3D Model panel of their slide/);
    });

    it("keeps one of each part (the FEM results all) and says what it left out", async () => {
        const set = await readViewerDataFiles([
            text("a.glb", "x"),
            text("b.glb", "y"),
            json("r.json", fem),
            json("r.json", fem),
            json("odd.json", { a: [1] }),
        ]);
        expect(set.items.map((i) => `${i.part}:${i.file.name}`)).toEqual(["model:a.glb", "fem:r.json"]);
        expect(set.ignored).toHaveLength(3);
        expect(set.ignored.some((r) => /b\.glb: 3d model already given by a\.glb/.test(r))).toBe(true);
    });

    it("takes a viewer configuration zip as the configuration", async () => {
        const zip = zipSync({ "viewer_config.json": strToU8(JSON.stringify(config)) });
        const set = await readViewerDataFiles([{ name: "viewer_config.zip", data: blobOf(zip) }]);
        expect(set.items.map((i) => i.part)).toEqual(["config"]);
        expect(set.items[0].summary).toMatch(/with 0 images/);
        const broken = await readViewerDataFiles([{ name: "x.zip", data: new Blob(["not a zip"]) }]);
        expect(broken.items).toEqual([]);
        expect(broken.ignored[0]).toMatch(/not a valid zip/);
    });

    it("leaves a loose pipeline to the Pipeline view when asked", async () => {
        const files = [text("pipeline.yml", YAML.stringify(pipeline)), json("results.json", fem)];
        const viewer = await readViewerDataFiles(files, { loosePipeline: false });
        expect(viewer.items.map((i) => i.part)).toEqual(["fem"]);
        expect(viewer.ignored[0]).toMatch(/Pipeline view/);
        const form = await readViewerDataFiles(files);
        expect(form.items.map((i) => i.part)).toEqual(["fem", "pipeline"]);
    });

    it("leaves a loose simulator format to the Simulator panel when asked", async () => {
        const files = [json("simulator.json", simulator)];
        const menu = await readViewerDataFiles(files, { loosePipeline: false, looseSimulator: false });
        expect(menu.items).toEqual([]);
        expect(menu.ignored[0]).toMatch(/Simulator panel/);
        expect((await readViewerDataFiles(files)).items.map((i) => i.part)).toEqual(["simulator"]);
    });

    it("takes the files of the zip's fem/ folder as FEM results without reading them", async () => {
        const zip = zipSync({
            "manifest.json": strToU8(JSON.stringify({ format: VIEWER_DATA_FORMAT })),
            "fem/big.json": strToU8("not even json"),
        });
        const set = await readViewerDataFiles([{ name: "data.zip", data: blobOf(zip) }]);
        expect(set.items.map((i) => `${i.part}:${i.file.name}`)).toEqual(["fem:big.json"]);
    });

    it("converts the stored pipeline to YAML and back", () => {
        const stored = JSON.stringify([{ ...pipeline.nodes[0], settings: JSON.stringify({ a: 1 }) }]);
        const yaml = pipelineYamlOf(stored)!;
        expect(YAML.parse(yaml).nodes[0].settings).toEqual({ a: 1 });
        const nodes = pipelineNodesOf(yaml) as { settings: string }[];
        expect(typeof nodes[0].settings).toBe("string");
        expect(JSON.parse(nodes[0].settings)).toEqual({ a: 1 });
        expect(pipelineYamlOf("")).toBeNull();
        expect(pipelineYamlOf("[]")).toBeNull();
        expect(pipelineNodesOf("nodes: []")).toBeNull();
        expect(simulatorFormatOf(JSON.stringify(simulator))).toEqual(simulator);
        expect(simulatorFormatOf("[1]")).toBeNull();
    });
});
