import { FC, ReactElement } from "react";
import { Navigate, useLocation } from "react-router";
import { useIsUserAuth } from "../contexts/authContext";

interface PrivateRouteProps {
	children: ReactElement;
}

// react-router v6+: los "guards" son elementos que envuelven a la página
export const PrivateRoute: FC<PrivateRouteProps> = ({ children }) => {
	const location = useLocation();
	const isUserAuth = useIsUserAuth();
	if (!isUserAuth) return <Navigate to="/login" replace state={{ from: location }} />;
	return children;
};
