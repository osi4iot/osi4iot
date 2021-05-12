import { FC, SyntheticEvent } from "react";
import { FaEdit } from "react-icons/fa";
import styled from "styled-components";

const FaEditStyled = styled(FaEdit)`
    font-size: 18px;
    color: #62f700;
`;

const IconContainer = styled.div`
	display: flex;
	justify-content: center;
	align-items: center;

    &:hover {
        cursor: pointer;

		& ${FaEditStyled} {
			color: white;
		}
    }
`;

interface EditIconProps {
	id: number;
}

const EditIcon: FC<EditIconProps> = ({ id }) => {

    const handleClick = (e: SyntheticEvent) => {
        console.log("Click= ", id)
    };

    return (
        <IconContainer onClick={handleClick} >
            <FaEditStyled />
        </IconContainer>
    );
};

export default EditIcon;