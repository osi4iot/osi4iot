import { FC, SyntheticEvent, useEffect, useState } from "react";
import { RiLoginCircleLine, RiLogoutCircleLine } from "react-icons/ri";
import { useHistory } from "react-router-dom";
import styled from "styled-components";
import { logout, useAuthDispatch, useIsUserAuth } from "../context";
import { useLoggedUserLogin } from "../context/context";

const SignOutIcon = styled(RiLogoutCircleLine)`
	font-size: 30px;
	color: #3274d9;
`;

const SignInIcon = styled(RiLoginCircleLine)`
	font-size: 30px;
	color: #3274d9;
`;

const SignInSignOutContainer = styled.div`
	background-color: #202226;
	width: 60px;
	margin: 0 5px;
	padding: 10px;
	display: flex;
	justify-content: center;
	align-items: center;

	&:hover {
        border: 1px solid white;

		& ${SignOutIcon} {
			color: white;
		}

		& ${SignInIcon} {
			color: white;
		}
	}

	@media screen and (max-width: 768px) {
		border: 1px solid #202226;
	}
`;

const UserName = styled.p`
    margin: 0 10px;
`;

const SingInSignOut: FC<{}> = () => {
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    
	const authDispatch = useAuthDispatch();
	const history = useHistory();
	const isUserLogged = useIsUserAuth();
    const userName = useLoggedUserLogin();
    
	useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
		window.addEventListener("resize", handleResize);
        
		return () => {
            window.removeEventListener("resize", handleResize);
		};
    }, []);
    
    const isMobile = windowWidth < 768;

	const onSignInSignOutClickHandler = (e: SyntheticEvent) => {
		if (isUserLogged) logout(authDispatch);
		else history.push("/login");
	};

	if (isUserLogged) {
		return (
            <>
                {! isMobile && <UserName>User: {userName}</UserName>}
				<SignInSignOutContainer onClick={onSignInSignOutClickHandler}>
					<SignOutIcon />
				</SignInSignOutContainer>
			</>
		);
	} else {
		return (
			<SignInSignOutContainer onClick={onSignInSignOutClickHandler}>
				<SignInIcon />
			</SignInSignOutContainer>
		);
	}
};

export default SingInSignOut;
