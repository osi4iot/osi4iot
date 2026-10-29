/* istanbul ignore file */
import "reflect-metadata";
import App from "./app";
import HealthCheckController from "./utils/healthCheck/healthCheck.controller";
import AuthenticationController from "./components/Authentication/authentication.controller";
import { logger } from "./config/winston";
import { dataBaseInitialization } from "./initialization/migration";
import { refreshAllComputedMessageSchemas } from "./components/topic/messageSchema";
import { notifyMobileAudioSensors } from "./initialization/mobileAudioSensor";
import OrganizationController from "./components/organization/organization.controller";
import ApplicationController from "./components/application/application.controller";
import GroupController from "./components/group/group.controller";
import TopicController from "./components/topic/topic.controller";
import DigitalTwinController from "./components/digitalTwin/digitalTwinController";
import BuildingController from "./components/building/building.controller";
import MeasurementController from "./components/mesurement/measurement.controller";
import DashboardController from "./components/dashboard/dashboardController";
import MLModelController from "./components/ml_model/ml_modelController";
import AssetController from "./components/asset/asset.controller";
import SensorController from "./components/sensor/sensor.controller";
import natsClient from "./config/natsConfig";
import S3FolderController from "./components/s3_folder/s3_folder.controller";
import GroupKnowledgeController from "./components/group/groupKnowledge.controller";
import LlmModelsController from "./components/organization/llmModels.controller";

const main = async (): Promise<void> => {
	try {
		await dataBaseInitialization();
		// esquemas de mensaje calculados (sensores, simulación, fijos): por si ha cambiado algo de lo que dependen
		await refreshAllComputedMessageSchemas();
		await natsClient.connect();
		await notifyMobileAudioSensors();

		// prettier-ignore
		const app = new App([
			new HealthCheckController(),
			new AuthenticationController(),
			new ApplicationController(),
			new OrganizationController(),
			new BuildingController(),
			new GroupController(),
			new GroupKnowledgeController(),
			new LlmModelsController(),
			new AssetController(),
			new S3FolderController(),
			new SensorController(),
			new TopicController(),
			new MeasurementController(),
			new DigitalTwinController(),
			new MLModelController(),
			new DashboardController(),
		]);
		app.listen();
	} catch (error: any) {
		logger.log("error", "Server initiation failed: %s ", error.message);
		logger.log("error", "Process finished");
		process.exit(1);
	}
};

void main();
