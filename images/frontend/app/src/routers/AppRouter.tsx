import { FC } from "react";
import { BrowserRouter as Router, Redirect, Route, Switch } from "react-router-dom";
import HomePage from "../pages/HomePage";
import LoginPage from "../pages/LoginPage";
import MobileSensorsPage from "../pages/MobileSensorsPage";
import NotAllowedPageGroup from "../pages/NotAllowedPageGroup";
import NotAllowedPageOrg from "../pages/NotAllowedPageOrg";
import NotAllowedPagePlatform from "../pages/NotAllowedPagePlatform";
import NotFoundPage from "../pages/NotFoundPage";
import PlatformAssistantPage from "../pages/PlatformAssistantPage";
import RegisterPage from "../pages/RegisterPage";
import { PrivateRoute } from "./PrivateRoute";
import { PublicRoute } from "./PublicRoute";

const AppRouter: FC<{}> = () => {
	return (
		<Router>
			<Switch>
				<PublicRoute exact path="/register" component={RegisterPage} />
				<PublicRoute exact path="/login" component={LoginPage} />
				<PrivateRoute exact path="/mobile_sensors" component={MobileSensorsPage} />

				<Route exact path="/" component={HomePage} />
				<PrivateRoute exact path="/platform_assistant" component={PlatformAssistantPage} />

				<Route exact path="/401/platform" component={NotAllowedPagePlatform} />
				<Route exact path="/401/org" component={NotAllowedPageOrg} />
				<Route exact path="/401/group" component={NotAllowedPageGroup} />
				<Route exact path="/404" component={NotFoundPage} />
				<Route path="*">
					<Redirect to="/404" />
				</Route>
			</Switch>
		</Router>
	);
};

export default AppRouter;
