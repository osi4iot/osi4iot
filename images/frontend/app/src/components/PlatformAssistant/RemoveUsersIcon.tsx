import { FC, SyntheticEvent } from "react";
import { FaUserSlash } from "react-icons/fa";
import styled from "styled-components";

const FaUserSlashStyled = styled(FaUserSlash)`
    font-size: 20px;
    color: white;
`;

interface FaUserSlashProps {
    rowIndex: number
}

const FaUserSlashWrapper = styled.div<FaUserSlashProps>`
    ${FaUserSlashStyled} {
        background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};
    }
`;

const IconContainer = styled.div<FaUserSlashProps>`
	display: flex;
	justify-content: center;
	align-items: center;
    background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};

    &:hover {
        cursor: pointer;

		& ${FaUserSlashStyled} {
			color: #3274d9;
		}
    }
`;

interface RemoveUsersIconProps {
    id: number;
    rowIndex: number
}

const RemoveUsersIcon: FC<RemoveUsersIconProps> = ({ id, rowIndex }) => {

    const handleClick = (e: SyntheticEvent) => {
        console.log("Click= ", id)
    };

    return (
        <IconContainer onClick={handleClick} rowIndex={rowIndex}>
            <FaUserSlashWrapper rowIndex={rowIndex}>
                <FaUserSlashStyled />
            </FaUserSlashWrapper>
        </IconContainer>
    );
};

export default RemoveUsersIcon;