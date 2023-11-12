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

	@media screen and (max-width: 350px) {
		height: 60px;
	}

	@media screen and (min-height: 900px) {
		height: 100px;
	}
`;

const HeaderLogo = styled.div`
	background-color: #202226;
	width: 33%;

	@media screen and (max-width: 350px) {
		width: 110px;
	}
`;

interface HeaderTitleProps {
	windowWidth: number;
	nameLength: number;
}

const HeaderTitle = styled.h1<HeaderTitleProps>`
	font-size: ${(props) => {
		let fontSize = "15px";
		if (props.windowWidth > 900) fontSize = "30px";
		else if (props.windowWidth >= 550 && props.windowWidth <= 900) fontSize = "20px";
		else {
			if (props.windowWidth < 350) {
				fontSize = "12px";
			} else {
				fontSize = props.nameLength >= 12 ? "12px" : "18px"
			}
		}
		return fontSize;
	}};
	background-color: inherit;
	text-align: center;
	font-weight: 400;
	width: 33%;
	padding: 3px;

	@media screen and (max-width: 350px) {
		width: 50%;
	}

	@media screen and (min-height: 1200px) and (min-width: 1800px) {
		font-size: 40px;
	}
`;



const HeaderSignInSignOut = styled.div`
	width: 33%;
	background-color: inherit;
	display: flex;
	justify-content: flex-end;
	align-items: center;

	@media screen and (max-width: 350px) {
		width: 15%;
	}
`;

let platformName = "IOT PLATFORM";
if (window._env_ && window._env_.PLATFORM_NAME) {
	platformName = `${window._env_.PLATFORM_NAME.replace('-', '\u2011').toUpperCase()}`;
}

const Header: FC<{}> = () => {
	const windowWidth = useWindowWidth();
	const nameLength = platformName.length;
	const headerTitle = `IOT ${platformName} PLATFORM`;
	return (
		<StyledHeader>
			<HeaderLogo>
				<Logo />
			</HeaderLogo>
			<HeaderTitle windowWidth={windowWidth} nameLength={nameLength}>{headerTitle}</HeaderTitle>
			<HeaderSignInSignOut>
				<SingInSignOut />
			</HeaderSignInSignOut>
		</StyledHeader>
	);
};

export default Header;
