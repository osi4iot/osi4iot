import React, { FC } from "react";
import styled from "styled-components";

const MainContainer = styled.main`
	color: white;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
`;

interface MainProps {
	children?: JSX.Element;
}

const Main: FC<MainProps> = ({ children }) => {
	return <MainContainer>{children}</MainContainer>;
};

export default Main;
