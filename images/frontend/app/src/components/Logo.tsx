import { FC, SyntheticEvent, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import styled from "styled-components";

const LogoLarge = styled.img`
	width: 250px;
	object-fit: cover;
	&:hover {
		border: 1px solid white;
		cursor: pointer;
	}
`;

const LogoSmall = styled.img`
	width: 100px;
	object-fit: cover;
	&:hover {
		border: 1px solid white;
		cursor: pointer;
	}
`;

const LogoContainer = styled.div`
	background-color: #202226;
	width: 100%;
	margin: 0 10px;
	display: flex;
	justify-content: flex-start;
	align-items: center;
`;


const Logo: FC<{}> = () => {
	const history = useHistory();
	const [windowWidth, setWindowWidth] = useState(window.innerWidth);
	const isMobile = windowWidth < 768;

	useEffect(() => {
		const handleResize = () => setWindowWidth(window.innerWidth);
		window.addEventListener("resize", handleResize);

		return () => {
			window.removeEventListener("resize", handleResize);
		};
	}, []);

	const handleSendHome = (e: SyntheticEvent) => {
		history.push("/");
	};

	return (
		<LogoContainer>
			{isMobile ? (
				<LogoSmall src="logo_small.png" alt="Logo" onClick={handleSendHome} />
			) : (
				<LogoLarge src="logo_large.png" alt="Logo" onClick={handleSendHome} />
			)}
		</LogoContainer>
	);
};

export default Logo;