import { FC } from "react";
import { TopBar } from "./TopBar";

// Barra superior de las páginas fuera del asistente de la plataforma (inicio, login, páginas móviles...),
// con el mismo diseño que la del asistente.
const Header: FC<{}> = () => <TopBar />;

export default Header;
