import { FC } from "react";
import { BrowserRouter as Router, Redirect, Route, Switch } from "react-router-dom";
import PlatformAssistantPageGroup from "../pages/PlaformAssitantPageGroup";
import PlatformAssistantPageAdmin from "../pages/PlatformAssistantPageAdmin";
import PlatformAssistantPage from "../pages/PlatformAssistantPage";
import PlatformAssistantPageOrg from "../pages/PlatformAssistantPageOrg";
import PlatformAssistantPageUser from "../pages/PlatformAssistantPageUser";
import { PrivateRoute } from "./PrivateRoute";
import { PrivateRouteWithUserRole } from "./PrivateRouteWithUserRole";

export const PlatformAssistanceRoute: FC<{}> = () => {

	return (
		<Router>
			<Switch>

				<PrivateRoute exact path="/platform_assistant" component={PlatformAssistantPage} />

				<PrivateRouteWithUserRole roleRequired="PlatformAdmin" exact path="/platform_assistant/admin" component={PlatformAssistantPageAdmin} />
				<PrivateRouteWithUserRole roleRequired="OrgAdmin" exact path="/platform_assistant/org" component={PlatformAssistantPageOrg} />
				<PrivateRouteWithUserRole roleRequired="GroupAdmin" exact path="/platform_assistant/group" component={PlatformAssistantPageGroup} />
				<PrivateRouteWithUserRole roleRequired="User" exact path="/platform_assistant/user" component={PlatformAssistantPageUser} />

				<Route path="*">
					<Redirect to="/404" />
				</Route>
			</Switch>
		</Router>
	);
};
