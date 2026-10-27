import { FC, ReactElement } from "react";
import { Location, Navigate, useLocation } from "react-router";
import { useIsUserAuth } from "../contexts/authContext";

interface PublicRouteProps {
	children: ReactElement;
}

// Si el usuario ya está autenticado se le redirige. Si venía de una ruta privada (state.from, puesto por
// PrivateRoute) se le devuelve allí: con react-router 7+ las navegaciones van en startTransition y este
// <Navigate> se renderiza antes que el navigate(from) de LoginPage, así que debe apuntar al mismo destino.
export const PublicRoute: FC<PublicRouteProps> = ({ children }) => {
	const location = useLocation();
	const isUserAuth = useIsUserAuth();
	if (!isUserAuth) return children;
	const from = (location.state as { from?: Location } | null)?.from;
	return <Navigate to={from ?? "/"} replace />;
};
