/* istanbul ignore file */
import "reflect-metadata";
import App from "./app";
import HealthCheckController from "./utils/healthCheck/healthCheck.controller";
import AuthenticationController from "./components/authentication/authentication.controller";
import { logger } from "./config/winston";
import { dataBaseInitialization } from "./utils/dbmigration/migration";
import OrganizationController from "./components/organization/organization.controller";
import ApplicationController from "./components/application/application.controller";
import GroupController from "./components/group/group.controller";

async function main(): Promise<void> {
	try {
		dataBaseInitialization();
		// prettier-ignore
		const app = new App([
			new HealthCheckController(),
			new AuthenticationController(),
			new ApplicationController(),
			new OrganizationController(),
			new GroupController(),
		]);
		app.listen();
	} catch (error) {
		logger.log("error", "Server initiation failed: %s ", error.message);
	}
}

main();
