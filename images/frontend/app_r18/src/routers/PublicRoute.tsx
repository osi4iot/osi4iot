import { FC } from "react";
import { Route, Redirect, RouteProps } from "react-router-dom";
import { useIsUserAuth } from "../contexts/authContext";
import { ChildrenProp } from "../interfaces/interfaces";

interface PublicRouteProps extends RouteProps {
	component: React.FC<ChildrenProp>;
}

export const PublicRoute: FC<PublicRouteProps> = ({ component: Component, ...rest }) => {
	return <Route {...rest}>{!useIsUserAuth() ? <Component /> : <Redirect to="/" />}</Route>;
};
