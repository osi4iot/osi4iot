// Ventana flotante del simulador del gemelo digital, con el mismo diseño que el inspector del visor.
// Se arrastra por la cabecera; al cerrarla se deja de enviar datos simulados.
import React, { useEffect, useState, useRef, FC, KeyboardEvent as ReactKeyboardEvent } from "react";
import styled, { keyframes } from "styled-components";
import { GripVertical, RotateCcw, Square, X } from "lucide-react";
import { SliderField, focusRing, inspectorColors as c } from "../Inspector/controls";

const ModalContainer = styled.div<{ $dragging: boolean }>`
    position: fixed;
    width: 340px;
    max-width: calc(100vw - 24px);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background-color: rgba(20, 22, 26, 0.96);
    backdrop-filter: blur(8px);
    border: 1px solid ${c.border};
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    color: ${c.text};
    font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
    user-select: none;
    z-index: 1001;
    overflow: hidden;
    cursor: ${({ $dragging }) => ($dragging ? "grabbing" : "default")};

    input {
        user-select: text;
    }
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    height: 52px;
    padding: 0 8px 0 10px;
    border-bottom: 1px solid ${c.divider};
    cursor: grab;
    touch-action: none;

    &:active {
        cursor: grabbing;
    }
`;

const Grip = styled(GripVertical)`
    width: 16px;
    height: 16px;
    flex: none;
    color: ${c.textDisabled};
`;

const TitleBlock = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
`;

const Title = styled.h2`
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: ${c.text};
`;

const pulse = keyframes`
    50% { opacity: 0.35; }
`;

const LiveStatus = styled.span`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: ${c.okText};

    &::before {
        content: "";
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: ${c.ok};
        animation: ${pulse} 1.4s ease-in-out infinite;
    }
`;

const IconButton = styled.button`
    width: 32px;
    height: 32px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: ${c.textMuted};
    cursor: pointer;
    ${focusRing}

    &:hover {
        background-color: ${c.hover};
        color: ${c.text};
    }

    svg {
        width: 16px;
        height: 16px;
    }
`;

const Body = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 6px 16px 10px;

    &::-webkit-scrollbar {
        width: 8px;
    }
    &::-webkit-scrollbar-thumb {
        background: ${c.track};
        border-radius: 4px;
    }

    & > div + div {
        border-top: 1px solid ${c.divider};
    }
`;

const Footer = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid ${c.divider};
`;

const FooterButton = styled.button<{ $primary?: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid ${({ $primary }) => ($primary ? "transparent" : "rgba(255, 255, 255, 0.14)")};
    background-color: ${({ $primary }) => ($primary ? c.accentStrong : "transparent")};
    color: ${({ $primary }) => ($primary ? "#ffffff" : c.textSecondary)};
    font: 500 13px Roboto, "Helvetica Neue", Arial, sans-serif;
    cursor: pointer;
    ${focusRing}

    &:hover {
        background-color: ${({ $primary }) => ($primary ? c.accentHover : c.hover)};
        color: #ffffff;
    }

    svg {
        width: 14px;
        height: 14px;
    }
`;

const EmptyText = styled.p`
    margin: 12px 0;
    font-size: 13px;
    color: ${c.textMuted};
`;

interface DigitalTwinSimulationParameter {
    minValue: number;
    maxValue: number;
    defaultValue: number;
    step: number;
    label: string;
    units: string;
    topicId: number;
}

export interface IDigitalTwinSimulator {
    id: number;
    orgAcronym: string;
    groupAcronym: string;
    groupId: string;
    assetUid: string;
    assetDescription: string;
    digitalTwinUid: string;
    digitalTwinDescription: string;
    description: string;
    digitalTwinSimulationFormat: Record<string, DigitalTwinSimulationParameter>;
    sensorSimulationTopicId: number;
    mqttTopic: string;
}

interface DigitalTwinSimulatorModalProps {
    digitalTwinSimulatorFormat: Record<string, DigitalTwinSimulationParameter>;
    setShowDigitalTwinSimulator: React.Dispatch<React.SetStateAction<boolean>>;
    updateDigitalTwinSimulatorState: (digitalTwinSimulatorState: Record<string, number>) => void;
    setDigitalTwinSimulatorSendData: (value: React.SetStateAction<boolean>) => void;
}

const defaultValues = (format: Record<string, DigitalTwinSimulationParameter>) => {
    const values: Record<string, number> = {};
    for (const paramName of Object.keys(format ?? {})) values[paramName] = Number(format[paramName].defaultValue);
    return values;
};

const DigitalTwinSimulatorModal: FC<DigitalTwinSimulatorModalProps> = ({
    digitalTwinSimulatorFormat,
    setShowDigitalTwinSimulator,
    updateDigitalTwinSimulatorState,
    setDigitalTwinSimulatorSendData,
}) => {
    const [paramValues, setParamValues] = useState<Record<string, number>>(() => defaultValues(digitalTwinSimulatorFormat));
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const [dragging, setDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const modalRef = useRef<HTMLDivElement>(null);
    const paramNames = Object.keys(digitalTwinSimulatorFormat ?? {});

    useEffect(() => {
        if (Object.keys(paramValues).length > 0) updateDigitalTwinSimulatorState(paramValues);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paramValues]);

    const clampToWindow = (x: number, y: number) => {
        const rect = modalRef.current?.getBoundingClientRect();
        const width = rect?.width ?? 340;
        const height = rect?.height ?? 200;
        return {
            x: Math.max(0, Math.min(x, window.innerWidth - width)),
            y: Math.max(0, Math.min(y, window.innerHeight - height)),
        };
    };

    // Posición inicial: centrada en la ventana
    useEffect(() => {
        const rect = modalRef.current?.getBoundingClientRect();
        if (rect) setPosition(clampToWindow((window.innerWidth - rect.width) / 2, (window.innerHeight - rect.height) / 2));
        const onResize = () => setPosition((prev) => (prev ? clampToWindow(prev.x, prev.y) : prev));
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!dragging) return;
        const onMove = (event: PointerEvent) =>
            setPosition(clampToWindow(event.clientX - dragOffset.current.x, event.clientY - dragOffset.current.y));
        const onUp = () => setDragging(false);
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        return () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dragging]);

    const onHeaderPointerDown = (event: React.PointerEvent) => {
        if ((event.target as HTMLElement).closest("button")) return;
        const rect = modalRef.current?.getBoundingClientRect();
        if (!rect) return;
        dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        setDragging(true);
        event.preventDefault();
    };

    const close = () => {
        setShowDigitalTwinSimulator(false);
        setDigitalTwinSimulatorSendData(false);
    };

    const onKeyDown = (event: ReactKeyboardEvent) => {
        if (event.key === "Escape") close();
    };

    return (
        <ModalContainer
            ref={modalRef}
            role="dialog"
            aria-label="Digital twin simulator"
            $dragging={dragging}
            onKeyDown={onKeyDown}
            style={position ? { left: position.x, top: position.y } : { left: "50%", top: "50%", visibility: "hidden" }}
        >
            <Header onPointerDown={onHeaderPointerDown}>
                <Grip aria-hidden="true" />
                <TitleBlock>
                    <Title>Digital twin simulator</Title>
                    <LiveStatus>Sending simulated data</LiveStatus>
                </TitleBlock>
                <IconButton
                    type="button"
                    aria-label="Reset to default values"
                    title="Reset to default values"
                    onClick={() => setParamValues(defaultValues(digitalTwinSimulatorFormat))}
                >
                    <RotateCcw aria-hidden="true" />
                </IconButton>
                <IconButton type="button" aria-label="Close simulator" title="Close" onClick={close}>
                    <X aria-hidden="true" />
                </IconButton>
            </Header>

            <Body>
                {paramNames.length === 0 && <EmptyText>This digital twin has no simulation parameters.</EmptyText>}
                {paramNames.map((paramName) => {
                    const format = digitalTwinSimulatorFormat[paramName];
                    return (
                        <SliderField
                            key={paramName}
                            id={`dt-simulator-${paramName.replace(/[^A-Za-z0-9_-]/g, "_")}`}
                            label={format.label ?? paramName}
                            unit={format.units}
                            value={paramValues[paramName]}
                            min={Number(format.minValue)}
                            max={Number(format.maxValue)}
                            step={Number(format.step)}
                            inset={false}
                            stepButtons
                            showRange
                            onChange={(value) => setParamValues((prev) => ({ ...prev, [paramName]: value }))}
                        />
                    );
                })}
            </Body>

            <Footer>
                <span style={{ fontSize: 12, color: c.textMuted }}>Drag the header to move</span>
                <FooterButton type="button" onClick={close}>
                    <Square aria-hidden="true" />
                    Stop simulation
                </FooterButton>
            </Footer>
        </ModalContainer>
    );
};

export default DigitalTwinSimulatorModal;
