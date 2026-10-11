// @ts-nocheck
import { SquareFunction, WifiHigh, ArrowBigRight, Mail, ClockFading, BrainCog, Layers, Zap } from "lucide-react";
import { Handle, Position } from "@xyflow/react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { useCallback, useState, useEffect } from "react";
import {
    TelegramIcon,
    AssetStateIcon,
    CommentIcon,
    IoTDBIcon,
    S3StorageIcon,
    SplitterIcon,
    IconContainer,
    TranscriptionIcon,
    TranslatorIcon,
    Text2SpeechIcon,
} from "./NodePalette";
import { headers, StringCodec } from "nats.ws";
const sc = StringCodec();

const NodeContainer = styled.div<{ bgColor: string; hoverColor?: string; selected?: boolean }>`
    padding: 2px 4px;
    border-radius: 1px;
    background-color: ${(props) => props.bgColor || "#c4a07dff"};
    border-radius: 5px;
    border: ${(props) => (props.selected ? "2px solid #3b82f6" : "2px solid #a09c98ff")};
    box-shadow: ${(props) =>
        props.selected
            ? "0 0 0 2px rgba(59, 130, 246, 0.3), 0 4px 6px -1px rgba(0, 0, 0, 0.1)"
            : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"};
    min-width: 80px;
    transform: ${(props) => (props.selected ? "scale(1.02)" : "scale(1)")};
    transition: all 0.2s ease;
    cursor: pointer;

    &:hover {
        background-color: ${(props) => props.hoverColor || "#8a9597"};
        transform: ${(props) => (props.selected ? "scale(1.02)" : "scale(1.01)")};
    }
`;

const NodeContent = styled.div<{ numOutputs?: number }>`
    padding: 0px 2px;
    display: flex;
    align-items: center;
    gap: 4px;
    height: ${(props) => `${(props.numOutputs || 1) * 5 + 15}px`};
`;

const NodeLabel = styled.div`
    flex: 1;
    font-size: 10px;
    font-family: Helvetica, Arial, sans-serif !important;
    color: #111827;
    padding-right: 4px;
`;

const InputWrapper = styled.div`
    position: relative;
    display: inline-grid;
    min-width: 48px;

    &::after {
        content: attr(data-value);
        visibility: hidden;
        white-space: pre;
        font-size: 10px;
        font-family: Helvetica, Arial, sans-serif;
        padding: 2px 4px;
        border: 1px solid transparent;
        box-sizing: border-box; /* ← igual que el input */
        grid-area: 1 / 1;
    }
`;

const InputLabel = styled.input<{ value: string; shiftHeld?: boolean; bgColor?: string; hoverColor?: string }>`
    grid-area: 1 / 1;
    width: 100%;
    padding: 2px 4px;
    font-size: 10px;
    font-family: Helvetica, Arial, sans-serif !important;
    font-style: ${(props) => (props.value === "Insert your comment here " ? "italic" : "normal")};
    color: #111827;
    outline: none;
    border: 1px solid #a09c98ff;
    border-radius: 3px;
    background-color: ${(props) => props.bgColor || "#9c9c9b"};
    box-sizing: border-box;
    cursor: ${(props) => (props.shiftHeld ? "pointer" : "text")};

    &:focus {
        outline: none;
    }

    &:hover {
        background-color: ${(props) => props.hoverColor || "#b4b4b3"};
    }
`;

export const StyledHandle = styled(Handle)`
    width: 6px !important;
    height: 6px !important;
    background-color: #d9d9d9 !important;
    border-color: #a09c98ff !important;
`;

const InjectNodeWrapper = styled.div`
    position: relative;
    display: flex;
    align-items: center;
`;

// Contenedor principal del nodo que envuelve tanto el botón como el contenido
const NodeInjectContainer = styled.div<{ selected?: boolean; numOutputs?: number }>`
    display: flex;
    align-items: center;
    height: ${(props) => `${(props.numOutputs || 1) * 5 + 23}px`};
    border-radius: 5px;
    border: ${(props) => (props.selected ? "2px solid #3b82f6" : "2px solid #a09c98ff")};
    box-shadow: ${(props) =>
        props.selected
            ? "0 0 0 2px rgba(59, 130, 246, 0.3), 0 4px 6px -1px rgba(0, 0, 0, 0.1)"
            : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"};
    transform: ${(props) => (props.selected ? "scale(1.02)" : "scale(1)")};
    transition: all 0.2s ease;
    cursor: pointer;
    position: relative;
    min-width: 90px;

    &:hover {
        transform: ${(props) => (props.selected ? "scale(1.02)" : "scale(1.01)")};
    }
`;

const NodeInjectContent = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
`;

const arrowBigRightCursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="%23000000" stroke="%23ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9h6V5l7 7-7 7v-4H6V9z"/></svg>') 10 10, pointer`;

const InjectButtonIntegrated = styled.div<{ numOutputs?: number }>`
    width: 28px;
    // height: 24px; /* 2px menos para compensar el border del contenedor */
    height: ${(props) => `${(props.numOutputs || 1) * 5 + 20}px`};
    border-radius: 3px 0 0 3px;
    background-color: #7993aaff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ${arrowBigRightCursor};
    font-size: 10px;
    color: #e7e3dfff;
    transition: all 0.1s ease;
    flex-shrink: 0;
    box-shadow: inset -1px 0 0 rgba(0, 0, 0, 0.2);

    &:hover {
        background-color: #95acc0ff;
    }

    &:active {
        background-color: #cfd8e0ff;
        box-shadow:
            inset -1px 0 0 rgba(0, 0, 0, 0.3),
            inset 0 1px 2px rgba(0, 0, 0, 0.2);
    }
`;

// Contenido del nodo (sin el botón)
const NodeContentContainer = styled.div<{ bgColor: string; hoverColor?: string; numOutputs?: number }>`
    display: flex;
    align-items: center;
    // height: 24px; /* 2px menos para compensar el border del contenedor */
    height: ${(props) => `${(props.numOutputs || 1) * 5 + 20}px`};
    padding: 2px 4px;
    background-color: ${(props) => props.bgColor || "#c4a07dff"};
    border-radius: 0 3px 3px 0;
    flex: 1;
    transition: background-color 0.2s ease;

    ${NodeInjectContainer}:hover & {
        background-color: ${(props) => props.hoverColor || "#8a9597"};
    }
`;

const getHandleStyle = (index, total) => {
    if (total === 1) {
        return { top: "50%", right: "-1px" }; // Centrado si solo hay uno
    }

    const spacing = 100 / (total + 1); // Porcentaje de espacio
    const top = spacing * (index + 1);
    return { top: `${top}%`, right: "-1px" }; // Ajuste para el handle izquierdo
};

export function FunctionNode({ data, selected }) {
    const numOutputs = data.numOutputs;
    return (
        <NodeContainer bgColor="#c4a07dff" hoverColor="#d4b08e" selected={selected}>
            <StyledHandle
                type="target"
                position={Position.Left}
                style={{ top: "50%", left: "-1px" }} // Centrar el input
            />

            <NodeContent numOutputs={numOutputs}>
                <IconContainer>
                    <SquareFunction size={20} color="#e7e3dfff" />
                </IconContainer>
                <NodeLabel>{data?.label || "Function Node"}</NodeLabel>
            </NodeContent>

            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function ListenNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;
    return (
        <NodeContainer bgColor="#aa97aaff" hoverColor="#b5a5b5" selected={selected}>
            <NodeContent numOutputs={numOutputs}>
                <IconContainer rotate="90deg" size="20px">
                    <WifiHigh size={20} color="#e7e3dfff" />
                </IconContainer>
                <NodeLabel>{data?.label || "Listen"}</NodeLabel>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function PublishNode({ data, selected }) {
    return (
        <NodeContainer bgColor="#aa97aaff" hoverColor="#b5a5b5" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent>
                <NodeLabel>{data?.label || "Publish"}</NodeLabel>
                <IconContainer rotate="90deg" size="20px">
                    <WifiHigh size={20} color="#e7e3dfff" />
                </IconContainer>
            </NodeContent>
        </NodeContainer>
    );
}

export function CommentNode(data, id, selected, onUpdateNode, handlePipelineUiChanged) {
    const [localLabel, setLocalLabel] = useState(data?.settings.comment || "Insert your comment here ");

    // Sincroniza si el valor externo cambia (ej: undo/redo)
    useEffect(() => {
        setLocalLabel(data?.settings.comment || "Insert your comment here ");
    }, [data?.settings.comment]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalLabel(e.target.value);
    };

    const handleBlur = () => {
        onUpdateNode(id, { ...data, settings: { ...data.settings, comment: localLabel } });
        handlePipelineUiChanged(true);
    };

    const [shiftHeld, setShiftHeld] = useState(false);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => e.key === "Shift" && setShiftHeld(true);
        const onKeyUp = (e: KeyboardEvent) => e.key === "Shift" && setShiftHeld(false);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
        };
    }, []);

    return (
        <NodeContainer bgColor="#9c9c9b" hoverColor="#b4b4b3" selected={selected}>
            <NodeContent>
                <IconContainer size="20px">
                    <CommentIcon size={20} color="#e7e3dfff" />
                </IconContainer>
                <InputWrapper data-value={localLabel}>
                    <InputLabel
                        value={localLabel}
                        shiftHeld={shiftHeld}
                        bgColor="#9c9c9b"
                        hoverColor="#b4b4b3"
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={shiftHeld ? "" : "nodrag"}
                    />
                </InputWrapper>
            </NodeContent>
        </NodeContainer>
    );
}

export function InjectNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;

    const handleButtonClick = useCallback(
        (e) => {
            e.stopPropagation();
            const natClient = data.natsClient;
            const natsSubjectsData = data.natsSubjectsData || [];
            if (natClient) {
                const topicRef = data.settings.injectRef;
                const natsSubject = natsSubjectsData.find(
                    (natSubject) => natSubject.topicRef === topicRef,
                )?.natsSubject;
                if (natsSubject) {
                    let messageToSend: string;
                    if (data.settings.injectionType === "JSON") {
                        messageToSend = data.settings.json;
                    } else {
                        messageToSend = JSON.stringify({
                            timestamp: Date.now(),
                        });
                    }
                    try {
                        const h = headers();
                        h.set("Content-Type", "application/json");
                        h.set("Json-Structure", "object");
                        natClient.publish(natsSubject, sc.encode(messageToSend), { headers: h });
                        toast.success(`Message sent to topicRef: ${topicRef} successfully`);
                    } catch (error) {
                        console.error("Error sending NATS message:", error);
                        toast.error(`Failed to send message to topicRef: ${topicRef}`);
                    }
                }
            }
            if (data?.onInject) {
                data.onInject(data);
            }
        },
        [data],
    );

    return (
        <InjectNodeWrapper>
            <NodeInjectContainer selected={selected} numOutputs={numOutputs}>
                <InjectButtonIntegrated onClick={handleButtonClick} title="Execute Inject" numOutputs={numOutputs}>
                    <ArrowBigRight size={20} color="#e7e3dfff" />
                </InjectButtonIntegrated>

                <NodeContentContainer bgColor="#a6bbcf" hoverColor="#b0c8d1" numOutputs={numOutputs}>
                    <NodeInjectContent>
                        <NodeLabel>{data?.label || "Inject"}</NodeLabel>
                    </NodeInjectContent>
                </NodeContentContainer>

                {numOutputs > 0 && (
                    <>
                        {Array.from({ length: numOutputs }, (_, index) => (
                            <StyledHandle
                                key={index}
                                type="source"
                                position={Position.Right}
                                id={`${data.nodeUid}-${index}`}
                                style={getHandleStyle(index, numOutputs)}
                            />
                        ))}
                    </>
                )}
            </NodeInjectContainer>
        </InjectNodeWrapper>
    );
}

export function DelayNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;
    return (
        <NodeContainer bgColor="#a8a152ff" hoverColor="#b8b062ff" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent numOutputs={numOutputs}>
                <IconContainer>
                    <ClockFading size={20} color="#e7e3dfff" />
                </IconContainer>
                <NodeLabel>{data?.label || "Delay Node"}</NodeLabel>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function SplitterNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;
    return (
        <NodeContainer bgColor="#a8a152ff" hoverColor="#b8b062ff" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent numOutputs={numOutputs}>
                <IconContainer>
                    <SplitterIcon size={20} color="#e7e3dfff" />
                </IconContainer>
                <NodeLabel>{data?.label || "Splitter Node"}</NodeLabel>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function MlModelNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;
    return (
        <NodeContainer bgColor="#bd5f25ff" hoverColor="#be7648ff" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent numOutputs={numOutputs}>
                <IconContainer>
                    <BrainCog size={20} color="#e7e3dfff" />
                </IconContainer>
                <NodeLabel>{data?.label || "AiAgent Node"}</NodeLabel>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function AiAgentNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;
    return (
        <NodeContainer bgColor="#B8B1FB" hoverColor="#cdc8fcff" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent numOutputs={numOutputs}>
                <IconContainer>
                    <BrainCog size={20} color="#e7e3dfff" />
                </IconContainer>
                <NodeLabel>{data?.label || "AiAgent Node"}</NodeLabel>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function TranscriptorNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;
    return (
        <NodeContainer bgColor="#B8B1FB" hoverColor="#cdc8fcff" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent numOutputs={numOutputs}>
                <IconContainer>
                    <TranscriptionIcon size={20} color="#e7e3dfff" bgColor="#B8B1FB" />
                </IconContainer>
                <NodeLabel>{data?.label || "Transcriptor Node"}</NodeLabel>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function TranslatorNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;
    return (
        <NodeContainer bgColor="#B8B1FB" hoverColor="#cdc8fcff" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent numOutputs={numOutputs}>
                <IconContainer>
                    <TranslatorIcon size="20px" color="#e7e3dfff" />
                </IconContainer>
                <NodeLabel>{data?.label || "Translator Node"}</NodeLabel>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function Text2SpeechNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;
    return (
        <NodeContainer bgColor="#B8B1FB" hoverColor="#cdc8fcff" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent numOutputs={numOutputs}>
                <IconContainer>
                    <Text2SpeechIcon size="20px" />
                </IconContainer>
                <NodeLabel>{data?.label || "Text2Speech Node"}</NodeLabel>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function TelegramListenNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 1;
    return (
        <NodeContainer bgColor="#4a90e2" hoverColor="#5da4f5ff" selected={selected}>
            <NodeContent>
                {/* <TelegramNodeIcon size="20px" mode="listen" color="#e7e3df" /> */}
                <TelegramIcon size="20px" color="#e7e3df" style={{ transform: "rotate(90deg)" }} />
                <NodeLabel>{data?.label || "Telegram listen Node"}</NodeLabel>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function TelegramSendNode({ data, selected }) {
    return (
        <NodeContainer bgColor="#4a90e2" hoverColor="#5da4f5ff" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent>
                <NodeLabel>{data?.label || "Telegram send Node"}</NodeLabel>
                <TelegramIcon size="20px" color="#e7e3df" />
            </NodeContent>
        </NodeContainer>
    );
}

export function EmailNode({ data, selected }) {
    return (
        <NodeContainer bgColor="#4a90e2" hoverColor="#5da4f5ff" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent>
                <NodeLabel>{data?.label || "Email Node"}</NodeLabel>
                <IconContainer>
                    <Mail size={15} color="#e7e3dfff" />
                </IconContainer>
            </NodeContent>
        </NodeContainer>
    );
}

export function BatchNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;
    return (
        <NodeContainer bgColor="#b8ac2fff" hoverColor="#bbb24eff" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent numOutputs={numOutputs}>
                <IconContainer>
                    <Layers size={20} color="#e7e3dfff" />
                </IconContainer>
                <NodeLabel>{data?.label || "Batch Node"}</NodeLabel>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function TriggerNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 1;
    return (
        <NodeContainer bgColor="#a6bbcf" hoverColor="#b0c8d1" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent numOutputs={numOutputs}>
                <IconContainer>
                    <Zap size={20} color="#e7e3dfff" />
                </IconContainer>
                <NodeLabel>{data?.label || "Trigger Node"}</NodeLabel>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function IoTDbNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;
    return (
        <NodeContainer bgColor="#5B85A7" hoverColor="#77aedb" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent>
                <NodeLabel>{data?.label || "IoT DB"}</NodeLabel>
                <IconContainer>
                    <IoTDBIcon size={20} bgcolor="#5B85A7" />
                </IconContainer>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function S3StorageNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;
    return (
        <NodeContainer bgColor="#5B85A7" hoverColor="#77aedb" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent>
                <NodeLabel>{data?.label || "S3 Storage"}</NodeLabel>
                <IconContainer>
                    <S3StorageIcon size={20} />
                </IconContainer>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}

export function AssetStateNode({ data, selected }) {
    const numOutputs = data?.numOutputs ?? 0;
    return (
        <NodeContainer bgColor="#5B85A7" hoverColor="#77aedb" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent>
                <NodeLabel>{data?.label || "Asset State"}</NodeLabel>
                <IconContainer>
                    <AssetStateIcon size="20px" color="#e7e3df" />
                </IconContainer>
            </NodeContent>
            {numOutputs > 0 && (
                <>
                    {Array.from({ length: numOutputs }, (_, index) => (
                        <StyledHandle
                            key={index}
                            type="source"
                            position={Position.Right}
                            id={`${data.nodeUid}-${index}`}
                            style={getHandleStyle(index, numOutputs)}
                        />
                    ))}
                </>
            )}
        </NodeContainer>
    );
}
