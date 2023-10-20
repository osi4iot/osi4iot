import { ChangeEventHandler, FC } from "react";
import styled from "styled-components";

const SliderContainer = styled.div`
    margin: 20px 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;
`;

const LabelContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;
    margin: 5px 3px;
    width: 100%;
    color: white;
`;

interface SliderLabelProps {
    label: string;
    value: number;
}

const SliderLabel = styled.div<SliderLabelProps>`
    display: flex;
    flex-direction: ${(props) => ((props.label.length + numberFormat(props.value).length) < 28 ? "row" : "column")};
    justify-content: flex-start;
    align-items: flex-start;
    width: calc(100% - 65px);
    font-size: 14px;
    font-family: Arial, Helvetica, sans-serif;
`;

const SliderLabelElement = styled.div`
    margin-left: 5px;
`;

const ControlsContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    width: 65px;
`;

const ControlElement = styled.button`
    margin: 0 2px;
    width: 25px;
    height: 25px;
    font-size: 22px;
    background-color: #4d4c4c;
    display: flex;
    justify-content: center;
    align-items: center;
    color: white;
    outline: none;
    border: 1px solid #6e6d6d;
    box-shadow: 0 5px #3d3d3d;

    &:hover {
        cursor: pointer;
        background-color: #6e6d6d;
    }

    &:active {
		background-color: #6e6d6d;
		box-shadow: 0 2px #3d3d3d;
		transform: translateY(4px);
	}
`;



const StyledInputRange = styled.input`
  -webkit-appearance: none;
  opacity: 0.9;
  width: 100%;
  margin: 5px 0;
  background-color: #0c0d0f;

  &:hover {
    opacity: 1;
  }


  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 26px;
    height: 26px;
    background: #3274d9;
    border-radius: 13px;
    border: 1px solid #212121;
    cursor: pointer;
    margin-top: -8px;
  }

  &::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: #3274d9;
    border-radius: 10px;
    cursor: pointer;
  }

  &::-webkit-slider-runnable-track {
    height: 10px;
    width: 200px;
    border-radius: 5px;
    background: #d3d3d3;
    outline: none;
    background: ${props => {
        const value = parseFloat(props.value as string);
        const min = parseFloat(props.min as string);
        const max = parseFloat(props.max as string);
        const ratio = ((value - min) * 100 / (max - min)).toFixed(2);
        return `linear-gradient(to right, #3274d9 0%, #3274d9 ${ratio}%, #4d4c4c ${ratio}%, #4d4c4c 100%)`;
    }};
 }

  &::-moz-range-track {
    height: 10px;
    border-radius: 5px;
    outline: none;
    background: ${props => {
        const value = parseFloat(props.value as string);
        const min = parseFloat(props.min as string);
        const max = parseFloat(props.max as string);
        const ratio = ((value - min) * 100 / (max - min)).toFixed(2);
        return `linear-gradient(to right, #3274d9 0%, #3274d9 ${ratio}%, #4d4c4c ${ratio}%, #4d4c4c 100%)`;
    }};
  }
  
`;


interface SliderProps {
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
    const lenghtIntPart = intPart.toString().length;
    let outputValue = roundValue.toString();
    if (lenghtIntPart > 6) outputValue = roundValue.toExponential(8);
    if (roundValue.toString().length >= 14) outputValue = roundValue.toExponential(8);
    return outputValue;
}

const Slider: FC<SliderProps> = ({
    label,
    min,
    max,
    step,
    value,
    setValue
}) => {

    const handleOnChange: ChangeEventHandler<HTMLInputElement> = (event) => setValue(parseFloat(event.target.value));

    const handleDecremet = () => {
        let newValue = value - step;
        if (newValue < min) newValue = min;
        setValue(newValue);
    }

    const handleIncremet = () => {
        let newValue = value + step;
        if (newValue > max) newValue = max;
        setValue(newValue);
    }

    return (
        <SliderContainer>
            <LabelContainer>
                <SliderLabel label={label} value={value}>
                    <SliderLabelElement>{label}:</SliderLabelElement>
                    <SliderLabelElement>{numberFormat(value)}</SliderLabelElement>
                </SliderLabel>
                <ControlsContainer>
                    <ControlElement onClick={handleDecremet}>-</ControlElement>
                    <ControlElement onClick={handleIncremet}>+</ControlElement>
                </ControlsContainer>
            </LabelContainer>
            <StyledInputRange
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={handleOnChange}
            />
        </SliderContainer>

    )
};

export default Slider;