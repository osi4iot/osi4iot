import axios, { AxiosResponse } from "axios";
import { setUserRole } from "../contexts/platformAssistantContext";
import { PlatformAssistantDispatch } from "../contexts/platformAssistantContext/interfaces";
import { PLATFORM_ASSISTANT_ROUTES } from "../components/PlatformAssistant/Utils/platformAssistantOptions";
import { axiosAuth, getDomainName, getProtocol } from "./tools";
import { AxiosError } from "axios";

const domainName = getDomainName();
const protocol = getProtocol();

export const getUserRoleAndRedirect = (accessToken: string, platformAssistantDispatch: PlatformAssistantDispatch, history: { push(path: string): void} ) => {
    const url = `${protocol}://${domainName}/admin_api/auth/user_managed_components`;
    const config = axiosAuth(accessToken);
    axios
        .get(url, config)
        .then((response: AxiosResponse<any, any>) => {
            const data = response.data;
            setUserRole(platformAssistantDispatch, data);
            history.push(PLATFORM_ASSISTANT_ROUTES.HOME);

        })
        .catch((error: AxiosError) => {
            console.log(error);
        })
}

export const getUserRole = (accessToken: string, platformAssistantDispatch: PlatformAssistantDispatch ) => {
  const url = `${protocol}://${domainName}/admin_api/auth/user_managed_components`;
  const config = axiosAuth(accessToken);
  axios
      .get(url, config)
      .then((response: AxiosResponse<any, any>) => {
          const data = response.data;
          setUserRole(platformAssistantDispatch, data);
      })
      .catch((error: AxiosError) => {
          console.log(error);
      })
}