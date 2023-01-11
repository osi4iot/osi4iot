/* istanbul ignore file */
import "reflect-metadata";
import App from "./app";
import HealthCheckController from "./utils/healthCheck/healthCheck.controller";
import AuthenticationController from "./components/Authentication/authentication.controller";
import { logger } from "./config/winston";
import { dataBaseInitialization } from "./initialization/migration";
import OrganizationController from "./components/organization/organization.controller";
import ApplicationController from "./components/application/application.controller";
import GroupController from "./components/group/group.controller";
import DeviceController from "./components/device/device.controller";
import TopicController from "./components/topic/topic.controller";
import DigitalTwinController from "./components/digitalTwin/digitalTwinController";
import BuildingController from "./components/building/building.controller";
import MeasurementController from "./components/mesurement/measurement.controller";
import DashboardController from "./components/dashboard/dashboardController";
import NodeRedInstanceController from "./components/nodeRedInstance/nodeRedInstance.controller";


async function main(): Promise<void> {
	try {
		await dataBaseInitialization();

		// prettier-ignore
		const app = new App([
			new HealthCheckController(),
			new AuthenticationController(),
			new ApplicationController(),
			new OrganizationController(),
			new BuildingController(),
			new GroupController(),
			new DeviceController(),
			new NodeRedInstanceController(),
			new TopicController(),
			new MeasurementController(),
			new DigitalTwinController(),
			new DashboardController(),
		]);
		app.listen();
	} catch (error) {
		logger.log("error", "Server initiation failed: %s ", error.message);
		logger.log("error", "Process finished");
		process.exit(1);
	}
}

main();
