import React, { useCallback } from "react";
import styled from "styled-components";

// Gráficas que pipelines dibuja para una respuesta del AI Agent (herramientas
// del servidor MCP sensor_history): PNG en base64 en el campo "charts" del
// mensaje llm2sim. El historial guardado trae solo las referencias (id y
// título); cada imagen se pide aparte (queryChatChart) y llega por state2sim.
export interface ChatChart {
    id?: string;
    title: string;
    mimeType: string;
    data: string; // base64; "" mientras se pide (historial)
}

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_CHARTS = 4;
const MAX_CHART_BASE64 = 1_000_000;
const CHART_ID_RE = /^chart_[0-9a-f]{24}$/;

export const isChartId = (id: unknown): id is string => typeof id === "string" && CHART_ID_RE.test(id);

// Sólo imágenes de los tipos esperados y con base64 válido: el mensaje viene de
// NATS y no se pinta nada que no sea una imagen.
export function sanitizeCharts(raw: unknown): ChatChart[] {
    if (!Array.isArray(raw)) return [];
    const charts: ChatChart[] = [];
    for (const item of raw) {
        if (charts.length >= MAX_CHARTS) break;
        if (!item || typeof item !== "object") continue;
        const { id, title, mimeType, data } = item as Record<string, unknown>;
        const safeTitle = typeof title === "string" ? title.slice(0, 200) : "";
        const safeId = isChartId(id) ? id : undefined;
        // una referencia del historial: la imagen se pedirá
        if ((data === undefined || data === null || data === "") && safeId) {
            charts.push({ id: safeId, title: safeTitle, mimeType: "", data: "" });
            continue;
        }
        if (typeof mimeType !== "string" || !ALLOWED_MIME_TYPES.has(mimeType)) continue;
        if (typeof data !== "string" || data.length === 0 || data.length > MAX_CHART_BASE64 || !BASE64_RE.test(data)) {
            continue;
        }
        charts.push({ ...(safeId ? { id: safeId } : {}), title: safeTitle, mimeType, data });
    }
    return charts;
}

function chartFileName(title: string, index: number, mimeType: string): string {
    const base =
        title
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^A-Za-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 60) || `chart_${index + 1}`;
    return `${base}.${mimeType.split("/")[1]}`;
}

function chartBlob(chart: ChatChart): Blob {
    const bytes = Uint8Array.from(atob(chart.data), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: chart.mimeType });
}

export const ChatCharts: React.FC<{ charts?: ChatChart[] }> = ({ charts }) => {
    const openChart = useCallback((chart: ChatChart) => {
        const url = URL.createObjectURL(chartBlob(chart));
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }, []);

    const downloadChart = useCallback((chart: ChatChart, index: number) => {
        const url = URL.createObjectURL(chartBlob(chart));
        const link = document.createElement("a");
        link.href = url;
        link.download = chartFileName(chart.title, index, chart.mimeType);
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }, []);

    if (!charts || charts.length === 0) return null;
    return (
        <ChartsContainer>
            {charts.map((chart, index) =>
                chart.data === "" ? (
                    <ChartPending key={chart.id ?? index}>Loading chart{chart.title ? `: ${chart.title}` : ""}…</ChartPending>
                ) : (
                <ChartFigure key={chart.id ?? index}>
                    <ChartImage
                        src={`data:${chart.mimeType};base64,${chart.data}`}
                        alt={chart.title || `Chart ${index + 1}`}
                        title="Click to open at full size"
                        onClick={() => openChart(chart)}
                    />
                    <ChartActions>
                        <ChartButton type="button" onClick={() => downloadChart(chart, index)}>
                            ⬇ PNG
                        </ChartButton>
                    </ChartActions>
                </ChartFigure>
                ),
            )}
        </ChartsContainer>
    );
};

const ChartsContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
`;

const ChartPending = styled.div`
    padding: 24px 12px;
    border-radius: 6px;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.8rem;
    text-align: center;
`;

const ChartFigure = styled.figure`
    margin: 0;
    position: relative;
`;

const ChartImage = styled.img`
    display: block;
    width: 100%;
    height: auto;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    cursor: zoom-in;
`;

const ChartActions = styled.div`
    position: absolute;
    top: 6px;
    right: 6px;
    opacity: 0.6;

    ${ChartFigure}:hover & {
        opacity: 1;
    }
`;

const ChartButton = styled.button`
    background: rgba(0, 0, 0, 0.55);
    color: #f0f0f0;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 0.7rem;
    cursor: pointer;
`;
