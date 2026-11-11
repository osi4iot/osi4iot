import React, { useState, useRef, useCallback, useEffect } from "react";
import styled from "styled-components";
import { Camera, Pause, Play } from "lucide-react";
import type { FrameStore } from "../Utils/customHooks";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const FrameContainer = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    overflow: hidden;
    cursor: grab;

    &:active {
        cursor: grabbing;
    }

    ${(props) => props.className}
`;

interface ZoomContainerProps {
    scale: number;
    translateX: number;
    translateY: number;
}

const ZoomContainer = styled.div.attrs<ZoomContainerProps>((props) => ({
    style: {
        transform: `scale(${props.scale}) translate(${props.translateX}px, ${props.translateY}px)`,
    },
}))<ZoomContainerProps>`
    transition: transform 0.1s ease-out;
    transform-origin: center center;
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
`;

// fits the frame in its panel (the Viewer page's panels can be small), keeping its proportions
const FramedCanvas = styled.canvas`
    display: block;
    box-sizing: border-box;
    max-width: 100%;
    max-height: 100%;
    border: 8px solid #868585ff;
    border-radius: 2px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2),
        inset 0 0 0 1px rgba(0, 0, 0, 0.1);
    user-select: none;
    pointer-events: none;
`;

const ZoomControls = styled.div`
    position: absolute;
    bottom: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    z-index: 10;
`;

const ZoomButton = styled.button`
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: bold;
    color: #333;
    transition: all 0.2s ease;

    &:hover {
        background: rgba(255, 255, 255, 1);
        transform: scale(1.1);
    }

    &:active {
        transform: scale(0.95);
    }
`;

const ZoomIndicator = styled.div`
    position: absolute;
    bottom: 140px;
    right: 0px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10;
`;

// the bar over a Video or Photo panel: what is shown (fps, paused, when the photo arrived) and the pause button
const InfoBar = styled.div`
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    z-index: 11;
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: none;
    font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
`;

const Badge = styled.span<{ $tone?: "live" | "paused" | "plain" }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px;
    border-radius: 12px;
    background: rgba(11, 12, 14, 0.78);
    color: #e6e8eb;
    font-size: 12px;
    white-space: nowrap;

    &::before {
        content: "";
        display: ${({ $tone }) => ($tone === "plain" ? "none" : "block")};
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: ${({ $tone }) => ($tone === "paused" ? "#f2cc0c" : "#f2495c")};
    }
`;

const PauseButton = styled.button`
    margin-left: auto;
    pointer-events: auto;
    height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    background: rgba(11, 12, 14, 0.82);
    border: 1px solid #3a4048;
    border-radius: 15px;
    color: #e6e8eb;
    font: 500 12px Roboto, "Helvetica Neue", Arial, sans-serif;
    cursor: pointer;

    &:hover,
    &:focus-visible {
        border-color: #3d82f0;
    }
    svg {
        width: 14px;
        height: 14px;
    }
`;

// "12:03:41 · 3 min ago"
export const photoAge = (receivedAt: number, now: number): string => {
    const seconds = Math.max(0, Math.round((now - receivedAt) / 1000));
    const time = new Date(receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const ago =
        seconds < 10
            ? "just now"
            : seconds < 60
              ? `${seconds} s ago`
              : seconds < 3600
                ? `${Math.floor(seconds / 60)} min ago`
                : seconds < 86400
                  ? `${Math.floor(seconds / 3600)} h ago`
                  : `${Math.floor(seconds / 86400)} d ago`;
    return `${time} · ${ago}`;
};

// frames per second of the last few seconds
export const framesPerSecond = (times: number[], now: number, windowMs = 3000): number => {
    const recent = times.filter((t) => now - t <= windowMs);
    if (recent.length < 2) return recent.length === 1 && now - recent[0] < 1500 ? 1 : 0;
    return ((recent.length - 1) * 1000) / Math.max(1, recent[recent.length - 1] - recent[0]);
};

interface ImageFrameProps {
    frameStore: FrameStore;
    // the topicRef whose frames it shows ("any" or none: all)
    source?: string;
    className?: string;
    minZoom?: number;
    maxZoom?: number;
    zoomStep?: number;
    showControls?: boolean;
    // the Image panels: a video (fps, pause and continue) or a photo (when it arrived); none: only the picture
    mode?: "video" | "photo";
}

export const ImageFrame: React.FC<ImageFrameProps> = ({
    frameStore,
    source,
    className = "",
    minZoom = 0.5,
    maxZoom = 5,
    zoomStep = 0.1,
    showControls = true,
    mode,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hasFirstFrame, setHasFirstFrame] = useState(false);
    // video: paused (the frames that arrive meanwhile are not drawn; the last one is drawn on continue)
    const [paused, setPaused] = useState(false);
    const pausedRef = useRef(false);
    const heldRef = useRef<{ frame: Blob; at: number } | null>(null);
    const drawRef = useRef<((frame: Blob, at: number) => void) | null>(null);
    const timesRef = useRef<number[]>([]);
    const [fps, setFps] = useState(0);
    const [shownAt, setShownAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const [scale, setScale] = useState(1);
    const [translateX, setTranslateX] = useState(0);
    const [translateY, setTranslateY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePosition, setLastMousePosition] = useState({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);

    // Frames are painted straight onto the canvas, outside React: no state
    // change and no re-render per frame. createImageBitmap decodes the JPEG
    // off the main thread. While one frame is decoding, newer ones replace
    // each other in `pending`: only the latest is drawn, so the picture
    // never falls behind the stream.
    useEffect(() => {
        let decoding = false;
        let pending: Blob | null = null;
        let cancelled = false;

        let pendingAt = 0;
        const draw = async (frame: Blob, at: number = Date.now()) => {
            if (decoding) {
                pending = frame;
                pendingAt = at;
                return;
            }
            decoding = true;
            try {
                const bitmap = await createImageBitmap(frame);
                const canvas = canvasRef.current;
                if (!cancelled && canvas) {
                    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
                        canvas.width = bitmap.width;
                        canvas.height = bitmap.height;
                    }
                    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
                    setHasFirstFrame(true); // only re-renders the first time
                    if (mode === "photo") setShownAt(at);
                }
                bitmap.close();
            } catch (err) {
                console.warn("ImageFrame: could not decode frame", err);
            } finally {
                decoding = false;
                if (pending && !cancelled) {
                    const next = pending;
                    pending = null;
                    draw(next, pendingAt);
                }
            }
        };

        setHasFirstFrame(false);
        setShownAt(null);
        timesRef.current = [];
        heldRef.current = null;
        drawRef.current = draw;
        const unsubscribe = frameStore.subscribe((frame, at) => {
            timesRef.current.push(at);
            if (timesRef.current.length > 120) timesRef.current.splice(0, timesRef.current.length - 120);
            if (pausedRef.current) {
                heldRef.current = { frame, at };
                return;
            }
            draw(frame, at);
        }, source);
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [frameStore, source, mode]);

    // the fps of the video and the age of the photo, once a second
    useEffect(() => {
        if (!mode) return;
        const tick = () => {
            const t = Date.now();
            if (mode === "video") {
                const value = Math.round(framesPerSecond(timesRef.current, t) * 10) / 10;
                setFps((old) => (old === value ? old : value));
            } else setNow(t);
        };
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [mode]);

    const togglePause = useCallback(() => {
        const next = !pausedRef.current;
        pausedRef.current = next;
        setPaused(next);
        // continue: the newest frame at once
        if (!next && heldRef.current && drawRef.current) {
            const { frame, at } = heldRef.current;
            heldRef.current = null;
            drawRef.current(frame, at);
        }
    }, []);

    // Wheel zoom
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheelEvent = (e: WheelEvent) => {
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 1 - zoomStep : 1 + zoomStep;
            const newScale = Math.min(Math.max(scale * zoomFactor, minZoom), maxZoom);
            if (newScale === scale) return;

            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left - rect.width / 2;
            const mouseY = e.clientY - rect.top - rect.height / 2;
            const scaleDiff = newScale / scale - 1;
            setScale(newScale);
            setTranslateX((prev) => prev - (mouseX * scaleDiff) / scale);
            setTranslateY((prev) => prev - (mouseY * scaleDiff) / scale);
        };

        container.addEventListener("wheel", handleWheelEvent, { passive: false });
        return () => container.removeEventListener("wheel", handleWheelEvent);
    }, [scale, minZoom, maxZoom, zoomStep]);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (scale > 1) {
                setIsDragging(true);
                setLastMousePosition({ x: e.clientX, y: e.clientY });
            }
        },
        [scale]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (isDragging && scale > 1) {
                const deltaX = (e.clientX - lastMousePosition.x) / scale;
                const deltaY = (e.clientY - lastMousePosition.y) / scale;
                setTranslateX((prev) => prev + deltaX);
                setTranslateY((prev) => prev + deltaY);
                setLastMousePosition({ x: e.clientX, y: e.clientY });
            }
        },
        [isDragging, lastMousePosition, scale]
    );

    const handleMouseUp = useCallback(() => setIsDragging(false), []);

    const zoomIn = useCallback(() => {
        setScale((prev) => Math.min(prev * (1 + zoomStep * 2), maxZoom));
    }, [maxZoom, zoomStep]);

    const zoomOut = useCallback(() => {
        setScale((prev) => {
            const next = Math.max(prev * (1 - zoomStep * 2), minZoom);
            if (next <= 1) {
                setTranslateX(0);
                setTranslateY(0);
            }
            return next;
        });
    }, [minZoom, zoomStep]);

    const resetZoom = useCallback(() => {
        setScale(1);
        setTranslateX(0);
        setTranslateY(0);
    }, []);

    return (
        <FrameContainer
            className={className}
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {!hasFirstFrame && <Camera size={100} color="#595858" />}

            {/* Always mounted, so frames can be drawn before the first one is shown */}
            <div style={{ display: hasFirstFrame ? "block" : "none", width: "100%", height: "100%", padding: 12, boxSizing: "border-box" }}>
                <ZoomContainer scale={scale} translateX={translateX} translateY={translateY}>
                    <FramedCanvas ref={canvasRef} />
                </ZoomContainer>
            </div>

            {mode === "video" && (
                <InfoBar>
                    {paused ? (
                        <Badge $tone="paused">Paused</Badge>
                    ) : hasFirstFrame ? (
                        <Badge $tone="live" aria-label={`Live, ${fps} frames per second`}>
                            Live · {fps.toLocaleString(undefined, { maximumFractionDigits: 1 })} fps
                        </Badge>
                    ) : (
                        <Badge $tone="plain">Waiting for frames</Badge>
                    )}
                    {hasFirstFrame && (
                        <PauseButton
                            type="button"
                            className="ws-no-drag"
                            aria-pressed={paused}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={togglePause}
                        >
                            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                            {paused ? "Continue" : "Pause"}
                        </PauseButton>
                    )}
                </InfoBar>
            )}
            {mode === "photo" && (
                <InfoBar>
                    <Badge $tone="plain">{shownAt !== null ? photoAge(shownAt, now) : "No photo yet"}</Badge>
                </InfoBar>
            )}

            {showControls && hasFirstFrame && (
                <ZoomControls>
                    <ZoomIndicator>{Math.round(scale * 100)}%</ZoomIndicator>
                    <ZoomButton onClick={zoomIn} title="Zoom In">+</ZoomButton>
                    <ZoomButton onClick={zoomOut} title="Zoom Out">−</ZoomButton>
                    <ZoomButton onClick={resetZoom} title="Reset Zoom">⌂</ZoomButton>
                </ZoomControls>
            )}
        </FrameContainer>
    );
};