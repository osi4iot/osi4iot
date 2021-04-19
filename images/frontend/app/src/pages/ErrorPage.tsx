import React, { FC } from "react";
import styled from "styled-components";
import Header from "../components/Header";
import Main from "../components/Main";
import { ChildrenProp } from "../interfaces/interfaces";

const ErrorMessageContainer = styled.div`
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
	color: #FFFFFF;
	background: #E02F44;
	border-radius: 2px;
`;


const ErrorPage: FC<ChildrenProp> = ({ children }) => {
	return (
		<>
			<Header />
			<Main>
				<ErrorMessageContainer>
					<ErrorText>{children}</ErrorText>
				</ErrorMessageContainer>
			</Main>
		</>
	);
};

export default ErrorPage;
