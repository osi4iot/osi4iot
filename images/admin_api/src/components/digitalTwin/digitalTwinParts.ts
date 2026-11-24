// The parts of a digital twin that the Viewer loads and downloads (README, "Viewer data"): its 3D model, its FEM
// results, its simulator format, its pipeline and its viewer configuration. Each one can be loaded alone, or all of
// them at once from a .zip. The files themselves go to the twin's folders in S3 with digital_twin_upload_file
// (gltfFile and femResJson of a slide's model, slideModels.ts; viewerImages); these functions keep the database in
// step with them.
//
// The type of a twin ("Glb 3D model", "Gltf 3D model", "Grafana dashboard") is no longer chosen in its forms: it says
// whether it has a 3D model, and of which kind, and it follows the model loaded (modelTypeOf). It is kept for
// what still reads it.
import pool from "../../config/dbconfig";
import natsClient from "../../config/natsConfig";
import IGroup from "../group/interfaces/Group.interface";
import { getSensorsByAssetId } from "../sensor/sensorDAL";
import { refreshTopicsMessageSchema, topicIdsOfDigitalTwin } from "../topic/messageSchema";
import IDigitalTwin from "./digitalTwin.interface";
import {
	checkMaxNumberOfFemResFiles,
	getGltfFileInfo,
	removeFilesFromBucketFolder,
	verifyAndCorrectDigitalTwinReferences,
} from "./digitalTwinDAL";
import UpdateDigitalTwinDto from "./digitalTwinUpdate.dto";
import { getSlideModels, modelKeyBase, refreshTwinFromModels, setSlideModelRow } from "./slideModels";

export const NO_MODEL_TYPE = "Grafana dashboard";
export const MODEL_FILE_NAME = /^[^/\\]{1,200}\.(glb|gltf)$/i;
export const MAX_FEM_RESULT_FILES = 100;
const MAX_SIMULATOR_PARAMETERS = 200;

// the type of a twin with this model file ("": none)
export const modelTypeOf = (fileName: string | null | undefined): string => {
	const name = (fileName ?? "").toLowerCase();
	if (name.endsWith(".glb")) return "Glb 3D model";
	if (name.endsWith(".gltf")) return "Gltf 3D model";
	return NO_MODEL_TYPE;
};

// the sensor references of a model that its asset does not have (a model may only point at the asset's sensors)
export const missingSensorsRef = async (assetId: number, sensorsRef: string[]): Promise<string[]> => {
	if (sensorsRef.length === 0) return [];
	const sensors = await getSensorsByAssetId(assetId);
	const known = new Set(sensors.map((s) => s.sensorRef));
	return [...new Set(sensorsRef)].filter((ref) => !known.has(ref));
};

const publishUpdate = async (digitalTwin: IDigitalTwin) => {
	await natsClient.jsPublish("digitalTwin", "update", digitalTwin.id, { groupId: digitalTwin.groupId });
};

// The model just uploaded to a slide's gltfFile (slideModels.ts): the twin's sensors become the union of those of
// its models (they give the viewer the topic of each sensor) and its type follows them. Its topics are completed
// if some is missing.
export const registerModel = async (
	group: IGroup,
	digitalTwin: IDigitalTwin,
	slideId: string,
	fileName: string,
	sensorsRef: string[]
): Promise<{ type: string; fileName: string }> => {
	const stored = await getGltfFileInfo(digitalTwin, slideId);
	const storedName = stored.gltfFileName.split("/").pop() ?? "";
	if (!storedName || storedName !== fileName) {
		throw new Error(`The model ${fileName} is not in the slide's files: upload it first`);
	}
	await setSlideModelRow(digitalTwin.id, slideId, fileName, sensorsRef);
	await refreshTwinFromModels(digitalTwin);
	const type = modelTypeOf(fileName);
	await verifyAndCorrectDigitalTwinReferences(group, { ...digitalTwin, type } as IDigitalTwin & UpdateDigitalTwinDto);
	return { type, fileName };
};

// A slide without its 3D model (its FEM results stay: they can be removed apart, or replaced with the next model's)
export const removeModel = async (digitalTwin: IDigitalTwin, slideId: string): Promise<void> => {
	await removeFilesFromBucketFolder(`${modelKeyBase(digitalTwin, slideId)}/gltfFile`);
	await pool.query("DELETE FROM grafanadb.digital_twin_slide_model WHERE digital_twin_id = $1 AND slide_id = $2", [
		digitalTwin.id,
		slideId,
	]);
	await refreshTwinFromModels(digitalTwin);
};

// what is wrong in a simulator format (null: nothing): an object whose fields are objects (label, units...)
export const simulatorFormatProblem = (format: unknown): string | null => {
	if (format === null || typeof format !== "object" || Array.isArray(format)) return "The simulator format must be a JSON object";
	const entries = Object.entries(format as Record<string, unknown>);
	if (entries.length > MAX_SIMULATOR_PARAMETERS) return `A simulator format has at most ${MAX_SIMULATOR_PARAMETERS} parameters`;
	for (const [name, value] of entries) {
		if (!/^[A-Za-z0-9_.-]{1,80}$/.test(name)) return `Invalid parameter name: ${name.slice(0, 80)}`;
		if (value === null || typeof value !== "object" || Array.isArray(value)) return `The parameter ${name} must be an object`;
	}
	return null;
};

export const setSimulatorFormat = async (
	digitalTwin: IDigitalTwin,
	format: Record<string, unknown>,
	fileName: string,
	lastModifDate: string
): Promise<void> => {
	await pool.query(
		`UPDATE grafanadb.digital_twin SET digital_twin_simulation_format = $1::jsonb,
		 digital_twin_simulation_format_file_name = $2, digital_twin_simulation_format_last_modif_date = $3, updated = NOW()
		 WHERE id = $4`,
		[JSON.stringify(format), fileName.slice(0, 190) || "-", lastModifDate.slice(0, 60) || "-", digitalTwin.id]
	);
	await refreshTopicsMessageSchema(await topicIdsOfDigitalTwin(digitalTwin.id));
	await publishUpdate(digitalTwin);
};

// how many FEM result files each slide's model keeps (the newest); the older ones are removed
export const setMaxFemResultFiles = async (digitalTwin: IDigitalTwin, max: number): Promise<void> => {
	await pool.query("UPDATE grafanadb.digital_twin SET max_num_resfem_files = $1, updated = NOW() WHERE id = $2", [max, digitalTwin.id]);
	for (const slideId of Object.keys(await getSlideModels(digitalTwin))) {
		await checkMaxNumberOfFemResFiles({ ...digitalTwin, maxNumResFemFiles: max }, slideId);
	}
};
