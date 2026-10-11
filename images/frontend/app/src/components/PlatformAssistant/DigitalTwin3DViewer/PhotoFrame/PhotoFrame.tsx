import React, { useState, useRef, useCallback, useEffect } from "react";
import styled from "styled-components";
import { Camera } from "lucide-react";

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
`;

const FramedImage = styled.img`
    border: 8px solid #868585ff;
    border-radius: 2px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2),
        inset 0 0 0 1px rgba(0, 0, 0, 0.1);
    user-select: none;
    pointer-events: none;
`;

const HiddenImg = styled.img`
    display: none;
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

interface ImageFrameProps {
    imageUrl: string;
    width?: string;
    height?: string;
    className?: string;
    minZoom?: number;
    maxZoom?: number;
    zoomStep?: number;
    showControls?: boolean;
}

export const ImageFrame: React.FC<ImageFrameProps> = ({
    imageUrl,
    width = "auto",
    height = "auto",
    className = "",
    minZoom = 0.5,
    maxZoom = 5,
    zoomStep = 0.1,
    showControls = true,
}) => {
    // visibleUrl: what is currently shown to the user
    // pendingUrl: loading silently in the background <img>
    const [visibleUrl, setVisibleUrl] = useState<string>("");
    const [pendingUrl, setPendingUrl] = useState<string>("");
    const [hasFirstLoad, setHasFirstLoad] = useState(false);
    const [hasError, setHasError] = useState(false);

    const [scale, setScale] = useState(1);
    const [translateX, setTranslateX] = useState(0);
    const [translateY, setTranslateY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePosition, setLastMousePosition] = useState({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);

    // Each new imageUrl goes into the hidden <img> to preload.
    // The visible <img> only updates once onLoad fires.
    useEffect(() => {
        if (!imageUrl) return;
        setHasError(false);
        setPendingUrl(imageUrl);
    }, [imageUrl]);

    // Called when the hidden img finishes loading — swap it to visible
    const handlePendingLoad = useCallback(() => {
        setVisibleUrl((prev) => {
            // Revoke the previous object URL after the browser has painted
            if (prev) requestAnimationFrame(() => URL.revokeObjectURL(prev));
            return pendingUrl;
        });
        setHasFirstLoad(true);
    }, [pendingUrl]);

    const handleError = useCallback(() => {
        setHasError(true);
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
            if (next <= 1) { setTranslateX(0); setTranslateY(0); }
            return next;
        });
    }, [minZoom, zoomStep]);

    const resetZoom = useCallback(() => {
        setScale(1);
        setTranslateX(0);
        setTranslateY(0);
    }, []);

    if (hasError) {
        return (
            <FrameContainer className={className}>
                <Camera size={100} color="#595858" />
            </FrameContainer>
        );
    }

    return (
        <FrameContainer
            className={className}
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {!hasFirstLoad && <Camera size={100} color="#595858" />}

            {/* Visible image — only updated after the pending one has loaded */}
            {visibleUrl && (
                <ZoomContainer scale={scale} translateX={translateX} translateY={translateY}>
                    <FramedImage
                        src={visibleUrl}
                        alt="Image Frame"
                        width={width}
                        height={height}
                    />
                </ZoomContainer>
            )}

            {/* Hidden preloader — decodes the next frame before showing it */}
            {pendingUrl && pendingUrl !== visibleUrl && (
                <HiddenImg
                    src={pendingUrl}
                    onLoad={handlePendingLoad}
                    onError={handleError}
                />
            )}

            {showControls && hasFirstLoad && (
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