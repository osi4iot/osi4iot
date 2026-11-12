// @ts-nocheck
import styled from "styled-components";
import { useMlModelsInGroup } from "../../../../state";
import { getViewerMemory, rememberViewer } from "../../../../state/viewerMemoryStore";
import { nanoid } from "nanoid";
import {
    Background,
    Controls,
    PanOnScrollMode,
    ReactFlow,
    SelectionMode,
    getNodesBounds,
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FunctionNode,
    ListenNode,
    PublishNode,
    InjectNode,
    AiToolNode,
    TriggerNode,
    DelayNode,
    SplitterNode,
    EmailNode,
    TelegramListenNode,
    TelegramSendNode,
    MlModelNode,
    AiAgentNode,
    TranscriptorNode,
    TranslatorNode,
    Text2SpeechNode,
    BatchNode,
    SwitchNode,
    DeadbandNode,
    WindowNode,
    JoinNode,
    WatchdogNode,
    AlarmNode,
    MachineStateNode,
    RainflowNode,
    VibrationNode,
    AnomalyNode,
    PoseEstimationNode,
    TotalizerNode,
    OeeNode,
    DegradationNode,
    ApprovalNode,
    IoTDbNode,
    S3StorageNode,
    AssetStateNode,
    CommentNode,
} from "./Nodes";
import NodePalette from "./NodePalette";
import FlowScrollbars, { topLeftViewport } from "./FlowScrollbars";
import NodePropertiesPanel from "./NodePropertiesPanel";
import { usePipelineLayout } from "./usePipelineLayout";
import { createNodesAndEdges } from "../Utils/customHooks";
import { toast } from "react-toastify";
import { usePipelineEditing } from "./usePipelineEditing";
import { uniqueToolName } from "./aiTool";

export const processInitialPipelineData = (digitalTwinSelected, natsClient, natsSubjectsData) => {
    if (!digitalTwinSelected.pipelineFileData || digitalTwinSelected.pipelineFileData === "") {
        return { nodes: [], edges: [] };
    }

    try {
        const pipelineNodes = JSON.parse(digitalTwinSelected.pipelineFileData);

        if (pipelineNodes.length === 0) {
            return { nodes: [], edges: [] };
        }

        const existingNodes = []; // No existent nodes on initial load
        const existingEdges = []; // No existent edges on initial load
        return createNodesAndEdges(existingNodes, existingEdges, pipelineNodes, natsClient, natsSubjectsData);
    } catch (error) {
        toast.error(`Error processing pipeline data: ${error.message}`);
        return { nodes: [], edges: [] };
    }
};

// Removed the panelOpen prop from the styled component
const ReactFlowWrapper = styled.div`
    flex: 1;
    min-width: 0;
    position: relative;
    /* debajo de la barra del visor */
    margin-top: var(--viewer-bar-offset, 0px);
    color: #222;
    background-color: #212121;
    /* Removed margin-left and transition - now canvas stays fixed */

    /* Al seleccionar varios nodos (Shift + arrastrar, Ctrl + clic) no se debe seleccionar el texto de las etiquetas */
    user-select: none;
    -webkit-user-select: none;

    & input,
    & textarea,
    & [contenteditable="true"] {
        user-select: text;
        -webkit-user-select: text;
    }

    &.placing .react-flow__pane,
    &.placing .react-flow__node {
        cursor: copy;
    }

    .react-flow__attribution a {
        text-decoration: none;
        color: black;
    }
`;

const PlacementHint = styled.div`
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    padding: 6px 12px;
    border-radius: 6px;
    background-color: rgba(50, 116, 217, 0.9);
    color: white;
    font-size: 13px;
    pointer-events: none;
    white-space: nowrap;
`;

const clearTextSelection = () => {
    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
};

export default function Flow({
    natsClient,
    natsConnectionStatus,
    natsSubjectsData,
    assetS3Folders,
    digitalTwinSelected,
    orgSelected,
    groupSelected,
    nodes,
    edges,
    setNodes,
    setEdges,
    handlePipelineUiChanged,
    importPipelineRef,
    focusNodeRef,
}) {
    const reactFlowWrapper = useRef(null);
    const rootRef = useRef(null);
    const { screenToFlowPosition, getNode, setCenter, getZoom, setViewport } = useReactFlow();
    const { paletteCollapsed, togglePalette, paletteWidth, barOffset } = usePipelineLayout(rootRef);

    // Lo que el usuario tenía en el editor al salir de él (pestaña 3D, otra capa): el desplazamiento y el
    // zoom del lienzo y el nodo abierto en el panel de propiedades (el panel recupera lo escrito sin aplicar)
    const dtUid = digitalTwinSelected?.digitalTwinUid ?? "";
    const [memory] = useState(() => getViewerMemory(dtUid));
    const [selectedNode, setSelectedNode] = useState(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    // El nodo abierto se vuelve a abrir cuando llegan los nodos: al montarse el visor otra vez (al volver
    // de otra capa) el pipeline se carga después del primer render y los nodos llegan vacíos.
    const pendingOpenNodeRef = useRef(memory.openNode?.nodeId ?? null);
    useEffect(() => {
        const nodeId = pendingOpenNodeRef.current;
        if (!nodeId || nodes.length === 0) return;
        pendingOpenNodeRef.current = null;
        const node = nodes.find((n) => n.id === nodeId);
        if (node && node.type !== "Comment") {
            setSelectedNode(node);
            setIsPanelOpen(true);
        } else {
            rememberViewer(dtUid, { openNode: null });
        }
    }, [dtUid, nodes]);
    useEffect(() => {
        if (!isPanelOpen && !pendingOpenNodeRef.current) rememberViewer(dtUid, { openNode: null });
    }, [dtUid, isPanelOpen]);
    // the first time the pipeline of a twin is opened (in this session): at zoom 1, its top left corner at the
    // top left of the canvas with a margin (the scrollbars reach the rest)
    const fittedRef = useRef(!!memory.flowViewport);
    useEffect(() => {
        if (fittedRef.current || nodes.length === 0) return;
        fittedRef.current = true;
        requestAnimationFrame(() => void setViewport(topLeftViewport(getNodesBounds(nodes))));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes.length, setViewport]);
    const onMoveEnd = useCallback(
        (_event, viewport) => {
            if (viewport) rememberViewer(dtUid, { flowViewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } });
        },
        [dtUid],
    );
    const [nodeCounters, setNodeCounters] = useState({});
    const mlModelsTable = useMlModelsInGroup(digitalTwinSelected.groupId);

    // Restricciones de la organización/grupo para nodos pegados o importados
    const validateNodes = useCallback(
        (newNodes) => {
            const types = new Set(newNodes.map((node) => node.type));
            if (types.has("AiAgent") && !orgSelected?.llmEnabled) return "AiAgent is not enabled for this organization.";
            if (types.has("AiAgent") && !groupSelected?.llmEnabled) return "AiAgent is not enabled for this group.";
            if ((types.has("TelegramListen") || types.has("TelegramSend")) && !orgSelected?.telegramEnabled) {
                return "Telegram integration is not enabled for this organization.";
            }
            return null;
        },
        [orgSelected, groupSelected],
    );

    const closePanelNow = useCallback(() => {
        setIsPanelOpen(false);
        setSelectedNode(null);
    }, []);

    const { takeSnapshot, resetHistory, importPipeline, isPlacing, wrapperHandlers } = usePipelineEditing({
        nodes,
        edges,
        setNodes,
        setEdges,
        wrapperRef: reactFlowWrapper,
        screenToFlowPosition,
        handlePipelineUiChanged,
        natsClient,
        natsSubjectsData,
        validateNodes,
        onHistoryChange: closePanelNow,
    });

    // "Show in flow" (pipeline logs): centres the canvas on a node and highlights it for a few seconds.
    // The highlight is a CSS rule on the node's wrapper ([data-id]), so the nodes themselves are not
    // changed and the pipeline is not marked as modified.
    const [focused, setFocused] = useState(null);
    const focusNode = useCallback(
        (uid, tone = "info") => {
            const node = getNode(uid);
            if (!node) return false;
            const width = node.measured?.width ?? node.width ?? 150;
            const height = node.measured?.height ?? node.height ?? 40;
            const position = node.positionAbsolute ?? node.internals?.positionAbsolute ?? node.position;
            setCenter(position.x + width / 2, position.y + height / 2, {
                zoom: Math.max(getZoom(), 1.2),
                duration: 450,
            });
            setFocused({ uid, tone, at: Date.now() });
            return true;
        },
        [getNode, setCenter, getZoom],
    );
    useEffect(() => {
        if (!focused) return;
        const timer = setTimeout(() => setFocused(null), 4000);
        return () => clearTimeout(timer);
    }, [focused]);
    useEffect(() => {
        if (!focusNodeRef) return;
        focusNodeRef.current = focusNode;
        return () => {
            if (focusNodeRef.current === focusNode) focusNodeRef.current = null;
        };
    }, [focusNodeRef, focusNode]);

    useEffect(() => {
        if (!importPipelineRef) return;
        importPipelineRef.current = importPipeline;
        return () => {
            if (importPipelineRef.current === importPipeline) importPipelineRef.current = null;
        };
    }, [importPipelineRef, importPipeline]);

    useEffect(() => {
        resetHistory();
    }, [digitalTwinSelected?.digitalTwinUid, resetHistory]);

    useEffect(() => {
        const newCounters = {
            Function: 0,
            Listen: 0,
            Publish: 0,
            Inject: 0,
            Trigger: 0,
            Email: 0,
            TelegramListen: 0,
            TelegramSend: 0,
            Delay: 0,
            Splitter: 0,
            AiAgent: 0,
            AiTool: 0,
            Transcriptor: 0,
            Translator: 0,
            Text2Speech: 0,
            MlModel: 0,
            Batch: 0,
            Switch: 0,
            Deadband: 0,
            Window: 0,
            Join: 0,
            Watchdog: 0,
            Alarm: 0,
            MachineState: 0,
            Rainflow: 0,
            Vibration: 0,
            Anomaly: 0,
            PoseEstimation: 0,
            Totalizer: 0,
            OEE: 0,
            Degradation: 0,
            Approval: 0,
            IoTDb: 0,
            S3Storage: 0,
            AssetState: 0,
            Comment: 0,
        };

        for (const node of nodes) {
            if (node.type in newCounters) {
                newCounters[node.type] += 1;
            }
        }

        setNodeCounters((prevCounters) => {
            const hasChanged = Object.keys(newCounters).some((key) => newCounters[key] !== prevCounters[key]);
            return hasChanged ? newCounters : prevCounters;
        });
    }, [nodes]);

    const onNodesChange = useCallback(
        (changes) => {
            changes.some((change) => {
                switch (change.type) {
                    case "position":
                        handlePipelineUiChanged(true);
                        return true;
                    case "dimensions":
                        const found = nodes.find((node) => node.id === change.id);
                        if (found) {
                            return false; // No need to update if dimensions change
                        } else {
                            handlePipelineUiChanged(true);
                            return true; // Update needed if node not found
                        }
                    default:
                        return false;
                }
            });

            setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [nodes],
    );

    const onEdgesChange = useCallback(
        (changes) => {
            changes.some((change) => {
                if (change.type === "remove") {
                    handlePipelineUiChanged(true);
                    return true;
                }
                return false;
            });
            setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const onConnect = useCallback(
        (params) => {
            takeSnapshot();
            handlePipelineUiChanged(true);
            setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const onNodeClick = useCallback((event, node) => {
        event.stopPropagation();
    }, []);

    const onNodeDoubleClick = useCallback((event, node) => {
        event.stopPropagation();
        if (node.type !== "Comment") {
            setSelectedNode(node);
            setIsPanelOpen(true);
        }
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
        setIsPanelOpen(false);
        setFocused(null);
    }, []);

    const onUpdateNode = useCallback(
        (nodeId, newData) => {
            takeSnapshot();
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
                }),
            );
        },
        [setNodes, takeSnapshot],
    );

    const onBeforeDelete = useCallback(async () => {
        takeSnapshot();
        return true;
    }, [takeSnapshot]);

    const onDragStartSnapshot = useCallback(() => {
        clearTextSelection();
        takeSnapshot();
    }, [takeSnapshot]);

    const onClosePanel = useCallback(() => {
        setIsPanelOpen(false);
        setTimeout(() => {
            setSelectedNode(null);
        }, 300);
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

            if (nodeType === "MlModel") {
                if (mlModelsTable.length === 0) {
                    toast.error("No ML Models available.");
                    return;
                } else {
                    if (settings && settings.mlModelId === 0) {
                        settings.mlModelId = parseInt(mlModelsTable[0].id);
                    }
                }
            } else if (nodeType === "AiAgent") {
                if (!orgSelected?.llmEnabled) {
                    toast.error("AiAgent is not enabled for this organization.");
                    return;
                }

                if (!groupSelected?.llmEnabled) {
                    toast.error("AiAgent is not enabled for this group.");
                    return;
                }
            } else if (nodeType === "TelegramListen" || nodeType === "TelegramSend") {
                if (!orgSelected?.telegramEnabled) {
                    toast.error("Telegram integration is not enabled for this organization.");
                    return;
                }
            }

            const nodeWidth = 190;
            const nodeHeight = 40;
            const position = screenToFlowPosition({
                x: event.clientX - nodeWidth / 2,
                y: event.clientY - nodeHeight / 2,
            });

            const nodeUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

            const nodeNumber = nodeCounters[nodeType] + 1;
            // an AI Tool gets a tool name that is free in the pipeline
            const toolSettings =
                nodeType === "AiTool"
                    ? {
                          ...settings,
                          toolName: uniqueToolName(
                              nodes.filter((n) => n.type === "AiTool").map((n) => n.data?.settings?.toolName),
                              nodeNumber,
                          ),
                      }
                    : settings;
            setNodeCounters((prevCounters) => ({
                ...prevCounters,
                [nodeType]: nodeNumber,
            }));

            const newNode = {
                id: nodeUid,
                type: nodeType,
                position,
                data: {
                    label: `${label} ${nodeNumber}`,
                    nodeUid,
                    numOutputs,
                    debug,
                    settings: toolSettings,
                },
            };

            // the nodes that talk to the pipeline from the editor (Inject, Approval and Alarm buttons)
            if (nodeType === "Inject" || nodeType === "Approval" || nodeType === "Alarm") {
                newNode.data.natsClient = natsClient;
                newNode.data.natsSubjectsData = natsSubjectsData;
            }

            takeSnapshot();
            setNodes((nds) => nds.concat(newNode));
            handlePipelineUiChanged(true);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [screenToFlowPosition, natsClient, natsSubjectsData, nodeCounters, takeSnapshot, nodes],
    );

    const nodeTypes = useMemo(
        () => ({
            Function: FunctionNode,
            Listen: ListenNode,
            Publish: PublishNode,
            Inject: InjectNode,
            Trigger: TriggerNode,
            Email: EmailNode,
            TelegramListen: TelegramListenNode,
            TelegramSend: TelegramSendNode,
            Delay: DelayNode,
            Splitter: SplitterNode,
            Comment: ({ data, id, selected }) => CommentNode(data, id, selected, onUpdateNode, handlePipelineUiChanged),
            MlModel: MlModelNode,
            AiAgent: AiAgentNode,
            AiTool: AiToolNode,
            Transcriptor: TranscriptorNode,
            Translator: TranslatorNode,
            Text2Speech: Text2SpeechNode,
            Batch: BatchNode,
            Switch: SwitchNode,
            Deadband: DeadbandNode,
            Window: WindowNode,
            Join: JoinNode,
            Watchdog: WatchdogNode,
            Alarm: AlarmNode,
            MachineState: MachineStateNode,
            Rainflow: RainflowNode,
            Vibration: VibrationNode,
            Anomaly: AnomalyNode,
            PoseEstimation: PoseEstimationNode,
            Totalizer: TotalizerNode,
            OEE: OeeNode,
            Degradation: DegradationNode,
            Approval: ApprovalNode,
            IoTDb: IoTDbNode,
            S3Storage: S3StorageNode,
            AssetState: AssetStateNode,
        }),

        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    return (
        <div
            ref={rootRef}
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                position: "relative",
                "--palette-width": `${paletteWidth}px`,
                "--viewer-bar-offset": `${barOffset}px`,
            }}
        >
            <NodePalette collapsed={paletteCollapsed} onToggle={togglePalette} />

            <NodePropertiesPanel
                isOpen={isPanelOpen}
                onClose={onClosePanel}
                selectedNode={selectedNode}
                onUpdateNode={onUpdateNode}
                digitalTwinSelected={digitalTwinSelected}
                groupSelected={groupSelected}
                handlePipelineUiChanged={handlePipelineUiChanged}
                natsSubjectsData={natsSubjectsData}
                assetS3Folders={assetS3Folders}
                pipelineNodes={nodes}
            />

            <ReactFlowWrapper ref={reactFlowWrapper} className={isPlacing ? "placing" : undefined} {...wrapperHandlers}>
                {focused && (
                    <style>{`.react-flow__node[data-id="${CSS.escape(focused.uid)}"] { border-radius: 8px; box-shadow: 0 0 0 3px ${
                        focused.tone === "error" ? "#ff6b6b" : "#3d82f0"
                    }, 0 0 24px ${focused.tone === "error" ? "rgba(255, 107, 107, 0.55)" : "rgba(61, 130, 240, 0.6)"}; transition: box-shadow 0.2s; }`}</style>
                )}
                {isPlacing && <PlacementHint>Click to place the nodes · Esc to cancel</PlacementHint>}
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
                    onBeforeDelete={onBeforeDelete}
                    onNodeDragStart={onDragStartSnapshot}
                    onSelectionDragStart={onDragStartSnapshot}
                    onSelectionStart={clearTextSelection}
                    nodeTypes={nodeTypes}
                    deleteKeyCode={["Backspace", "Delete"]}
                    multiSelectionKeyCode={["Control", "Meta"]}
                    selectionKeyCode="Shift"
                    // as Node-RED: a node is dragged with the mouse, the empty canvas draws a selection box,
                    // the wheel scrolls (Shift + wheel: sideways), Ctrl + wheel (or a pinch) zooms, the
                    // scrollbars move the view, and Space + drag or the middle button drag the whole canvas
                    panOnDrag={[1]}
                    panActivationKeyCode="Space"
                    selectionOnDrag={true}
                    selectionMode={SelectionMode.Partial}
                    panOnScroll={true}
                    panOnScrollMode={PanOnScrollMode.Free}
                    zoomOnScroll={false}
                    zoomOnPinch={true}
                    zoomOnDoubleClick={false}
                    defaultViewport={memory.flowViewport ?? { x: 0, y: 0, zoom: 1 }}
                    onMoveEnd={onMoveEnd}
                    minZoom={0.3}
                    maxZoom={4}
                    fitView={false}
                    snapToGrid={true}
                    snapGrid={[10, 10]}
                    nodesDraggable={true}
                    nodesConnectable={true}
                    elementsSelectable={true}
                >
                    {/* without the lock: locked, the nodes could not be dragged and dragging one moved everything */}
                    <Controls style={{ color: "black" }} showInteractive={false} position="bottom-left" />
                    <FlowScrollbars />
                    <Background variant="dots" gap={12} size={1} />
                </ReactFlow>
            </ReactFlowWrapper>
        </div>
    );
}
