import { FC } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
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

const StyledToastContainer = styled(ToastContainer)`

	.Toastify__toast-body {
		background-color: inherit;
		color: white;
	}

	.Toastify__toast--warning {
		background-color: #ff8a23;
	}
  
`;

const AppRouter: FC<{}> = () => {
	return (
		<>
			<Router>
				<Routes>
					<Route element={<PublicRoute redirectAddress={"/"} />}>
						<Route path="/register" element={<RegisterPage />} />
						<Route path="/login" element={<LoginPage />} />
					</Route>


					<Route element={<PrivateRoute redirectAddress={"/login"} />}>
						<Route path="/mobile_sensors" element={<MobileSensorsPage />} />
						<Route path="/login" element={<DigitalTwinSimulatorMobilePage />} />
						<Route path="/platform_assistant" element={<PlatformAssistantPage/>} />
					</Route>

					<Route path="/" element={<HomePage />} />

					<Route element={<PrivateRouteWithUserRole roleRequired="PlatformAdmin" redirectAddress={"/login"} />}>
						<Route path="/platform_assistant/admin" element={<PlatformAssistantPageAdmin />} />
					</Route>

					<Route element={<PrivateRouteWithUserRole roleRequired="OrgAdmin" redirectAddress={"/login"} />}>
						<Route path="/platform_assistant/org" element={<PlatformAssistantPageOrg />} />
					</Route>

					<Route element={<PrivateRouteWithUserRole roleRequired="GroupAdmin" redirectAddress={"/login"} />}>
						<Route path="/platform_assistant/group" element={<PlatformAssistantPageGroup />} />
					</Route>

					<Route element={<PrivateRouteWithUserRole roleRequired="User" redirectAddress={"/login"} />}>
						<Route path="/platform_assistant/user" element={<PlatformAssistantPageUser />} />
					</Route>

					<Route path="/404" element={<NotFoundPage />} />
					<Route path="*" element={<NotFoundPage />} />
				</Routes>
			</Router>
			<StyledToastContainer position="bottom-right" hideProgressBar={true} autoClose={5000} />
		</>
	);
};

export default AppRouter;
