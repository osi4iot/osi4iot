
import { FC } from "react";
import { Route, Redirect, RouteProps, useLocation } from "react-router-dom";
import { useIsUserAuth } from "../contexts/authContext";
import { useUserRole } from "../contexts/platformAssistantContext/platformAssistantContext";
import { ChildrenProp } from "../interfaces/interfaces";
import { getPlatformAssistantPathForUserRole } from "../tools/tools";

interface PrivateRouteWithUserRoleProps extends RouteProps {
    component: React.FC<ChildrenProp>;
    roleRequired: string;
}


const userRolesArray = ["User", "GroupAdmin", "OrgAdmin", "PlatformAdmin"];

export const PrivateRouteWithUserRole: FC<PrivateRouteWithUserRoleProps> = ({ component: Component, roleRequired, ...rest }) => {
    const location = useLocation();
    const userRole = useUserRole();

    return (
        <Route {...rest}>
            {
                useIsUserAuth() ?
                    (
                        userRolesArray.indexOf(userRole) >= userRolesArray.indexOf(roleRequired)
                            ?
                            <Component />
                            :
                            <Redirect to={{ pathname: getPlatformAssistantPathForUserRole(userRole) }} />
                    )
                    :
                    <Redirect to={{ pathname: "/login", state: { from: location } }} />}
        </Route>
    );
};