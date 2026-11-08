import { describe, expect, it } from "vitest";
import { pipelineToYamlNodes, yamlDownloadSelection } from "./customHooks";

const node = (id: string, selected = false) =>
    ({ id, type: "Function", position: { x: 0, y: 0 }, selected, data: { label: id, numOutputs: 1, settings: {} } }) as any;
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target, sourceHandle: "output-0" }) as any;

describe("Download YAML", () => {
    const nodes = [node("a", true), node("b", true), node("c")];
    const edges = [edge("a", "b"), edge("b", "c")];

    it("saves only the selected nodes and the wires between them", () => {
        const { nodes: chosen, edges: wires, partial } = yamlDownloadSelection(nodes, edges);
        expect(partial).toBe(true);
        expect(chosen.map((n) => n.id)).toEqual(["a", "b"]);
        const yaml = pipelineToYamlNodes(chosen, wires);
        expect(yaml.find((n) => n.nodeUid === "a").wires).toEqual([[{ nodeEndUid: "b" }]]);
        expect(yaml.find((n) => n.nodeUid === "b").wires).toEqual([[]]); // b -> c is left out
    });

    it("saves the whole pipeline when nothing is selected", () => {
        const all = nodes.map((n) => ({ ...n, selected: false }));
        expect(yamlDownloadSelection(all, edges)).toEqual({ nodes: all, edges, partial: false });
    });
});
