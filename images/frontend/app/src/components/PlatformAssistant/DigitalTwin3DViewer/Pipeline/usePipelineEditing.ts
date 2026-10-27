import { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { createNodesAndEdges, pipelineToYamlNodes } from "../Utils/customHooks";
import { nodesBounds, parsePipelineYaml, pipelineYamlText, prepareNodesForInsertion } from "./pipelineClipboard";

// Undo/Redo, Copy/Cut/Paste y colocación con el ratón de grupos de nodos en el editor de pipelines.
//  - Ctrl+Z deshacer, Ctrl+Y / Ctrl+Shift+Z rehacer (Cmd en macOS)
//  - Ctrl+C / Ctrl+X / Ctrl+V copian, cortan y pegan los nodos seleccionados y las conexiones entre ellos.
//    Se usa el portapapeles del sistema en formato YAML (el mismo de "Download YAML"), así que se puede
//    pegar en otro gemelo digital, en otra pestaña o en un editor de texto.
//  - Los nodos pegados o importados con "Upload YAML" siguen al ratón hasta hacer clic (Esc cancela).
// Los atajos no actúan mientras se escribe en un input, textarea o en el editor de código.

const HISTORY_LIMIT = 100;
const SNAP = 10;

interface Snapshot {
    nodes: any[];
    edges: any[];
}

interface Placement {
    ids: Set<string>;
    offsets: Map<string, { x: number; y: number }>;
}

// Último texto copiado, por si el navegador no deja leer el portapapeles en el evento "paste"
let internalClipboard: string | null = null;

const isEditableTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor');

const snap = (value: number) => Math.round(value / SNAP) * SNAP;

interface UsePipelineEditingParams {
    nodes: any[];
    edges: any[];
    setNodes: (updater: any) => void;
    setEdges: (updater: any) => void;
    wrapperRef: MutableRefObject<HTMLElement | null>;
    screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
    handlePipelineUiChanged: (changed: boolean) => void;
    natsClient: any;
    natsSubjectsData: any;
    // devuelve un mensaje de error si los nodos no se pueden añadir (p. ej. AiAgent sin LLM habilitado)
    validateNodes?: (nodes: any[]) => string | null;
    onHistoryChange?: () => void;
}

export const usePipelineEditing = ({
    nodes,
    edges,
    setNodes,
    setEdges,
    wrapperRef,
    screenToFlowPosition,
    handlePipelineUiChanged,
    natsClient,
    natsSubjectsData,
    validateNodes,
    onHistoryChange,
}: UsePipelineEditingParams) => {
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    nodesRef.current = nodes;
    edgesRef.current = edges;

    const latest = useRef({ handlePipelineUiChanged, natsClient, natsSubjectsData, validateNodes, onHistoryChange, screenToFlowPosition });
    latest.current = { handlePipelineUiChanged, natsClient, natsSubjectsData, validateNodes, onHistoryChange, screenToFlowPosition };

    const past = useRef<Snapshot[]>([]);
    const future = useRef<Snapshot[]>([]);
    const placementRef = useRef<Placement | null>(null);
    const [isPlacing, setIsPlacing] = useState(false);
    const lastPointer = useRef<{ x: number; y: number } | null>(null);
    const swallowClick = useRef(false);

    const takeSnapshot = useCallback(() => {
        const last = past.current[past.current.length - 1];
        if (last && last.nodes === nodesRef.current && last.edges === edgesRef.current) return;
        past.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
        future.current = [];
    }, []);

    const resetHistory = useCallback(() => {
        past.current = [];
        future.current = [];
    }, []);

    const restore = useCallback(
        (snapshot: Snapshot) => {
            setNodes(snapshot.nodes);
            setEdges(snapshot.edges);
            latest.current.handlePipelineUiChanged(true);
            latest.current.onHistoryChange?.();
        },
        [setNodes, setEdges],
    );

    const undo = useCallback(() => {
        const snapshot = past.current.pop();
        if (!snapshot) return;
        future.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
        restore(snapshot);
    }, [restore]);

    const redo = useCallback(() => {
        const snapshot = future.current.pop();
        if (!snapshot) return;
        past.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
        restore(snapshot);
    }, [restore]);

    // Posición (en coordenadas del flujo) donde colocar el grupo: el ratón si está sobre el lienzo, si no el centro
    const anchorFlowPosition = useCallback(() => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        const pointer = lastPointer.current;
        const inside =
            rect && pointer && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom;
        const screen = inside ? pointer! : rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
        return latest.current.screenToFlowPosition(screen);
    }, [wrapperRef]);

    const finishPlacement = useCallback(() => {
        if (!placementRef.current) return;
        placementRef.current = null;
        setIsPlacing(false);
        latest.current.handlePipelineUiChanged(true);
    }, []);

    const cancelPlacement = useCallback(() => {
        if (!placementRef.current) return;
        placementRef.current = null;
        setIsPlacing(false);
        const snapshot = past.current.pop();
        if (snapshot) {
            setNodes(snapshot.nodes);
            setEdges(snapshot.edges);
        }
    }, [setNodes, setEdges]);

    // Añade el grupo seleccionado y pegado al ratón; queda fijo con el siguiente clic
    const startPlacement = useCallback(
        (groupNodes: any[], groupEdges: any[], regenerateIds: boolean) => {
            if (placementRef.current) finishPlacement();
            const prepared = prepareNodesForInsertion(groupNodes, groupEdges, nodesRef.current, { regenerateIds });
            if (prepared.error !== undefined) {
                toast.error(prepared.error);
                return false;
            }
            const validationError = latest.current.validateNodes?.(prepared.nodes);
            if (validationError) {
                toast.error(validationError);
                return false;
            }
            const bounds = nodesBounds(prepared.nodes);
            const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
            const offsets = new Map<string, { x: number; y: number }>();
            for (const node of prepared.nodes) {
                offsets.set(node.id, { x: node.position.x - center.x, y: node.position.y - center.y });
            }
            const anchor = anchorFlowPosition();
            const placedNodes = prepared.nodes.map((node) => {
                const offset = offsets.get(node.id)!;
                return { ...node, selected: true, position: { x: snap(anchor.x + offset.x), y: snap(anchor.y + offset.y) } };
            });

            takeSnapshot();
            setNodes((nds: any[]) => nds.map((node) => (node.selected ? { ...node, selected: false } : node)).concat(placedNodes));
            setEdges((eds: any[]) => eds.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)).concat(prepared.edges));
            placementRef.current = { ids: new Set(placedNodes.map((node) => node.id)), offsets };
            setIsPlacing(true);
            return true;
        },
        [anchorFlowPosition, finishPlacement, setEdges, setNodes, takeSnapshot],
    );

    const importPipeline = useCallback(
        (importedNodes: any[], importedEdges: any[]) => {
            if (startPlacement(importedNodes, importedEdges, false)) {
                toast.info(`${importedNodes.length} node(s) loaded: click on the canvas to place them (Esc to cancel)`);
            }
        },
        [startPlacement],
    );

    // ---- ratón sobre el lienzo ----
    const onMouseMove = useCallback(
        (event: React.MouseEvent) => {
            lastPointer.current = { x: event.clientX, y: event.clientY };
            const placement = placementRef.current;
            if (!placement) return;
            const anchor = latest.current.screenToFlowPosition({ x: event.clientX, y: event.clientY });
            setNodes((nds: any[]) =>
                nds.map((node) => {
                    const offset = placement.offsets.get(node.id);
                    if (!offset) return node;
                    return { ...node, position: { x: snap(anchor.x + offset.x), y: snap(anchor.y + offset.y) } };
                }),
            );
        },
        [setNodes],
    );

    const onPointerDownCapture = useCallback(
        (event: React.PointerEvent | React.MouseEvent) => {
            if (!placementRef.current) return;
            // el clic que suelta el grupo no debe llegar a React Flow (deseleccionaría o empezaría un arrastre)
            event.stopPropagation();
            event.preventDefault();
            if ((event as React.MouseEvent).button === 0) {
                lastPointer.current = { x: event.clientX, y: event.clientY };
                finishPlacement();
            } else {
                cancelPlacement();
            }
            swallowClick.current = true;
            window.setTimeout(() => (swallowClick.current = false), 400);
        },
        [cancelPlacement, finishPlacement],
    );

    const onMouseDownCapture = useCallback((event: React.MouseEvent) => {
        if (!placementRef.current && !swallowClick.current) return;
        event.stopPropagation();
        event.preventDefault();
    }, []);

    const onClickCapture = useCallback((event: React.MouseEvent) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        event.stopPropagation();
        event.preventDefault();
    }, []);

    // ---- teclado y portapapeles ----
    useEffect(() => {
        const inScope = (target: EventTarget | null) => {
            if (isEditableTarget(target)) return false;
            const el = target as Node | null;
            if (!el || el === document.body || el === document.documentElement || el === document) return true;
            return !!wrapperRef.current?.contains(el);
        };

        const selectedGroup = () => {
            const selectedNodes = nodesRef.current.filter((node) => node.selected);
            const ids = new Set(selectedNodes.map((node) => node.id));
            const groupEdges = edgesRef.current.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
            return { selectedNodes, groupEdges, ids };
        };

        const copySelection = (event: ClipboardEvent) => {
            const { selectedNodes, groupEdges } = selectedGroup();
            if (selectedNodes.length === 0) return 0;
            const text = pipelineYamlText(pipelineToYamlNodes(selectedNodes, groupEdges));
            internalClipboard = text;
            event.clipboardData?.setData("text/plain", text);
            event.preventDefault();
            return selectedNodes.length;
        };

        const onCopy = (event: ClipboardEvent) => {
            if (!inScope(event.target) || placementRef.current) return;
            const count = copySelection(event);
            if (count) toast.info(`${count} node(s) copied`, { autoClose: 1500 });
        };

        const onCut = (event: ClipboardEvent) => {
            if (!inScope(event.target) || placementRef.current) return;
            const { ids } = selectedGroup();
            const count = copySelection(event);
            if (!count) return;
            takeSnapshot();
            setNodes((nds: any[]) => nds.filter((node) => !ids.has(node.id)));
            setEdges((eds: any[]) => eds.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)));
            latest.current.handlePipelineUiChanged(true);
            latest.current.onHistoryChange?.();
            toast.info(`${count} node(s) cut`, { autoClose: 1500 });
        };

        const onPaste = (event: ClipboardEvent) => {
            if (!inScope(event.target)) return;
            const systemText = event.clipboardData?.getData("text/plain") ?? "";
            const yamlNodes = parsePipelineYaml(systemText || internalClipboard);
            if (!yamlNodes) return;
            event.preventDefault();
            const { nodes: groupNodes, edges: groupEdges } = createNodesAndEdges(
                [],
                [],
                yamlNodes,
                latest.current.natsClient,
                latest.current.natsSubjectsData,
            );
            startPlacement(groupNodes, groupEdges, true);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && placementRef.current) {
                event.preventDefault();
                cancelPlacement();
                return;
            }
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
            if (!inScope(event.target)) return;
            const key = /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : event.code.replace(/^Key/, "").toLowerCase();
            if (placementRef.current && (key === "z" || key === "y")) {
                event.preventDefault();
                return;
            }
            if (key === "z" && !event.shiftKey) {
                event.preventDefault();
                undo();
            } else if (key === "y" || (key === "z" && event.shiftKey)) {
                event.preventDefault();
                redo();
            }
        };

        document.addEventListener("copy", onCopy);
        document.addEventListener("cut", onCut);
        document.addEventListener("paste", onPaste);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("copy", onCopy);
            document.removeEventListener("cut", onCut);
            document.removeEventListener("paste", onPaste);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [cancelPlacement, redo, setEdges, setNodes, startPlacement, takeSnapshot, undo, wrapperRef]);

    return {
        takeSnapshot,
        resetHistory,
        undo,
        redo,
        importPipeline,
        isPlacing,
        wrapperHandlers: {
            onMouseMove,
            onPointerDownCapture,
            onMouseDownCapture,
            onClickCapture,
        },
    };
};
