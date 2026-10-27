import { describe, expect, it } from "vitest";
import { createNodesAndEdges, pipelineToYamlNodes } from "../Utils/customHooks";
import { parsePipelineYaml, pipelineYamlText, prepareNodesForInsertion, uniqueLabel } from "./pipelineClipboard";

const node = (id: string, type: string, label: string, extra: Record<string, any> = {}) => ({
    id,
    type,
    position: { x: 100, y: 50 },
    data: { label, nodeUid: id, numOutputs: 2, debug: "off", settings: { ...extra } },
});

describe("pipelineClipboard", () => {
    it("YAML de ida y vuelta conserva las conexiones creadas en el editor (ids xy-edge__)", () => {
        const nodes = [node("aaa", "Function", "Function 1"), node("bbb", "Publish", "Publish 1")];
        const edges = [{ id: "xy-edge__aaaaaa-1-bbb", source: "aaa", target: "bbb", sourceHandle: "aaa-1" }];
        const text = pipelineYamlText(pipelineToYamlNodes(nodes as any, edges as any));
        const yamlNodes = parsePipelineYaml(text)!;
        expect(yamlNodes).toHaveLength(2);
        expect(yamlNodes[0].numOutputs).toBe(2);
        expect(yamlNodes[0].wires[1]).toEqual([{ nodeEndUid: "bbb" }]);
        const rebuilt = createNodesAndEdges([], [], yamlNodes, null, []);
        expect(rebuilt.edges).toEqual([{ id: "aaa-1-bbb", source: "aaa", target: "bbb", sourceHandle: "aaa-1" }]);
    });

    it("no interpreta texto cualquiera como pipeline", () => {
        expect(parsePipelineYaml("hola mundo")).toBeNull();
        expect(parsePipelineYaml("nodes: 3")).toBeNull();
        expect(parsePipelineYaml("nodes:\n  - foo: 1")).toBeNull();
    });

    it("al pegar genera uids nuevos, nombres únicos y reconecta sólo dentro del grupo", () => {
        const existing = [node("aaa", "Function", "Function 1"), node("bbb", "Function", "Function 2")];
        const group = [node("aaa", "Function", "Function 1"), node("ccc", "Publish", "Publish 1")];
        const groupEdges = [
            { id: "e1", source: "aaa", target: "ccc", sourceHandle: "aaa-0" },
            { id: "e2", source: "aaa", target: "zzz", sourceHandle: "aaa-1" },
        ];
        const result = prepareNodesForInsertion(group, groupEdges, existing, { regenerateIds: true });
        if (result.error !== undefined) throw new Error(result.error);
        const [fn, pub] = result.nodes;
        expect(fn.id).not.toBe("aaa");
        expect(fn.data.nodeUid).toBe(fn.id);
        expect(fn.data.label).toBe("Function 3");
        expect(pub.data.label).toBe("Publish 1");
        expect(result.edges).toEqual([{ id: `${fn.id}-0-${pub.id}`, source: fn.id, target: pub.id, sourceHandle: `${fn.id}-0` }]);
        // los settings son una copia
        expect(fn.data.settings).not.toBe(group[0].data.settings);
    });

    it("respeta el límite de nodos Inject y asigna injectRef libres", () => {
        const existing = [1, 2, 3].map((n) => node(`i${n}`, "Inject", `Inject ${n}`, { injectRef: `inject_${n}` }));
        const ok = prepareNodesForInsertion([existing[0]], [], existing, { regenerateIds: true });
        if (ok.error !== undefined) throw new Error(ok.error);
        expect(ok.nodes[0].data.settings.injectRef).toBe("inject_4");
        const tooMany = prepareNodesForInsertion(existing, [], existing, { regenerateIds: true });
        expect(tooMany.error).toMatch(/5 Inject/);
    });

    it("uniqueLabel", () => {
        expect(uniqueLabel("Delay 1", new Set(["Delay 1", "Delay 2"]))).toBe("Delay 3");
        expect(uniqueLabel("My node", new Set(["My node"]))).toBe("My node 2");
        expect(uniqueLabel("Free", new Set())).toBe("Free");
    });
});
