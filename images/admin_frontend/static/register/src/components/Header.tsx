import React, { FC } from "react";
import styled from "styled-components";

const StyledHeader = styled.header`
	background-color: #202226;
	color: white;
	display: flex;
	justify-content: center;
	align-items: center;
	height: 100px;
`;

const HeaderTitle = styled.h1`
	font-size: 24px;
	margin: 0;
	padding: 0;
	background-color: inherit;
	font-weight: 400;
`;


const Header: FC<{}> = () => {
    let platformName = "IOT PLATFORM";
    if (window._env_.PLATFORM_NAME) {
        platformName = `${window._env_.PLATFORM_NAME.replace(/_/g, " ").toUpperCase()} PLATFORM`;
    }
    
	return (
		<StyledHeader>
			<HeaderTitle>{platformName} </HeaderTitle>
		</StyledHeader>
	);
};

export default Header;
