import { FC, SyntheticEvent } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { useWindowWidth } from "@react-hook/window-size";

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
	const navigate = useNavigate();
	const windowWidth = useWindowWidth();
	const isMobile = windowWidth < 768;

	const handleSendHome = (e: SyntheticEvent) => {
		navigate("/");
	};

	return (
		<LogoContainer>
			{isMobile ? (
				<LogoSmall src="../../logo_small.png" alt="Logo" onClick={handleSendHome} />
			) : (
				<LogoLarge src="../../logo_large.png" alt="Logo" onClick={handleSendHome} />
			)}
		</LogoContainer>
	);
};

export default Logo;