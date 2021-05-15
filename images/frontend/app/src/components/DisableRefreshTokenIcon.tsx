import { FC, SyntheticEvent } from "react";
import { FaCalendarTimes } from "react-icons/fa";
import styled from "styled-components";


const DisableRefreshTokenStyled = styled(FaCalendarTimes)`
    font-size: 18px;
    color: white;
`;

interface DisableRefreshTokenProps {
    rowIndex: number
}

const DisableRefreshTokenWrapper = styled.div<DisableRefreshTokenProps>`
    ${DisableRefreshTokenStyled} {
        background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};
    }
`;

const IconContainer = styled.div<DisableRefreshTokenProps>`
	display: flex;
	justify-content: center;
	align-items: center;
    background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};

    &:hover {
        cursor: pointer;

		& ${DisableRefreshTokenStyled} {
			color: #3274d9;
		}
    }
`;

interface DisableRefreshTokenIconProps {
    id: number;
    rowIndex: number
}

const DisableRefreshTokenIcon: FC<DisableRefreshTokenIconProps> = ({ id, rowIndex }) => {

    const handleClick = (e: SyntheticEvent) => {
        console.log("Click= ", id)
    };

    return (
        <IconContainer onClick={handleClick} rowIndex={rowIndex}>
            <DisableRefreshTokenWrapper rowIndex={rowIndex}>
                <DisableRefreshTokenStyled />
            </DisableRefreshTokenWrapper>
        </IconContainer>
    );
};

export default DisableRefreshTokenIcon;