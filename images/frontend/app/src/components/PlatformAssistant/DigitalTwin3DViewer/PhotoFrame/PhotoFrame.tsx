import React, { useState, useRef, useCallback, useEffect } from "react";
import styled from "styled-components";
import { Camera } from "lucide-react";

// Container principal del marco con overflow hidden para el zoom
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

// Container para la imagen que permite el zoom y pan
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
`;

// Imagen con marco
interface FramedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    isLoaded: boolean;
}

const FramedImage = styled.img<FramedImageProps>`
    border: 8px solid #868585ff;
    border-radius: 2px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2),
        inset 0 0 0 1px rgba(0, 0, 0, 0.1);
    transition: opacity 0.3s ease;
    opacity: ${(props) => (props.isLoaded ? 1 : 0)};
    ${(props) => !props.isLoaded && `position: absolute;`}
    user-select: none;
    pointer-events: none;
`;

// Controles de zoom
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

// Componente principal
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
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [scale, setScale] = useState(1);
    const [translateX, setTranslateX] = useState(0);
    const [translateY, setTranslateY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePosition, setLastMousePosition] = useState({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setIsLoaded(false);
        setHasError(false);
        setScale(1);
        setTranslateX(0);
        setTranslateY(0);
        setIsDragging(false);
    }, [imageUrl]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheelEvent = (e: WheelEvent) => {
            e.preventDefault();

            const delta = e.deltaY;
            const zoomFactor = delta > 0 ? 1 - zoomStep : 1 + zoomStep;
            const newScale = Math.min(Math.max(scale * zoomFactor, minZoom), maxZoom);

            if (newScale !== scale) {
                // Calcular el punto de zoom basado en la posición del cursor
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left - rect.width / 2;
                const mouseY = e.clientY - rect.top - rect.height / 2;

                // Ajustar la traducción para mantener el punto bajo el cursor
                const scaleDiff = newScale / scale - 1;
                const newTranslateX = translateX - (mouseX * scaleDiff) / scale;
                const newTranslateY = translateY - (mouseY * scaleDiff) / scale;

                setScale(newScale);
                setTranslateX(newTranslateX);
                setTranslateY(newTranslateY);
            }
        };

        container.addEventListener("wheel", handleWheelEvent, { passive: false });

        return () => {
            container.removeEventListener("wheel", handleWheelEvent);
        };
    }, [scale, translateX, translateY, minZoom, maxZoom, zoomStep]);

    const handleImageLoad = () => {
        setIsLoaded(true);
        setHasError(false);
    };

    const handleImageError = () => {
        setHasError(true);
        setIsLoaded(false);
    };

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

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const zoomIn = useCallback(() => {
        const newScale = Math.min(scale * (1 + zoomStep * 2), maxZoom);
        setScale(newScale);
    }, [scale, maxZoom, zoomStep]);

    const zoomOut = useCallback(() => {
        const newScale = Math.max(scale * (1 - zoomStep * 2), minZoom);
        setScale(newScale);

        // Reset position if zoom is back to 1 or less
        if (newScale <= 1) {
            setTranslateX(0);
            setTranslateY(0);
        }
    }, [scale, minZoom, zoomStep]);

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
            {!isLoaded && (
                <Camera size={100} color="#595858" />
            )}

            <ZoomContainer scale={scale} translateX={translateX} translateY={translateY}>
                <FramedImage
                    src={imageUrl}
                    alt={"Image Frame"}
                    width={width}
                    height={height}
                    isLoaded={isLoaded}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                />
            </ZoomContainer>

            {showControls && isLoaded && (
                <>
                    <ZoomControls>
                        <ZoomIndicator>{Math.round(scale * 100)}%</ZoomIndicator>
                        <ZoomButton onClick={zoomIn} title="Zoom In">
                            +
                        </ZoomButton>
                        <ZoomButton onClick={zoomOut} title="Zoom Out">
                            −
                        </ZoomButton>
                        <ZoomButton onClick={resetZoom} title="Reset Zoom">
                            ⌂
                        </ZoomButton>
                    </ZoomControls>
                </>
            )}
        </FrameContainer>
    );
};
