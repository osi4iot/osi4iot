import { useWindowWidth } from "@react-hook/window-size";
import { FC, SyntheticEvent } from "react";
import styled from "styled-components";

interface ButtonsContainerProps {
    isMobile: boolean;
}

const ButtonsContainer = styled.div<ButtonsContainerProps>`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 0 10px;
	align-items: center;
    background-color: #0c0d0f;
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

interface FormButtonsProps {
    onCancel: (e: SyntheticEvent) => void;
    isValid: boolean;
    isSensorReading: boolean;
}

const MobileAccelerationFormButtons: FC<FormButtonsProps> = ({ onCancel, isValid, isSensorReading }) => {
    const windowWidth = useWindowWidth();
	const isMobile = windowWidth < 768;
    return (
        <ButtonsContainer  isMobile={isMobile}>
            <Button  onClick={onCancel}>
                Cancel
            </Button>
            <Button type='submit' disabled={!isValid || isSensorReading} >
                {(isValid && isSensorReading) ? "READING" : "READ"}
            </Button>
        </ButtonsContainer>
    )
}

export default MobileAccelerationFormButtons;