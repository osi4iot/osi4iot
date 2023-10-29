
import { FC, PropsWithChildren } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useIsUserAuth } from "../contexts/authContext";
import { useUserRole } from "../contexts/platformAssistantContext/platformAssistantContext";
import { getPlatformAssistantPathForUserRole } from "../tools/tools";

interface RouteProps extends PropsWithChildren {
    redirectAddress: string;
    roleRequired: string;
}

const userRolesArray = ["User", "GroupAdmin", "OrgAdmin", "PlatformAdmin"];

export const PrivateRouteWithUserRole: FC<RouteProps> = ({ children, redirectAddress, roleRequired }) => {
    const location = useLocation();
    const userRole = useUserRole();

    return (
        <>
            {
                useIsUserAuth() ?
                    (
                        userRolesArray.indexOf(userRole) >= userRolesArray.indexOf(roleRequired)
                            ?
                            children ? children : <Outlet />
                            :
                            <Navigate to={getPlatformAssistantPathForUserRole(userRole)} state={location} />
                    )
                    :
                    <Navigate to={redirectAddress} state={location} />
            }
        </>
    );
};