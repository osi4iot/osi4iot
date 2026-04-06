import { FC, SyntheticEvent } from "react";
import { FaTrashAlt } from "react-icons/fa";
import styled from "styled-components";
import { toast } from "react-toastify";

const FaTrashAltStyled = styled(FaTrashAlt as any)`
    font-size: 17px;
    color: white;
 `;


interface FaTrashAltProps {
    rowIndex: number
}

const FaTrashAltWrapper = styled.div<FaTrashAltProps>`
    ${FaTrashAltStyled} {
        background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};
    }
`;


const IconContainer = styled.div<FaTrashAltProps>`
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
    undeletable?: boolean;
    undeletableMessage?: string;
}

const DeleteIcon: FC<DeleteIconProps> = ({ action, rowIndex, undeletable, undeletableMessage }) => {

    const handleClick = (e: SyntheticEvent) => {
        if (undeletable) {
            const message = undeletableMessage || "This element cannot be deleted.";
            toast.error(message);
            return;
        }

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