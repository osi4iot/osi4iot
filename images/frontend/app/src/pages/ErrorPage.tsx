import React, { FC } from "react";
import styled from "styled-components";
import Header from "../components/Header";
import Main from "../components/Main";

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
	color: rgb(255, 255, 255);
	background: rgb(224, 47, 68);
	border-radius: 2px;
`;

interface ErrorPageProps {
	children: JSX.Element
}

const ErrorPage: FC<ErrorPageProps> = ({ children }) => {
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
