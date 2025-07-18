import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
    AlertCircle,
    Info,
    Bug,
    ChevronDown,
    ChevronRight,
    Trash2,
    RotateCcw,
    RefreshCw,
    Download,
    CircleX,
    Upload,
    Play,
    Code,
    FileText,
    PencilOff,
} from "lucide-react";
import styled from "styled-components";
import YAML from "yaml";
import { AxiosError, AxiosResponse } from "axios";
import { toast } from "react-toastify";
import React from "react";
import YamlEditor from "@focus-reactive/react-yaml";
import { axiosAuth, getDomainName, getProtocol } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import { useAuthDispatch, useAuthState } from "../../../../contexts/authContext";
import { IDigitalTwin } from "../../TableColumns/digitalTwinsColumns";
import axiosErrorHandler from "../../../../tools/axiosErrorHandler";
import formatDateString from "../../../../tools/formatDate";
import { setReloadDigitalTwinsTable, usePlatformAssitantDispatch } from "../../../../contexts/platformAssistantContext";

export interface PipelineLog {
    level: string; // debug, error, info
    component: string; // node, pipeline, digitalTwin
    name: string;
    uid: string;
    message: string;
    description?: string; // Optional, used for error/info logs
    topicUid?: string; // Optional, used for topic reference
    topicRef?: string; // Optional, used for topic reference
    payload: Record<string, any>;
    state: Record<string, any>;
    date: string;
}

// Styled Components
const Container = styled.div<{ width: number }>`
    position: fixed;
    top: 272px;
    right: 15px;
    width: ${(props) => props.width}px;
    height: calc(100vh - 325px);
    background-color: #2c2c2c;
    border: 1px solid #444;
    border-radius: 8px;
    overflow: hidden;
    font-family: Arial, sans-serif;
    display: flex;
    flex-direction: column;
`;

const ResizeHandle = styled.div<{ isDragging: boolean }>`
    position: absolute;
    top: 0;
    left: 0;
    width: 8px;
    height: 100%;
    cursor: ew-resize;
    background: ${(props) => (props.isDragging ? "rgba(59, 130, 246, 0.3)" : "transparent")};
    border-right: ${(props) => (props.isDragging ? "2px solid #3b82f6" : "2px solid transparent")};
    transition: all 0.2s ease;
    z-index: 10;

    &:hover {
        background: rgba(59, 130, 246, 0.2);
        border-right: 2px solid #3b82f6;
    }

    &::after {
        content: "";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 3px;
        height: 40px;
        background: #6b7280;
        border-radius: 2px;
        opacity: ${(props) => (props.isDragging ? 1 : 0.6)};
        transition: opacity 0.2s ease;
    }

    &:hover::after {
        opacity: 1;
        background: #3b82f6;
    }
`;

const LogContainer = styled.div`
    padding: 5px 5px 5px 10px;
    background-color: #2c2c2c;
    display: flex;
    flex-direction: column;
    height: 100%;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 5px;
    background-color: #1c1a1a;
    padding: 5px 10px;
    border-radius: 10px;
`;

const Title = styled.h1`
    font-size: 20px;
    font-weight: bold;
    color: white;
    margin: 0;
`;

const TabContainer = styled.div`
    display: flex;
    background-color: #1c1a1a;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    overflow: hidden;
`;

const Tab = styled.button<{ active: boolean }>`
    flex: 1;
    padding: 10px 16px;
    background: none;
    border: none;
    color: ${(props) => (props.active ? "#3B82F6" : "#9CA3AF")};
    background-color: ${(props) => (props.active ? "#1f2937" : "#2C2C2C")};
    cursor: pointer;
    transition: all 0.2s;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    &:hover {
        background-color: #2f3b4d;
        color: white;
    }
`;

const ActionsContainer = styled.div`
    display: flex;
    gap: 2px;
    align-items: center;
    margin-right: 15px;
`;

const IconButton = styled.button`
    padding: 8px;
    background: none;
    border: none;
    border-radius: 4px;
    color: #d1d5db;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background-color: #374151;
        color: white;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const Tooltip = styled.div<{ visible: boolean }>`
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    background-color: #1f2937;
    color: white;
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    opacity: ${(props) => (props.visible ? 1 : 0)};
    visibility: ${(props) => (props.visible ? "visible" : "hidden")};
    transition: opacity 0.2s, visibility 0.2s;
    z-index: 1000;
    margin-top: 4px;
    border: 1px solid #374151;

    &::after {
        content: "";
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-bottom: 5px solid #1f2937;
    }
`;

const YamlEditorContainer = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #1f2937;
    border-radius: 8px;
    overflow: hidden;
    margin-top: -5px;
`;

const YamlEditorContent = styled.div`
    flex: 1;
    font-size: 14px;

    overflow-y: auto;
    ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
    }
    ::-webkit-scrollbar-track {
        background-color: #202226;
        border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb {
        background-color: #2c3235;
        border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }

    ::-webkit-scrollbar-corner {
        background-color: #202226;
    }

    .cm-scroller {
        overflow-x: auto;
        ::-webkit-scrollbar {
            width: 10px;
            height: 10px;
        }
        ::-webkit-scrollbar-track {
            background-color: #202226;
            border-radius: 5px;
        }
        ::-webkit-scrollbar-thumb {
            background-color: #2c3235;
            border-radius: 5px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background-color: #343840;
        }

        ::-webkit-scrollbar-corner {
            background-color: #202226;
        }
    }

    .cm-gutter {
        background-color: #263242;
    }

    .cm-gutter .cm-gutterElement {
        color: #6e7c8f;
    }

    .cm-activeLineGutter {
        background-color: #374151;
    }

    .ͼb {
        color: #569cd6;
    }

    .ͼm {
        color: #f3f4f6;
    }

    .ͼd {
        color: #ce9178;
    }

    .ͼc {
        color: #dbdacc;
    }

    .cm-editor .cm-cursor {
        border-left: 1px solid white !important;
    }

    .cm-editor .cm-content {
        caret-color: white !important;
    }

    .cm-focused .cm-selectionBackground,
    ::selection {
        background-color: #3b495c;
    }
`;

const FiltersContainer = styled.div`
    // margin-bottom: 10px;
    padding: 0 10px;
    background-color: #1f2937;
`;

const FilterButtons = styled.div`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
`;

const FilterButton = styled.button<{ active: boolean }>`
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 14px;
    height: 25px;
    transition: all 0.2s;
    border: none;
    cursor: pointer;

    ${(props) =>
        props.active
            ? `
    background-color: #3B82F6;
    color: white;
  `
            : `
    background-color: #4B5563;
    color: #D1D5DB;
    
    &:hover {
      background-color: #6B7280;
    }
  `}
`;

const LogEntryContainer = styled.div<{ borderColor: string }>`
    background-color: #1f2937;
    border: 1px solid ${(props) => props.borderColor};
    border-radius: 4px;
    padding: 5px;
    margin-bottom: 8px;
    transition: all 0.2s;
`;

const LogHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
`;

const LogHeaderLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 15px;
`;

const LogLevelContainer = styled.div<{ textColor: string }>`
    color: ${(props) => props.textColor};
    display: flex;
    align-items: center;
    gap: 4px;
`;

const LogLevelBadge = styled.span<{ badgeColor: string }>`
    ${(props) => props.badgeColor};
    padding: 2px 6px;
    border-radius: 2px;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
`;

const LogInfo = styled.div`
    font-size: 12px;
    color: #d1d5db;

    .node-name {
        font-weight: 500;
    }

    .separator {
        margin: 0 4px;
    }

    .date {
        margin: 0 4px;
    }
`;

const ExpandButton = styled.button`
    padding: 2px;
    background: none;
    border: none;
    border-radius: 2px;
    transition: background-color 0.2s;
    color: #d1d5db;
    cursor: pointer;

    &:hover {
        background-color: #374151;
    }
`;

const TopicInfo = styled.div`
    margin-bottom: 4px;
    font-size: 12px;
    color: #d1d5db;
    text-align: left;

    .topic-label {
        font-weight: normal;
    }
`;

const ComponentInfo = styled.div`
    margin-bottom: 4px;
    font-size: 12px;
    color: #d1d5db;
    text-align: left;

    .topic-label {
        font-weight: normal;
    }
`;

const ExpandedContent = styled.div`
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #4b5563;

    > div {
        margin-bottom: 8px;
    }
`;

const UidInfo = styled.div`
    font-size: 12px;
    color: #9ca3af;
`;

const SectionTitle = styled.div`
    font-size: 12px;
    font-weight: 500;
    color: #d1d5db;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;

    &:hover {
        color: #f3f4f6;
    }
`;

const CodeBlock = styled.div`
    background-color: #111827;
    padding: 8px;
    border-radius: 4px;
    font-size: 12px;
    text-align: left;

    pre {
        white-space: pre-wrap;
        overflow-x: auto;
        color: #d1d5db;
        margin: 0;
        text-align: left;
    }
`;

const NestedItem = styled.div<{ level: number }>`
    margin-left: ${(props) => props.level * 16}px;
    margin-bottom: 4px;
    padding: 2px 0;
`;

const NestedKey = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #93c5fd;
    cursor: pointer;

    &:hover {
        color: #bfdbfe;
    }
`;

const LogsList = styled.div`
    > div {
        margin-bottom: 4px;
    }
    background-color: #1f2937;

    flex: 1;
    padding: 5px 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow-y: auto;
    ::-webkit-scrollbar {
        width: 10px;
    }
    ::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb {
        background: #2c3235;
        border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }
`;

const EmptyState = styled.div`
    text-align: center;
    padding: 32px 0;
    color: #9ca3af;
`;

const HiddenFileInput = styled.input`
    display: none;
`;

const domainName = getDomainName();
const protocol = getProtocol();

// Componente para renderizar objetos anidados con expansión
const NestedObjectRenderer: React.FC<{
    data: any;
    level?: number;
    parentPath?: string;
}> = ({ data, level = 0, parentPath = "" }) => {
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

    const toggleExpanded = useCallback((path: string) => {
        setExpandedKeys((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        });
    }, []);

    const renderItem = useCallback(
        (value: any, key: string, currentLevel: number, keyIndex: number): React.ReactNode => {
            const currentPath = parentPath ? `${parentPath}.${key}` : key;
            const reactKey = `${currentPath}_${keyIndex}_${currentLevel}`;
            const isExpanded = expandedKeys.has(currentPath);

            // Valores null/undefined
            if (value === null || value === undefined) {
                return (
                    <NestedItem level={currentLevel} key={reactKey}>
                        <NestedKey>
                            <span style={{ color: "#fbbf24" }}>{key}:</span>
                            <span style={{ color: "#6b7280", marginLeft: "8px" }}>
                                {value === null ? "null" : "undefined"}
                            </span>
                        </NestedKey>
                    </NestedItem>
                );
            }

            // Arrays
            if (Array.isArray(value)) {
                if (value.length === 0) {
                    return (
                        <NestedItem level={currentLevel} key={reactKey}>
                            <NestedKey>
                                <span style={{ color: "#fbbf24" }}>{key}:</span>
                                <span style={{ color: "#6b7280", marginLeft: "8px" }}>[]</span>
                            </NestedKey>
                        </NestedItem>
                    );
                }

                return (
                    <NestedItem level={currentLevel} key={reactKey}>
                        <NestedKey onClick={() => toggleExpanded(currentPath)}>
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <span style={{ color: "#fbbf24" }}>{key}:</span>
                            <span style={{ color: "#6b7280", marginLeft: "8px" }}>
                                {isExpanded ? "[" : `[ ${value.length} items ]`}
                            </span>
                        </NestedKey>
                        {isExpanded && (
                            <div>
                                {value.map((item, arrayIndex) => {
                                    const arrayKey = `[${arrayIndex}]`;
                                    return renderItem(item, arrayKey, currentLevel + 1, arrayIndex);
                                })}
                                <NestedItem level={currentLevel + 1}>
                                    <span style={{ color: "#6b7280" }}>]</span>
                                </NestedItem>
                            </div>
                        )}
                    </NestedItem>
                );
            }

            // Objetos
            if (typeof value === "object") {
                const objectKeys = Object.keys(value);

                if (objectKeys.length === 0) {
                    return (
                        <NestedItem level={currentLevel} key={reactKey}>
                            <NestedKey>
                                <span style={{ color: "#fbbf24" }}>{key}:</span>
                                <span style={{ color: "#6b7280", marginLeft: "8px" }}>{"{}"}</span>
                            </NestedKey>
                        </NestedItem>
                    );
                }

                return (
                    <NestedItem level={currentLevel} key={reactKey}>
                        <NestedKey onClick={() => toggleExpanded(currentPath)}>
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <span style={{ color: "#fbbf24" }}>{key}:</span>
                            <span style={{ color: "#6b7280", marginLeft: "8px" }}>
                                {isExpanded ? "{" : `{ ${objectKeys.length} items }`}
                            </span>
                        </NestedKey>
                        {isExpanded && (
                            <div>
                                {objectKeys.map((objKey, objIndex) => {
                                    return renderItem(value[objKey], objKey, currentLevel + 1, objIndex);
                                })}
                                <NestedItem level={currentLevel + 1}>
                                    <span style={{ color: "#6b7280" }}>{"}"}</span>
                                </NestedItem>
                            </div>
                        )}
                    </NestedItem>
                );
            }

            // Valores primitivos (string, number, boolean)
            const getValueColor = (val: any) => {
                switch (typeof val) {
                    case "string":
                        return "#34d399";
                    case "number":
                        return "#60a5fa";
                    case "boolean":
                        return "#f472b6";
                    default:
                        return "#d1d5db";
                }
            };

            const formatValue = (val: any) => {
                if (typeof val === "string") {
                    return `"${val}"`;
                }
                return String(val);
            };

            return (
                <NestedItem level={currentLevel} key={reactKey}>
                    <NestedKey>
                        <span style={{ color: "#fbbf24" }}>{key}:</span>
                        <span style={{ color: getValueColor(value), marginLeft: "8px" }}>{formatValue(value)}</span>
                    </NestedKey>
                </NestedItem>
            );
        },
        [expandedKeys, parentPath, toggleExpanded]
    );

    // Validaciones iniciales
    if (data === null || data === undefined) {
        return <div style={{ color: "#6b7280" }}>null</div>;
    }

    if (typeof data !== "object") {
        return <div style={{ color: "#d1d5db" }}>{String(data)}</div>;
    }

    const rootKeys = Object.keys(data);
    if (rootKeys.length === 0) {
        return <div style={{ color: "#6b7280" }}>Empty object</div>;
    }

    return (
        <div>
            {rootKeys.map((key, index) => {
                return renderItem(data[key], key, level, index);
            })}
        </div>
    );
};

// Componente para el tooltip con hover
const TooltipWrapper: React.FC<{
    children: React.ReactNode;
    tooltip: string;
    onClick?: () => void;
    disabled?: boolean;
}> = ({ children, tooltip, onClick, disabled }) => {
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <IconButton
            onClick={onClick}
            disabled={disabled}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            {children}
            <Tooltip visible={showTooltip}>{tooltip}</Tooltip>
        </IconButton>
    );
};

// Componente para mostrar un log individual (optimizado con React.memo)
const LogEntry = React.memo(({ log }: { log: PipelineLog }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Memoizar configuración de colores para evitar recálculo
    const levelConfig = useMemo(() => {
        switch (log.level.toLowerCase()) {
            case "error":
                return {
                    borderColor: "#EF4444",
                    textColor: "#F87171",
                    icon: <AlertCircle className="w-4 h-4" />,
                    badgeColor: "background-color: #7F1D1D; color: #FECACA;",
                };
            case "debug":
                return {
                    borderColor: "#3B82F6",
                    textColor: "#60A5FA",
                    icon: <Bug className="w-4 h-4" />,
                    badgeColor: "background-color: #1E3A8A; color: #BFDBFE;",
                };
            case "info":
                return {
                    borderColor: "#10B981",
                    textColor: "#34D399",
                    icon: <Info className="w-4 h-4" />,
                    badgeColor: "background-color: #064E3B; color: #A7F3D0;",
                };
            default:
                return {
                    borderColor: "#6B7280",
                    textColor: "#9CA3AF",
                    icon: <Info className="w-4 h-4" />,
                    badgeColor: "background-color: #374151; color: #E5E7EB;",
                };
        }
    }, [log.level]);

    const toggleExpanded = useCallback(() => {
        setIsExpanded((prev) => !prev);
    }, []);

    return (
        <LogEntryContainer borderColor={levelConfig.borderColor}>
            <LogHeader>
                <LogHeaderLeft>
                    <LogLevelContainer textColor={levelConfig.textColor}>
                        {levelConfig.icon}
                        <LogLevelBadge badgeColor={levelConfig.badgeColor}>{log.level}</LogLevelBadge>
                    </LogLevelContainer>
                    <LogInfo>
                        <span className="node-name">{log.name}</span>
                        <span className="separator">·</span>
                        <span className="date">{log.date}</span>
                    </LogInfo>
                </LogHeaderLeft>
                <ExpandButton onClick={toggleExpanded}>
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </ExpandButton>
            </LogHeader>

            {/* Información básica del mensaje */}
            {log.level === "debug" && (
                <TopicInfo>
                    Topic: <span className="topic-label">{log.topicUid}</span>
                </TopicInfo>
            )}

            {log.level === "error" && (
                <ComponentInfo>
                    Description: <span className="topic-label">{log.description}</span>
                </ComponentInfo>
            )}

            {log.level === "info" && (
                <ComponentInfo>
                    Message: <span className="topic-label">{log.message}</span>
                </ComponentInfo>
            )}

            {isExpanded && (
                <ExpandedContent>
                    {log.level === "debug" && (
                        <>
                            <UidInfo>Node UID: {log.uid}</UidInfo>

                            {/* Payload con expansión anidada */}
                            {Object.keys(log.payload).length > 0 && (
                                <div>
                                    <SectionTitle>Payload:</SectionTitle>
                                    <CodeBlock>
                                        <NestedObjectRenderer data={log.payload} />
                                    </CodeBlock>
                                </div>
                            )}

                            {/* State con expansión anidada */}
                            {Object.keys(log.state).length > 0 && (
                                <div>
                                    <SectionTitle>State:</SectionTitle>
                                    <CodeBlock>
                                        <NestedObjectRenderer data={log.state} />
                                    </CodeBlock>
                                </div>
                            )}
                        </>
                    )}
                    {(log.level === "error" || log.level === "info") && (
                        <>
                            <UidInfo>
                                {log.component} UID: {log.uid}
                            </UidInfo>
                            <div>
                                <SectionTitle>Details:</SectionTitle>
                                <CodeBlock>{log.message}</CodeBlock>
                            </div>
                        </>
                    )}
                </ExpandedContent>
            )}
        </LogEntryContainer>
    );
});

LogEntry.displayName = "LogEntry";

interface PipelineManagerProps {
    logMessages: PipelineLog[];
    setLogMessages: React.Dispatch<React.SetStateAction<PipelineLog[]>>;
    digitalTwinSelected: IDigitalTwin;
}

const PipelineManager: React.FC<PipelineManagerProps> = ({ logMessages, setLogMessages, digitalTwinSelected }) => {
    const [width, setWidth] = useState(520);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, widthInicial: 0 });
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [filterLevel, setFilterLevel] = useState<string>("all");
    const [activeTab, setActiveTab] = useState<"logs" | "yaml">("logs");
    const [yamlContent, setYamlContent] = useState<any>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [lastUpdate, setLastUpdate] = useState(Date.now());

    useEffect(() => {
        if (digitalTwinSelected.pipelineFileData !== "") {
            const pipelineData = JSON.parse(digitalTwinSelected.pipelineFileData);
            if (Object.keys(pipelineData).length !== 0) {
                for (let inode = 0; inode < pipelineData.nodes.length; inode++) {
                    if (typeof pipelineData.nodes[inode].settings === "string") {
                        pipelineData.nodes[inode].settings = JSON.parse(pipelineData.nodes[inode].settings);
                    }
                }
                setYamlContent(pipelineData);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const config = useMemo(() => axiosAuth(accessToken), [accessToken]);

    // Memoizar logs filtrados
    const filteredLogs = useMemo(() => {
        return filterLevel === "all"
            ? logMessages
            : logMessages.filter((log) => log.level.toLowerCase() === filterLevel);
    }, [logMessages, filterLevel]);

    const startDrag = useCallback(
        (e: React.MouseEvent) => {
            setIsDragging(true);
            dragStartRef.current = {
                x: e.clientX,
                widthInicial: width,
            };

            document.body.style.userSelect = "none";
            document.body.style.cursor = "ew-resize";
        },
        [width]
    );

    const handleDrag = useCallback(
        (e: MouseEvent) => {
            if (!isDragging) return;

            const deltaX = dragStartRef.current.x - e.clientX;
            const newWidth = dragStartRef.current.widthInicial + deltaX;

            const widthMin = 520;
            const widthMax = 1000;

            if (newWidth >= widthMin && newWidth <= widthMax) {
                setWidth(newWidth);
            }
        },
        [isDragging]
    );

    const finishDrag = useCallback(() => {
        setIsDragging(false);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
    }, []);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener("mousemove", handleDrag);
            document.addEventListener("mouseup", finishDrag);

            return () => {
                document.removeEventListener("mousemove", handleDrag);
                document.removeEventListener("mouseup", finishDrag);
            };
        }
    }, [isDragging, handleDrag, finishDrag]);

    const logCounts = useMemo(() => {
        const counts = { all: logMessages.length, error: 0, info: 0, debug: 0 };
        logMessages.forEach((log) => {
            const level = log.level.toLowerCase();
            if (level === "error") counts.error++;
            else if (level === "info") counts.info++;
            else if (level === "debug") counts.debug++;
        });
        return counts;
    }, [logMessages]);

    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [filteredLogs]);

    // Optimizar funciones con useCallback
    const handleClear = useCallback(() => {
        setLogMessages([]);
    }, [setLogMessages]);

    const refreshDigitalTwins = useCallback(() => {
        const reloadDigitalTwinsTable = true;
        setReloadDigitalTwinsTable(plaformAssistantDispatch, { reloadDigitalTwinsTable });
    }, [plaformAssistantDispatch]);

    const handleRestart = useCallback(
        (reinitialize: boolean) => {
            const groupId = digitalTwinSelected.groupId;
            const digitalTwinId = digitalTwinSelected.id;
            const urlSetPipelineActionBase = `${protocol}://${domainName}/admin_api/digital_twin_pipeline_action`;
            const urlSetPipelineAction = `${urlSetPipelineActionBase}/${groupId}/${digitalTwinId}`;
            const pipelineAction = {
                action: "restart",
                reinitialize,
            };

            getAxiosInstance(refreshToken, authDispatch)
                .post(urlSetPipelineAction, pipelineAction, config)
                .then((response: AxiosResponse<any, any>) => {
                    setActiveTab("logs");
                    toast.success(response.data.message);
                })
                .catch((error: AxiosError) => {
                    axiosErrorHandler(error, authDispatch);
                });
        },
        [digitalTwinSelected.groupId, digitalTwinSelected.id, refreshToken, authDispatch, config]
    );

    const handleReinitiate = useCallback(() => handleRestart(true), [handleRestart]);
    const handleRestartOnly = useCallback(() => handleRestart(false), [handleRestart]);

    const handleDownloadYaml = useCallback(() => {
        const yamlContentString = YAML.stringify(yamlContent);
        const blob = new Blob([yamlContentString], { type: "text/yaml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pipeline_${digitalTwinSelected.digitalTwinUid}.yml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [yamlContent, digitalTwinSelected.digitalTwinUid]);

    const handleUploadClick = useCallback(() => {
        setActiveTab("yaml");
        fileInputRef.current?.click();
    }, []);

    const handleCancelChanges = useCallback(() => {
        if (digitalTwinSelected.pipelineFileData !== "") {
            const pipelineData = JSON.parse(digitalTwinSelected.pipelineFileData);
            if (Object.keys(pipelineData).length !== 0) {
                for (let inode = 0; inode < pipelineData.nodes.length; inode++) {
                    if (typeof pipelineData.nodes[inode].settings === "string") {
                        pipelineData.nodes[inode].settings = JSON.parse(pipelineData.nodes[inode].settings);
                    }
                }
                setYamlContent(pipelineData);
            } else {
                setYamlContent({});
            }
        } else {
            setYamlContent({});
        }
        setLastUpdate(Date.now());
    }, [digitalTwinSelected.pipelineFileData]);

    const handleStopPipeline = useCallback(() => {
        const groupId = digitalTwinSelected.groupId;
        const digitalTwinId = digitalTwinSelected.id;
        const urlSetPipelineActionBase = `${protocol}://${domainName}/admin_api/digital_twin_pipeline_action`;
        const urlSetPipelineAction = `${urlSetPipelineActionBase}/${groupId}/${digitalTwinId}`;
        const pipelineAction = {
            action: "stop",
            reinitialize: false,
        };

        getAxiosInstance(refreshToken, authDispatch)
            .post(urlSetPipelineAction, pipelineAction, config)
            .then((response: AxiosResponse<any, any>) => {
                setActiveTab("logs");
                toast.success(response.data.message);
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
            });
    }, [digitalTwinSelected.groupId, digitalTwinSelected.id, refreshToken, authDispatch, config]);

    const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target?.result as string;
                try {
                    const yamlData = YAML.parse(content);
                    setYamlContent(yamlData);
                    setLastUpdate(Date.now());
                    toast.success("YAML file loaded successfully");
                } catch (error) {
                    toast.error("Error parsing YAML file");
                    console.error("YAML parsing error:", error);
                }
            };
            reader.onerror = () => {
                toast.error("Error reading file");
            };
            reader.readAsText(file);
        }
        event.target.value = "";
    }, []);

    const handleDeployChanges = () => {
        if (yamlContent && Object.keys(yamlContent).length !== 0) {
            const groupId = digitalTwinSelected.groupId;
            const digitalTwinId = digitalTwinSelected.id;
            const url = `${protocol}://${domainName}/admin_api/digital_twin_pipeline_file_data/${groupId}/${digitalTwinId}`;
            const pipelineFileName = `pipeline_${digitalTwinSelected.digitalTwinUid}.yml`;
            const pipelineFileLastModifDate = formatDateString(new Date().toISOString());
            const pipelineFileData = JSON.stringify(yamlContent);
            const newDigitalTwinData = {
                pipelineFileName,
                pipelineFileLastModifDate,
                pipelineFileData,
            };

            getAxiosInstance(refreshToken, authDispatch)
                .patch(url, newDigitalTwinData, config)
                .then((response: AxiosResponse<any, any>) => {
                    if (response.data) {
                        toast.success(response.data.message);
                        const pipelineData = JSON.parse(JSON.stringify(yamlContent)) as any;
                        for (let inode = 0; inode < pipelineData.nodes.length; inode++) {
                            if (Object.keys(pipelineData.nodes[inode].settings).length !== 0) {
                                pipelineData.nodes[inode].settings = JSON.stringify(pipelineData.nodes[inode].settings);
                            }
                        }
                        const urlUploadPipelineBase = `${protocol}://${domainName}/admin_api/digital_twin_pipeline`;
                        const urlUploadPipeline = `${urlUploadPipelineBase}/${groupId}/${digitalTwinId}`;
                        if (digitalTwinSelected.pipelineFileData === "") {
                            getAxiosInstance(refreshToken, authDispatch)
                                .post(urlUploadPipeline, pipelineData, config)
                                .then((response: AxiosResponse<any, any>) => {
                                    digitalTwinSelected.pipelineFileData = pipelineFileData;
                                    digitalTwinSelected.pipelineFileName = pipelineFileName;
                                    digitalTwinSelected.pipelineFileLastModifDate = pipelineFileLastModifDate;
                                    setActiveTab("logs");
                                    toast.success(response.data.message);
                                })
                                .catch((error: AxiosError) => {
                                    axiosErrorHandler(error, authDispatch);
                                });
                        } else {
                            getAxiosInstance(refreshToken, authDispatch)
                                .patch(urlUploadPipeline, pipelineData, config)
                                .then((response: AxiosResponse<any, any>) => {
                                    digitalTwinSelected.pipelineFileData = pipelineFileData;
                                    digitalTwinSelected.pipelineFileName = pipelineFileName;
                                    digitalTwinSelected.pipelineFileLastModifDate = pipelineFileLastModifDate;
                                    setActiveTab("logs");
                                    toast.success(response.data.message);
                                })
                                .catch((error: AxiosError) => {
                                    axiosErrorHandler(error, authDispatch);
                                });
                        }
                    }
                })
                .catch((error: AxiosError) => {
                    axiosErrorHandler(error, authDispatch);
                })
                .finally(() => {
                    refreshDigitalTwins();
                });
        }
    };

    const handleYamlChange = useCallback(({ json, text }) => {
        setYamlContent(json);
    }, []);

    const renderLogsTab = () => (
        <>
            <FiltersContainer>
                <FilterButtons>
                    <FilterButton active={filterLevel === "all"} onClick={() => setFilterLevel("all")}>
                        All ({logCounts.all})
                    </FilterButton>
                    <FilterButton active={filterLevel === "error"} onClick={() => setFilterLevel("error")}>
                        Errors ({logCounts.error})
                    </FilterButton>
                    <FilterButton active={filterLevel === "info"} onClick={() => setFilterLevel("info")}>
                        Info ({logCounts.info})
                    </FilterButton>
                    <FilterButton active={filterLevel === "debug"} onClick={() => setFilterLevel("debug")}>
                        Debug ({logCounts.debug})
                    </FilterButton>
                    <TooltipWrapper tooltip="Clear all logs" onClick={handleClear}>
                        <Trash2 className="w-4 h-4" />
                    </TooltipWrapper>
                </FilterButtons>
            </FiltersContainer>

            <LogsList>
                {filteredLogs.length === 0 ? (
                    <EmptyState>There are no logs to display with the selected filter.</EmptyState>
                ) : (
                    filteredLogs.map((log, index) => <LogEntry key={`${log.uid}-${index}`} log={log} />)
                )}
                <div ref={logsEndRef} />
            </LogsList>
        </>
    );

    const renderYamlTab = () => (
        <YamlEditorContainer>
            <YamlEditorContent>
                <YamlEditor key={`editor-${lastUpdate}`} json={yamlContent} onChange={handleYamlChange} />
            </YamlEditorContent>
        </YamlEditorContainer>
    );

    return (
        <>
            <Container width={width}>
                <ResizeHandle isDragging={isDragging} onMouseDown={startDrag} />
                <LogContainer>
                    <Header>
                        <Title>Pipeline Manager</Title>
                        <ActionsContainer>
                            <TooltipWrapper tooltip="Download YAML" onClick={handleDownloadYaml}>
                                <Download className="w-4 h-4" />
                            </TooltipWrapper>
                            <TooltipWrapper tooltip="Upload YAML" onClick={handleUploadClick}>
                                <Upload className="w-4 h-4" />
                            </TooltipWrapper>
                            <TooltipWrapper tooltip="Cancel changes" onClick={handleCancelChanges}>
                                <PencilOff className="w-4 h-4" />
                            </TooltipWrapper>
                            <TooltipWrapper tooltip="Stop pipeline" onClick={handleStopPipeline}>
                                <CircleX className="w-4 h-4" />
                            </TooltipWrapper>
                            <TooltipWrapper tooltip="Reinitiate pipeline" onClick={handleReinitiate}>
                                <RotateCcw className="w-4 h-4" />
                            </TooltipWrapper>
                            <TooltipWrapper tooltip="Restart pipeline" onClick={handleRestartOnly}>
                                <RefreshCw className="w-4 h-4" />
                            </TooltipWrapper>
                            <TooltipWrapper tooltip="Deploy changes" onClick={handleDeployChanges}>
                                <Play className="w-4 h-4" />
                            </TooltipWrapper>
                        </ActionsContainer>
                    </Header>

                    <TabContainer>
                        <Tab active={activeTab === "logs"} onClick={() => setActiveTab("logs")}>
                            <FileText className="w-4 h-4" />
                            Logs
                        </Tab>
                        <Tab active={activeTab === "yaml"} onClick={() => setActiveTab("yaml")}>
                            <Code className="w-4 h-4" />
                            YAML Editor
                        </Tab>
                    </TabContainer>
                    {activeTab === "logs" ? renderLogsTab() : renderYamlTab()}
                </LogContainer>
            </Container>

            <HiddenFileInput ref={fileInputRef} type="file" accept=".yml,.yaml" onChange={handleFileUpload} />
        </>
    );
};

export default PipelineManager;
