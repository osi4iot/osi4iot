// @ts-nocheck
import { SquareFunction, WifiHigh, ArrowBigRight, Mail, ClockFading } from "lucide-react";
import { FaTelegramPlane } from "react-icons/fa";
import styled from "styled-components";

const PaletteContainer = styled.div`
    width: 150px;
    background-color: #2a2a2a;
    border-right: 1px solid #444;
    padding: 16px;
    height: 100%;
    overflow-y: auto;
    border-bottom: 1px solid #444;
`;

const PaletteTitle = styled.h3`
    color: #e7e3df;
    font-size: 14px;
    margin-bottom: 16px;
    font-family: Helvetica, Arial, sans-serif;
`;

const NodeItem = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    margin-bottom: 10px;
    background-color: ${(props) => props.bgColor || "#c4a07d"};
    border: 1px solid #a09c98;
    border-radius: 5px;
    cursor: grab;
    transition: transform 0.2s;

    &:hover {
        transform: translateX(4px);
    }

    &:active {
        cursor: grabbing;
    }
`;

const IconContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    rotate: ${(props) => props.rotate || "0deg"};
`;

const NodeLabel = styled.span`
    font-size: 14px;
    font-family: Helvetica, Arial, sans-serif;
    color: #111827;
    font-weight: 500;
    flex: 1;
`;

const TelegramIcon = styled(FaTelegramPlane)`
    width: 25px;
    height: 25px;
    color: #e7e3df;
`;

const nodeTypes = [
    {
        type: "Listen",
        label: "Listen",
        bgColor: "#aa97aa",
        hoverColor: "#b5a5b5",
        icon: <WifiHigh size={30} color="#e7e3df" style={{ transform: "rotate(90deg)" }} />,
        numOutputs: 1,
        debug: "off",
        settings: {
            listenTo: "Topic reference",
            topic: "dev2pdb_1",
        },
    },
    {
        type: "Publish",
        label: "Publish",
        bgColor: "#aa97aa",
        hoverColor: "#b5a5b5",
        icon: <WifiHigh size={30} color="#e7e3df" style={{ transform: "rotate(90deg)" }} />,
        numOutputs: 0,
        debug: "off",
        settings: {
            debug: "off",
            publishTo: "Topic reference",
            topic: "dtm2sim",
        },
    },
    {
        type: "Inject",
        label: "Inject",
        bgColor: "#a6bbcf",
        hoverColor: "#b0c8d1",
        icon: <ArrowBigRight size={30} color="#e7e3df" />,
        numOutputs: 1,
        debug: "off",
        settings: {
            injectRef: "inject_1",
            repeat: "none",
            every: 0.0,
        },
    },
    {
        type: "Function",
        label: "Function",
        bgColor: "#c4a07d",
        hoverColor: "#d4b08e",
        icon: <SquareFunction size={30} color="#e7e3df" />,
        numOutputs: 1,
        debug: "off",
        settings: {
            onMessageScript: "function process(msg) {\n    // Your code here\n    return msg;\n}",
            onStartScript: "function start() {\n    // Your code here\n}",
            onStopScript: "function init() {\n    // Your code here\n}",
        },
    },
    {
        type: "Delay",
        label: "Delay",
        bgColor: "#a8a152",
        hoverColor: "#b8b062ff",
        icon: <ClockFading size={30} color="#e7e3df" />,
        numOutputs: 1,
        debug: "off",
        settings: {
            duration: 0.0,
        },
    },
    {
        type: "Email",
        label: "Email",
        bgColor: "#4a90e2",
        hoverColor: "#5da4f5ff",
        icon: <Mail size={25} color="#e7e3df" />,
        numOutputs: 0,
        debug: "off",
        settings: {
            toOptions: "Group email notification channel",
            to: "myemail@example.com",
            messageOptions: "Message received options",
            subject: "Email Subject",
            body: "Email Body",
        },
    },
    {
        type: "Telegram",
        label: "Telegram",
        bgColor: "#4a90e2",
        hoverColor: "#5da4f5ff",
        icon: <TelegramIcon color="#e7e3df" />,
        numOutputs: 0,
        debug: "off",
        settings: {
            options: "Group notification options",
            chatId: "123456789",
            telegramBotToken: "your-telegram-bot-token",
            messageOptions: "Message received options",
            message: "Hello from OSI4IOT!",
        },
    },
];

export default function NodePalette() {
    const onDragStart = (event, nodeType, nodeUid, label, numOutputs, debug, settings) => {
        event.dataTransfer.setData(
            "application/reactflow",
            JSON.stringify({ nodeType, nodeUid, label, numOutputs, debug, settings })
        );
        event.dataTransfer.effectAllowed = "move";
    };

    return (
        <PaletteContainer>
            <PaletteTitle>Node Palette</PaletteTitle>
            {nodeTypes.map((node) => (
                <NodeItem
                    key={node.type}
                    bgColor={node.bgColor}
                    draggable
                    onDragStart={(event) =>
                        onDragStart(
                            event,
                            node.type,
                            node.nodeUid,
                            node.label,
                            node.numOutputs,
                            node.debug,
                            node.settings
                        )
                    }
                >
                    {(node.type === "Publish" || node.type === "Email" || node.type === "Telegram") ? (
                        <>
                            <NodeLabel>{node.label}</NodeLabel>
                            <IconContainer>{node.icon}</IconContainer>
                        </>
                    ) : (
                        <>
                            <IconContainer>{node.icon}</IconContainer>
                            <NodeLabel>{node.label}</NodeLabel>
                        </>
                    )}
                </NodeItem>
            ))}
        </PaletteContainer>
    );
}
