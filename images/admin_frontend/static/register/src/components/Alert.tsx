import React, { FC } from "react";
import styled from "styled-components";

const AlertContainer = styled.div`
	font-size: 12px;
	font-weight: 500;
	padding: 4px 8px;
	color: rgb(255, 255, 255);
	background: rgb(224, 47, 68);
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
		border-color: transparent transparent rgb(224, 47, 68);
		border-style: solid;
	}
`;

interface AlertProp {
	alertText: string;
}

const Alert: FC<AlertProp> = ({ alertText }) => {
	return <AlertContainer>{alertText}</AlertContainer>;
};

export default Alert;
