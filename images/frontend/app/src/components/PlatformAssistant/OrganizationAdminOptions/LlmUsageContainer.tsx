// "AI usage" section of the organization admin: what the organization's nodes consumed of its LLM
// provider (tokens, audio seconds, characters) in a month, by day and broken down by provider and model,
// node type, group, digital twin, node and user, plus the monthly token limit (a warning only).
import { FC, useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { AxiosError, AxiosResponse } from "axios";
import { toast } from "react-toastify";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { usePersistentState } from "../../../state";
import { IOrgManaged } from "../TableColumns/organizationsManagedColumns";
import { focusRing, panelColors as c } from "../DigitalTwin3DViewer/AssistantPanel/controls";

// ---------------------------------------------------------------- data

export interface UsageTotals {
    operations: number;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    reasoningTokens: number;
    audioSeconds: number;
    characters: number;
}

export interface LlmUsageSummary {
    from: string;
    to: string;
    totals: UsageTotals;
    byProviderModel: (UsageTotals & { providerType: string; providerHost: string; model: string })[];
    bySource: (UsageTotals & { source: string })[];
    byGroup: (UsageTotals & { groupId: number | null; groupName: string })[];
    byDigitalTwin: (UsageTotals & { digitalTwinUid: string; digitalTwinName: string; groupName: string })[];
    byNode: (UsageTotals & { nodeUid: string; nodeName: string; nodeType: string; digitalTwinUid: string })[];
    byUser: (UsageTotals & { userName: string })[];
    daily: (UsageTotals & { day: string })[];
    monthlyTokenLimit: number;
    warningPercent: number;
    monthTokens: number;
    // usage older than this has been deleted (retention policy of the metrics database)
    retentionDays?: number;
    // the monthly totals (trend) are kept this many years
    trendRetentionYears?: number;
}

export interface UsageTrendMonth extends UsageTotals {
    month: string; // YYYY-MM (UTC)
    byModel: (UsageTotals & { providerType: string; providerHost: string; model: string })[];
    bySource: (UsageTotals & { source: string })[];
}

export interface UsageTrend {
    months: UsageTrendMonth[];
    retentionYears: number;
}

// Every month from the first one with usage to the current one, with zeros where nothing was consumed
export const fillMonths = (months: UsageTrendMonth[], now = new Date()): UsageTrendMonth[] => {
    if (months.length === 0) return [];
    const byMonth = new Map(months.map((m) => [m.month, m]));
    const last = currentMonth(now);
    const out: UsageTrendMonth[] = [];
    for (let m = months[0].month; m <= last; m = shiftMonth(m, 1)) {
        out.push(
            byMonth.get(m) ?? {
                month: m,
                operations: 0,
                requests: 0,
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                reasoningTokens: 0,
                audioSeconds: 0,
                characters: 0,
                byModel: [],
                bySource: [],
            },
        );
    }
    return out;
};

const SOURCE_LABELS: Record<string, string> = {
    ai_agent: "AI Agent",
    translator: "Translator",
    transcriptor: "Transcriptor",
    text2speech: "Text2Speech",
    embeddings: "Embeddings",
};

const intFormat = new Intl.NumberFormat("en-US");
const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
export const formatInt = (n: number) => intFormat.format(Math.round(n || 0));
export const formatCompact = (n: number) => compactFormat.format(n || 0);
const tokensOf = (t: UsageTotals) => (t.inputTokens || 0) + (t.outputTokens || 0);

const pad = (n: number) => String(n).padStart(2, "0");
// "YYYY-MM" of the current month (UTC: the usage is stored by UTC day)
export const currentMonth = (now = new Date()) => `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
export const shiftMonth = (month: string, delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
export const monthRange = (month: string) => {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${month}-01`, to: `${month}-${pad(last)}`, days: last };
};
// Whether a month still has usage: its last day is within the retention
export const monthWithinRetention = (month: string, retentionDays: number, now = new Date()) => {
    const [y, m] = month.split("-").map(Number);
    const monthEnd = Date.UTC(y, m, 1);
    return now.getTime() - monthEnd < retentionDays * 24 * 3600 * 1000;
};
const monthLabel = (month: string) => {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

// Every day of the month, with zeros where nothing was consumed
export const fillDays = (month: string, daily: LlmUsageSummary["daily"]) => {
    const { days } = monthRange(month);
    const byDay = new Map(daily.map((d) => [d.day, d]));
    return Array.from({ length: days }, (_, i) => {
        const day = `${month}-${pad(i + 1)}`;
        return (
            byDay.get(day) ?? {
                day,
                operations: 0,
                requests: 0,
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                reasoningTokens: 0,
                audioSeconds: 0,
                characters: 0,
            }
        );
    });
};

// ---------------------------------------------------------------- styles

const Page = styled.div`
    width: 100%;
    max-width: 1200px;
    box-sizing: border-box;
    padding: 20px 24px 40px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: ${c.text};
    font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
`;

const Toolbar = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;

    h1 {
        margin: 0 auto 0 0;
        font: 600 18px Roboto, Arial, sans-serif;
    }
`;

const Select = styled.select`
    height: 34px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid ${c.border};
    background: ${c.field};
    color: ${c.text};
    font: 13px Roboto, Arial, sans-serif;
    ${focusRing}
`;

const MonthNav = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 9px;
    background: ${c.field};
    border: 1px solid ${c.border};

    span {
        min-width: 130px;
        text-align: center;
        font: 500 13px Roboto, Arial, sans-serif;
    }
`;

const IconButton = styled.button`
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: ${c.textSecondary};
    cursor: pointer;
    ${focusRing}

    &:hover:not(:disabled) {
        background: ${c.hover};
        color: #ffffff;
    }

    &:disabled {
        opacity: 0.35;
        cursor: default;
    }

    svg {
        width: 16px;
        height: 16px;
    }
`;

const Card = styled.section`
    padding: 16px;
    border-radius: 12px;
    background: ${c.surface};
    border: 1px solid ${c.border};

    h2 {
        margin: 0 0 12px;
        font: 600 13px Roboto, Arial, sans-serif;
        color: ${c.textSecondary};
    }
`;

const Tiles = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
`;

const Tile = styled.div`
    padding: 14px 16px;
    border-radius: 12px;
    background: ${c.surface};
    border: 1px solid ${c.border};

    .label {
        font: 500 12px Roboto, Arial, sans-serif;
        color: ${c.textMuted};
    }
    .value {
        margin-top: 6px;
        font: 600 24px Roboto, Arial, sans-serif;
        color: ${c.text};
        font-variant-numeric: tabular-nums;
    }
    .sub {
        margin-top: 4px;
        font: 400 12px Roboto, Arial, sans-serif;
        color: ${c.textSecondary};
        font-variant-numeric: tabular-nums;
    }
`;

const LimitRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 16px 24px;
`;

const Progress = styled.div`
    flex: 1 1 320px;
    min-width: 0;

    .text {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
        font: 400 13px Roboto, Arial, sans-serif;
        color: ${c.textSecondary};
        font-variant-numeric: tabular-nums;
    }

    .bar {
        position: relative;
        height: 10px;
        border-radius: 5px;
        background: ${c.track};
        overflow: hidden;
    }

    .fill {
        height: 100%;
        border-radius: 5px;
    }

    .marker {
        position: absolute;
        top: -2px;
        bottom: -2px;
        width: 2px;
        background: ${c.textSecondary};
    }
`;

const Field = styled.label`
    display: flex;
    flex-direction: column;
    gap: 6px;
    font: 500 12px Roboto, Arial, sans-serif;
    color: ${c.textMuted};

    input {
        width: 170px;
        height: 34px;
        box-sizing: border-box;
        padding: 0 10px;
        border-radius: 8px;
        border: 1px solid ${c.border};
        background: ${c.field};
        color: ${c.text};
        font: 13px Roboto, Arial, sans-serif;
        font-variant-numeric: tabular-nums;
        ${focusRing}
    }

    input.short {
        width: 90px;
    }
`;

const PrimaryButton = styled.button`
    height: 34px;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    background: ${c.accentStrong};
    color: #ffffff;
    font: 500 13px Roboto, Arial, sans-serif;
    cursor: pointer;
    ${focusRing}

    &:hover:not(:disabled) {
        background: ${c.accentHover};
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

const Note = styled.p`
    margin: 10px 0 0;
    font: 400 12px/1.5 Roboto, Arial, sans-serif;
    color: ${c.textMuted};
`;

const ChartBox = styled.div`
    position: relative;

    svg {
        display: block;
        width: 100%;
        height: auto;
        overflow: visible;
    }

    .tooltip {
        position: absolute;
        top: 0;
        transform: translateX(-50%);
        min-width: 170px;
        padding: 8px 10px;
        border-radius: 8px;
        background: ${c.surfaceSolid};
        border: 1px solid ${c.border};
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
        font: 400 12px/1.5 Roboto, Arial, sans-serif;
        color: ${c.textSecondary};
        pointer-events: none;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;

        b {
            color: ${c.text};
            font-weight: 600;
        }
    }
`;

const Tabs = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 3px;
    margin-bottom: 12px;
    border-radius: 9px;
    background: ${c.field};
    width: fit-content;
    max-width: 100%;
`;

const TabButton = styled.button<{ $selected: boolean }>`
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 7px;
    background: ${({ $selected }) => ($selected ? c.selected : "transparent")};
    box-shadow: ${({ $selected }) => ($selected ? `inset 0 -2px 0 ${c.accent}` : "none")};
    color: ${({ $selected }) => ($selected ? "#ffffff" : c.textMuted)};
    font: 500 12px Roboto, Arial, sans-serif;
    cursor: pointer;
    ${focusRing}

    &:hover {
        color: ${c.text};
    }
`;

const TableWrap = styled.div`
    overflow-x: auto;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font: 400 13px Roboto, Arial, sans-serif;
    font-variant-numeric: tabular-nums;

    th {
        padding: 8px 10px;
        text-align: right;
        font: 500 12px Roboto, Arial, sans-serif;
        color: ${c.textMuted};
        border-bottom: 1px solid ${c.divider};
        white-space: nowrap;
    }

    td {
        padding: 8px 10px;
        text-align: right;
        border-bottom: 1px solid ${c.divider};
        color: ${c.textSecondary};
        white-space: nowrap;
    }

    th:first-child,
    td:first-child {
        text-align: left;
    }

    td:first-child {
        color: ${c.text};
        white-space: normal;
        min-width: 180px;
    }

    .secondary {
        display: block;
        font-size: 11px;
        color: ${c.textMuted};
    }

    .share {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
    }

    .shareBar {
        width: 80px;
        height: 6px;
        border-radius: 3px;
        background: ${c.track};
        overflow: hidden;
    }

    .shareFill {
        height: 100%;
        border-radius: 3px;
        background: ${c.accent};
    }
`;

const Empty = styled.p`
    margin: 8px 0;
    font-size: 13px;
    color: ${c.textMuted};
`;

// ---------------------------------------------------------------- daily chart

const CHART_W = 1000;
const CHART_H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 48 };

export const niceMax = (value: number) => {
    if (value <= 0) return 1;
    const power = 10 ** Math.floor(Math.log10(value));
    for (const step of [1, 2, 2.5, 5, 10]) {
        if (step * power >= value) return step * power;
    }
    return 10 * power;
};

const DailyChart: FC<{ month: string; daily: LlmUsageSummary["daily"] }> = ({ month, daily }) => {
    const days = useMemo(() => fillDays(month, daily), [month, daily]);
    const [hover, setHover] = useState<number | null>(null);
    const max = niceMax(Math.max(...days.map(tokensOf), 0));
    const plotW = CHART_W - PAD.left - PAD.right;
    const plotH = CHART_H - PAD.top - PAD.bottom;
    const slot = plotW / days.length;
    const barW = Math.max(2, Math.min(18, slot - 4));
    const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
    const ticks = [0, max / 2, max];
    const hovered = hover !== null ? days[hover] : null;

    return (
        <ChartBox onMouseLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label={`Tokens per day in ${monthLabel(month)}`}>
                {ticks.map((t) => (
                    <g key={t}>
                        <line x1={PAD.left} x2={CHART_W - PAD.right} y1={y(t)} y2={y(t)} stroke={c.divider} strokeWidth={1} />
                        <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={c.textMuted}>
                            {formatCompact(t)}
                        </text>
                    </g>
                ))}
                {days.map((d, i) => {
                    const total = tokensOf(d);
                    const x = PAD.left + i * slot + (slot - barW) / 2;
                    const h = Math.max(0, y(0) - y(total));
                    const showLabel = i === 0 || (i + 1) % 5 === 0 || i === days.length - 1;
                    return (
                        <g key={d.day}>
                            {total > 0 && (
                                <path
                                    d={roundedTopBar(x, y(total), barW, h, Math.min(4, barW / 2, h))}
                                    fill={c.accent}
                                    opacity={hover === null || hover === i ? 1 : 0.45}
                                />
                            )}
                            {showLabel && (
                                <text x={x + barW / 2} y={CHART_H - 8} textAnchor="middle" fontSize={11} fill={c.textMuted}>
                                    {i + 1}
                                </text>
                            )}
                            {/* hit target: the whole day column */}
                            <rect
                                x={PAD.left + i * slot}
                                y={PAD.top}
                                width={slot}
                                height={plotH}
                                fill="transparent"
                                onMouseEnter={() => setHover(i)}
                            />
                        </g>
                    );
                })}
            </svg>
            {hovered && hover !== null && (
                <div className="tooltip" style={{ left: `${((PAD.left + (hover + 0.5) * slot) / CHART_W) * 100}%` }}>
                    <b>{new Date(`${hovered.day}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" })}</b>
                    <br />
                    Tokens <b>{formatInt(tokensOf(hovered))}</b>
                    <br />
                    Input {formatInt(hovered.inputTokens)} · output {formatInt(hovered.outputTokens)}
                    <br />
                    {formatInt(hovered.operations)} operations · {formatInt(hovered.requests)} requests
                </div>
            )}
        </ChartBox>
    );
};

// A bar with rounded top corners, anchored to the baseline
const roundedTopBar = (x: number, top: number, w: number, h: number, r: number) => {
    if (h <= 0) return "";
    const rr = Math.max(0, Math.min(r, h));
    return `M${x},${top + h} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + w - rr} Q${x + w},${top} ${x + w},${top + rr} V${top + h} Z`;
};

// ---------------------------------------------------------------- long-term trend

const shortMonth = (month: string) => {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
};

const TrendChart: FC<{
    months: UsageTrendMonth[];
    selected: string;
    canOpen: (month: string) => boolean;
    onOpen: (month: string) => void;
}> = ({ months, selected, canOpen, onOpen }) => {
    const [hover, setHover] = useState<number | null>(null);
    const max = niceMax(Math.max(...months.map(tokensOf), 0));
    const plotW = CHART_W - PAD.left - PAD.right;
    const plotH = CHART_H - PAD.top - PAD.bottom;
    const slot = plotW / months.length;
    const barW = Math.max(2, Math.min(28, slot - 4));
    const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
    const labelEvery = Math.max(1, Math.ceil(months.length / 12));
    const hovered = hover !== null ? months[hover] : null;

    return (
        <ChartBox onMouseLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label="Tokens per month">
                {[0, max / 2, max].map((t) => (
                    <g key={t}>
                        <line x1={PAD.left} x2={CHART_W - PAD.right} y1={y(t)} y2={y(t)} stroke={c.divider} strokeWidth={1} />
                        <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={c.textMuted}>
                            {formatCompact(t)}
                        </text>
                    </g>
                ))}
                {months.map((m, i) => {
                    const total = tokensOf(m);
                    const x = PAD.left + i * slot + (slot - barW) / 2;
                    const h = Math.max(0, y(0) - y(total));
                    const isSelected = m.month === selected;
                    const openable = canOpen(m.month);
                    return (
                        <g key={m.month}>
                            {total > 0 && (
                                <path
                                    d={roundedTopBar(x, y(total), barW, h, Math.min(4, barW / 2, h))}
                                    fill={c.accent}
                                    opacity={isSelected || hover === i ? 1 : hover === null ? 0.75 : 0.4}
                                />
                            )}
                            {isSelected && (
                                <line x1={x - 2} x2={x + barW + 2} y1={y(0) + 3} y2={y(0) + 3} stroke={c.text} strokeWidth={2} />
                            )}
                            {(i % labelEvery === 0 || i === months.length - 1) && (
                                <text x={x + barW / 2} y={CHART_H - 8} textAnchor="middle" fontSize={11} fill={c.textMuted}>
                                    {shortMonth(m.month)}
                                </text>
                            )}
                            {/* hit target: the whole month column; a month with detail opens it above */}
                            <rect
                                x={PAD.left + i * slot}
                                y={PAD.top}
                                width={slot}
                                height={plotH}
                                fill="transparent"
                                style={{ cursor: openable ? "pointer" : "default" }}
                                onMouseEnter={() => setHover(i)}
                                onClick={() => openable && onOpen(m.month)}
                            />
                        </g>
                    );
                })}
            </svg>
            {hovered && hover !== null && (
                <div
                    className="tooltip"
                    style={{ left: `${Math.min(85, Math.max(15, ((PAD.left + (hover + 0.5) * slot) / CHART_W) * 100))}%` }}
                >
                    <b>{monthLabel(hovered.month)}</b>
                    <br />
                    Tokens <b>{formatInt(tokensOf(hovered))}</b> · {formatInt(hovered.operations)} operations
                    {hovered.byModel.slice(0, 3).map((model) => (
                        <div key={`${model.providerHost}|${model.model}`}>
                            {model.model || "Unknown model"} · {formatInt(tokensOf(model))}
                        </div>
                    ))}
                    <div style={{ color: c.textMuted }}>
                        {canOpen(hovered.month) ? "Click to see its detail" : "Only the monthly totals are kept"}
                    </div>
                </div>
            )}
        </ChartBox>
    );
};

const TrendCard: FC<{
    trend: UsageTrend | null;
    selected: string;
    retentionDays: number;
    onOpen: (month: string) => void;
}> = ({ trend, selected, retentionDays, onOpen }) => {
    const [showTable, setShowTable] = useState(false);
    const months = useMemo(() => fillMonths(trend?.months ?? []), [trend]);
    const canOpen = (month: string) => monthWithinRetention(month, retentionDays);
    const years = trend?.retentionYears ?? 5;
    return (
        <Card aria-labelledby="llm-usage-trend">
            <h2 id="llm-usage-trend" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>Tokens per month · last {years} years (UTC)</span>
                {months.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setShowTable((v) => !v)}
                        style={{ border: 0, background: "transparent", color: c.accentText, cursor: "pointer", font: "500 12px Roboto, Arial, sans-serif" }}
                    >
                        {showTable ? "Show chart" : "Show as table"}
                    </button>
                )}
            </h2>
            {months.length === 0 ? (
                <Empty>No usage recorded yet.</Empty>
            ) : showTable ? (
                <TableWrap>
                    <Table>
                        <thead>
                            <tr>
                                <th scope="col">Month</th>
                                <th scope="col" style={{ textAlign: "left" }}>
                                    Model
                                </th>
                                <th scope="col">Operations</th>
                                <th scope="col">Input tokens</th>
                                <th scope="col">Output tokens</th>
                                <th scope="col">Total tokens</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...months].reverse().flatMap((m) =>
                                m.byModel.map((model, i) => (
                                    <tr key={`${m.month}|${model.providerHost}|${model.model}`}>
                                        <td>{i === 0 ? monthLabel(m.month) : ""}</td>
                                        <td style={{ textAlign: "left" }}>
                                            {model.model || "Unknown model"}
                                            <span className="secondary">
                                                {[model.providerType, model.providerHost].filter(Boolean).join(" · ")}
                                            </span>
                                        </td>
                                        <td>{formatInt(model.operations)}</td>
                                        <td>{formatInt(model.inputTokens)}</td>
                                        <td>{formatInt(model.outputTokens)}</td>
                                        <td>{formatInt(tokensOf(model))}</td>
                                    </tr>
                                )),
                            )}
                        </tbody>
                    </Table>
                </TableWrap>
            ) : (
                <TrendChart months={months} selected={selected} canOpen={canOpen} onOpen={onOpen} />
            )}
            <Note>
                The detail of each operation is kept for {retentionDays} days; after that only these monthly totals by
                provider, model and node type remain, for {years} years. Updated every hour.
            </Note>
        </Card>
    );
};

// ---------------------------------------------------------------- breakdown tables

type BreakdownId = "model" | "source" | "group" | "digitalTwin" | "node" | "user";

const BREAKDOWNS: { id: BreakdownId; label: string; nameHeader: string }[] = [
    { id: "model", label: "Provider & model", nameHeader: "Model" },
    { id: "source", label: "Node type", nameHeader: "Node type" },
    { id: "group", label: "Group", nameHeader: "Group" },
    { id: "digitalTwin", label: "Digital twin", nameHeader: "Digital twin" },
    { id: "node", label: "Node", nameHeader: "Node" },
    { id: "user", label: "User", nameHeader: "User" },
];

interface BreakdownRow extends UsageTotals {
    key: string;
    name: string;
    secondary?: string;
}

export const breakdownRows = (summary: LlmUsageSummary, id: BreakdownId): BreakdownRow[] => {
    switch (id) {
        case "model":
            return summary.byProviderModel.map((r) => ({
                ...r,
                key: `${r.providerType}|${r.providerHost}|${r.model}`,
                name: r.model || "Unknown model",
                secondary: [r.providerType, r.providerHost].filter(Boolean).join(" · "),
            }));
        case "source":
            return summary.bySource.map((r) => ({ ...r, key: r.source, name: SOURCE_LABELS[r.source] ?? r.source }));
        case "group":
            return summary.byGroup.map((r) => ({
                ...r,
                key: String(r.groupId),
                name: r.groupName || (r.groupId === null ? "No group" : `Group ${r.groupId}`),
            }));
        case "digitalTwin":
            return summary.byDigitalTwin.map((r) => ({
                ...r,
                key: r.digitalTwinUid,
                name: r.digitalTwinName || r.digitalTwinUid,
                secondary: [r.groupName, r.digitalTwinName ? r.digitalTwinUid : ""].filter(Boolean).join(" · "),
            }));
        case "node":
            return summary.byNode.map((r) => ({
                ...r,
                key: r.nodeUid,
                name: r.nodeName || r.nodeUid,
                secondary: [r.nodeType, r.nodeUid].filter(Boolean).join(" · "),
            }));
        case "user":
            return summary.byUser.map((r) => ({ ...r, key: r.userName, name: r.userName }));
    }
};

const otherUsage = (r: UsageTotals) => {
    const parts: string[] = [];
    if (r.audioSeconds > 0) parts.push(`${(r.audioSeconds / 60).toFixed(1)} min audio`);
    if (r.characters > 0) parts.push(`${formatInt(r.characters)} chars`);
    return parts.join(" · ") || "—";
};

const Breakdown: FC<{ summary: LlmUsageSummary }> = ({ summary }) => {
    const [tab, setTab] = usePersistentState<BreakdownId>("org.llmUsage.breakdown", "model");
    const rows = breakdownRows(summary, tab);
    const total = tokensOf(summary.totals);
    const header = BREAKDOWNS.find((b) => b.id === tab)?.nameHeader ?? "";
    return (
        <Card aria-labelledby="llm-usage-breakdown">
            <h2 id="llm-usage-breakdown">Breakdown</h2>
            <Tabs role="tablist" aria-label="Breakdown">
                {BREAKDOWNS.map((b) => (
                    <TabButton
                        key={b.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === b.id}
                        $selected={tab === b.id}
                        onClick={() => setTab(b.id)}
                    >
                        {b.label}
                    </TabButton>
                ))}
            </Tabs>
            {rows.length === 0 ? (
                <Empty>Nothing consumed in this period.</Empty>
            ) : (
                <TableWrap>
                    <Table>
                        <thead>
                            <tr>
                                <th scope="col">{header}</th>
                                <th scope="col">Operations</th>
                                <th scope="col">Requests</th>
                                <th scope="col">Input tokens</th>
                                <th scope="col">Output tokens</th>
                                <th scope="col">Total tokens</th>
                                <th scope="col">Audio / speech</th>
                                <th scope="col">Share of tokens</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => {
                                const share = total > 0 ? (tokensOf(r) / total) * 100 : 0;
                                return (
                                    <tr key={r.key}>
                                        <td>
                                            {r.name}
                                            {r.secondary && <span className="secondary">{r.secondary}</span>}
                                        </td>
                                        <td>{formatInt(r.operations)}</td>
                                        <td>{formatInt(r.requests)}</td>
                                        <td>{formatInt(r.inputTokens)}</td>
                                        <td>{formatInt(r.outputTokens)}</td>
                                        <td>{formatInt(tokensOf(r))}</td>
                                        <td>{otherUsage(r)}</td>
                                        <td>
                                            <span className="share">
                                                {share.toFixed(share < 10 && share > 0 ? 1 : 0)} %
                                                <span className="shareBar" aria-hidden="true">
                                                    <span className="shareFill" style={{ display: "block", width: `${share}%` }} />
                                                </span>
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </Table>
                </TableWrap>
            )}
        </Card>
    );
};

// ---------------------------------------------------------------- limit

const LimitCard: FC<{
    summary: LlmUsageSummary;
    saving: boolean;
    onSave: (limit: number, percent: number) => void;
}> = ({ summary, saving, onSave }) => {
    const [limitText, setLimitText] = useState(String(summary.monthlyTokenLimit || 0));
    const [percentText, setPercentText] = useState(String(summary.warningPercent || 80));
    useEffect(() => {
        setLimitText(String(summary.monthlyTokenLimit || 0));
        setPercentText(String(summary.warningPercent || 80));
    }, [summary.monthlyTokenLimit, summary.warningPercent]);

    const limit = summary.monthlyTokenLimit;
    const used = summary.monthTokens;
    const ratio = limit > 0 ? used / limit : 0;
    const status = limit <= 0 ? "none" : ratio >= 1 ? "over" : ratio * 100 >= summary.warningPercent ? "warning" : "ok";
    const fillColor = status === "over" ? c.danger : status === "warning" ? "#ffc233" : c.accent;
    const parsedLimit = Number(limitText.replace(/[\s,._]/g, ""));
    const parsedPercent = Number(percentText);
    const valid =
        Number.isInteger(parsedLimit) && parsedLimit >= 0 && Number.isInteger(parsedPercent) && parsedPercent >= 1 && parsedPercent <= 100;
    const changed = parsedLimit !== limit || parsedPercent !== summary.warningPercent;

    return (
        <Card aria-labelledby="llm-usage-limit">
            <h2 id="llm-usage-limit">Monthly token limit · {monthLabel(currentMonth())} (UTC)</h2>
            <LimitRow>
                <Progress>
                    <div className="text">
                        <span>
                            <b style={{ color: c.text }}>{formatInt(used)}</b>
                            {limit > 0 ? ` of ${formatInt(limit)} tokens` : " tokens this month · no limit set"}
                        </span>
                        {limit > 0 && (
                            <span role="status">
                                {status === "over"
                                    ? "Limit reached"
                                    : status === "warning"
                                      ? `Over ${summary.warningPercent} %`
                                      : `${Math.floor(ratio * 100)} %`}
                            </span>
                        )}
                    </div>
                    {limit > 0 && (
                        <div
                            className="bar"
                            role="progressbar"
                            aria-label="Tokens used this month"
                            aria-valuemin={0}
                            aria-valuemax={limit}
                            aria-valuenow={Math.min(used, limit)}
                        >
                            <div className="fill" style={{ width: `${Math.min(100, ratio * 100)}%`, background: fillColor }} />
                            <div className="marker" style={{ left: `${summary.warningPercent}%` }} title={`Warning at ${summary.warningPercent} %`} />
                        </div>
                    )}
                </Progress>
                <Field>
                    Monthly limit (tokens)
                    <input
                        inputMode="numeric"
                        value={limitText}
                        aria-describedby="llm-usage-limit-note"
                        onChange={(e) => setLimitText(e.target.value)}
                    />
                </Field>
                <Field>
                    Warn at (%)
                    <input
                        className="short"
                        inputMode="numeric"
                        value={percentText}
                        onChange={(e) => setPercentText(e.target.value)}
                    />
                </Field>
                <PrimaryButton type="button" disabled={!valid || !changed || saving} onClick={() => onSave(parsedLimit, parsedPercent)}>
                    {saving ? "Saving…" : "Save"}
                </PrimaryButton>
            </LimitRow>
            <Note id="llm-usage-limit-note">
                0 means no limit. When the organization's tokens reach the warning percentage and the limit, the users
                are told once a month in the pipeline logs and in the chat of the digital twins; the AI tools keep
                working. The usage is kept for {summary.retentionDays ?? 400} days and then deleted.
            </Note>
        </Card>
    );
};

// ---------------------------------------------------------------- page

interface LlmUsageContainerProps {
    orgsManaged: IOrgManaged[];
}

const LlmUsageContainer: FC<LlmUsageContainerProps> = ({ orgsManaged }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [orgId, setOrgId] = usePersistentState<number | null>("org.llmUsage.orgId", null);
    const [month, setMonth] = usePersistentState<string>("org.llmUsage.month", currentMonth());
    const [summary, setSummary] = useState<LlmUsageSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showTable, setShowTable] = useState(false);
    const [trend, setTrend] = useState<UsageTrend | null>(null);

    const selectedOrg = orgsManaged.find((o) => o.id === orgId) ?? orgsManaged[0];
    const selectedOrgId = selectedOrg?.id;
    const baseUrl = `${getProtocol()}://${getDomainName()}/admin_api`;

    const load = useCallback(() => {
        if (!selectedOrgId) return;
        const { from, to } = monthRange(month);
        setLoading(true);
        getAxiosInstance(refreshToken, authDispatch)
            .get(`${baseUrl}/llm_usage/${selectedOrgId}?from=${from}&to=${to}`, axiosAuth(accessToken))
            .then((response: AxiosResponse<LlmUsageSummary>) => setSummary(response.data))
            .catch((error: AxiosError) => {
                setSummary(null);
                axiosErrorHandler(error, authDispatch);
            })
            .finally(() => setLoading(false));
    }, [selectedOrgId, month, baseUrl, accessToken, refreshToken, authDispatch]);

    useEffect(() => {
        load();
    }, [load]);

    // The long-term trend (monthly totals), once per organization
    const loadTrend = useCallback(() => {
        if (!selectedOrgId) return;
        getAxiosInstance(refreshToken, authDispatch)
            .get(`${baseUrl}/llm_usage_trend/${selectedOrgId}`, axiosAuth(accessToken))
            .then((response: AxiosResponse<UsageTrend>) => setTrend(response.data))
            .catch((error: AxiosError) => {
                setTrend(null);
                axiosErrorHandler(error, authDispatch);
            });
    }, [selectedOrgId, baseUrl, accessToken, refreshToken, authDispatch]);

    useEffect(() => {
        loadTrend();
    }, [loadTrend]);

    const saveLimit = (limit: number, percent: number) => {
        if (!selectedOrgId) return;
        setSaving(true);
        getAxiosInstance(refreshToken, authDispatch)
            .put(`${baseUrl}/llm_usage_limit/${selectedOrgId}`, { monthlyTokenLimit: limit, warningPercent: percent }, axiosAuth(accessToken))
            .then(() => {
                toast.success(limit > 0 ? "Monthly token limit saved" : "Monthly token limit removed");
                load();
            })
            .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch))
            .finally(() => setSaving(false));
    };

    const isCurrentMonth = month === currentMonth();
    const retentionDays = summary?.retentionDays ?? 400;
    const canGoBack = monthWithinRetention(shiftMonth(month, -1), retentionDays);
    const totals = summary?.totals;
    const totalTokens = totals ? tokensOf(totals) : 0;

    return (
        <Page>
            <Toolbar>
                <h1>AI usage</h1>
                {orgsManaged.length > 1 && (
                    <Select aria-label="Organization" value={selectedOrgId ?? ""} onChange={(e) => setOrgId(Number(e.target.value))}>
                        {orgsManaged.map((o) => (
                            <option key={o.id} value={o.id}>
                                {o.name}
                            </option>
                        ))}
                    </Select>
                )}
                <MonthNav>
                    <IconButton
                        type="button"
                        aria-label="Previous month"
                        title={canGoBack ? undefined : `Usage older than ${retentionDays} days is deleted`}
                        disabled={!canGoBack}
                        onClick={() => setMonth(shiftMonth(month, -1))}
                    >
                        <ChevronLeft aria-hidden="true" />
                    </IconButton>
                    <span aria-live="polite">{monthLabel(month)}</span>
                    <IconButton
                        type="button"
                        aria-label="Next month"
                        disabled={isCurrentMonth}
                        onClick={() => setMonth(shiftMonth(month, 1))}
                    >
                        <ChevronRight aria-hidden="true" />
                    </IconButton>
                </MonthNav>
                <IconButton
                    type="button"
                    aria-label="Refresh"
                    title="Refresh"
                    onClick={() => {
                        load();
                        loadTrend();
                    }}
                    disabled={loading}
                >
                    <RefreshCw aria-hidden="true" />
                </IconButton>
            </Toolbar>

            {!selectedOrg && <Empty>You do not manage any organization.</Empty>}
            {selectedOrg && !selectedOrg.llmEnabled && (
                <Note style={{ marginTop: 0 }}>The LLM tools are not enabled for {selectedOrg.name}.</Note>
            )}

            {summary && totals && (
                <>
                    <Tiles>
                        <Tile>
                            <div className="label">Tokens</div>
                            <div className="value">{formatInt(totalTokens)}</div>
                            <div className="sub">
                                {formatInt(totals.inputTokens)} input · {formatInt(totals.outputTokens)} output
                            </div>
                        </Tile>
                        <Tile>
                            <div className="label">Operations</div>
                            <div className="value">{formatInt(totals.operations)}</div>
                            <div className="sub">{formatInt(totals.requests)} requests to the provider</div>
                        </Tile>
                        <Tile>
                            <div className="label">Cached input</div>
                            <div className="value">{formatInt(totals.cacheReadTokens)}</div>
                            <div className="sub">
                                {totals.inputTokens > 0
                                    ? `${Math.round((totals.cacheReadTokens / totals.inputTokens) * 100)} % of the input`
                                    : "—"}
                                {totals.reasoningTokens > 0 ? ` · ${formatInt(totals.reasoningTokens)} reasoning` : ""}
                            </div>
                        </Tile>
                        <Tile>
                            <div className="label">Audio and speech</div>
                            <div className="value">{(totals.audioSeconds / 60).toFixed(1)} min</div>
                            <div className="sub">{formatInt(totals.characters)} characters spoken</div>
                        </Tile>
                    </Tiles>

                    <LimitCard summary={summary} saving={saving} onSave={saveLimit} />

                    <Card aria-labelledby="llm-usage-daily">
                        <h2 id="llm-usage-daily" style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Tokens per day (UTC)</span>
                            <button
                                type="button"
                                onClick={() => setShowTable((v) => !v)}
                                style={{ border: 0, background: "transparent", color: c.accentText, cursor: "pointer", font: "500 12px Roboto, Arial, sans-serif" }}
                            >
                                {showTable ? "Show chart" : "Show as table"}
                            </button>
                        </h2>
                        {showTable ? (
                            <TableWrap>
                                <Table>
                                    <thead>
                                        <tr>
                                            <th scope="col">Day</th>
                                            <th scope="col">Operations</th>
                                            <th scope="col">Input tokens</th>
                                            <th scope="col">Output tokens</th>
                                            <th scope="col">Total tokens</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summary.daily.map((d) => (
                                            <tr key={d.day}>
                                                <td>{d.day}</td>
                                                <td>{formatInt(d.operations)}</td>
                                                <td>{formatInt(d.inputTokens)}</td>
                                                <td>{formatInt(d.outputTokens)}</td>
                                                <td>{formatInt(tokensOf(d))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </TableWrap>
                        ) : (
                            <DailyChart month={month} daily={summary.daily} />
                        )}
                    </Card>

                    <Breakdown summary={summary} />

                    <TrendCard trend={trend} selected={month} retentionDays={retentionDays} onOpen={setMonth} />
                </>
            )}
            {loading && !summary && <Empty>Loading…</Empty>}
        </Page>
    );
};

export default LlmUsageContainer;
