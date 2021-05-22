import { FC } from "react";
import styled from "styled-components";

const AlertContainer = styled.div`
	font-size: 12px;
	font-weight: 500;
	padding: 4px 8px;
	color: #FFFFFF;
	background: #E02F44;
	border-radius: 2px;
	position: relative;
	display: inline-block;
	margin: 4px 0px 0px;

	&::before {
		content: "";
		position: absolute;
		left: 9px;
		top: -5px;
		width: 0px;
		height: 0px;
		border-width: 0px 4px 5px;
		border-color: transparent transparent #E02F44;
		border-style: solid;
	}
`;

interface AlertProp {
	alertText: string;
}

const Alert: FC<AlertProp> = ({ alertText }) => {
	return <AlertContainer>&#9888;&nbsp;&nbsp;{alertText}</AlertContainer>;
};

export default Alert;
