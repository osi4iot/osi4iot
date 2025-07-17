import type { ChangeEventHandler, FC } from "react";
import styled from "styled-components";

const SliderContainer = styled.div`
    margin: 8px 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 8px;
    background-color: rgba(255, 255, 255, 0.02);
    border-radius: 6px;
    border: 1px solid rgba(50, 116, 217, 0.2);
    transition: all 0.2s ease;
    box-sizing: border-box;
    
    &:hover {
        border-color: rgba(50, 116, 217, 0.4);
        background-color: rgba(255, 255, 255, 0.04);
    }
`;

const LabelContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    width: 100%;
`;

const SliderInfo = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    margin-right: 8px;
    min-width: 0; /* Permite que el texto se trunce si es necesario */
`;

const SliderLabel = styled.div`
    font-size: 12px;
    font-weight: 500;
    color: #e0e0e0;
    margin-bottom: 2px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const SliderValue = styled.div`
    font-size: 13px;
    font-weight: 600;
    color: #3274d9;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const ControlsContainer = styled.div`
    display: flex;
    flex-direction: row;
    gap: 4px;
    align-items: center;
    flex-shrink: 0;
`;

const ControlElement = styled.button`
    width: 24px;
    height: 24px;
    font-size: 14px;
    font-weight: 600;
    background-color: #2a2d33;
    display: flex;
    justify-content: center;
    align-items: center;
    color: #e0e0e0;
    outline: none;
    border: 1px solid #3a3d43;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;

    &:hover {
        background-color: #3274d9;
        border-color: #3274d9;
        color: white;
        transform: translateY(-1px);
    }

    &:active {
        transform: translateY(0);
        background-color: #2461c0;
    }
    
    &:disabled {
        background-color: #1a1d23;
        border-color: #2a2d33;
        color: #666;
        cursor: not-allowed;
        transform: none;
    }
`;

const SliderTrackContainer = styled.div`
    position: relative;
    width: 100%;
    // margin-top: 4px;
`;

const RangeInfo = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    // margin-top: 6px;
    font-size: 10px;
    color: #888;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
`;

const RangeLabel = styled.span`
    padding: 1px 4px;
    background-color: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
    font-weight: 500;
`;

const StyledInputRange = styled.input`
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    background: transparent;
    outline: none;
    border-radius: 3px;
    cursor: pointer;
    position: relative;

    &::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        top: -8px;
        width: 20px;
        height: 20px;
        background: #3274d9;
        border-radius: 50%;
        border: 2px solid #1a1d23;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 1px 4px rgba(50, 116, 217, 0.3);
        position: relative;
        z-index: 2;
    }

    &::-webkit-slider-thumb:hover {
        background: #2461c0;
        transform: scale(1.1);
        box-shadow: 0 2px 8px rgba(50, 116, 217, 0.5);
    }

    &::-webkit-slider-thumb:active {
        transform: scale(1.05);
        box-shadow: 0 1px 4px rgba(50, 116, 217, 0.6);
    }

    &::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #3274d9;
        border-radius: 50%;
        border: 2px solid #1a1d23;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 1px 4px rgba(50, 116, 217, 0.3);
    }

    &::-moz-range-thumb:hover {
        background: #2461c0;
        transform: scale(1.1);
        box-shadow: 0 2px 8px rgba(50, 116, 217, 0.5);
    }

    &::-webkit-slider-runnable-track {
        height: 6px;
        border-radius: 3px;
        background: ${props => {
            const value = parseFloat(props.value as string);
            const min = parseFloat(props.min as string);
            const max = parseFloat(props.max as string);
            const ratio = ((value - min) * 100 / (max - min)).toFixed(2);
            return `linear-gradient(to right, #3274d9 0%, #3274d9 ${ratio}%, #2a2d33 ${ratio}%, #2a2d33 100%)`;
        }};
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    &::-moz-range-track {
        height: 6px;
        border-radius: 3px;
        background: ${props => {
            const value = parseFloat(props.value as string);
            const min = parseFloat(props.min as string);
            const max = parseFloat(props.max as string);
            const ratio = ((value - min) * 100 / (max - min)).toFixed(2);
            return `linear-gradient(to right, #3274d9 0%, #3274d9 ${ratio}%, #2a2d33 ${ratio}%, #2a2d33 100%)`;
        }};
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
`;

interface ModalSliderProps {
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    setValue: (value: number) => void;
}

const numberFormat = (value: number) => {
    const roundValue = Math.round(value * 1.0e15) / 1.0e15;
    const intPart = Math.round(roundValue);
    const lengthIntPart = intPart.toString().length;
    let outputValue = roundValue.toString();
    
    if (lengthIntPart > 6) outputValue = roundValue.toExponential(3);
    if (roundValue.toString().length >= 14) outputValue = roundValue.toExponential(3);
    
    return outputValue;
};

const ModalSlider: FC<ModalSliderProps> = ({
    label,
    min,
    max,
    step,
    value,
    setValue
}) => {
    const handleOnChange: ChangeEventHandler<HTMLInputElement> = (event) => 
        setValue(parseFloat(event.target.value));

    const handleDecrement = () => {
        let newValue = value - step;
        if (newValue < min) newValue = min;
        setValue(newValue);
    };

    const handleIncrement = () => {
        let newValue = value + step;
        if (newValue > max) newValue = max;
        setValue(newValue);
    };

    const isAtMin = value <= min;
    const isAtMax = value >= max;

    // Extraer solo el nombre del parámetro sin las unidades para el label
    const parameterName = label.split('(')[0].trim();
    const units = label.match(/\(([^)]+)\)/)?.[1] || '';

    return (
        <SliderContainer>
            <LabelContainer>
                <SliderInfo>
                    <SliderLabel>{parameterName}</SliderLabel>
                    <SliderValue>
                        {numberFormat(value)} {units && `${units}`}
                    </SliderValue>
                </SliderInfo>
                <ControlsContainer>
                    <ControlElement 
                        onClick={handleDecrement}
                        disabled={isAtMin}
                        title="Disminuir valor"
                    >
                        −
                    </ControlElement>
                    <ControlElement 
                        onClick={handleIncrement}
                        disabled={isAtMax}
                        title="Aumentar valor"
                    >
                        +
                    </ControlElement>
                </ControlsContainer>
            </LabelContainer>
            
            <SliderTrackContainer>
                <StyledInputRange
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={handleOnChange}
                />
            </SliderTrackContainer>
            
            <RangeInfo>
                <RangeLabel>Min: {numberFormat(min)}</RangeLabel>
                <RangeLabel>Max: {numberFormat(max)}</RangeLabel>
            </RangeInfo>
        </SliderContainer>
    );
};

export default ModalSlider;