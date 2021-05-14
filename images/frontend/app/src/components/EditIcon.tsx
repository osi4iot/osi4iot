import { FC, SyntheticEvent } from "react";
import { FaEdit } from "react-icons/fa";
import styled from "styled-components";

const FaEditStyled = styled(FaEdit)`
    font-size: 18px;
    color: white;
`;

const IconContainer = styled.div`
	display: flex;
	justify-content: center;
	align-items: center;

    &:hover {
        cursor: pointer;

		& ${FaEditStyled} {
			color: #3274d9;
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