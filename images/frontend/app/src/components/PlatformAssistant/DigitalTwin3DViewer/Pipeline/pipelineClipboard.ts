import YAML from "yaml";
import { nanoid } from "nanoid";

// Utilidades puras para copiar/pegar e importar grupos de nodos del pipeline.

export const newNodeUid = () => nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

export const edgeOutputIndex = (edge: { sourceHandle?: string | null }) =>
    edge.sourceHandle ? parseInt(edge.sourceHandle.split("-")[1], 10) || 0 : 0;

// Devuelve los nodos del YAML si el texto es un pipeline (el formato de "Download YAML"), si no null
export const parsePipelineYaml = (text: string | null | undefined): any[] | null => {
    if (!text || !/nodes\s*:/.test(text)) return null;
    try {
        const data = YAML.parse(text);
        const nodes = Array.isArray(data) ? data : data?.nodes;
        if (!Array.isArray(nodes) || nodes.length === 0) return null;
        const valid = nodes.every(
            (node) => node && typeof node.type === "string" && typeof node.nodeUid === "string" && Array.isArray(node.wires ?? []),
        );
        if (!valid) return null;
        return nodes.map((node) => ({ ...node, wires: node.wires ?? [] }));
    } catch {
        return null;
    }
};

export const pipelineYamlText = (yamlNodes: any[]) => YAML.stringify({ nodes: yamlNodes });

// "Function 1" -> "Function 2", "Function 3"... hasta encontrar uno libre
// A free name for a copied node. A counter separated by a space ("Delay 1") or in brackets ("Listen
// dev2pdb_2 (2)") is increased; a number that is part of the name ("Listen dev2pdb_2") is kept, and
// "(2)" is added, so that the name does not suggest another topic.
export const uniqueLabel = (label: string, usedLabels: Set<string>) => {
    if (!usedLabels.has(label)) return label;
    let base = label;
    let n = 2;
    let format = (k: number) => `${base} ${k}`;
    const bracketed = /^(.*\S) \((\d+)\)$/.exec(label);
    const spaced = /^(.*\S)\s+(\d+)$/.exec(label);
    if (bracketed) {
        base = bracketed[1];
        n = parseInt(bracketed[2], 10) + 1;
        format = (k) => `${base} (${k})`;
    } else if (spaced) {
        base = spaced[1];
        n = parseInt(spaced[2], 10) + 1;
    } else if (/\d$/.test(label)) {
        format = (k) => `${base} (${k})`;
    }
    while (usedLabels.has(format(n))) n++;
    return format(n);
};

interface PrepareOptions {
    // true al pegar (los nodos son copias) y false al importar (createNodesAndEdges ya evitó colisiones de uid)
    regenerateIds: boolean;
}

export type PrepareResult = { nodes: any[]; edges: any[]; error?: undefined } | { error: string; nodes?: undefined; edges?: undefined };

// Prepara nodos/conexiones para insertarlos junto a los existentes: uids nuevos, nombres únicos
// y conexiones sólo entre los nodos del grupo.
export const prepareNodesForInsertion = (
    groupNodes: any[],
    groupEdges: any[],
    existingNodes: any[],
    { regenerateIds }: PrepareOptions,
): PrepareResult => {
    const idMap = new Map<string, string>();
    for (const node of groupNodes) idMap.set(node.id, regenerateIds ? newNodeUid() : node.id);

    const usedLabels = new Set<string>(existingNodes.map((node) => node.data?.label));

    const nodes = groupNodes.map((node) => {
        const id = idMap.get(node.id)!;
        const label = uniqueLabel(node.data?.label ?? node.type, usedLabels);
        usedLabels.add(label);
        const settings = node.data?.settings ? JSON.parse(JSON.stringify(node.data.settings)) : {};
        // Inject nodes are told apart by their uid: the injectRef of older pipelines is not used
        if (node.type === "Inject") delete settings.injectRef;
        return {
            id,
            type: node.type,
            position: { ...node.position },
            data: { ...node.data, label, nodeUid: id, settings },
        };
    });

    const edges = [] as any[];
    const edgeIds = new Set<string>();
    for (const edge of groupEdges) {
        const source = idMap.get(edge.source);
        const target = idMap.get(edge.target);
        if (!source || !target) continue;
        const outputIndex = edgeOutputIndex(edge);
        const id = `${source}-${outputIndex}-${target}`;
        if (edgeIds.has(id)) continue;
        edgeIds.add(id);
        edges.push({ id, source, target, sourceHandle: `${source}-${outputIndex}` });
    }

    return { nodes, edges };
};

// Rectángulo que ocupa un grupo de nodos (usa las medidas reales si React Flow ya las conoce)
export const nodesBounds = (nodes: any[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
        const width = node.measured?.width ?? node.width ?? 190;
        const height = node.measured?.height ?? node.height ?? 40;
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + width);
        maxY = Math.max(maxY, node.position.y + height);
    }
    if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};
