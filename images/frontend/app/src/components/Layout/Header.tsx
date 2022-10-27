import { useWindowWidth } from "@react-hook/window-size";
import React, { FC } from "react";
import styled from "styled-components";
import Logo from "./Logo";
import SingInSignOut from "./SingInSignOut";

const StyledHeader = styled.header`
	background-color: #202226;
	color: white;
	display: flex;
	justify-content: center;
	align-items: center;
	height: 80px;
	width: 100%;
`;

const HeaderLogo = styled.div`
	background-color: #202226;
	width: 33%;
`;

interface HeaderTitleProps {
	isMobile: boolean;
	nameLength: number;
}

const HeaderTitle = styled.h1<HeaderTitleProps>`
	font-size: ${(props) => props.isMobile ? (props.nameLength >= 12 ? "16px" : "18px") : "30px"};
	background-color: inherit;
	text-align: center;
	font-weight: 400;
	width: 33%;
`;

const HeaderSignInSignOut = styled.div`
	width: 33%;
	background-color: inherit;
	display: flex;
	justify-content: flex-end;
	align-items: center;
`;

let platformName = "IOT PLATFORM";
if (window._env_ && window._env_.PLATFORM_NAME) {
	platformName = `${window._env_.PLATFORM_NAME.replace('-', '\u2011').toUpperCase()}`;
}

const Header: FC<{}> = () => {
	const windowWidth = useWindowWidth();
	const isMobile = windowWidth < 768;
	const nameLength = platformName.length;
	const headerTitle = `IOT ${platformName} PLATFORM`;
	return (
		<StyledHeader>
			<HeaderLogo>
				<Logo />
			</HeaderLogo>
			<HeaderTitle isMobile={isMobile} nameLength={nameLength}>{headerTitle}</HeaderTitle>
			<HeaderSignInSignOut>
				<SingInSignOut />
			</HeaderSignInSignOut>
		</StyledHeader>
	);
};

export default Header;
