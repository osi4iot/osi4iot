// Pipeline logs panel, docked on the right of the pipeline view with the look of the assistant panel:
// one line per log (time, level, node, summary), identical consecutive logs grouped with a ×N counter,
// level/text/node filters, auto-scroll that pauses when the user scrolls up, and an expandable detail
// with the payload, the state or the message and a "Show in flow" button that finds the node.
import { FC, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { ArrowDown, Check, ChevronRight, Copy, Crosshair, List, Pause, Play, Search, Trash2, X } from "lucide-react";

import { focusRing, panelColors as c } from "../AssistantPanel/controls";
import {
    LevelFilter,
    LogGroup,
    MAX_PIPELINE_LOGS,
    countByLevel,
    filterLogs,
    groupLogs,
    levelOf,
    parseMessage,
    summaryOf,
    timeOf,
} from "./pipelineLogsModel";

export interface PipelineLog {
    level: string; // debug, error, warning, info
    component: string;
    name: string;
    uid: string;
    message: string;
    description?: string;
    outputIndex?: number;
    payload: Record<string, any>;
    state: Record<string, any>;
    date: string;
    // when the viewer received it (ms since epoch): the list shows the time with milliseconds
    receivedAt?: number;
}

export const PIPELINE_LOGS_WIDTH = 460;
export const PIPELINE_LOGS_MIN_WIDTH = 380;
const GAP = 12;
const MONO = "'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace";

export const clampLogsWidth = (width: number) =>
    Math.round(Math.max(PIPELINE_LOGS_MIN_WIDTH, Math.min(width, Math.max(PIPELINE_LOGS_MIN_WIDTH, window.innerWidth - 120))));

const LEVEL_STYLE = {
    error: { label: "ERR", fg: "#ff8a8a", bg: "rgba(255, 107, 107, 0.16)", dot: "#ff6b6b" },
    warning: { label: "WRN", fg: "#ffd27a", bg: "rgba(245, 184, 61, 0.16)", dot: "#f5b83d" },
    info: { label: "INF", fg: "#8fb8ff", bg: "rgba(110, 168, 255, 0.16)", dot: "#6ea8ff" },
    debug: { label: "DBG", fg: "#a3acb7", bg: "rgba(139, 149, 161, 0.16)", dot: "#8b95a1" },
} as const;

// ---------------------------------------------------------------- styles

const Panel = styled.aside`
    position: absolute;
    top: ${GAP}px;
    right: ${GAP}px;
    bottom: ${GAP}px;
    max-width: calc(100% - ${2 * GAP}px);
    display: flex;
    flex-direction: column;
    background-color: ${c.surface};
    backdrop-filter: blur(8px);
    border: 1px solid ${c.border};
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
    color: ${c.text};
    font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
    overflow: hidden;
    z-index: 1000;
`;

const ResizeEdge = styled.div<{ $active: boolean }>`
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
    z-index: 2;
    background: ${({ $active }) => ($active ? "rgba(61, 130, 240, 0.55)" : "transparent")};

    &:hover {
        background: rgba(61, 130, 240, 0.35);
    }
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    height: 48px;
    flex: none;
    padding: 0 8px 0 14px;
    border-bottom: 1px solid ${c.divider};

    h2 {
        margin: 0;
        font: 600 13px Roboto, "Helvetica Neue", Arial, sans-serif;
    }

    > svg {
        width: 16px;
        height: 16px;
        color: ${c.textSecondary};
    }
`;

const LiveState = styled.span<{ $live: boolean }>`
    display: flex;
    align-items: center;
    gap: 5px;
    margin-left: 4px;
    font: 500 11px Roboto, Arial, sans-serif;
    color: ${({ $live }) => ($live ? c.okText : c.textMuted)};

    &::before {
        content: "";
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: ${({ $live }) => ($live ? c.ok : c.textMuted)};
    }
`;

const IconButton = styled.button<{ $active?: boolean }>`
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: ${({ $active }) => ($active ? c.selected : "transparent")};
    color: ${({ $active }) => ($active ? "#ffffff" : c.textSecondary)};
    cursor: pointer;
    ${focusRing}

    &:hover {
        background: ${c.hover};
        color: #ffffff;
    }

    svg {
        width: 16px;
        height: 16px;
    }
`;

const Segmented = styled.div`
    display: flex;
    gap: 2px;
    margin: 10px 12px 0;
    padding: 3px;
    border-radius: 9px;
    background: ${c.field};
`;

const Segment = styled.button<{ $selected: boolean }>`
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 28px;
    border: 0;
    border-radius: 7px;
    background: ${({ $selected }) => ($selected ? c.selected : "transparent")};
    box-shadow: ${({ $selected }) => ($selected ? `inset 0 -2px 0 ${c.accent}` : "none")};
    color: ${({ $selected }) => ($selected ? "#ffffff" : c.textMuted)};
    font: 500 12px Roboto, Arial, sans-serif;
    white-space: nowrap;
    cursor: pointer;
    ${focusRing}

    &:hover {
        color: ${c.text};
    }

    .count {
        color: ${c.textMuted};
        font-weight: 400;
    }
`;

const Dot = styled.span<{ $color: string }>`
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ $color }) => $color};
    flex: none;
`;

const Toolbar = styled.div`
    display: flex;
    gap: 8px;
    margin: 8px 12px 6px;
`;

const SearchBox = styled.label`
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid ${c.border};
    background: ${c.field};

    &:focus-within {
        border-color: ${c.accent};
    }

    svg {
        width: 14px;
        height: 14px;
        color: ${c.textMuted};
        flex: none;
    }

    input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: none;
        background: transparent;
        color: ${c.text};
        font: 12px Roboto, Arial, sans-serif;
    }
`;

const NodeSelect = styled.select`
    max-width: 150px;
    height: 32px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid ${c.border};
    background: ${c.field};
    color: ${c.textSecondary};
    font: 12px Roboto, Arial, sans-serif;
    ${focusRing}
`;

const List_ = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 2px 0 6px;

    &::-webkit-scrollbar {
        width: 8px;
    }
    &::-webkit-scrollbar-track {
        background: transparent;
    }
    &::-webkit-scrollbar-thumb {
        background: ${c.track};
        border-radius: 4px;
    }
    &::-webkit-scrollbar-thumb:hover {
        background: #3a404a;
    }
`;

const Row = styled.button<{ $selected: boolean; $error: boolean }>`
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 12px;
    border: 0;
    background: ${({ $selected, $error }) =>
        $selected ? c.selected : $error ? "rgba(255, 107, 107, 0.06)" : "transparent"};
    box-shadow: ${({ $selected, $error }) =>
        $selected ? `inset 2px 0 0 ${c.accent}` : $error ? "inset 2px 0 0 #ff6b6b" : "none"};
    color: ${c.text};
    text-align: left;
    cursor: pointer;
    ${focusRing}

    &:hover {
        background: ${({ $selected }) => ($selected ? c.selected : c.hover)};
    }

    .time {
        flex: none;
        width: 82px;
        font: 400 11px ${MONO};
        color: ${c.textMuted};
    }

    .node {
        flex: none;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font: 500 12px Roboto, Arial, sans-serif;
    }

    .summary {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font: 400 11px ${MONO};
        color: ${({ $error }) => ($error ? "#ffb3b3" : c.textSecondary)};
    }

    .count {
        flex: none;
        padding: 0 6px;
        height: 16px;
        border-radius: 999px;
        background: ${c.field};
        color: ${c.textMuted};
        font: 500 10px/16px Roboto, Arial, sans-serif;
    }
`;

const LevelTag = styled.span<{ $fg: string; $bg: string }>`
    flex: none;
    width: 28px;
    height: 16px;
    border-radius: 4px;
    background: ${({ $bg }) => $bg};
    color: ${({ $fg }) => $fg};
    font: 700 9px/16px Roboto, Arial, sans-serif;
    letter-spacing: 0.04em;
    text-align: center;
`;

const Detail = styled.div`
    margin: 2px 8px 6px;
    border-radius: 10px;
    background: ${c.raised};
    border: 1px solid ${c.border};
    overflow: hidden;
`;

const Meta = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    padding: 8px 12px;
    border-bottom: 1px solid ${c.divider};
    font: 400 11px Roboto, Arial, sans-serif;
    color: ${c.textMuted};
    user-select: text;

    b {
        font-weight: 500;
        color: ${c.textSecondary};
    }
`;

const Code = styled.div`
    padding: 8px 12px;
    max-height: 320px;
    overflow: auto;
    font: 400 11.5px/1.55 ${MONO};
    color: ${c.textSecondary};
    user-select: text;

    &::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    &::-webkit-scrollbar-thumb {
        background: ${c.track};
        border-radius: 4px;
    }

    .text {
        white-space: pre-wrap;
        word-break: break-word;
    }

    .error {
        color: #ffb3b3;
    }

    .section {
        margin: 6px 0 2px;
        font: 600 10px Roboto, Arial, sans-serif;
        letter-spacing: 0.06em;
        color: ${c.textMuted};
    }
`;

const JsonLine = styled.div<{ $depth: number }>`
    padding-left: ${({ $depth }) => $depth * 14}px;
    white-space: nowrap;

    .key {
        color: ${c.textSecondary};
    }
    .punct {
        color: ${c.textMuted};
    }
    .num {
        color: #ffc233;
    }
    .str {
        color: #9be86a;
    }
    .bool {
        color: #6ea8ff;
    }
    .null {
        color: ${c.textMuted};
    }

    button {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
    }

    svg {
        width: 11px;
        height: 11px;
        color: ${c.textMuted};
    }
`;

const Actions = styled.div`
    display: flex;
    gap: 6px;
    padding: 6px 8px 8px;
`;

const SmallButton = styled.button<{ $accent?: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 9px;
    border-radius: 7px;
    border: 1px solid ${c.border};
    background: transparent;
    color: ${({ $accent }) => ($accent ? c.accentText : c.textSecondary)};
    font: 500 11px Roboto, Arial, sans-serif;
    cursor: pointer;
    ${focusRing}

    &:hover:not(:disabled) {
        background: ${c.hover};
        color: #ffffff;
    }

    &:disabled {
        opacity: 0.45;
        cursor: default;
    }

    svg {
        width: 13px;
        height: 13px;
    }
`;

const Empty = styled.p`
    margin: 24px 16px;
    text-align: center;
    font-size: 12px;
    color: ${c.textMuted};
`;

const Foot = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 40px;
    flex: none;
    padding: 0 10px 0 14px;
    border-top: 1px solid ${c.divider};
    font: 400 11px Roboto, Arial, sans-serif;
    color: ${c.textMuted};
`;

const NewLogsButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: 999px;
    background: ${c.accent};
    color: #ffffff;
    font: 500 11px Roboto, Arial, sans-serif;
    cursor: pointer;
    ${focusRing}

    svg {
        width: 13px;
        height: 13px;
    }
`;

// ---------------------------------------------------------------- JSON viewer

const JsonValue: FC<{ value: unknown }> = ({ value }) => {
    if (value === null || value === undefined) return <span className="null">{String(value)}</span>;
    if (typeof value === "number") return <span className="num">{String(value)}</span>;
    if (typeof value === "boolean") return <span className="bool">{String(value)}</span>;
    return <span className="str">{JSON.stringify(value)}</span>;
};

// Indented JSON with colours; objects and arrays below the second level start folded
const JsonTree: FC<{ value: unknown; name?: string; depth?: number; last?: boolean }> = ({
    value,
    name,
    depth = 0,
    last = true,
}) => {
    const isContainer = value !== null && typeof value === "object";
    const [open, setOpen] = useState(depth < 2);
    const key = name !== undefined ? (
        <>
            <span className="key">{name}</span>
            <span className="punct">: </span>
        </>
    ) : null;
    const comma = last ? null : <span className="punct">,</span>;
    if (!isContainer) {
        return (
            <JsonLine $depth={depth}>
                {key}
                <JsonValue value={value} />
                {comma}
            </JsonLine>
        );
    }
    const isArray = Array.isArray(value);
    const entries = isArray ? (value as unknown[]).map((v, i) => [String(i), v] as const) : Object.entries(value as object);
    const [openBrace, closeBrace] = isArray ? ["[", "]"] : ["{", "}"];
    if (!open || entries.length === 0) {
        return (
            <JsonLine $depth={depth}>
                {key}
                {entries.length === 0 ? (
                    <span className="punct">{openBrace + closeBrace}</span>
                ) : (
                    <button type="button" onClick={() => setOpen(true)} aria-expanded={false}>
                        <ChevronRight aria-hidden="true" />
                        <span className="punct">{`${openBrace} … ${entries.length} ${closeBrace}`}</span>
                    </button>
                )}
                {comma}
            </JsonLine>
        );
    }
    return (
        <>
            <JsonLine $depth={depth}>
                {key}
                {depth > 0 ? (
                    <button type="button" onClick={() => setOpen(false)} aria-expanded={true}>
                        <span className="punct">{openBrace}</span>
                    </button>
                ) : (
                    <span className="punct">{openBrace}</span>
                )}
            </JsonLine>
            {entries.map(([k, v], i) => (
                <JsonTree key={k} name={isArray ? undefined : k} value={v} depth={depth + 1} last={i === entries.length - 1} />
            ))}
            <JsonLine $depth={depth}>
                <span className="punct">{closeBrace}</span>
                {comma}
            </JsonLine>
        </>
    );
};

// Copies a text; answers whether it did. Without the clipboard API (a page served over plain http) it
// falls back to a hidden textarea and execCommand("copy").
export const copyText = async (text: string): Promise<boolean> => {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // denied or not available: try the old way
    }
    try {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand?.("copy") ?? false;
        area.remove();
        return ok;
    } catch {
        return false;
    }
};

// How long the copy button shows "Copied" with a check
export const COPIED_MS = 2000;

const CopiedButton = styled(SmallButton)<{ $copied: boolean }>`
    ${({ $copied }) =>
        $copied
            ? `
        color: #8fdc9f;
        border-color: rgba(86, 194, 113, 0.55);
        background: rgba(86, 194, 113, 0.12);
        &:hover:not(:disabled) { color: #8fdc9f; background: rgba(86, 194, 113, 0.18); }
    `
            : ""}
`;

// The copy button of a log: a check and "Copied" for COPIED_MS after a copy that worked
const CopyButton: FC<{ text: string; label: string }> = ({ text, label }) => {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );
    const onClick = async () => {
        const ok = await copyText(text);
        if (!ok) return;
        if (timer.current) clearTimeout(timer.current);
        setCopied(true);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    };
    return (
        <CopiedButton type="button" $copied={copied} aria-label={copied ? `${label}: copied` : label} onClick={onClick}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            <span aria-live="polite">{copied ? "Copied" : label}</span>
        </CopiedButton>
    );
};

// ---------------------------------------------------------------- one log

interface LogRowProps {
    group: LogGroup;
    expanded: boolean;
    onToggle: (key: string) => void;
    canShowInFlow: (uid: string) => boolean;
    onShowInFlow?: (uid: string, isError: boolean) => void;
}

const LogRow: FC<LogRowProps> = memo(({ group, expanded, onToggle, canShowInFlow, onShowInFlow }) => {
    const { log, count } = group;
    const level = levelOf(log);
    const style = LEVEL_STYLE[level];
    const isError = level === "error";
    const message = useMemo(() => (level === "debug" ? null : parseMessage(log.message)), [level, log.message]);
    const inFlow = !!log.uid && canShowInFlow(log.uid);

    const copyValue =
        level === "debug"
            ? JSON.stringify({ payload: log.payload ?? {}, state: log.state ?? {} }, null, 2)
            : typeof message === "string"
              ? message
              : JSON.stringify(message, null, 2);

    return (
        <div role="listitem">
            <Row
                type="button"
                $selected={expanded}
                $error={isError}
                aria-expanded={expanded}
                onClick={() => onToggle(group.key)}
            >
                <span className="time">{timeOf(log)}</span>
                <LevelTag $fg={style.fg} $bg={style.bg} title={level}>
                    {style.label}
                </LevelTag>
                <span className="node" title={log.name}>
                    {log.name}
                </span>
                <span className="summary">{summaryOf(log)}</span>
                {count > 1 && (
                    <span className="count" title={`Repeated ${count} times in a row`}>
                        ×{count}
                    </span>
                )}
            </Row>
            {expanded && (
                <Detail>
                    <Meta>
                        {log.component && (
                            <span>
                                Component <b>{log.component}</b>
                            </span>
                        )}
                        {log.uid && (
                            <span>
                                UID <b>{log.uid}</b>
                            </span>
                        )}
                        {level === "debug" && (
                            <span>
                                Output <b>{log.outputIndex ?? 0}</b>
                            </span>
                        )}
                        {log.description && (
                            <span>
                                Description <b>{log.description}</b>
                            </span>
                        )}
                        <span>
                            Date <b>{log.date}</b>
                        </span>
                    </Meta>
                    <Code>
                        {level === "debug" ? (
                            <>
                                <div className="section">PAYLOAD</div>
                                <JsonTree value={log.payload ?? {}} />
                                {log.state && Object.keys(log.state).length > 0 && (
                                    <>
                                        <div className="section">STATE</div>
                                        <JsonTree value={log.state} />
                                    </>
                                )}
                            </>
                        ) : typeof message === "string" ? (
                            <div className={isError ? "text error" : "text"}>{message || "—"}</div>
                        ) : (
                            <JsonTree value={message} />
                        )}
                    </Code>
                    <Actions>
                        {onShowInFlow && (
                            <SmallButton
                                type="button"
                                $accent
                                disabled={!inFlow}
                                title={inFlow ? "Center the flow on this node and highlight it" : "This node is not in the flow"}
                                onClick={() => onShowInFlow(log.uid, isError)}
                            >
                                <Crosshair aria-hidden="true" />
                                Show in flow
                            </SmallButton>
                        )}
                        <CopyButton
                            text={copyValue}
                            label={isError ? "Copy error" : level === "debug" ? "Copy JSON" : "Copy message"}
                        />
                    </Actions>
                </Detail>
            )}
        </div>
    );
});
LogRow.displayName = "LogRow";

// ---------------------------------------------------------------- panel

interface PipelineLogsProps {
    logMessages: PipelineLog[];
    setLogMessages: React.Dispatch<React.SetStateAction<PipelineLog[]>>;
    width?: number;
    onResizeWidth?: (width: number) => void;
    onClose?: () => void;
    // "Show in flow": whether the node is in the flow, and what to do to find it there
    canShowInFlow?: (uid: string) => boolean;
    onShowInFlow?: (uid: string, isError: boolean) => void;
}

const LEVELS: { id: LevelFilter; label: string; dot?: string }[] = [
    { id: "all", label: "All" },
    { id: "error", label: "Errors", dot: LEVEL_STYLE.error.dot },
    { id: "warning", label: "Warnings", dot: LEVEL_STYLE.warning.dot },
    { id: "info", label: "Info", dot: LEVEL_STYLE.info.dot },
    { id: "debug", label: "Debug", dot: LEVEL_STYLE.debug.dot },
];

const PipelineLogs: FC<PipelineLogsProps> = ({
    logMessages,
    setLogMessages,
    width = PIPELINE_LOGS_WIDTH,
    onResizeWidth,
    onClose,
    canShowInFlow = () => false,
    onShowInFlow,
}) => {
    const [level, setLevel] = useState<LevelFilter>("all");
    const [text, setText] = useState("");
    const [node, setNode] = useState("");
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    // Auto-scroll: follows the newest log unless the user scrolls up or presses pause
    const [following, setFollowing] = useState(true);
    const [newWhilePaused, setNewWhilePaused] = useState(0);
    const [resizing, setResizing] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const lastLogRef = useRef<PipelineLog | undefined>(logMessages[logMessages.length - 1]);

    const counts = useMemo(() => countByLevel(logMessages), [logMessages]);
    const nodeNames = useMemo(
        () => Array.from(new Set(logMessages.map((log) => log.name).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
        [logMessages],
    );
    const groups = useMemo(() => groupLogs(filterLogs(logMessages, { level, text, node })), [logMessages, level, text, node]);

    // New logs: scroll to the bottom when following; otherwise count them for the "N new logs" button
    useLayoutEffect(() => {
        const last = logMessages[logMessages.length - 1];
        if (last === lastLogRef.current) return;
        let added = 0;
        for (let i = logMessages.length - 1; i >= 0 && logMessages[i] !== lastLogRef.current; i--) added++;
        lastLogRef.current = last;
        if (following) {
            const list = listRef.current;
            if (list) list.scrollTop = list.scrollHeight;
        } else if (logMessages.length > 0) {
            setNewWhilePaused((n) => n + added);
        }
    }, [logMessages, following]);

    // Scrolled to the bottom on opening and when the filters change
    useLayoutEffect(() => {
        const list = listRef.current;
        if (list && following) list.scrollTop = list.scrollHeight;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [level, text, node]);

    const jumpToLatest = useCallback(() => {
        setFollowing(true);
        setNewWhilePaused(0);
        const list = listRef.current;
        if (list) list.scrollTop = list.scrollHeight;
    }, []);

    const onScroll = useCallback(() => {
        const list = listRef.current;
        if (!list) return;
        const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
        if (atBottom && !following) {
            setFollowing(true);
            setNewWhilePaused(0);
        } else if (!atBottom && following) {
            setFollowing(false);
        }
    }, [following]);

    const togglePause = () => (following ? setFollowing(false) : jumpToLatest());
    const onToggle = useCallback((key: string) => setExpandedKey((prev) => (prev === key ? null : key)), []);
    const clear = () => {
        setLogMessages([]);
        setExpandedKey(null);
        setNewWhilePaused(0);
        setFollowing(true);
    };

    const startResize = useCallback(
        (event: React.PointerEvent) => {
            if (!onResizeWidth) return;
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = width;
            setResizing(true);
            const onMove = (e: PointerEvent) => onResizeWidth(clampLogsWidth(startWidth + (startX - e.clientX)));
            const onUp = () => {
                setResizing(false);
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
            };
            document.body.style.cursor = "ew-resize";
            document.body.style.userSelect = "none";
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        },
        [onResizeWidth, width],
    );

    const filtered = level !== "all" || text.trim() !== "" || node !== "";

    return (
        <Panel aria-label="Pipeline logs" data-testid="pipeline-logs" style={{ width }}>
            {onResizeWidth && (
                <ResizeEdge
                    $active={resizing}
                    onPointerDown={startResize}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize the logs"
                    title="Drag to resize"
                />
            )}
            <Head>
                <List aria-hidden="true" />
                <h2>Pipeline logs</h2>
                <LiveState $live={following}>{following ? "Live" : "Paused"}</LiveState>
                <span style={{ flex: 1 }} />
                <IconButton
                    type="button"
                    $active={!following}
                    aria-label={following ? "Pause auto-scroll" : "Resume auto-scroll"}
                    title={following ? "Pause auto-scroll" : "Resume auto-scroll"}
                    onClick={togglePause}
                >
                    {following ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                </IconButton>
                <IconButton type="button" aria-label="Clear logs" title="Clear logs" onClick={clear}>
                    <Trash2 aria-hidden="true" />
                </IconButton>
                {onClose && (
                    <IconButton type="button" aria-label="Close logs" title="Close logs" onClick={onClose}>
                        <X aria-hidden="true" />
                    </IconButton>
                )}
            </Head>

            <Segmented role="tablist" aria-label="Log level">
                {LEVELS.map((l) => (
                    <Segment
                        key={l.id}
                        type="button"
                        role="tab"
                        aria-selected={level === l.id}
                        $selected={level === l.id}
                        onClick={() => setLevel(l.id)}
                    >
                        {l.dot && <Dot $color={l.dot} aria-hidden="true" />}
                        {l.label}
                        <span className="count">{counts[l.id]}</span>
                    </Segment>
                ))}
            </Segmented>

            <Toolbar>
                <SearchBox>
                    <Search aria-hidden="true" />
                    <input
                        type="search"
                        value={text}
                        placeholder="Filter by node or text…"
                        aria-label="Filter by node or text"
                        onChange={(e) => setText(e.target.value)}
                    />
                </SearchBox>
                <NodeSelect aria-label="Node" value={node} onChange={(e) => setNode(e.target.value)}>
                    <option value="">All nodes</option>
                    {nodeNames.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </NodeSelect>
            </Toolbar>

            <List_ ref={listRef} role="list" aria-label="Logs" onScroll={onScroll}>
                {groups.length === 0 ? (
                    <Empty>{filtered ? "No logs match the filters." : "No logs yet."}</Empty>
                ) : (
                    groups.map((group) => (
                        <LogRow
                            key={group.key}
                            group={group}
                            expanded={expandedKey === group.key}
                            onToggle={onToggle}
                            canShowInFlow={canShowInFlow}
                            onShowInFlow={onShowInFlow}
                        />
                    ))
                )}
            </List_>

            <Foot>
                <span>
                    {following
                        ? `${logMessages.length} logs · newest at the bottom · last ${MAX_PIPELINE_LOGS} kept`
                        : "Auto-scroll paused"}
                </span>
                {!following && newWhilePaused > 0 && (
                    <NewLogsButton type="button" onClick={jumpToLatest}>
                        <ArrowDown aria-hidden="true" />
                        {newWhilePaused} new {newWhilePaused === 1 ? "log" : "logs"}
                    </NewLogsButton>
                )}
                {!following && newWhilePaused === 0 && (
                    <NewLogsButton type="button" onClick={jumpToLatest}>
                        <ArrowDown aria-hidden="true" />
                        Latest
                    </NewLogsButton>
                )}
            </Foot>
        </Panel>
    );
};

export default PipelineLogs;
