import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { AlertCircle, Info, Bug, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import styled from "styled-components";
import React from "react";

export interface PipelineLog {
    level: string; // debug, error, info
    component: string;
    name: string;
    uid: string;
    message: string;
    description?: string;
    outputIndex?: number;
    payload: Record<string, any>;
    state: Record<string, any>;
    date: string;
}

// Styled Components
const Container = styled.div<{ width: number }>`
    position: fixed;
    top: 265px;
    right: 15px;
    width: ${(props: { width: any; }) => props.width}px;
    height: calc(100vh - 330px);
    background-color: #2c2c2c;
    border: 1px solid #444;
    border-radius: 8px;
    overflow: hidden;
    font-family: Arial, sans-serif;
    display: flex;
    flex-direction: row;
    user-select: none;
`;

const ResizeHandle = styled.div`
    width: 14px;
    min-width: 14px;
    cursor: ew-resize;
    border-radius: 8px 0 0 8px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover > span,
    &:active > span {
        background-color: #3B82F6;
    }
`;

const ResizeHandleBar = styled.span`
    display: block;
    width: 4px;
    height: 100px;
    border-radius: 9999px;
    background-color: #4B5563;
    transition: background-color 0.2s;
`;

const LogContainer = styled.div`
    padding: 5px 5px 5px 0px;
    background-color: #2c2c2c;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
`;

const Title = styled.h1`
    font-size: 20px;
    font-weight: bold;
    color: white;
    margin-left: 10px;
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
    opacity: ${(props: { visible: any; }) => (props.visible ? 1 : 0)};
    visibility: ${(props: { visible: any; }) => (props.visible ? "visible" : "hidden")};
    transition:
        opacity 0.2s,
        visibility 0.2s;
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

const FiltersContainer = styled.div`
    padding: 10px 5px;
    background-color: #1f2937;
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const FilterButtons = styled.div`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    margin-right: 18px;
`;

const FilterButton = styled.button<{ active: boolean }>`
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 14px;
    height: 25px;
    transition: all 0.2s;
    border: none;
    cursor: pointer;

    ${(props: { active: any; }) =>
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
    border: 1px solid ${(props: { borderColor: any; }) => props.borderColor};
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
    color: ${(props: { textColor: any; }) => props.textColor};
    display: flex;
    align-items: center;
    gap: 4px;
`;

const LogLevelBadge = styled.span<{ badgeColor: string }>`
    ${(props: { badgeColor: any; }) => props.badgeColor};
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

const OutputIndex = styled.div`
    margin-bottom: 4px;
    font-size: 12px;
    color: #d1d5db;
    text-align: left;

    .label {
        font-weight: normal;
    }
`;

const ComponentInfo = styled.div`
    margin-bottom: 4px;
    font-size: 12px;
    color: #d1d5db;
    text-align: left;

    .label {
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
    overflow: hidden;
    max-width: 100%;
    
    pre {
        white-space: pre-wrap;
        word-wrap: break-word;
        word-break: break-all;
        overflow-wrap: break-word;
        color: #d1d5db;
        margin: 0;
        text-align: left;
    }
`;

const NestedItem = styled.div<{ level: number }>`
    margin-left: ${(props: { level: number; }) => props.level * 16}px;
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

const StyledTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-top: 4px;

    th,
    td {
        padding: 6px 8px;
        text-align: left;
        border: 1px solid #374151;
        color: #d1d5db;
        word-break: break-word;
        max-width: 300px;
    }

    th {
        background-color: #1f2937;
        color: #f9fafb;
        font-weight: 600;
    }

    tr:nth-child(even) {
        background-color: rgba(31, 41, 55, 0.5);
    }

    tr:hover {
        background-color: #1f2937;
    }
`;

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
        [expandedKeys, parentPath, toggleExpanded],
    );

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
            {children as any}
            <Tooltip visible={showTooltip}>{tooltip}</Tooltip>
        </IconButton>
    );
};

const LogMessage = ({ message }: { message: string }) => {
    const parsedData = useMemo(() => {
        if (typeof message === 'string') {
            try {
                const parsed = JSON.parse(message);

                if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
                    return { type: 'array', data: parsed };
                }
                if (typeof parsed === 'object' && parsed !== null) {
                    return { type: 'object', data: parsed };
                }
                return { type: 'string', data: message };
            } catch {
                return { type: 'string', data: message };
            }
        }
        
        return { type: 'string', data: String(message ?? '') };
    }, [message]);

    if (parsedData.type === 'array') {
        const keys = Array.from(new Set(parsedData.data.flatMap((item: any) => Object.keys(item)))) as string[];
        
        return (
            <StyledTable>
                <thead>
                    <tr>
                        {keys.map((key) => (
                            <th key={key}>{key}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {parsedData.data.map((row: any, index: number) => (
                        <tr key={index}>
                            {keys.map((key) => (
                                <td key={key}>
                                    {typeof row[key] === 'object' 
                                        ? JSON.stringify(row[key]) 
                                        : String(row[key] ?? '')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </StyledTable>
        );
    }

    if (parsedData.type === 'object') {
        return <pre>{JSON.stringify(parsedData.data, null, 2)}</pre>;
    }

    return <pre>{parsedData.data}</pre>;
};

const LogEntry = React.memo(({ log }: { log: PipelineLog }) => {
    const [isExpanded, setIsExpanded] = useState(false);

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

            {log.level === "debug" && (
                <OutputIndex>
                    Output Index: <span className="label">{log.outputIndex}</span>
                </OutputIndex>
            )}

            {log.level === "error" && (
                <ComponentInfo>
                    Description: <span className="label">{log.description}</span>
                </ComponentInfo>
            )}

            {log.level === "info" &&
                (log.component === "node" ? (
                    <ComponentInfo>
                        Description: <span className="label">{log.description}</span>
                    </ComponentInfo>
                ) : (
                    <ComponentInfo>
                        Message: <span className="label">{log.message}</span>
                    </ComponentInfo>
                ))}

            {isExpanded && (
                <ExpandedContent>
                    {log.level === "debug" && (
                        <>
                            <UidInfo>Node UID: {log.uid}</UidInfo>

                            {Object.keys(log.payload).length > 0 && (
                                <div>
                                    <SectionTitle>Payload:</SectionTitle>
                                    <CodeBlock>
                                        <NestedObjectRenderer data={log.payload} />
                                    </CodeBlock>
                                </div>
                            )}

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
                                <CodeBlock>
                                    <LogMessage message={log.message} />
                                </CodeBlock>
                            </div>
                        </>
                    )}
                </ExpandedContent>
            )}
        </LogEntryContainer>
    );
});

LogEntry.displayName = "LogEntry";

const DEFAULT_WIDTH = 600;
const MIN_WIDTH = DEFAULT_WIDTH;

interface PipelineLogsProps {
    logMessages: PipelineLog[];
    setLogMessages: React.Dispatch<React.SetStateAction<PipelineLog[]>>;
}

const PipelineLogs: React.FC<PipelineLogsProps> = ({ logMessages, setLogMessages }) => {
    const [filterLevel, setFilterLevel] = useState<string>("all");
    const [width, setWidth] = useState<number>(DEFAULT_WIDTH);

    const isDragging = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(DEFAULT_WIDTH);

    const filteredLogs = useMemo(() => {
        return filterLevel === "all"
            ? logMessages
            : logMessages.filter((log) => log.level.toLowerCase() === filterLevel);
    }, [logMessages, filterLevel]);

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

    const handleClear = useCallback(() => {
        setLogMessages([]);
    }, [setLogMessages]);

    const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        startX.current = e.clientX;
        startWidth.current = width;

        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
    }, [width]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;

            // Dragging left edge: moving mouse left increases width, moving right decreases
            const delta = startX.current - e.clientX;
            const maxWidth = window.innerWidth - 280;
            const newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth.current + delta));
            setWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (!isDragging.current) return;
            isDragging.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, []);

    return (
        <Container width={width}>
            <ResizeHandle onMouseDown={handleResizeMouseDown} title="Drag to resize">
                <ResizeHandleBar />
            </ResizeHandle>
            <LogContainer>
                <FiltersContainer>
                    <Title>Logs</Title>
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
            </LogContainer>
        </Container>
    );
};

export default PipelineLogs;