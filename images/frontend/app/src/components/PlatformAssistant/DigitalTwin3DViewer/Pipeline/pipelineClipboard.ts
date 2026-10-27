import YAML from "yaml";
import { nanoid } from "nanoid";

// Utilidades puras para copiar/pegar e importar grupos de nodos del pipeline.

export const MAX_INJECT_NODES = 5;

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
export const uniqueLabel = (label: string, usedLabels: Set<string>) => {
    if (!usedLabels.has(label)) return label;
    const match = /^(.*?)\s*(\d+)$/.exec(label);
    const base = match ? match[1] : label;
    let n = match ? parseInt(match[2], 10) + 1 : 2;
    while (usedLabels.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
};

interface PrepareOptions {
    // true al pegar (los nodos son copias) y false al importar (createNodesAndEdges ya evitó colisiones de uid)
    regenerateIds: boolean;
}

export type PrepareResult = { nodes: any[]; edges: any[]; error?: undefined } | { error: string; nodes?: undefined; edges?: undefined };

// Prepara nodos/conexiones para insertarlos junto a los existentes: uids nuevos, nombres únicos,
// injectRef libres y conexiones sólo entre los nodos del grupo.
export const prepareNodesForInsertion = (
    groupNodes: any[],
    groupEdges: any[],
    existingNodes: any[],
    { regenerateIds }: PrepareOptions,
): PrepareResult => {
    const existingInjects = existingNodes.filter((node) => node.type === "Inject");
    const groupInjects = groupNodes.filter((node) => node.type === "Inject");
    if (existingInjects.length + groupInjects.length > MAX_INJECT_NODES) {
        return { error: `You can only have ${MAX_INJECT_NODES} Inject nodes in the pipeline.` };
    }

    const idMap = new Map<string, string>();
    for (const node of groupNodes) idMap.set(node.id, regenerateIds ? newNodeUid() : node.id);

    const usedLabels = new Set<string>(existingNodes.map((node) => node.data?.label));
    const usedInjectRefs = new Set<string>(existingInjects.map((node) => node.data?.settings?.injectRef).filter(Boolean));

    const nodes = groupNodes.map((node) => {
        const id = idMap.get(node.id)!;
        const label = uniqueLabel(node.data?.label ?? node.type, usedLabels);
        usedLabels.add(label);
        const settings = node.data?.settings ? JSON.parse(JSON.stringify(node.data.settings)) : {};
        if (node.type === "Inject") {
            let injectRef = settings.injectRef;
            if (!injectRef || usedInjectRefs.has(injectRef)) {
                let n = 1;
                while (usedInjectRefs.has(`inject_${n}`)) n++;
                injectRef = `inject_${n}`;
            }
            settings.injectRef = injectRef;
            usedInjectRefs.add(injectRef);
        }
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
