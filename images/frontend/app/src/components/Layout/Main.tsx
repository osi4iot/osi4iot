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
	background-color: #0c0d0f;

	overflow: auto;
    /* width */
    ::-webkit-scrollbar {
        width: 10px;
		height: 10px;
    }

    /* Track */
    ::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }

    /* Handle */
    ::-webkit-scrollbar-thumb {
        background: #2c3235; 
        border-radius: 5px;
    }

    /* Handle on hover */
    ::-webkit-scrollbar-thumb:hover {
		background-color: #343840;
	}

	::-webkit-scrollbar-corner {
        /* background-color: #0c0d0f; */
        background: #202226;
    }
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
