import { FC, PropsWithChildren } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useIsUserAuth } from "../contexts/authContext";

interface RouteProps extends PropsWithChildren{
	redirectAddress: string;
}

export const PublicRoute: FC<RouteProps> = ({ children, redirectAddress }) => {
	if (useIsUserAuth()) {
		return <Navigate to={redirectAddress} replace />;
	} 
		
	return children ? children : <Outlet />;
};
