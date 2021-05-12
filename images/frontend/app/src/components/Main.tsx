import { FC } from "react";
import { useLocation } from "react-router-dom";
import styled from "styled-components";


interface MainContainerProps {
	currentPath: string;
}

const isPlatformAssistantPath = (currentPath: string): boolean => {
	let isPlatformAssistantPath = false;
	if (currentPath.slice(0, 19) === "/platform_assistant") isPlatformAssistantPath = true;
	return isPlatformAssistantPath;
}

const isFlexDireccionRow = (currentPath: string): boolean => {
	let isRowDirection = false;
	if (currentPath === "/" || isPlatformAssistantPath(currentPath)) {
		isRowDirection = true;
	}
	return isRowDirection;
}

const MainContainer = styled.main<MainContainerProps>`
	color: white;
	display: flex;
	flex-direction: ${(props) => (isFlexDireccionRow(props.currentPath) ? "row" : "column")};
	align-items: ${(props) => (isFlexDireccionRow(props.currentPath) ? "flex-start" : "center")};
	height: calc(100vh - 80px);
`;

interface MainProps {
	children?: JSX.Element;
}

const Main: FC<MainProps> = ({ children }) => {
	const location = useLocation();
	const currentPath = location.pathname;
	return <MainContainer currentPath={currentPath}>
		{children}
	</MainContainer>;
};

export default Main;
