import { FC } from "react";
import { BrowserRouter as Router, Redirect, Route, Switch } from "react-router-dom";
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
				<Switch>
					<PublicRoute exact path="/register" component={RegisterPage} />
					<PublicRoute exact path="/login" component={LoginPage} />
					<PrivateRoute exact path="/mobile_sensors" component={MobileSensorsPage} />

					<Route exact path="/" component={HomePage} />

					<PrivateRoute exact path="/platform_assistant" component={PlatformAssistantPage} />

					<PrivateRouteWithUserRole roleRequired="PlatformAdmin" exact path="/platform_assistant/admin" component={PlatformAssistantPageAdmin} />
					<PrivateRouteWithUserRole roleRequired="OrgAdmin" exact path="/platform_assistant/org" component={PlatformAssistantPageOrg} />
					<PrivateRouteWithUserRole roleRequired="GroupAdmin" exact path="/platform_assistant/group" component={PlatformAssistantPageGroup} />
					<PrivateRouteWithUserRole roleRequired="User" exact path="/platform_assistant/user" component={PlatformAssistantPageUser} />

					<Route exact path="/404" component={NotFoundPage} />
					<Route path="*">
						<Redirect to="/404" />
					</Route>
				</Switch>
			</Router>
			<StyledToastContainer position="bottom-right" hideProgressBar={true} autoClose={5000}/>
		</>
	);
};

export default AppRouter;
