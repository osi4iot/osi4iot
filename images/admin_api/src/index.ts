/* istanbul ignore file */
import "reflect-metadata";
import App from "./app";
import fs from "fs";
import path from "path";
import HealthCheckController from "./utils/healthCheck/healthCheck.controller";
import AuthenticationController from "./components/Authentication/authentication.controller";
import { logger } from "./config/winston";
import { dataBaseInitialization } from "./dbmigration/migration";
import OrganizationController from "./components/organization/organization.controller";
import ApplicationController from "./components/application/application.controller";
import GroupController from "./components/group/group.controller";
import DeviceController from "./components/device/device.controller";
import TopicController from "./components/topic/topic.controller";
import DigitalTwinController from "./components/digitalTwin/digitalTwinController";
import BuildingController from "./components/building/building.controller";


async function main(): Promise<void> {
	try {
		dataBaseInitialization();
		// prettier-ignore
		const app = new App([
			new HealthCheckController(),
			new AuthenticationController(),
			new ApplicationController(),
			new OrganizationController(),
			new BuildingController(),
			new GroupController(),
			new DeviceController(),
			new TopicController(),
			new DigitalTwinController(),
		]);
		app.listen();
	} catch (error) {
		logger.log("error", "Server initiation failed: %s ", error.message);
	}
}

main();
