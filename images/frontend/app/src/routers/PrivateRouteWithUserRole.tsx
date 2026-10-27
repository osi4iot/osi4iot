import { FC, ReactElement } from "react";
import { Navigate, useLocation } from "react-router";
import { useIsUserAuth } from "../contexts/authContext";
import { useUserRole } from "../state/sessionStore";
import { getPlatformAssistantPathForUserRole } from "../tools/tools";
import { useEnsureUserRole } from "../tools/useEnsureUserRole";
import PageLoader from "../components/Layout/PageLoader";

interface PrivateRouteWithUserRoleProps {
    children: ReactElement;
    roleRequired: string;
}

const userRolesArray = ["User", "GroupAdmin", "OrgAdmin", "PlatformAdmin"];

export const PrivateRouteWithUserRole: FC<PrivateRouteWithUserRoleProps> = ({ children, roleRequired }) => {
    const location = useLocation();
    const userRole = useUserRole();
    const isUserAuth = useIsUserAuth();
    // tras recargar la página el rol aún no se conoce: se pide y se espera, en vez de redirigir al inicio
    const roleRequestFailed = useEnsureUserRole();

    if (!isUserAuth) return <Navigate to="/login" replace state={{ from: location }} />;
    if (userRole === "unknown" && !roleRequestFailed) return <PageLoader />;
    if (userRolesArray.indexOf(userRole) < userRolesArray.indexOf(roleRequired)) {
        return <Navigate to={getPlatformAssistantPathForUserRole(userRole)} replace />;
    }
    return children;
};
