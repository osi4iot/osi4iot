import { FC, SyntheticEvent } from "react";
import { FaTrashAlt } from "react-icons/fa";
import styled from "styled-components";


const FaTrashAltStyled = styled(FaTrashAlt)`
    font-size: 17px;
    color: white;
 `;


interface FaTrashAltProps {
    rowIndex: number
}

const FaTrashAltWrapper = styled.div.withConfig({
	shouldForwardProp: (prop) => prop !== 'rowIndex'
  })<FaTrashAltProps>`
    ${FaTrashAltStyled} {
        background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};
    }
`;


const IconContainer = styled.div.withConfig({
	shouldForwardProp: (prop) => prop !== 'rowIndex'
  })<FaTrashAltProps>`
	display: flex;
	justify-content: center;
	align-items: center;
    background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};

    &:hover {
        cursor: pointer;

		& ${FaTrashAltStyled} {
			color: #e02f44;
		}
    }
`;

interface DeleteIconProps {
    action: any;
    rowIndex: number;
}

const DeleteIcon: FC<DeleteIconProps> = ({ action, rowIndex }) => {

    const handleClick = (e: SyntheticEvent) => {
        action();
    };

    return (
        <IconContainer onClick={handleClick} rowIndex={rowIndex} >
            <FaTrashAltWrapper rowIndex={rowIndex}>
                <FaTrashAltStyled />
            </FaTrashAltWrapper>
        </IconContainer>
    );
};

export default DeleteIcon;