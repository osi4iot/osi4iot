import { FC, useEffect } from "react";
import styled from "styled-components";
import Main from "../components/Layout/Main";
import Header from "../components/Layout/Header";
import PlatformAssistantMenu from "./PlatformAssistantMenu";
import { useAuthDispatch, useAuthState } from "../contexts/authContext";
import { usePlatformAssitantDispatch } from "../contexts/platformAssistantContext";
import { axiosAuth, getDomainName, getProtocol } from "../tools/tools";
import { setUserRole } from "../contexts/platformAssistantContext";
import { PLATFORM_ASSISTANT_OPTION } from "../components/PlatformAssistant/Utils/platformAssistantOptions";
import PlatformAssistantHomeOptions from '../components/PlatformAssistant/PlatformAssistantHomeOptions/PlatformAssistantHomeOptions';
import { getAxiosInstance } from "../tools/axiosIntance";
import axiosErrorHandler from "../tools/axiosErrorHandler";
import { AxiosResponse, AxiosError } from "axios";


const Container = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
	align-items: center;
    width: calc(100vw - 60px);
`;


const Title = styled.h2`
	font-size: 20px;
	margin-top: 20px;
	margin-bottom: 20px;
	font-weight: 400;
	text-align: center;
	color: white;
	width: 100%;
`;

const domainName = getDomainName();
const protocol = getProtocol();

const PlatformAssistantPage: FC<{}> = () => {
	const { accessToken, refreshToken } = useAuthState();
	const authDispatch = useAuthDispatch();
	const platformAssistantDispatch = usePlatformAssitantDispatch();

	useEffect(() => {
		const url = `${protocol}://${domainName}/admin_api/auth/user_managed_components`;
		const config = axiosAuth(accessToken);
		getAxiosInstance(refreshToken, authDispatch)
			.get(url, config)
			.then((response: AxiosResponse<any, any>) => {
				const data = response.data;
				setUserRole(platformAssistantDispatch, data);
			})
			.catch((error: AxiosError) => {
				axiosErrorHandler(error, authDispatch);
			});
	}, [
		accessToken,
		refreshToken,
        authDispatch,
		platformAssistantDispatch
	]);

	return (
		<>
			<Header />
			<Main>
				<>
					<PlatformAssistantMenu platformAssistantOptionToShow={PLATFORM_ASSISTANT_OPTION.HOME} />
					<Container>
						<Title>Platform assistant</Title>
						<PlatformAssistantHomeOptions />
					</Container>
				</>
			</Main>
		</>
	);
};

export default PlatformAssistantPage;