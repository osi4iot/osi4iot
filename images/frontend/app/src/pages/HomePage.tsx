import { FC } from "react";
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

const ImageContainer = styled.div`
	width: 75vw;
	height: 100%;
	padding: 0px 0px 10px 0px;
	display: none;

	@media screen and (min-width: 768px) {
		display: block;
	}
`;

const FondImage = styled.img`
	width: 100%;
	height: 100%;
	object-fit: cover;
	object-position: 5px 10%;
`;

const MenuContainer = styled.div`
	width: 25vw;
	min-width: 440px;
	display: flex;
	flex-direction: column;
	/* justify-content: center; */
	align-items: center;

	@media screen and (max-width: 768px) {
		width: 100%;
		min-width: 100%;
	}
`;

const MenuBorder = styled.div`
	position: relative;
	display: flex;
	flex-direction: column;
	justify-content: space-around;
	align-items: center;
	width: 320px;
	height: calc(100vh - 180px);
	font-size: 18px;
	border: 3px solid #3274d9;
	border-radius: 15px;
	padding-bottom: 40px;

	@media screen and (min-width: 768px) {
		width: 400px;
	}

	@media screen and (min-height: 750px) {
		justify-content: flex-start;
	}

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
	width: 80%;

	&:hover {
		background-color: #2461c0;
	}

	&:active {
		background-color: #2461c0;
		box-shadow: 0 2px #173b70;
		transform: translateY(4px);
	}


	@media screen and (min-height: 750px) {
		margin: 50px 0;
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
	width: 80%;
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

	@media screen and (min-height: 750px) {
		margin: 50px 0;
	}
`;

const Footer = styled.p`
	position: absolute;
	font-size: 12px;
	margin: 5px;
	bottom: 5px;
`;

const domainName = getDomainName();

const HomePage: FC<{}> = () => {
	const handleLinkClick = (path: string) => {
		const url = `https://${domainName}${path}`;
		window.open(url, "_blank");
	};

	return (
		<>
			<Header />
			<Main>
				<>
					<ImageContainer>
						<FondImage src="osi4iot_fond.jpg" alt="Logo" />
					</ImageContainer>
					<MenuContainer>
						<Title>Platform options</Title>
						<MenuBorder>
							<ButtonLink onClick={() => handleLinkClick("/grafana/")}>Dashboards</ButtonLink>
							<ButtonLink onClick={() => handleLinkClick("/admin_api/swagger/")}>Swagger</ButtonLink>
							<StyledNavLink exact to="/platform_assistant">
								<p>Platform assistant</p>
							</StyledNavLink>
							<StyledNavLink exact to="/mobile_sensors">
								<p>Mobile sensors</p>
								<p>(Only Android devices)</p>
							</StyledNavLink>
							<Footer>Power by Aula CIMNE-EEBE - dicapua@cimne.upc.edu</Footer>
						</MenuBorder>
					</MenuContainer>
				</>
			</Main>
		</>
	);
};

export default HomePage;
