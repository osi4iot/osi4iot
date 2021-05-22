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

const HeaderTitle = styled.h1`
	font-size: 22px;
	background-color: inherit;
	text-align: center;
	font-weight: 400;
	width: 33%;

	@media screen and (min-width: 768px) {
		font-size: 30px;
	}
`;

const HeaderSignInSignOut = styled.div`
	width: 33%;
	background-color: inherit;
	display: flex;
	justify-content: flex-end;
	align-items: center;
`;

let platformName = "IOT PLATFORM";
if (window._env_.PLATFORM_NAME) {
	platformName = `${window._env_.PLATFORM_NAME.replace(/_/g, " ").toUpperCase()} PLATFORM`;
}

const Header: FC<{}> = () => {
	return (
		<StyledHeader>
			<HeaderLogo>
				<Logo />
			</HeaderLogo>
			<HeaderTitle>{platformName} </HeaderTitle>
			<HeaderSignInSignOut>
				<SingInSignOut />
			</HeaderSignInSignOut>
		</StyledHeader>
	);
};

export default Header;
