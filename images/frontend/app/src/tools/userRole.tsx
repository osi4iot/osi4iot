import axios from "axios";
import { setUserRole } from "../contexts/platformAssistantContext";
import { PlatformAssistantDispatch } from "../contexts/platformAssistantContext/interfaces";
import { PLATFORM_ASSISTANT_ROUTES } from "../components/PlatformAssistant/platformAssistantOptions";
import { axiosAuth, getDomainName } from "./tools";

const domainName = getDomainName();

export const getUserRoleAndRedirect = (accessToken: string, platformAssistantDispatch: PlatformAssistantDispatch, history: { push(path: string): void} ) => {
    const url = `https://${domainName}/admin_api/auth/user_managed_components`;
    const config = axiosAuth(accessToken);
    axios
        .get(url, config)
        .then((response) => {
            const data = response.data;
            setUserRole(platformAssistantDispatch, data);
            switch (data.userRole) {
                case "PlatformAdmin":
                    history.push(PLATFORM_ASSISTANT_ROUTES.PLATFORM_ADMIN);
                  break;
                case "OrgAdmin":
                    history.push(PLATFORM_ASSISTANT_ROUTES.ORG_ADMIN);
                  break;
                case "GroupAdmin":
                    history.push(PLATFORM_ASSISTANT_ROUTES.GROUP_ADMIN);
                  break;
                default:
                    history.push(PLATFORM_ASSISTANT_ROUTES.USER);
                    break;
              }
        })
        .catch((error) => {
            console.log(error);
        })
}

export const getUserRole = (accessToken: string, platformAssistantDispatch: PlatformAssistantDispatch ) => {
  const url = `https://${domainName}/admin_api/auth/user_managed_components`;
  const config = axiosAuth(accessToken);
  axios
      .get(url, config)
      .then((response) => {
          const data = response.data;
          setUserRole(platformAssistantDispatch, data);
      })
      .catch((error) => {
          console.log(error);
      })
}