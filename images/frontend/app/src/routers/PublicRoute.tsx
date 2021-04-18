import { FC } from "react";
import { Route, Redirect, RouteProps } from "react-router-dom";
import { useIsUserAuth } from "../context";

interface PublicRouteProps extends RouteProps {
	component: React.FC;
}

export const PublicRoute: FC<PublicRouteProps> = ({ component: Component, ...rest }) => {
	return <Route {...rest}>{!useIsUserAuth() ? <Component /> : <Redirect to="/" />}</Route>;
};
