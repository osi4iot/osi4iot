import { FC } from "react";
import { useLocation } from "react-router-dom";
import styled from "styled-components";

interface MainContainerProps {
	currentPath: string;
}

const MainContainer = styled.main<MainContainerProps>`
	color: white;
	display: flex;
	flex-direction: ${(props) => (props.currentPath === "/" ? "row" : "column")};
	align-items: ${(props) => (props.currentPath === "/" ? "flex-start" : "center")};
	height: calc(100vh - 80px);
`;

interface MainProps {
	children?: JSX.Element;
}

const Main: FC<MainProps> = ({ children }) => {
	const location = useLocation();
	const currentPath = location.pathname;
	return <MainContainer currentPath={currentPath}>{children}</MainContainer>;
};

export default Main;
