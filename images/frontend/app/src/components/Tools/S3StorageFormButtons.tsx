import { useWindowWidth } from "@react-hook/window-size";
import { FC, SyntheticEvent } from "react";
import styled from "styled-components";

interface ButtonsContainerProps {
    isMobile: boolean;
}

const ButtonsContainer = styled.div<ButtonsContainerProps>`
    display: flex;
    flex-direction: row;
    justify-content: center;
    padding: 0 10px;
	align-items: center;
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
    width: 300px;

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
    isSubmitting: boolean;
    isWideForm?: boolean;
}

const S3StorageFormButtons: FC<FormButtonsProps> = ({ onCancel, isSubmitting, isWideForm = false }) => {
    const windowWidth = useWindowWidth();
	const isMobile = windowWidth < 768;
    return (
        <ButtonsContainer  isMobile={isMobile}>
            <Button type='submit' disabled={isSubmitting} >
                Download
            </Button>
        </ButtonsContainer>
    )
}

export default S3StorageFormButtons;