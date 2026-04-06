// @ts-nocheck
import {
    SquareFunction,
    WifiHigh,
    ArrowBigRight,
    Mail,
    ClockFading,
    BrainCog,
    BrainCircuit,
    Layers,
    Zap,
    Database,
} from "lucide-react";
import { FaTelegramPlane } from "react-icons/fa";
import { TbDatabaseCog } from "react-icons/tb";
import { FaRegCommentDots, FaMicrochip, FaGear } from "react-icons/fa6";
import { BsBucket } from "react-icons/bs";
import styled from "styled-components";

const PaletteContainer = styled.div`
    width: 190px;
    background-color: #2a2a2a;
    border-right: 1px solid #444;
    border-bottom: 1px solid #444;
    height: 100%;

    display: flex;
    flex-direction: column;
`;

const PaletteTitle = styled.h3`
    color: #e7e3df;
    font-size: 14px;
    margin: 0;
    padding: 12px 0;
    font-family: Helvetica, Arial, sans-serif;
    text-align: center;
    border-bottom: 1px solid #444;
    font-weight: 700;
    user-select: none;
`;

const NodesContainer = styled.div`
    overflow-y: auto;
    flex: 1;
    margin: 10px 0;
    padding: 5px 10px;

    ::-webkit-scrollbar {
        width: 10px;
    }
    ::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb {
        background: #3e474b;
        border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background-color: #515c61;
    }
`;

const NodeItem = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
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

export const IconContainer = styled.div<{ size?: string; rotate?: string }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: ${(props) => props.size || "30px"};
    height: ${(props) => props.size || "30px"};
    rotate: ${(props) => props.rotate || "0deg"};
`;

const NodeLabel = styled.span`
    font-size: 14px;
    font-family: Helvetica, Arial, sans-serif;
    color: #111827;
    font-weight: 500;
    flex: 1;
`;

export const TelegramIcon = styled(FaTelegramPlane)<{ size?: string }>`
    font-size: ${(props) => props.size || "26px"};
    color: #ffffff;
    filter: drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.2));
`;

export const AssetStateIcon = styled(TbDatabaseCog)<{ size?: string }>`
    font-size: 30px;
    color: #ffffff;
    filter: drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.2));
`;

export const CommentIcon = styled(FaRegCommentDots)<{ size?: string }>`
    font-size: ${(props) => props.size || "26px"};
    color: #ffffff;
    filter: drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.2));
`;

export const BsBucketIcon = styled(BsBucket)<{ size?: string }>`
    font-size: ${(props) => props.size || "26px"};
    color: #ffffff;
    filter: drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.2));
`;

const Wrapper = styled.div<{ size: number }>`
    position: relative;
    width: ${(props) => `${props.size}px`};
    height: ${(props) => `${props.size}px`};
    display: flex;
    align-items: center;
    justify-content: center;
`;

const OverlayIcon = styled.div<{ bgcolor?: string }>`
    position: absolute;
    bottom: -2px;
    right: -2px;
    background: ${(props) => props.bgcolor || "#ffffff"};
    border-radius: 50%;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
`;

export const IoTDBIcon: React.FC<Props> = ({ size = 30, bgcolor = "#5B85A7" }) => {
    return (
        <Wrapper size={size}>
            <Database size={size} strokeWidth={2} />
            <OverlayIcon size={size} bgcolor={bgcolor}>
                <FaMicrochip size={size * 0.4} />
            </OverlayIcon>
        </Wrapper>
    );
};

export const S3StorageIcon: React.FC<Props> = ({ size = 30, bgcolor = "#5B85A7" }) => {
    return (
        <Wrapper size={size}>
            <BsBucketIcon size={size} />
            <OverlayIcon size={size} bgcolor={bgcolor}>
                <FaMicrochip size={size * 0.4} />
            </OverlayIcon>
        </Wrapper>
    );
};

export const AssetStateStoreIcon: React.FC<Props> = ({ size = 30, bgcolor = "#5B85A7" }) => {
    return (
        <Wrapper size={size}>
            <Database size={size} strokeWidth={2} />
            <OverlayIcon size={size} bgcolor={bgcolor}>
                <FaGear size={size * 0.4} />
            </OverlayIcon>
        </Wrapper>
    );
};

export const NODE_FUNCTION_SCRIPTS = {
    onInitiation:
        "function init() {\n    const go = Go();\n    const { log, time } = go.All();\n\n    // Your code here\n}",
    onStart:
        "function start() {\n    const go = Go();\n    const { log, time } = go.All();\n\n    // Your code here\n}",
    onMessage:
        "function process(msg) {\n    const go = Go();\n    const { log, time } = go.All();\n\n    // Your code here\n    return msg;\n}",
} as const;

const nodeTypes = [
    {
        type: "Listen",
        label: "Nats listen",
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
        label: "Nats publish",
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
            injectionType: "Timestamp",
            json: "{}",
        },
    },
    {
        type: "Trigger",
        label: "Trigger",
        bgColor: "#a6bbcf",
        hoverColor: "#b0c8d1",
        icon: <Zap size={30} color="#e7e3df" />,
        numOutputs: 1,
        debug: "off",
        settings: {
            sendMode: "wait_for",
            firstMessageType: "JSON",
            firstMessagePayload: "{}",
            secondMessageType: "JSON",
            secondMessagePayload: "{}",
            delay: 1,
            resendInterval: 1,
            overrideDelay: false,
            extendDelay: false,
            resetTriggerOption: "msg.payload.reset",
            customPayloadFieldForReset: "",
            separateOutput: false,
            handleMessagesBy: "all",
            streamNameToHandle: "",
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
        settings: NODE_FUNCTION_SCRIPTS,
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
        type: "Comment",
        label: "Comment",
        bgColor: "#9c9c9b",
        hoverColor: "#b4b4b3",
        icon: <CommentIcon size={30} color="#e7e3df" />,
        numOutputs: 0,
        debug: "off",
        settings: {
            comment: "Insert your comment here ",
        },
    },
    {
        type: "MlModel",
        label: "ML Model",
        bgColor: "#bd5f25ff",
        hoverColor: "#be7648ff",
        icon: <BrainCircuit size={30} color="#e7e3df" />,
        numOutputs: 1,
        debug: "off",
        settings: {
            mlModelId: 0,
            batchSize: 1,
        },
    },
    {
        type: "AiAgent",
        label: "AI Agent",
        bgColor: "#B8B1FB",
        hoverColor: "#cdc8fcff",
        icon: <BrainCog size={30} color="#e7e3df" />,
        numOutputs: 1,
        debug: "off",
        settings: {
            systemPrompt: "",
            llmTemperature: 0.7,
            llmTopK: 40,
            llmTopP: 0.95,
        },
    },
    {
        type: "Email",
        label: "Email",
        bgColor: "#4a90e2",
        hoverColor: "#5da4f5ff",
        icon: <Mail size={30} color="#e7e3df" />,
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
        type: "TelegramListen",
        label: "Telegram listen",
        bgColor: "#4a90e2",
        hoverColor: "#5da4f5ff",
        icon: <TelegramIcon size="30px" color="#e7e3df" style={{ transform: "rotate(90deg)" }} />,
        numOutputs: 1,
        debug: "off",
        settings: {
            chatId: "123456789",
        },
    },
    {
        type: "TelegramSend",
        label: "Telegram send",
        bgColor: "#4a90e2",
        hoverColor: "#5da4f5ff",
        icon: <TelegramIcon size="30px" color="#e7e3df" />,
        numOutputs: 0,
        debug: "off",
        settings: {
            chatId: "123456789",
            messageOptions: "Custom message",
            messageToSend: "Hello from OSI4IOT!",
        },
    },
    {
        type: "Batch",
        label: "Batch",
        bgColor: "#b8ac2fff",
        hoverColor: "#bbb24eff",
        icon: <Layers size="30px" color="#e7e3df" />,
        numOutputs: 1,
        debug: "off",
        settings: {
            batchMode: "Group by number of messages",
            batchSize: 10,
            batchInterval: 10,
        },
    },
    {
        type: "IoTDb",
        label: "IoT DB",
        bgColor: "#5B85A7",
        hoverColor: "#77aedb",
        icon: <IoTDBIcon size={30} bgcolor="#5B85A7" />,
        numOutputs: 1,
        debug: "off",
        settings: {
            queryMode: "static_query",
            action: "Insert",
            insertTopicRef: "dev2pdb_1",
            sqlQuery:
                "SELECT * FROM iot_table \nWHERE topic = $__topicFun('dev2pdb_1') \nAND timestamp >= $__timeFun('now-25s') \nAND timestamp <= $__timeFun('now') \nORDER BY timestamp DESC;",
        },
    },
    {
        type: "S3Storage",
        label: "S3 Storage",
        bgColor: "#5B85A7",
        hoverColor: "#77aedb",
        icon: <S3StorageIcon size={30} bgcolor="#5B85A7" />,
        numOutputs: 1,
        debug: "off",
        settings: {
            queryMode: "static_query",
            action: "Insert",
            folderName: "telemetry",
            duckdbQuery:
                "SELECT * FROM s3_storage('telemetry') \nWHERE timestamp >= $__timeFun('now-10d/d') \nAND timestamp <= $__timeFun('now') \nORDER BY timestamp DESC;",
        },
    },
    {
        type: "AssetState",
        label: "Asset state",
        bgColor: "#5B85A7",
        hoverColor: "#77aedb",
        icon: <AssetStateStoreIcon size={30} bgcolor="#5B85A7" />,
        numOutputs: 1,
        debug: "off",
        settings: {
            storeType: "IoTDB",
            action: "Set or update state of current asset",
            setStateMode: "custom_state",
            customState: '{\n    "status": "OK"\n}',
        },
    },
];

export default function NodePalette() {
    const onDragStart = (event, nodeType, nodeUid, label, numOutputs, debug, settings) => {
        event.dataTransfer.setData(
            "application/reactflow",
            JSON.stringify({ nodeType, nodeUid, label, numOutputs, debug, settings }),
        );
        event.dataTransfer.effectAllowed = "move";
    };

    return (
        <PaletteContainer>
            <PaletteTitle>Node Palette</PaletteTitle>

            <NodesContainer>
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
                                node.settings,
                            )
                        }
                    >
                        {node.type === "Publish" ||
                        node.type === "Email" ||
                        node.type === "TelegramSend" ||
                        node.type === "IoTDb" ||
                        node.type === "S3Storage" ||
                        node.type === "AssetState" ? (
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
            </NodesContainer>
        </PaletteContainer>
    );
}
