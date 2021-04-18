import React, { FC } from "react";
import { NavLink } from "react-router-dom";
import styled from "styled-components";
import Main from "../components/Main";
import Header from "../components/Header";
import { getDomainName } from "../tools/tools";

const Title = styled.h2`
	font-size: 20px;
	margin-top: 30px;
	margin-bottom: 20px;
	font-weight: 400;
	text-align: center;
	color: white;
	width: 300px;
`;

const MenuContainer = styled.div`
	display: flex;
	flex-direction: column;
	justify-content: space-around;
	align-items: center;
	width: 300px;
	height: 450px;
	font-size: 18px;
	border: 2px solid #3274d9;
	border-radius: 15px;
`;

const ButtonLink = styled.button`
	background-color: #3274d9;
	padding: 10px 20px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
	width: 250px;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}
`;

const StyledNavLink = styled(NavLink)`
	background-color: #3274d9;
	padding: 10px 0px;
	color: white;
	border: 1px solid #2c3235;
	border-radius: 10px;
	outline: none;
	cursor: pointer;
	box-shadow: 0 5px #173b70;
	width: 250px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-decoration: none;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}

	& p {
		background-color: #3274d9;
		margin: 2px 0;
		padding: 0;
	}

	&:hover p {
		background-color: #2461c0;
	}
`;

const domainName = getDomainName();

interface MenuProps {
	children?: JSX.Element;
}

const HomePage: FC<MenuProps> = ({ children }) => {
	const handleLinkClick = (path: string) => {
		window.location.href = `https://${domainName}${path}`;
	};

	return (
		<>
			<Header />
			<Main>
				<>
					<Title>Platform options</Title>
					<MenuContainer>
						{children}
						<ButtonLink onClick={() => handleLinkClick("")}>Dashboards</ButtonLink>
						<ButtonLink onClick={() => handleLinkClick("/admin_api/swagger/")}>Platform assistant</ButtonLink>
						<StyledNavLink exact to="/mobile_sensors">
							<p>Mobile sensors</p>
							<p>(Only Android devices)</p>
						</StyledNavLink>
					</MenuContainer>
				</>
			</Main>
		</>
	);
};

export default HomePage;
