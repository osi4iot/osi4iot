import React, { useEffect, useState, useRef, FC, SyntheticEvent } from "react";
import styled from "styled-components";
import ModalSlider from "./ModalSlider";

const ModalContainer = styled.div<{ isDragging: boolean }>`
    position: fixed;
    background-color: #1a1d23;
    border: 2px solid #3274d9;
    border-radius: 15px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    user-select: none;
    cursor: ${(props) => (props.isDragging ? "grabbing" : "default")};
    z-index: 1001;
    max-height: 90vh;
    width: 300px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;

const ModalHeader = styled.div`
    background-color: #3274d9;
    padding: 10px 15px;
    border-top-left-radius: 13px;
    border-top-right-radius: 13px;
    cursor: grab;
    display: flex;
    justify-content: space-between;
    align-items: center;

    &:active {
        cursor: grabbing;
    }
`;

const Title = styled.h2`
    font-size: 20px;
    margin: 0;
    font-weight: 400;
    color: white;
`;

const CloseButton = styled.button`
    background: none;
    border: none;
    color: white;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;

    &:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }
`;

const FormContainer = styled.div`
    position: relative;
    display: flex;
    flex-direction: column;
    color: white;
    padding: 10px 12px;
    flex: 1;
    overflow: hidden;
`;

const ParametersContainer = styled.div`
    flex: 1;
    width: 100%;
    padding: 0px;
    overflow-y: auto;
    overflow-x: hidden;
    max-height: 300px;
    margin-bottom: 10px;

    /* width */
    ::-webkit-scrollbar {
        width: 8px;
    }

    /* Track */
    ::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }

    /* Handle */
    ::-webkit-scrollbar-thumb {
        background: #2c3235;
        border-radius: 5px;
    }

    /* Handle on hover */
    ::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }

    div:first-child {
        margin-top: 0;
    }

    div:last-child {
        margin-bottom: 3px;
    }
`;

const ButtonsContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;
    padding: 10px;
    align-items: center;
    border-bottom-left-radius: 13px;
    border-bottom-right-radius: 13px;
    flex-shrink: 0;
`;

const Button = styled.button`
    background-color: #3274d9;
    padding: 8px 20px;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 10px;
    outline: none;
    cursor: pointer;
    box-shadow: 0 5px #173b70;
    font-size: 15px;
    width: 100px;

    &:hover {
        background-color: #2461c0;
    }

    &:active {
        background-color: #2461c0;
        box-shadow: 0 2px #173b70;
        transform: translateY(4px);
    }

    &:disabled {
        cursor: pointer;
        background-color: #3c3d40;
        box-shadow: 0 6px #19191a;
        color: white;

        &:hover,
        &:focus {
            cursor: not-allowed;
        }
    }
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

interface IDTSParam {
    path: string;
    units?: string;
    label: string;
    minValue: number;
    maxValue: number;
    defaultValue?: number;
    step: number;
}

interface DigitalTwinSimulatorModalProps {
    digitalTwinSimulatorFormat: Record<string, DigitalTwinSimulationParameter>;
    setShowDigitalTwinSimulator: React.Dispatch<React.SetStateAction<boolean>>;
    updateDigitalTwinSimulatorState: (digitalTwinSimulatorState: Record<string, number>) => void;
    setDigitalTwinSimulatorSendData: (value: React.SetStateAction<boolean>) => void;
}

const DigitalTwinSimulatorModal: FC<DigitalTwinSimulatorModalProps> = ({
    digitalTwinSimulatorFormat,
    setShowDigitalTwinSimulator,
    updateDigitalTwinSimulatorState,
    setDigitalTwinSimulatorSendData,
}) => {
    const [digitalTwinSimulatorParams, setDigitalTwinSimulatorParams] = useState<IDTSParam[]>([]);
    const [paramValues, setParamValues] = useState<Record<string, number>>({});
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const modalRef = useRef<HTMLDivElement>(null);

    const setParamValue = (path: string, value: number) => {
        setParamValues((prevValues: Record<string, number>) => {
            const newValues = { ...prevValues };
            newValues[path] = value;
            return newValues;
        });
    };

    useEffect(() => {
        if (Object.keys(paramValues).length > 0) {
            updateDigitalTwinSimulatorState(paramValues);
        }
    }, [paramValues, updateDigitalTwinSimulatorState]);

    // Función para centrar el modal inicialmente
    const centerModal = () => {
        if (modalRef.current) {
            const rect = modalRef.current.getBoundingClientRect();
            const centerX = (window.innerWidth - rect.width) / 2;
            const centerY = (window.innerHeight - rect.height) / 2;
            setPosition({ x: centerX, y: centerY });
        }
    };

    // Manejo del inicio del arrastre
    const handleMouseDown = (e: React.MouseEvent) => {
        if (modalRef.current) {
            setIsDragging(true);
            const rect = modalRef.current.getBoundingClientRect();
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        }
    };

    // Manejo del movimiento del mouse
    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging && modalRef.current) {
            const newX = e.clientX - dragOffset.x;
            const newY = e.clientY - dragOffset.y;

            // Limitar el movimiento dentro de los límites de la ventana
            const rect = modalRef.current.getBoundingClientRect();
            const maxX = window.innerWidth - rect.width;
            const maxY = window.innerHeight - rect.height;

            setPosition({
                x: Math.max(0, Math.min(newX, maxX)),
                y: Math.max(0, Math.min(newY, maxY)),
            });
        }
    };

    // Manejo del fin del arrastre
    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        const digitalTwinSimulatorParamNames = Object.keys(digitalTwinSimulatorFormat);
        const digitalTwinSimulatorParams: IDTSParam[] = [];
        const initialParamValues: Record<string, number> = {};

        digitalTwinSimulatorParamNames.forEach((paramPath) => {
            const label = `${digitalTwinSimulatorFormat[paramPath].label} (${digitalTwinSimulatorFormat[paramPath].units}) `;
            const digitalTwinSimulatorParam = {
                path: paramPath,
                label,
                minValue: digitalTwinSimulatorFormat[paramPath].minValue,
                maxValue: digitalTwinSimulatorFormat[paramPath].maxValue,
                step: digitalTwinSimulatorFormat[paramPath].step,
            };
            digitalTwinSimulatorParams.push(digitalTwinSimulatorParam);
            initialParamValues[paramPath] = digitalTwinSimulatorFormat[paramPath].defaultValue as number;
        });

        setDigitalTwinSimulatorParams(digitalTwinSimulatorParams);
        setParamValues(initialParamValues);

        // Centrar el modal después de que se monte
        setTimeout(centerModal, 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Efecto para manejar los eventos del mouse globalmente
    useEffect(() => {
        if (isDragging) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
            return () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDragging, dragOffset]);

    // Efecto para manejar el redimensionamiento de la ventana
    useEffect(() => {
        const handleResize = () => {
            if (modalRef.current) {
                const rect = modalRef.current.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width;
                const maxY = window.innerHeight - rect.height;

                setPosition((prev) => ({
                    x: Math.max(0, Math.min(prev.x, maxX)),
                    y: Math.max(0, Math.min(prev.y, maxY)),
                }));
            }
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const onCancel = (e: SyntheticEvent) => {
        e.preventDefault();
        setShowDigitalTwinSimulator(false);
        setDigitalTwinSimulatorSendData(false);
    };

    return (
        <ModalContainer
            ref={modalRef}
            isDragging={isDragging}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
            }}
        >
            <ModalHeader onMouseDown={handleMouseDown}>
                <Title>Digital twin simulator</Title>
                <CloseButton onClick={onCancel}>×</CloseButton>
            </ModalHeader>

            <FormContainer>
                <ParametersContainer>
                    {digitalTwinSimulatorParams.length &&
                        digitalTwinSimulatorParams.map((param) => {
                            return (
                                <ModalSlider
                                    key={param.path}
                                    label={param.label}
                                    min={param.minValue}
                                    max={param.maxValue}
                                    step={param.step}
                                    value={paramValues[param.path]}
                                    setValue={(value: number) => setParamValue(param.path, value)}
                                />
                            );
                        })}
                </ParametersContainer>

                <ButtonsContainer>
                    <Button onClick={onCancel}>Cancel</Button>
                </ButtonsContainer>
            </FormContainer>
        </ModalContainer>
    );
};

export default DigitalTwinSimulatorModal;
