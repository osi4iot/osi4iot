// @ts-nocheck
import styled from "styled-components";
import { nanoid } from "nanoid";
import {
    Background,
    Controls,
    ReactFlow,
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useRef, useState } from "react";
import { FunctionNode, ListenNode, PublishNode, InjectNode, DelayNode, EmailNode, TelegramNode } from "./Nodes";
import NodePalette from "./NodePalette";
import NodePropertiesPanel from "./NodePropertiesPanel";
import { createNodesAndEdges } from "../Utils/customHooks";
import { toast } from "react-toastify";

export const processInitialPipelineData = (digitalTwinSelected) => {
    if (!digitalTwinSelected.pipelineFileData || digitalTwinSelected.pipelineFileData === "") {
        return { nodes: [], edges: [] };
    }

    try {
        const pipelineData = JSON.parse(digitalTwinSelected.pipelineFileData);

        if (Object.keys(pipelineData).length === 0) {
            return { nodes: [], edges: [] };
        }

        return createNodesAndEdges(pipelineData);
    } catch (error) {
        toast.error(`Error processing pipeline data: ${error.message}`);
        return { nodes: [], edges: [] };
    }
};

const nodeCounters = {
    Function: 0,
    Listen: 0,
    Publish: 0,
    Inject: 0,
    Email: 0,
    Telegram: 0,
    Delay: 0,
};

// Removed the panelOpen prop from the styled component
const ReactFlowWrapper = styled.div`
    flex: 1;
    color: #222;
    background-color: #212121;
    /* Removed margin-left and transition - now canvas stays fixed */

    .react-flow__attribution a {
        text-decoration: none;
        color: black;
    }
`;

export default function Flow({
    mqttClient,
    mqttConnectionStatus,
    digitalTwinSelected,
    nodes,
    edges,
    setNodes,
    setEdges,
    handlePipelineUiChanged,
}) {
    const reactFlowWrapper = useRef(null);
    const { screenToFlowPosition } = useReactFlow();

    // Estados para el panel de propiedades
    const [selectedNode, setSelectedNode] = useState(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    // Define nodeTypes outside of component or memoize them without dependencies
    const nodeTypes = useMemo(
        () => ({
            Function: FunctionNode,
            Listen: ListenNode,
            Publish: PublishNode,
            Inject: InjectNode,
            Email: EmailNode,
            Telegram: TelegramNode,
            Delay: DelayNode,
        }),
        [] // Empty dependency array - nodeTypes won't change
    );

    const onNodesChange = useCallback(
        (changes) => setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    const onEdgesChange = useCallback(
        (changes) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const onConnect = useCallback((params) => setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)), []);

    // Manejar clic simple en nodo (solo seleccionar) - ReactFlow maneja la selección automáticamente
    const onNodeClick = useCallback((event, node) => {
        event.stopPropagation();
        // ReactFlow maneja la selección visual automáticamente
    }, []);

    // Manejar doble clic en nodo (abrir panel)
    const onNodeDoubleClick = useCallback((event, node) => {
        event.stopPropagation();
        setSelectedNode(node);
        setIsPanelOpen(true);
    }, []);

    // Manejar clic en el fondo del canvas
    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
        setIsPanelOpen(false);
    }, []);

    // Actualizar nodo
    const onUpdateNode = useCallback(
        (nodeId, newData) => {
            setNodes((nds) =>
                nds.map((node) => {
                    if (node.id === nodeId) {
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                ...newData,
                            },
                        };
                    }
                    return node;
                })
            );
        },
        [setNodes]
    );

    // Cerrar panel
    const onClosePanel = useCallback(() => {
        setIsPanelOpen(false);
        setTimeout(() => {
            setSelectedNode(null);
        }, 300); // Esperar a que termine la animación
    }, []);

    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    }, []);

    const onDrop = useCallback(
        (event) => {
            event.preventDefault();

            const data = event.dataTransfer.getData("application/reactflow");

            if (!data) return;

            const { nodeType, label, numOutputs, debug, settings } = JSON.parse(data);
            const nodeWidth = 190;
            const nodeHeight = 40;
            const position = screenToFlowPosition({
                x: event.clientX - nodeWidth / 2,
                y: event.clientY - nodeHeight / 2,
            });

            const nodeUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

            const nodeNumber = nodeCounters[nodeType] + 1;
            nodeCounters[nodeType] = nodeNumber;

            const newNode = {
                id: nodeUid,
                type: nodeType,
                position,
                data: {
                    label: `${label} ${nodeNumber}`,
                    nodeUid,
                    numOutputs,
                    debug,
                    settings,
                },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [screenToFlowPosition]
    );

    return (
        <div style={{ width: "100%", height: "100%", display: "flex" }}>
            <NodePalette />

            {/* Panel de propiedades de nodos - Now positioned absolutely and won't affect canvas */}
            <NodePropertiesPanel
                isOpen={isPanelOpen}
                onClose={onClosePanel}
                selectedNode={selectedNode}
                onUpdateNode={onUpdateNode}
                handlePipelineUiChanged={handlePipelineUiChanged}
            />

            <ReactFlowWrapper ref={reactFlowWrapper}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={onNodeClick}
                    onNodeDoubleClick={onNodeDoubleClick}
                    onPaneClick={onPaneClick}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    nodeTypes={nodeTypes}
                    deleteKeyCode={["Backspace", "Delete"]}
                    multiSelectionKeyCode={["Control", "Meta"]}
                    selectionKeyCode="Shift"
                    panOnDrag={true}
                    selectionOnDrag={false}
                    defaultViewport={{ x: 0, y: 0, zoom: 1.5 }}
                    minZoom={0.3}
                    maxZoom={4}
                    fitView={false}
                    snapToGrid={true}
                    snapGrid={[10, 10]}
                    nodesDraggable={true}
                    nodesConnectable={true}
                    elementsSelectable={true}
                >
                    <Controls style={{ color: "black" }} />
                    <Background variant="dots" gap={12} size={1} />
                </ReactFlow>
            </ReactFlowWrapper>
        </div>
    );
}
