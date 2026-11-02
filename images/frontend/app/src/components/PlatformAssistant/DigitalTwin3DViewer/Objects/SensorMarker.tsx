// Marcador de un sensor en el visor 3D: un punto luminoso sobre un pequeño soporte, con el color de su estado
// (en directo, sin datos recientes, sin datos), y al pasar el ratón (o con el foco del teclado) una tarjeta con
// el nombre del sensor, su medida y el valor que tiene ahora. Mismo lenguaje visual que la HomePage: fondo
// oscuro translúcido con desenfoque, bordes finos, píldoras con un punto de color que brilla y la tipografía
// Archivo para los títulos. Al hacer clic se abre el dashboard del sensor, como antes.
import { FC, KeyboardEvent, useEffect, useState } from "react";
import styled, { css, keyframes } from "styled-components";
import "@fontsource-variable/archivo/standard.css";
import { IMeasurement } from "../../../../tools/measurements";

const display = `"Archivo Variable", Roboto, "Helvetica Neue", Arial, sans-serif`;
const text = `Roboto, "Helvetica Neue", Arial, sans-serif`;

const colors = {
    panel: "rgba(7, 10, 16, 0.86)",
    pin: "rgba(7, 10, 16, 0.72)",
    ink: "#eef2f7",
    muted: "#a7b1be",
    faint: "#6f7a88",
    line: "rgba(255, 255, 255, 0.14)",
    live: "#3dff8f",
    stale: "#ffc233",
    none: "#8a94a3",
};

export type SensorMarkerStatus = "live" | "stale" | "none";

const statusColor = (status: SensorMarkerStatus) =>
    status === "live" ? colors.live : status === "stale" ? colors.stale : colors.none;

// ---- valores

// Número legible: notación científica para valores muy pequeños o muy grandes (deformaciones, 1e-5) y,
// si no, hasta 4 cifras significativas sin ceros de sobra
export const formatSensorNumber = (value: number): string => {
    if (!Number.isFinite(value)) return "—";
    if (value === 0) return "0";
    const abs = Math.abs(value);
    if (abs < 1e-3 || abs >= 1e6) {
        const [mantissa, exponent] = value.toExponential(3).split("e");
        return `${String(Number(mantissa))}e${exponent.replace("+", "")}`;
    }
    return String(Number(value.toPrecision(4)));
};

export interface SensorMarkerRow {
    label: string;
    value: string;
}

// Filas de la tarjeta: una por valor (un número, o cada componente de un array con su etiqueta)
export const sensorMarkerRows = (
    value: number | number[] | null | undefined,
    measurement: IMeasurement | undefined,
    fieldName: string,
): SensorMarkerRow[] => {
    const label = measurement?.label || fieldName || "Value";
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) {
        const labels = label.split(",").map((l) => l.trim());
        return value.map((v, i) => ({
            label: labels[i] || `${fieldName}[${i}]`,
            value: typeof v === "number" ? formatSensorNumber(v) : "—",
        }));
    }
    return [{ label, value: formatSensorNumber(value) }];
};

export const formatAge = (seconds: number): string => {
    if (seconds < 2) return "just now";
    if (seconds < 60) return `${Math.round(seconds)} s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
    return `${Math.round(seconds / 3600)} h ago`;
};

// ---- estilos

const pulse = keyframes`
    0% { transform: scale(1); opacity: 0.75; }
    70% { transform: scale(2.6); opacity: 0; }
    100% { transform: scale(2.6); opacity: 0; }
`;

// El extremo inferior del soporte queda justo en la posición del sensor
const Anchor = styled.div<{ $occluded: boolean }>`
    position: relative;
    transform: translate(-50%, -100%);
    opacity: ${({ $occluded }) => ($occluded ? 0 : 1)};
    visibility: ${({ $occluded }) => ($occluded ? "hidden" : "visible")};
    transition:
        opacity 0.2s ease,
        visibility 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
    font-family: ${text};
`;

const Pin = styled.button<{ $color: string; $active: boolean; $live: boolean }>`
    position: relative;
    pointer-events: auto;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid ${({ $active, $color }) => ($active ? $color : `${$color}66`)};
    background: ${colors.pin};
    backdrop-filter: blur(6px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    cursor: pointer;
    transition:
        border-color 0.15s ease,
        transform 0.15s ease;

    &::before {
        content: "";
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, #ffffff 0%, ${({ $color }) => $color} 45%);
        box-shadow:
            0 0 ${({ $active }) => ($active ? "8px 2px" : "6px 1px")} ${({ $color }) => $color},
            0 0 ${({ $active }) => ($active ? "18px 4px" : "14px 2px")} ${({ $color }) => `${$color}99`};
    }

    ${({ $live, $color }) =>
        $live &&
        css`
            &::after {
                content: "";
                position: absolute;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: ${$color};
                animation: ${pulse} 2.2s ease-out infinite;
            }
        `}

    &:hover {
        transform: scale(1.12);
        border-color: ${({ $color }) => $color};
    }

    &:focus-visible {
        outline: 2px solid ${({ $color }) => $color};
        outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
        &::after {
            animation: none;
        }
    }
`;

const Stem = styled.span<{ $color: string }>`
    width: 1px;
    height: 12px;
    background: linear-gradient(180deg, ${({ $color }) => $color}, ${({ $color }) => $color}00);
`;

const Foot = styled.span<{ $color: string }>`
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: ${({ $color }) => $color};
    box-shadow: 0 0 6px ${({ $color }) => $color};
`;

const Card = styled.div`
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    min-width: 190px;
    max-width: 280px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid ${colors.line};
    background: ${colors.panel};
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    color: ${colors.ink};
    white-space: nowrap;
    pointer-events: none;
    text-align: left;
`;

const Title = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font: 650 14px ${display};
    font-stretch: 108%;
    letter-spacing: 0.005em;

    /* el texto se recorta, no el brillo del punto */
    span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
    }
`;

const Dot = styled.span<{ $color: string }>`
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${({ $color }) => $color};
    box-shadow:
        0 0 6px 1px ${({ $color }) => $color},
        0 0 14px 2px ${({ $color }) => `${$color}88`};
`;

const Subtitle = styled.div`
    margin: 2px 0 10px 16px;
    font: 400 12px ${text};
    color: ${colors.faint};
`;

const Big = styled.div`
    display: flex;
    align-items: baseline;
    gap: 6px;

    strong {
        font: 650 24px ${display};
        font-stretch: 104%;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
    }

    span {
        font: 400 13px ${text};
        color: ${colors.muted};
    }
`;

const BigLabel = styled.div`
    margin-bottom: 2px;
    font: 500 12px ${text};
    color: ${colors.muted};
`;

const Rows = styled.dl`
    display: grid;
    grid-template-columns: auto auto;
    gap: 4px 16px;
    margin: 0;

    dt {
        font: 500 12px ${text};
        color: ${colors.muted};
    }

    dd {
        margin: 0;
        text-align: right;
        font: 600 13px ${display};
        font-variant-numeric: tabular-nums;
    }
`;

const Footer = styled.div`
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font: 400 11px ${text};
    color: ${colors.faint};
`;

// ---- componente

export interface SensorMarkerProps {
    title: string;
    subtitle?: string;
    measurement?: IMeasurement;
    fieldName: string;
    value: number | number[] | null | undefined;
    status: SensorMarkerStatus;
    lastValueAt: number | null; // ms
    hasDashboard: boolean;
    onOpen: () => void;
    // hidden by other objects (when the user chose not to see those markers)
    occluded?: boolean;
    // the card opens or closes (the marker is then drawn above the others)
    onActiveChange?: (active: boolean) => void;
}

export const SensorMarker: FC<SensorMarkerProps> = ({
    title,
    subtitle,
    measurement,
    fieldName,
    value,
    status,
    lastValueAt,
    hasDashboard,
    onOpen,
    occluded = false,
    onActiveChange,
}) => {
    const [active, setActive] = useState(false);
    useEffect(() => {
        onActiveChange?.(active);
    }, [active, onActiveChange]);
    // un marcador que queda oculto cierra su tarjeta
    useEffect(() => {
        if (occluded) setActive(false);
    }, [occluded]);
    const [now, setNow] = useState(() => Date.now());

    // la antigüedad del valor se actualiza cada segundo mientras se ve la tarjeta
    useEffect(() => {
        if (!active) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [active]);

    const color = statusColor(status);
    const rows = sensorMarkerRows(value, measurement, fieldName);
    const units = measurement?.units && measurement.units !== "-" ? measurement.units : "";
    const statusText =
        status === "live"
            ? `Live · ${lastValueAt ? formatAge((now - lastValueAt) / 1000) : "updating"}`
            : status === "stale"
              ? `No recent data${lastValueAt ? ` · ${formatAge((now - lastValueAt) / 1000)}` : ""}`
              : "No data yet";

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") setActive(false);
    };

    return (
        <Anchor $occluded={occluded} aria-hidden={occluded || undefined}>
            {active && (
                <Card role="tooltip">
                    <Title>
                        <Dot $color={color} />
                        <span>{title}</span>
                    </Title>
                    {subtitle && <Subtitle>{subtitle}</Subtitle>}
                    {!subtitle && <Subtitle />}
                    {rows.length === 0 && <BigLabel>No value received yet</BigLabel>}
                    {rows.length === 1 && (
                        <>
                            <BigLabel>{rows[0].label}</BigLabel>
                            <Big>
                                <strong>{rows[0].value}</strong>
                                {units && <span>{units}</span>}
                            </Big>
                        </>
                    )}
                    {rows.length > 1 && (
                        <Rows>
                            {rows.map((row) => (
                                <div key={row.label} style={{ display: "contents" }}>
                                    <dt>{row.label}</dt>
                                    <dd>
                                        {row.value}
                                        {units ? ` ${units}` : ""}
                                    </dd>
                                </div>
                            ))}
                        </Rows>
                    )}
                    <Footer>
                        <span>{statusText}</span>
                        {hasDashboard && <span>Click: dashboard</span>}
                    </Footer>
                </Card>
            )}
            <Pin
                type="button"
                $color={color}
                $active={active}
                $live={status === "live"}
                aria-label={`${title}${rows[0] ? `: ${rows.map((r) => `${r.label} ${r.value}${units ? ` ${units}` : ""}`).join(", ")}` : ""}`}
                onPointerEnter={() => setActive(true)}
                onPointerLeave={() => setActive(false)}
                onFocus={() => setActive(true)}
                onBlur={() => setActive(false)}
                onKeyDown={onKeyDown}
                onClick={onOpen}
            />
            <Stem $color={color} />
            <Foot $color={color} />
        </Anchor>
    );
};

export default SensorMarker;