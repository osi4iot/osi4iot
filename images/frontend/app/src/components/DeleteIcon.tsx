import { FC, SyntheticEvent } from "react";
import { FaTrashAlt } from "react-icons/fa";
import styled from "styled-components";

const FaTrashAltStyled = styled(FaTrashAlt)`
    font-size: 17px;
    color: white;
`;

const IconContainer = styled.div`
	display: flex;
	justify-content: center;
	align-items: center;

    &:hover {
        cursor: pointer;

		& ${FaTrashAltStyled} {
			color: #e02f44;
		}
    }
`;

interface EditIconProps {
	id: number;
}

const DeleteIcon: FC<EditIconProps> = ({ id }) => {

    const handleClick = (e: SyntheticEvent) => {
        console.log("Click= ", id)
    };

    return (
        <IconContainer onClick={handleClick} >
            <FaTrashAltStyled />
        </IconContainer>
    );
};

export default DeleteIcon;