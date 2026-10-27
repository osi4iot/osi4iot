import { FC } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ToastContainer, ToastContainerProps } from "react-toastify";
import styled from "styled-components";
import HomePage from "../pages/HomePage";
import LoginPage from "../pages/LoginPage";
import MobileSensorsPage from "../pages/MobileSensorsPage";
import NotFoundPage from "../pages/NotFoundPage";
import RegisterPage from "../pages/RegisterPage";
import { PrivateRoute } from "./PrivateRoute";
import { PublicRoute } from "./PublicRoute";
import PlatformAssistantPage from "../pages/PlatformAssistantPage";
import PlatformAssistantPageAdmin from "../pages/PlatformAssistantPageAdmin";
import PlatformAssistantPageGroup from "../pages/PlaformAssitantPageGroup";
import PlatformAssistantPageOrg from "../pages/PlatformAssistantPageOrg";
import PlatformAssistantPageUser from "../pages/PlatformAssistantPageUser";
import { PrivateRouteWithUserRole } from "./PrivateRouteWithUserRole";
import DigitalTwinSimulatorMobilePage from "../pages/DigitalTwinSimulatorMobilePage";

// react-toastify v11 inyecta su CSS automáticamente y usa el tema "light" por defecto.
// Se usa el tema "colored" (success verde, error rojo, warning amarillo, info azul) y sin iconos.
// Ojo: `theme` no puede pasarse a través de styled(...) porque styled-components reserva esa prop,
// por eso se fija en este envoltorio.
const ColoredToastContainer: FC<ToastContainerProps> = (props) => (
    <ToastContainer theme="colored" icon={false} {...props} />
);

const StyledToastContainer = styled(ColoredToastContainer)`
    .Toastify__toast-body {
        background-color: inherit;
        color: white;
    }
`;

const AppRouter: FC<{}> = () => {
    return (
        <>
            <BrowserRouter>
                <Routes>
                    <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
                    <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                    <Route path="/mobile_sensors" element={<PrivateRoute><MobileSensorsPage /></PrivateRoute>} />
                    <Route
                        path="/digital_twin_simulator_mobile"
                        element={<PrivateRoute><DigitalTwinSimulatorMobilePage /></PrivateRoute>}
                    />

                    <Route path="/" element={<HomePage />} />

                    <Route path="/platform_assistant" element={<PrivateRoute><PlatformAssistantPage /></PrivateRoute>} />

                    <Route
                        path="/platform_assistant/admin"
                        element={
                            <PrivateRouteWithUserRole roleRequired="PlatformAdmin">
                                <PlatformAssistantPageAdmin />
                            </PrivateRouteWithUserRole>
                        }
                    />
                    <Route
                        path="/platform_assistant/org"
                        element={
                            <PrivateRouteWithUserRole roleRequired="OrgAdmin">
                                <PlatformAssistantPageOrg />
                            </PrivateRouteWithUserRole>
                        }
                    />
                    <Route
                        path="/platform_assistant/group"
                        element={
                            <PrivateRouteWithUserRole roleRequired="GroupAdmin">
                                <PlatformAssistantPageGroup />
                            </PrivateRouteWithUserRole>
                        }
                    />
                    <Route
                        path="/platform_assistant/user"
                        element={
                            <PrivateRouteWithUserRole roleRequired="User">
                                <PlatformAssistantPageUser />
                            </PrivateRouteWithUserRole>
                        }
                    />

                    <Route path="/404" element={<NotFoundPage />} />
                    <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
            </BrowserRouter>
            <StyledToastContainer position="bottom-right" hideProgressBar={true} autoClose={5000} />
        </>
    );
};

export default AppRouter;
