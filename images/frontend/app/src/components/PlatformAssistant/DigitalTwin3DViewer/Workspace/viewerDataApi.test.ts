import { beforeEach, describe, expect, it, vi } from "vitest";
// jsdom's Blob has no stream() (every browser's has): Node's is used instead
vi.hoisted(() => {
    const node = globalThis as unknown as { process: { getBuiltinModule: (id: string) => { Blob: unknown } } };
    (globalThis as { Blob: unknown }).Blob = node.process.getBuiltinModule("node:buffer").Blob;
    // jsdom's FormData only takes jsdom's Blob; axios is mocked, so the form only has to be built
    (globalThis as { FormData: unknown }).FormData = class {
        append() {}
    };
});

const calls: { method: string; url: string; body?: unknown }[] = [];
let missing: string[] = [];
vi.mock("../../../../tools/axiosIntance", () => ({
    getAxiosInstance: () => ({
        post: async (url: string, body: unknown) => {
            calls.push({ method: "post", url, body });
            return { data: url.includes("model_check") ? { missingSensorsRef: missing } : { message: "ok" } };
        },
        put: async (url: string, body: unknown) => {
            calls.push({ method: "put", url, body });
            return { data: { message: "ok" } };
        },
        patch: async (url: string, body: unknown) => {
            calls.push({ method: "patch", url, body });
            return { data: { message: "ok" } };
        },
        get: async () => ({ data: [] }),
        delete: async () => ({ data: {} }),
    }),
}));
vi.mock("react-toastify", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import { applyViewerData, loadModel } from "./viewerDataApi";
import { readViewerDataFiles } from "./viewerData";

const auth = { accessToken: "a", refreshToken: "r", authDispatch: vi.fn() } as any;
const ref = { groupId: 3, digitalTwinId: 9 };
const gltf = {
    asset: { version: "2.0" },
    meshes: [{ primitives: [] }],
    nodes: [
        { name: "Sensor1", mesh: 0, extras: { type: "sensor", sensorRef: "temp" } },
        { name: "Fan", mesh: 0, extras: { clipSensorRef: "speed" } },
    ],
};

describe("Viewer data API", () => {
    beforeEach(() => {
        calls.length = 0;
        missing = [];
    });

    it("loads a model: checks its sensors, uploads it and registers it", async () => {
        const ok = await loadModel({ ...ref, slideId: "s-tank" }, { name: "pump.gltf", data: new Blob([JSON.stringify(gltf)]) }, auth);
        expect(ok).toBe(true);
        // to the slide's own folder (each slide has its own model)
        expect(calls.map((c) => `${c.method} ${c.url.split("/admin_api/")[1]}`)).toEqual([
            "post digital_twin_model_check/3/9",
            "post digital_twin_upload_file/3/9/gltfFile/pump.gltf?slide=s-tank",
            "put digital_twin_model/3/9?slide=s-tank",
        ]);
        expect(calls[0].body).toEqual({ sensorsRef: ["temp", "speed"] });
        expect(calls[2].body).toEqual({ fileName: "pump.gltf", sensorsRef: ["temp", "speed"] });
    });

    it("does not upload a model that points at sensors the asset does not have", async () => {
        missing = ["speed"];
        const ok = await loadModel({ ...ref, slideId: "slide-1" }, { name: "pump.gltf", data: new Blob([JSON.stringify(gltf)]) }, auth);
        expect(ok).toBe(false);
        expect(calls).toHaveLength(1);
    });

    it("loads the chosen parts in their order", async () => {
        const set = await readViewerDataFiles([
            {
                name: "pipeline.yml",
                data: new Blob(["nodes:\n  - name: A\n    nodeUid: n1\n    type: inject\n    settings: {a: 1}\n    wires: []\n"]),
            },
            {
                name: "simulator.json",
                data: new Blob([JSON.stringify({ t: { label: "T", units: "C", minValue: 0, maxValue: 1, defaultValue: 0, step: 1 } })]),
            },
        ]);
        const steps: string[] = [];
        const result = await applyViewerData(ref, set.items, { auth, onStep: (item) => steps.push(item.part) });
        expect(result.loaded.map((i) => i.part)).toEqual(["simulator", "pipeline"]);
        expect(calls.map((c) => c.url.split("/admin_api/")[1])).toEqual(["digital_twin_simulator_format/3/9", "digital_twin_pipeline/3/9"]);
        const pipelineBody = calls[1].body as { nodes: { settings: string }[]; reinitialize: boolean };
        expect(pipelineBody.reinitialize).toBe(false);
        expect(JSON.parse(pipelineBody.nodes[0].settings)).toEqual({ a: 1 });
        expect(steps[0]).toBe("simulator");
    });
});
