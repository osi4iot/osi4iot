// The time picker of the Viewer page, as a Grafana dashboard's: the range (quick ranges, or from / to as
// "now-6h" or dates), moving it back and forward, zooming out, and the refresh (now, or every 5 s…1 d).
import { FC, useEffect, useId, useRef, useState } from "react";
import styled from "styled-components";
import { ChevronDown, ChevronLeft, ChevronRight, Clock, RefreshCw, ZoomOut } from "lucide-react";
import {
    PageTime,
    QUICK_RANGES,
    REFRESH_INTERVALS,
    absoluteRaw,
    describeRange,
    isValidTime,
    refreshText,
    resolveRange,
    shiftRange,
    timeText,
    zoomOut,
} from "./timeRange";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

const Wrap = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    font-family: ${font};
`;

const Btn = styled.button<{ $wide?: boolean }>`
    height: 34px;
    min-width: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 ${({ $wide }) => ($wide ? "10px" : "0")};
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #d5d9de;
    font: 500 13px ${font};
    white-space: nowrap;
    cursor: pointer;

    &:hover {
        border-color: #3d82f0;
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 1px;
    }

    svg {
        width: 15px;
        height: 15px;
        flex: none;
    }

    @media (max-width: 1100px) {
        .hide-narrow {
            display: none;
        }
    }
`;

const Popover = styled.div`
    position: absolute;
    top: 40px;
    right: 0;
    z-index: 3000;
    display: flex;
    background: #181b1f;
    border: 1px solid #2c3137;
    border-radius: 10px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    color: #e6e8eb;
    font: 400 13px ${font};
    overflow: hidden;

    @media (max-width: 640px) {
        position: fixed;
        top: 64px;
        left: 8px;
        right: 8px;
        flex-direction: column;
        max-height: calc(100vh - 80px);
        overflow-y: auto;
    }
`;

const Column = styled.div`
    width: 260px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;

    h3 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
        color: #9aa1aa;
    }

    input {
        height: 32px;
        padding: 0 10px;
        background: #0e1013;
        border: 1px solid #2c3137;
        border-radius: 7px;
        color: #e6e8eb;
        font: 400 13px ${font};
    }

    input[aria-invalid="true"] {
        border-color: #f2495c;
    }

    @media (max-width: 640px) {
        width: auto;
    }
`;

const Quick = styled.ul`
    margin: 0;
    padding: 6px;
    list-style: none;
    width: 200px;
    max-height: 360px;
    overflow-y: auto;
    border-left: 1px solid #262a2f;

    button {
        width: 100%;
        height: 30px;
        padding: 0 10px;
        background: transparent;
        border: none;
        border-radius: 6px;
        color: #d5d9de;
        font: 400 13px ${font};
        text-align: left;
        cursor: pointer;
    }

    button:hover,
    button[aria-current="true"] {
        background: #23324a;
        color: #e6efff;
    }

    @media (max-width: 640px) {
        width: auto;
        max-height: none;
        border-left: none;
        border-top: 1px solid #262a2f;
    }
`;

const RefreshList = styled.ul`
    margin: 0;
    padding: 6px;
    list-style: none;

    button {
        width: 90px;
        height: 30px;
        padding: 0 10px;
        background: transparent;
        border: none;
        border-radius: 6px;
        color: #d5d9de;
        font: 400 13px ${font};
        text-align: left;
        cursor: pointer;
    }

    button:hover,
    button[aria-current="true"] {
        background: #23324a;
        color: #e6efff;
    }
`;

const Apply = styled.button`
    height: 32px;
    border: none;
    border-radius: 7px;
    background: #3d82f0;
    color: #fff;
    font: 600 13px ${font};
    cursor: pointer;

    &:disabled {
        opacity: 0.5;
    }
`;

export interface TimePickerProps {
    time: PageTime;
    onChange: (time: PageTime) => void;
    onRefresh: () => void;
    now?: () => number;
    compact?: boolean;
}

const TimePicker: FC<TimePickerProps> = ({ time, onChange, onRefresh, now = Date.now, compact = false }) => {
    const [open, setOpen] = useState<"range" | "refresh" | null>(null);
    const [from, setFrom] = useState(time.from);
    const [to, setTo] = useState(time.to);
    const wrapRef = useRef<HTMLDivElement>(null);
    const id = useId();
    useEffect(() => {
        setFrom(time.from);
        setTo(time.to);
    }, [time.from, time.to, open]);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    const fromValid = isValidTime(from);
    const toValid = isValidTime(to);
    const rangeValid = fromValid && toValid && resolveRange({ from, to }, now()) !== null;
    const current = resolveRange(time, now());
    const move = (direction: -1 | 1) => current && onChange({ ...time, ...absoluteRaw(shiftRange(current, direction, now())) });

    return (
        <Wrap ref={wrapRef} role="group" aria-label="Time range" onKeyDown={(e) => e.key === "Escape" && open && (e.stopPropagation(), setOpen(null))}>
            {!compact && (
                <Btn type="button" aria-label="Move the range back" title="Move the range back" onClick={() => move(-1)}>
                    <ChevronLeft aria-hidden="true" />
                </Btn>
            )}
            <Btn type="button" $wide aria-haspopup="dialog" aria-expanded={open === "range"} onClick={() => setOpen(open === "range" ? null : "range")} title={`${timeText(time.from)} to ${timeText(time.to)}`}>
                <Clock aria-hidden="true" />
                <span className={compact ? "hide-narrow" : undefined}>{describeRange(time)}</span>
                <ChevronDown aria-hidden="true" />
            </Btn>
            {!compact && (
                <>
                    <Btn type="button" aria-label="Move the range forward" title="Move the range forward" onClick={() => move(1)}>
                        <ChevronRight aria-hidden="true" />
                    </Btn>
                    <Btn type="button" aria-label="Zoom out" title="Zoom out (twice as long)" onClick={() => current && onChange({ ...time, ...absoluteRaw(zoomOut(current, now())) })}>
                        <ZoomOut aria-hidden="true" />
                    </Btn>
                </>
            )}
            <Btn type="button" aria-label="Refresh now" title="Refresh now" onClick={onRefresh} style={{ marginLeft: 4, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
                <RefreshCw aria-hidden="true" />
            </Btn>
            <Btn
                type="button"
                $wide
                aria-label={`Auto refresh: ${refreshText(time.refresh)}`}
                aria-haspopup="listbox"
                aria-expanded={open === "refresh"}
                onClick={() => setOpen(open === "refresh" ? null : "refresh")}
                style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1 }}
            >
                {time.refresh || ""}
                <ChevronDown aria-hidden="true" />
            </Btn>

            {open === "range" && (
                <Popover role="dialog" aria-label="Choose the range of time">
                    <Column>
                        <h3>Absolute time range</h3>
                        <label htmlFor={`${id}-from`}>
                            From
                            <input id={`${id}-from`} value={from} aria-invalid={!fromValid} onChange={(e) => setFrom(e.target.value)} placeholder="now-6h or 2026-11-09 10:00" />
                        </label>
                        <label htmlFor={`${id}-to`}>
                            To
                            <input id={`${id}-to`} value={to} aria-invalid={!toValid} onChange={(e) => setTo(e.target.value)} placeholder="now" />
                        </label>
                        <span style={{ fontSize: 11, color: "#8b929b" }}>Relative times as in Grafana: now-6h, now-1d/d, now/w; or dates (2026-11-09 10:00).</span>
                        <Apply
                            type="button"
                            disabled={!rangeValid}
                            onClick={() => {
                                const asDate = (text: string) => (/^\d{4}-\d{2}-\d{2} /.test(text.trim()) ? text.trim().replace(" ", "T") : text.trim());
                                onChange({ ...time, from: asDate(from), to: asDate(to) });
                                setOpen(null);
                            }}
                        >
                            Apply time range
                        </Apply>
                    </Column>
                    <Quick aria-label="Quick ranges">
                        {QUICK_RANGES.map((q) => (
                            <li key={q.display}>
                                <button
                                    type="button"
                                    aria-current={q.from === time.from && q.to === time.to}
                                    onClick={() => {
                                        onChange({ ...time, from: q.from, to: q.to });
                                        setOpen(null);
                                    }}
                                >
                                    {q.display}
                                </button>
                            </li>
                        ))}
                    </Quick>
                </Popover>
            )}
            {open === "refresh" && (
                <Popover role="listbox" aria-label="Auto refresh">
                    <RefreshList>
                        {REFRESH_INTERVALS.map((r) => (
                            <li key={r || "off"}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={r === time.refresh}
                                    aria-current={r === time.refresh}
                                    onClick={() => {
                                        onChange({ ...time, refresh: r });
                                        setOpen(null);
                                    }}
                                >
                                    {refreshText(r)}
                                </button>
                            </li>
                        ))}
                    </RefreshList>
                </Popover>
            )}
        </Wrap>
    );
};

export default TimePicker;
