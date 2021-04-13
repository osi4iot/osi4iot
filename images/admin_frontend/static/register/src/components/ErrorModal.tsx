import React, { FC } from "react";
import styled from "styled-components";

const ErrorModalContainer = styled.div`
	width: 300px;
	height: 200px;
	display: flex;
	align-items: center;
	justify-content: center;
`;

const ErrorText = styled.div`
	font-size: 20px;
	font-weight: 500;
	padding: 10px 20px;
	color: rgb(255, 255, 255);
	background: rgb(224, 47, 68);
	border-radius: 2px;
`;

interface ErrorModalProp {
	children: string;
}

const ErrorModal: FC<ErrorModalProp> = ({ children }) => {
	return (
		<ErrorModalContainer>
			<ErrorText>{children}</ErrorText>
		</ErrorModalContainer>
	);
};

export default ErrorModal;
