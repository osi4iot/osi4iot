import axios, { AxiosResponse } from "axios";
import { useSessionStore } from "../state/sessionStore";
import { PLATFORM_ASSISTANT_ROUTES } from "../components/PlatformAssistant/Utils/platformAssistantOptions";
import { axiosAuth, getDomainName, getProtocol } from "./tools";
import { AxiosError } from "axios";

const domainName = getDomainName();
const protocol = getProtocol();

export const getUserRoleAndRedirect = (accessToken: string, navigate: (path: string) => void) => {
    const url = `${protocol}://${domainName}/admin_api/auth/user_managed_components`;
    const config = axiosAuth(accessToken);
    axios
        .get(url, config)
        .then((response: AxiosResponse<any, any>) => {
            const data = response.data;
            useSessionStore.getState().setUserRole(data);
            navigate(PLATFORM_ASSISTANT_ROUTES.HOME);

        })
        .catch((error: AxiosError) => {
            console.log(error);
        })
}

export const getUserRole = (accessToken: string) => {
  const url = `${protocol}://${domainName}/admin_api/auth/user_managed_components`;
  const config = axiosAuth(accessToken);
  axios
      .get(url, config)
      .then((response: AxiosResponse<any, any>) => {
          const data = response.data;
          useSessionStore.getState().setUserRole(data);
      })
      .catch((error: AxiosError) => {
          console.log(error);
      })
}