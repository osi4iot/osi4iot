// @ts-nocheck
import { SquareFunction, WifiHigh, ArrowBigRight, Mail, ClockFading } from "lucide-react";
import { FaTelegramPlane } from "react-icons/fa";
import { Handle, Position } from "@xyflow/react";
import Paho from "paho-mqtt";
import styled from "styled-components";
import { toast } from "react-toastify";
import  { useCallback } from "react";

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

const NodeContent = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
`;

const IconContainer = styled.div<{ rotate?: string }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    rotate: ${(props) => props.rotate || "0deg"};
`;

const NodeLabel = styled.div`
    flex: 1;
    font-size: 10px;
    font-family: Helvetica, Arial, sans-serif !important;
    color: #111827;
    padding-right: 4px;
`;

export const StyledHandle = styled(Handle)`
    width: 6px !important;
    height: 6px !important;
    background-color: #d9d9d9 !important;
    border-color: #a09c98ff !important;
`;

const TelegramIcon = styled(FaTelegramPlane)`
    width: 15px;
    height: 15px;
    color: #e7e3dfff;
`;

const InjectNodeWrapper = styled.div`
    position: relative;
    display: flex;
    align-items: center;
`;

// Contenedor principal del nodo que envuelve tanto el botón como el contenido
const NodeInjectContainer = styled.div<{ selected?: boolean }>`
    display: flex;
    align-items: center;
    height: 28px;
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


const InjectButtonIntegrated = styled.div`
    width: 28px;
    height: 24px; /* 2px menos para compensar el border del contenedor */
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
        box-shadow: inset -1px 0 0 rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(0, 0, 0, 0.2);
    }
`;

// Contenido del nodo (sin el botón)
const NodeContentContainer = styled.div<{ bgColor: string; hoverColor?: string }>`
    display: flex;
    align-items: center;
    height: 24px; /* 2px menos para compensar el border del contenedor */
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

            <NodeContent>
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
    const numOutputs = data?.numOutputs || 0;
    return (
        <NodeContainer bgColor="#aa97aaff" hoverColor="#b5a5b5" selected={selected}>
            <NodeContent>
                <IconContainer rotate="90deg">
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
                <IconContainer rotate="90deg">
                    <WifiHigh size={20} color="#e7e3dfff" />
                </IconContainer>
            </NodeContent>
        </NodeContainer>
    );
}

export function InjectNode({ data, selected }) {
    const numOutputs = data?.numOutputs || 0;

    const handleButtonClick = useCallback(
        (e) => {
            e.stopPropagation();
            const mqttClient = data.mqttClient;
            const mqttTopics = data.mqttTopics || [];
            if (mqttClient && mqttClient.isConnected()) {
                const topicRef = data.settings.injectRef;
                const mqttTopic = mqttTopics.find((topic) => topic.topicRef === topicRef)?.mqttTopic;
                if (mqttTopic) {
                    const messageToSend = JSON.stringify({
                        timestamp: new Date().toJSON(),
                    });
                    try {
                        const message = new Paho.Message(messageToSend);
                        message.destinationName = mqttTopic;
                        mqttClient.send(message);
                        toast.success(`Message sent to topicRef: ${topicRef} successfully`);
                    } catch (error) {
                        console.error("Error sending MQTT message:", error);
                        toast.error(`Failed to send message to topicRef: ${topicRef}`);
                    }
                }
            }
            if (data?.onInject) {
                data.onInject(data);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [data.mqttClient, data.mqttTopicsData]
    );

    return (
        <InjectNodeWrapper>
            <NodeInjectContainer selected={selected}>
                <InjectButtonIntegrated onClick={handleButtonClick} title="Execute Inject">
                    <ArrowBigRight size={20} color="#e7e3dfff" />
                </InjectButtonIntegrated>

                <NodeContentContainer bgColor="#a6bbcf" hoverColor="#b0c8d1">
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
    const numOutputs = data?.numOutputs || 0;
    return (
        <NodeContainer bgColor="#a8a152ff" hoverColor="#b8b062ff" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent>
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

export function TelegramNode({ data, selected }) {
    return (
        <NodeContainer bgColor="#4a90e2" hoverColor="#5da4f5ff" selected={selected}>
            <StyledHandle type="target" position={Position.Left} style={{ top: "50%", left: "-1px" }} />
            <NodeContent>
                <NodeLabel>{data?.label || "Telegram Node"}</NodeLabel>
                <IconContainer>
                    <TelegramIcon />
                </IconContainer>
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
