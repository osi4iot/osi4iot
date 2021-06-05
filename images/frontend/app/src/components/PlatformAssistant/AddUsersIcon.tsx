import { FC } from "react";
import { FaUsers } from "react-icons/fa";
import styled from "styled-components";

const FaUsersStyled = styled(FaUsers)`
    font-size: 20px;
    color: white;
`;

interface FaUsersProps {
    rowIndex: number
}

const FaUsersWrapper = styled.div<FaUsersProps>`
    ${FaUsersStyled} {
        background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};
    }
`;

const IconContainer = styled.div<FaUsersProps>`
	display: flex;
	justify-content: center;
	align-items: center;
    background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};

    &:hover {
        cursor: pointer;

		& ${FaUsersStyled} {
			color: #3274d9;
		}
    }
`;

interface AddUsersIconProps {
    rowIndex: number
}

const AddUsersIcon: FC<AddUsersIconProps> = ({ rowIndex }) => {

    return (
        <IconContainer rowIndex={rowIndex}>
            <FaUsersWrapper rowIndex={rowIndex}>
                <FaUsersStyled />
            </FaUsersWrapper>
        </IconContainer>
    );
};

export default AddUsersIcon;