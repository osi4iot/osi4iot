import { FC, SyntheticEvent } from "react";
import { FaExchangeAlt } from "react-icons/fa";
import styled from "styled-components";

const ExChangeStyled = styled(FaExchangeAlt)`
    font-size: 18px;
    color: white;
`;

interface ExChangeProps {
    rowIndex: number
}

const ExChangeWrapper = styled.div.withConfig({
	shouldForwardProp: (prop) => prop !== 'rowIndex'
  })<ExChangeProps>`
    ${ExChangeStyled} {
        background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};
    }
`;

const IconContainer = styled.div.withConfig({
	shouldForwardProp: (prop) => prop !== 'rowIndex'
  })<ExChangeProps>`
	display: flex;
	justify-content: center;
	align-items: center;
    background-color:${(props) => (props.rowIndex % 2 === 0 ? '#0c0d0f' : '#202226')};

    &:hover {
        cursor: pointer;

		& ${ExChangeStyled} {
			color: #3274d9;
		}
    }
`;

interface ExChangeIconProps {
    action: any;
    rowIndex: number
}

const ExChangeIcon: FC<ExChangeIconProps> = ({ action, rowIndex }) => {

    const handleClick = (e: SyntheticEvent) => {
        action();
    };

    return (
        <IconContainer onClick={handleClick} rowIndex={rowIndex}>
            <ExChangeWrapper rowIndex={rowIndex}>
                <ExChangeStyled />
            </ExChangeWrapper>
        </IconContainer>
    );
};

export default ExChangeIcon;