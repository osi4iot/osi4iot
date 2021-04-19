import React, { FC, SyntheticEvent } from "react";
import styled from "styled-components";
import { FaWifi, FaChartLine, FaHome, FaSignOutAlt } from "react-icons/fa";
import { NavLink } from "react-router-dom";

const StyledHeader = styled.header`
	background-color: #202226;
	color: white;
	display: flex;
	justify-content: center;
	align-items: center;
	height: 80px;
`;

const LogoIcon = styled(FaWifi)`
	font-size: 30px;
	color: #3274d9;
`;

const ChartIcon = styled(FaChartLine)`
	font-size: 30px;
	color: #3274d9;
`;

const HomeIcon = styled(FaHome)`
	font-size: 30px;
	color: #3274d9;
`;

const SignOutIcon = styled(FaSignOutAlt)`
	font-size: 30px;
	color: #3274d9;
`;

const LogoContainer = styled.div`
	background-color: #202226;
	width: 60px;
	margin: 0 10px;
	padding: 10px;
	display: flex;
	justify-content: center;
	align-items: center;
	border: 1px solid #3274d9;
`;

const SignOutLink = styled(NavLink)`
	background-color: #202226;
	width: 60px;
	margin: 0 10px;
	padding: 10px;
	display: flex;
	justify-content: center;
	align-items: center;
	border: 1px solid #3274d9;
	cursor: pointer;

	&:hover {
		border-color: white;

		& ${HomeIcon} {
			color: white;
		}

		& ${SignOutIcon} {
			color: white;
		}
	}
`;

const HeaderTitle = styled.h1`
	font-size: 24px;
	background-color: inherit;
	text-align: center;
	font-weight: 400;
	width: calc(100% - 120px);
`;

let platformName = "IOT PLATFORM";
if (window._env_.PLATFORM_NAME) {
	platformName = `${window._env_.PLATFORM_NAME.replace(/_/g, " ").toUpperCase()} PLATFORM`;
}

const Header: FC<{}> = () => {
	const onSignOutClickHandler = (e: SyntheticEvent) => {
		
	};

	return (
		<StyledHeader>
			<LogoContainer>
				<LogoIcon />
				<ChartIcon/>
			</LogoContainer>
			<HeaderTitle>{platformName} </HeaderTitle>
			<SignOutLink exact to="/">
				<SignOutIcon onClick={onSignOutClickHandler}/>
			</SignOutLink>
		</StyledHeader>
	);
};

export default Header;
