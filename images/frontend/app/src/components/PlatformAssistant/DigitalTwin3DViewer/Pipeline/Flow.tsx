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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FunctionNode, ListenNode, PublishNode, InjectNode, DelayNode, EmailNode, TelegramNode } from "./Nodes";
import NodePalette from "./NodePalette";
import NodePropertiesPanel from "./NodePropertiesPanel";
import { createNodesAndEdges } from "../Utils/customHooks";
import { toast } from "react-toastify";

export const processInitialPipelineData = (digitalTwinSelected, mqttClient, mqttTopicsData) => {
    if (!digitalTwinSelected.pipelineFileData || digitalTwinSelected.pipelineFileData === "") {
        return { nodes: [], edges: [] };
    }

    try {
        const pipelineNodes = JSON.parse(digitalTwinSelected.pipelineFileData);

        if (pipelineNodes.length === 0) {
            return { nodes: [], edges: [] };
        }

        return createNodesAndEdges(pipelineNodes, mqttClient, mqttTopicsData);
    } catch (error) {
        toast.error(`Error processing pipeline data: ${error.message}`);
        return { nodes: [], edges: [] };
    }
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
    mqttTopicsData,
    digitalTwinSelected,
    nodes,
    edges,
    setNodes,
    setEdges,
    handlePipelineUiChanged,
}) {
    const reactFlowWrapper = useRef(null);
    const { screenToFlowPosition } = useReactFlow();

    const [selectedNode, setSelectedNode] = useState(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [nodeCounters, setNodeCounters] = useState({});

    useEffect(() => {
        const newCounters = {
            Function: 0,
            Listen: 0,
            Publish: 0,
            Inject: 0,
            Email: 0,
            Telegram: 0,
            Delay: 0,
        };

        let maxInject = 0;
        for (const node of nodes) {
            if (node.type in newCounters) {
                if (node.type === "Inject") {
                    const injectRef = node.data.settings.injectRef;
                    if (injectRef) {
                        const injectNumber = parseInt(injectRef.split("_")[1]);
                        maxInject = Math.max(maxInject, injectNumber);
                    }
                } else {
                    newCounters[node.type] += 1;
                }
            }
        }
        newCounters.Inject = maxInject;

        setNodeCounters((prevCounters) => {
            const hasChanged = Object.keys(newCounters).some((key) => newCounters[key] !== prevCounters[key]);
            return hasChanged ? newCounters : prevCounters;
        });
    }, [nodes]);

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
        []
    );

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
        [nodes]
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
        []
    );

    const onConnect = useCallback(
        (params) => {
            handlePipelineUiChanged(true);
            setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    const onNodeClick = useCallback((event, node) => {
        event.stopPropagation();
    }, []);

    const onNodeDoubleClick = useCallback((event, node) => {
        event.stopPropagation();
        setSelectedNode(node);
        setIsPanelOpen(true);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
        setIsPanelOpen(false);
    }, []);

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
            const nodeWidth = 190;
            const nodeHeight = 40;
            const position = screenToFlowPosition({
                x: event.clientX - nodeWidth / 2,
                y: event.clientY - nodeHeight / 2,
            });

            const nodeUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

            if (nodeType === "Inject" && nodeCounters[nodeType] === 5) {
                toast.error("You can only have 5 Inject nodes in the pipeline.");
                return;
            }

            const nodeNumber = nodeCounters[nodeType] + 1;
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
                    settings,
                },
            };

            if (nodeType === "Inject") {
                newNode.data.settings.injectRef = `inject_${nodeNumber}`;
                newNode.data.mqttClient = mqttClient;
                newNode.data.mqttTopics = mqttTopicsData;
            }

            setNodes((nds) => nds.concat(newNode));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [screenToFlowPosition, mqttClient, mqttTopicsData, nodeCounters]
    );

    return (
        <div style={{ width: "100%", height: "100%", display: "flex" }}>
            <NodePalette />

            <NodePropertiesPanel
                isOpen={isPanelOpen}
                onClose={onClosePanel}
                selectedNode={selectedNode}
                onUpdateNode={onUpdateNode}
                handlePipelineUiChanged={handlePipelineUiChanged}
                mqttTopicsData={mqttTopicsData}
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
