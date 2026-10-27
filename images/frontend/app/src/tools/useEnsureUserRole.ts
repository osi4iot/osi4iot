import { useEffect, useState } from "react";
import { useAuthDispatch, useAuthState } from "../contexts/authContext";
import { getAxiosInstance } from "./axiosIntance";
import axiosErrorHandler from "./axiosErrorHandler";
import { axiosAuth, getDomainName, getProtocol } from "./tools";
import { useSessionStore, useUserRole } from "../state/sessionStore";

const domainName = getDomainName();
const protocol = getProtocol();

// Rol del usuario si aún no se conoce: tras recargar la página (Ctrl-F5) o al entrar directamente en una capa.
// Devuelve true si la petición del rol ha fallado (para no esperar indefinidamente).
export const useEnsureUserRole = () => {
    const userRole = useUserRole();
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        if (userRole !== "unknown" || !accessToken) return;
        let cancelled = false;
        const url = `${protocol}://${domainName}/admin_api/auth/user_managed_components`;
        getAxiosInstance(refreshToken, authDispatch)
            .get(url, axiosAuth(accessToken))
            .then((response) => {
                if (!cancelled) useSessionStore.getState().setUserRole(response.data);
            })
            .catch((error) => {
                if (cancelled) return;
                setFailed(true);
                axiosErrorHandler(error, authDispatch);
            });
        return () => {
            cancelled = true;
        };
    }, [userRole, accessToken, refreshToken, authDispatch]);
    return failed;
};
