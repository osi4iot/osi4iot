import { FC } from "react";
import { Route, Redirect, RouteProps, useLocation } from "react-router-dom";
import { useIsUserAuth } from "../context";

interface PrivateRouteProps extends RouteProps {
	component: React.FC;
}

export const PrivateRoute: FC<PrivateRouteProps> = ({ component: Component, ...rest }) => {
	const location = useLocation();

	return (
		<Route {...rest}>
			{useIsUserAuth() ? <Component /> : <Redirect to={{ pathname: "/login", state: { from: location } }} />}
		</Route>
	);
};
