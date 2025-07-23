// @ts-nocheck
import { SquareFunction, WifiHigh, ArrowBigRight, Mail, ClockFading } from "lucide-react";
import { FaTelegramPlane } from "react-icons/fa";
import { Handle, Position } from "@xyflow/react";
import styled from "styled-components";

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
    return (
        <NodeContainer bgColor="#a6bbcf" hoverColor="#b0c8d1" selected={selected}>
            <NodeContent>
                <IconContainer>
                    <ArrowBigRight size={20} color="#e7e3dfff" />
                </IconContainer>
                <NodeLabel>{data?.label || "Inject"}</NodeLabel>
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
