import { FC, useEffect } from "react";
import PlatformAssistantLayout from "../components/Layout/PlatformAssistantLayout";
import { useAuthDispatch, useAuthState } from "../contexts/authContext";
import { axiosAuth, getDomainName, getProtocol } from "../tools/tools";
import { LayerScopeProvider } from "../state";
import { useSessionStore } from "../state/sessionStore";
import PlatformAssistantHomeOptions from "../components/PlatformAssistant/PlatformAssistantHomeOptions/PlatformAssistantHomeOptions";
import { getAxiosInstance } from "../tools/axiosIntance";
import axiosErrorHandler from "../tools/axiosErrorHandler";
import { AxiosResponse, AxiosError } from "axios";

const domainName = getDomainName();
const protocol = getProtocol();

const PlatformAssistantPage: FC<{}> = () => {
	const { accessToken, refreshToken } = useAuthState();
	const authDispatch = useAuthDispatch();

	// rol del usuario (y número de elementos que gestiona) actualizado al entrar en el asistente
	useEffect(() => {
		const url = `${protocol}://${domainName}/admin_api/auth/user_managed_components`;
		const config = axiosAuth(accessToken);
		getAxiosInstance(refreshToken, authDispatch)
			.get(url, config)
			.then((response: AxiosResponse<any, any>) => {
				useSessionStore.getState().setUserRole(response.data);
			})
			.catch((error: AxiosError) => {
				axiosErrorHandler(error, authDispatch);
			});
	}, [accessToken, refreshToken, authDispatch]);

	return (
		<PlatformAssistantLayout layer="home">
			<LayerScopeProvider scope="home">
				<PlatformAssistantHomeOptions />
			</LayerScopeProvider>
		</PlatformAssistantLayout>
	);
};

export default PlatformAssistantPage;
