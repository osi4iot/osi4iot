/* istanbul ignore file */
import "reflect-metadata";
import App from "./app";
import HealthCheckController from "./utils/healthCheck/healthCheck.controller";
import AuthenticationController from "./components/Authentication/authentication.controller";
import { logger } from "./config/winston";
import { dataBaseInitialization } from "./initialization/migration";
import { refreshAllComputedMessageSchemas } from "./components/topic/messageSchema";
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
import process_env from "./config/api_config";
import { migrateDigitalTwinsPipelineTopics } from "./components/digitalTwin/digitalTwinDAL";
import { migrateAssetDeviceTopicRefs } from "./components/asset/assetTopicRefs";
import S3FolderController from "./components/s3_folder/s3_folder.controller";
import GroupKnowledgeController from "./components/group/groupKnowledge.controller";
import LlmModelsController from "./components/organization/llmModels.controller";
import AlarmHistoryController from "./components/alarmHistory/alarmHistory.controller";
import ApprovalHistoryController from "./components/approvalHistory/approvalHistory.controller";
import { ensureEventHistoryTables } from "./utils/eventHistory/eventHistory";
import { LLM_USAGE_RETENTION_DAYS } from "./components/llmUsage/llmUsageDAL";
import LlmUsageController from "./components/llmUsage/llmUsage.controller";
import SkillController from "./components/skill/skill.controller";
import { seedBuiltinSkills } from "./components/skill/skillStorage";
import { createMissingAssetStateRows } from "./components/asset/assetStateDAL";
import { ensureDigitalTwinViewerSettingsColumn } from "./components/digitalTwin/digitalTwinDAL";
import ViewerLayoutController from "./components/viewerLayout/viewerLayout.controller";
import TimeSeriesController from "./components/timeSeries/timeSeries.controller";
import { ensureViewerLayoutTable } from "./components/viewerLayout/viewerLayoutDAL";

const main = async (): Promise<void> => {
	try {
		await dataBaseInitialization();
		// digital twins of older versions: the viewer_settings column (every replica, before serving)
		try {
			await ensureDigitalTwinViewerSettingsColumn();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.log("error", "The viewer_settings column of the digital twins could not be added: %s", message);
		}
		// the layouts of the Viewer page (one per digital twin, saved by group administrators)
		try {
			await ensureViewerLayoutTable();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.log("error", "The viewer_layout table could not be created: %s", message);
		}
		// esquemas de mensaje calculados (sensores, simulación, fijos): por si ha cambiado algo de lo que dependen
		await refreshAllComputedMessageSchemas();
		await natsClient.connect();
		// digital twins of older versions: the single "inject" topic instead of inject_1..inject_5,
		// and the "approval" topic
		if (process_env.REPLICA === "1") {
			try {
				await migrateDigitalTwinsPipelineTopics();
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.log("error", "The pipeline topics of the digital twins could not be migrated: %s", message);
			}
		}
		// device topics of the assets named by their type (dev2dtm_n, dtm2dev_n; the mobile asset had dev2pdb_5..7)
		if (process_env.REPLICA === "1") {
			try {
				await migrateAssetDeviceTopicRefs();
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.log("error", "The device topics of the assets could not be renamed: %s", message);
			}
		}
		// the row of each asset in the IoT DB's asset states (assets of older versions)
		if (process_env.REPLICA === "1") {
			try {
				const created = await createMissingAssetStateRows();
				if (created > 0) logger.log("info", `Asset states created for ${created} assets`);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.log("error", "The missing asset states could not be created: %s", message);
			}
		}
		// the history of alarms and approvals in the IoT database (clusters created before it), and the
		// retention of the LLM usage (2 years)
		if (process_env.REPLICA === "1") {
			try {
				await ensureEventHistoryTables(LLM_USAGE_RETENTION_DAYS);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.log("error", "The history tables of alarms and approvals could not be created: %s", message);
			}
		}
		// the platform's built-in skills, in the bucket (they do not stop the start if they fail)
		await seedBuiltinSkills();

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
			new LlmUsageController(),
			new AlarmHistoryController(),
			new ApprovalHistoryController(),
			new ViewerLayoutController(),
			new TimeSeriesController(),
			new SkillController(),
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