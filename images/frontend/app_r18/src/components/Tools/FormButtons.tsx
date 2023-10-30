import { useWindowWidth } from "@react-hook/window-size";
import { FC, SyntheticEvent } from "react";
import styled from "styled-components";

interface ButtonsContainerProps {
    isWideForm: boolean;
    isMobile: boolean;
}

const ButtonsContainer = styled.div.withConfig({
	shouldForwardProp: (prop) => prop !== 'isMobile' && prop !== 'isWideForm',
  })<ButtonsContainerProps>`
    margin-top: ${props => props.isMobile  ? '20px' : '30px'};
    display: flex;
    flex-direction: row;
    justify-content: ${props => props.isWideForm  ? 'space-around' : 'space-between'};
	align-items: center;
    background-color: #202226;
`;

interface ButtonsProps {
    isWideForm: boolean;
}

const Button = styled.button.withConfig({
	shouldForwardProp: (prop) => prop !== 'isWideForm',
  })<ButtonsProps>`
	background-color: #3274d9;
	padding: 10px 20px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
    font-size: 16px;
    width: ${props => props.isWideForm  ? '20%' : 'auto'};

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
    isSubmitting: boolean;
    isWideForm?: boolean;
}

const FormButtons: FC<FormButtonsProps> = ({ onCancel, isValid, isSubmitting, isWideForm = false }) => {
    const windowWidth = useWindowWidth();
	const isMobile = windowWidth < 768;
    return (
        <ButtonsContainer isWideForm={isWideForm} isMobile={isMobile}>
            <Button isWideForm={isWideForm} onClick={onCancel}>
                Cancel
            </Button>
            <Button type='submit' disabled={!isValid || isSubmitting} isWideForm={isWideForm}>
                Submit
            </Button>
        </ButtonsContainer>
    )
}

export default FormButtons;