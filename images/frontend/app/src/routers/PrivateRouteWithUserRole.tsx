import { FC, ReactElement } from "react";
import { Navigate, useLocation } from "react-router";
import { useIsUserAuth } from "../contexts/authContext";
import { useUserRole } from "../contexts/platformAssistantContext/platformAssistantContext";
import { getPlatformAssistantPathForUserRole } from "../tools/tools";

interface PrivateRouteWithUserRoleProps {
    children: ReactElement;
    roleRequired: string;
}

const userRolesArray = ["User", "GroupAdmin", "OrgAdmin", "PlatformAdmin"];

export const PrivateRouteWithUserRole: FC<PrivateRouteWithUserRoleProps> = ({ children, roleRequired }) => {
    const location = useLocation();
    const userRole = useUserRole();
    const isUserAuth = useIsUserAuth();

    if (!isUserAuth) return <Navigate to="/login" replace state={{ from: location }} />;
    if (userRolesArray.indexOf(userRole) < userRolesArray.indexOf(roleRequired)) {
        return <Navigate to={getPlatformAssistantPathForUserRole(userRole)} replace />;
    }
    return children;
};
