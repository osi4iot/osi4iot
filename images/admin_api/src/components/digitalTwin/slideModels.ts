// The 3D models of the slides of a digital twin's Viewer (README, "Viewer data"). Each slide has at most one
// "3D Model" panel, and that panel its own files in S3, under the slide's id (immutable: a slide keeps it when it is
// renamed or moved; a duplicated slide gets a new one):
//
//   org_data/org_<org>/group_<group>/digitalTwin_<dt>/slides/<slideId>/
//       gltfFile/<model>.glb|.gltf     the model (one)
//       femResJson/<results>.json      its FEM results (the newest maxNumResFemFiles)
//       femResParquet/…                the same, converted by pipelines for the AI agents
//
// grafanadb.digital_twin_slide_model keeps, for each slide with a model, the file's name and the sensors the model
// points at: the twin's sensors (digital_twin_sensor) are the union of those of all its models.
//
// The files of a slide are removed when the group's layout is saved without it, or without its 3D Model panel
// (removedModelSlides), and copied when a slide is duplicated (copySlideFiles). Before this version a twin had one
// model, at the root of its folder: migrateRootModels moves it to the slides that show it.
import { CopyObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import pool, { readQuery } from "../../config/dbconfig";
import process_env from "../../config/api_config";
import s3Client from "../../config/s3Config";
import natsClient from "../../config/natsConfig";
import { getSensorsByAssetId } from "../sensor/sensorDAL";
import { refreshTopicsMessageSchema, topicIdsOfDigitalTwin } from "../topic/messageSchema";
import { IViewerLayout } from "../viewerLayout/viewerLayoutValidation";
import IDigitalTwin from "./digitalTwin.interface";

// a slide's id, as the layouts have them (viewerLayoutValidation: PANEL_ID)
export const SLIDE_ID = /^[A-Za-z0-9_-]{1,40}$/;
// the slide of the automatic layout (the frontend's defaultWorkspaceLayout), and of the twins of older versions
export const FIRST_SLIDE_ID = "slide-1";
// the folders of a slide's model
export const MODEL_FOLDERS = ["gltfFile", "femResJson", "femResParquet"];

export const twinKeyBase = (digitalTwin: Pick<IDigitalTwin, "orgId" | "groupId" | "id">): string =>
	`org_data/org_${digitalTwin.orgId}/group_${digitalTwin.groupId}/digitalTwin_${digitalTwin.id}`;

// where the files of a slide's model are ("": the root of the twin's folder, as before slides had models)
export const modelKeyBase = (digitalTwin: Pick<IDigitalTwin, "orgId" | "groupId" | "id">, slideId: string): string =>
	slideId ? `${twinKeyBase(digitalTwin)}/slides/${slideId}` : twinKeyBase(digitalTwin);

// the slide of a request (?slide=…): "" when none; null when it is not a slide's id
export const slideOfQuery = (value: unknown): string | null => {
	if (value === undefined || value === "") return "";
	return typeof value === "string" && SLIDE_ID.test(value) ? value : null;
};

export const SLIDE_MODEL_DDL = `
CREATE TABLE IF NOT EXISTS grafanadb.digital_twin_slide_model(
	digital_twin_id bigint NOT NULL,
	slide_id VARCHAR(40) NOT NULL,
	file_name VARCHAR(200) NOT NULL,
	sensors_ref TEXT[] NOT NULL DEFAULT '{}',
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (digital_twin_id, slide_id),
	CONSTRAINT fk_slide_model_digital_twin
		FOREIGN KEY(digital_twin_id)
		REFERENCES grafanadb.digital_twin(id)
		ON DELETE CASCADE
);`;

// Every replica at start, before serving
export const ensureSlideModelTable = async (): Promise<void> => {
	await pool.query(SLIDE_MODEL_DDL);
};

export interface ISlideModelRow {
	slideId: string;
	fileName: string;
	sensorsRef: string[];
}

export const getSlideModelRows = async (digitalTwinId: number): Promise<ISlideModelRow[]> => {
	const result = await readQuery<ISlideModelRow>(
		`SELECT slide_id AS "slideId", file_name AS "fileName", sensors_ref AS "sensorsRef"
		FROM grafanadb.digital_twin_slide_model WHERE digital_twin_id = $1 ORDER BY slide_id`,
		[digitalTwinId]
	);
	return result.rows;
};

// ---------------------------------------------------------------------------------------------------------
// S3

const bucket = () => process_env.S3_BUCKET_NAME;

export interface IS3Object {
	key: string;
	lastModified: string;
	size: number;
}

export const listObjects = async (prefix: string): Promise<IS3Object[]> => {
	const p = prefix.endsWith("/") ? prefix : `${prefix}/`;
	const objects: IS3Object[] = [];
	let token: string | undefined;
	do {
		const data = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: p, ContinuationToken: token }));
		for (const o of data.Contents ?? []) {
			if (o.Key) objects.push({ key: o.Key, lastModified: o.LastModified?.toString() ?? "", size: o.Size ?? 0 });
		}
		token = data.IsTruncated ? data.NextContinuationToken : undefined;
	} while (token);
	return objects;
};

const copySource = (key: string) => `${bucket()}/${key.split("/").map(encodeURIComponent).join("/")}`;

// copies every object under one prefix to another (the same relative keys)
export const copyPrefix = async (from: string, to: string, folders?: string[]): Promise<number> => {
	const objects = await listObjects(from);
	let copied = 0;
	for (const o of objects) {
		const rest = o.key.slice(from.length + 1);
		if (folders && !folders.includes(rest.split("/")[0])) continue;
		await s3Client.send(new CopyObjectCommand({ Bucket: bucket(), CopySource: copySource(o.key), Key: `${to}/${rest}` }));
		copied++;
	}
	return copied;
};

// ---------------------------------------------------------------------------------------------------------
// What each slide has

export interface ISlideModelInfo {
	// the model's file ("": none) with its date and size
	gltfFileName: string;
	gltfFileDate: string;
	gltfFileSize: number;
	// how many FEM result files it has
	femResults: number;
}

const emptyInfo = (): ISlideModelInfo => ({ gltfFileName: "", gltfFileDate: "", gltfFileSize: 0, femResults: 0 });

// the files under <twin>/slides/, by slide (from their keys: slides/<slideId>/<folder>/<file>)
export const slideModelsFromKeys = (keyBase: string, objects: IS3Object[]): Record<string, ISlideModelInfo> => {
	const prefix = `${keyBase}/slides/`;
	const bySlide: Record<string, ISlideModelInfo> = {};
	const newest: Record<string, number> = {};
	for (const o of objects) {
		if (!o.key.startsWith(prefix)) continue;
		const [slideId, folder, ...rest] = o.key.slice(prefix.length).split("/");
		if (!SLIDE_ID.test(slideId) || rest.length !== 1 || !rest[0]) continue;
		const info = (bySlide[slideId] ??= emptyInfo());
		if (folder === "gltfFile") {
			const time = new Date(o.lastModified).getTime() || 0;
			// the newest model, if an upload left two
			if (newest[slideId] === undefined || time > newest[slideId]) {
				newest[slideId] = time;
				info.gltfFileName = rest[0];
				info.gltfFileDate = o.lastModified;
				info.gltfFileSize = o.size;
			}
		} else if (folder === "femResJson") info.femResults++;
	}
	const out: Record<string, ISlideModelInfo> = {};
	for (const [slideId, info] of Object.entries(bySlide)) {
		if (info.gltfFileName || info.femResults > 0) out[slideId] = info;
	}
	return out;
};

export const getSlideModels = async (digitalTwin: IDigitalTwin): Promise<Record<string, ISlideModelInfo>> => {
	const keyBase = twinKeyBase(digitalTwin);
	return slideModelsFromKeys(keyBase, await listObjects(`${keyBase}/slides`));
};

// ---------------------------------------------------------------------------------------------------------
// The twin's sensors and type follow its models

const modelTypeOf = (fileName: string): string => {
	const name = fileName.toLowerCase();
	if (name.endsWith(".glb")) return "Glb 3D model";
	if (name.endsWith(".gltf")) return "Gltf 3D model";
	return "Grafana dashboard";
};

// the union of the sensors of all the twin's models (digital_twin_sensor) and its type (that of a model: the twin
// "has a 3D model"); then its topics' message schemas and the pipelines learn it
export const refreshTwinFromModels = async (digitalTwin: IDigitalTwin): Promise<void> => {
	const rows = await getSlideModelRows(digitalTwin.id);
	const refs = new Set(rows.flatMap((r) => r.sensorsRef ?? []));
	const sensors = await getSensorsByAssetId(digitalTwin.assetId);
	const ids = sensors.filter((s) => refs.has(s.sensorRef)).map((s) => Number(s.id));
	const type = modelTypeOf(rows.find((r) => r.fileName)?.fileName ?? "");
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query("UPDATE grafanadb.digital_twin SET type = $1, updated = NOW() WHERE id = $2", [type, digitalTwin.id]);
		await client.query("DELETE FROM grafanadb.digital_twin_sensor WHERE digital_twin_id = $1", [digitalTwin.id]);
		for (const id of ids) {
			await client.query(
				"INSERT INTO grafanadb.digital_twin_sensor(digital_twin_id, sensor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
				[digitalTwin.id, id]
			);
		}
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
	await refreshTopicsMessageSchema(await topicIdsOfDigitalTwin(digitalTwin.id));
	await natsClient.jsPublish("digitalTwin", "update", digitalTwin.id, { groupId: digitalTwin.groupId });
};

export const setSlideModelRow = async (digitalTwinId: number, slideId: string, fileName: string, sensorsRef: string[]): Promise<void> => {
	await pool.query(
		`INSERT INTO grafanadb.digital_twin_slide_model (digital_twin_id, slide_id, file_name, sensors_ref, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (digital_twin_id, slide_id) DO UPDATE
		SET file_name = EXCLUDED.file_name, sensors_ref = EXCLUDED.sensors_ref, updated_at = NOW()`,
		[digitalTwinId, slideId, fileName.slice(0, 200), [...new Set(sensorsRef)].slice(0, 500)]
	);
};

const deleteSlideModelRows = async (digitalTwinId: number, slideIds: string[]): Promise<void> => {
	if (slideIds.length === 0) return;
	await pool.query("DELETE FROM grafanadb.digital_twin_slide_model WHERE digital_twin_id = $1 AND slide_id = ANY($2)", [
		digitalTwinId,
		slideIds,
	]);
};

// ---------------------------------------------------------------------------------------------------------
// Removing, copying

const deleteKeys = async (keys: string[]): Promise<void> => {
	for (let i = 0; i < keys.length; i += 1000) {
		await s3Client.send(
			new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) } })
		);
	}
};

export const removePrefix = async (prefix: string): Promise<number> => {
	const keys = (await listObjects(prefix)).map((o) => o.key);
	await deleteKeys(keys);
	return keys.length;
};

// removes the files of these slides (model, FEM results and their Parquet) and what the database keeps of them
export const removeSlideFiles = async (digitalTwin: IDigitalTwin, slideIds: string[]): Promise<void> => {
	const ids = slideIds.filter((id) => SLIDE_ID.test(id));
	if (ids.length === 0) return;
	for (const id of ids) await removePrefix(modelKeyBase(digitalTwin, id));
	await deleteSlideModelRows(digitalTwin.id, ids);
	await refreshTwinFromModels(digitalTwin);
};

// a duplicated slide gets a copy of the files of its model (the Parquet too: pipelines finds it current)
export const copySlideFiles = async (digitalTwin: IDigitalTwin, from: string, to: string): Promise<number> => {
	const copied = await copyPrefix(modelKeyBase(digitalTwin, from), modelKeyBase(digitalTwin, to), MODEL_FOLDERS);
	const row = (await getSlideModelRows(digitalTwin.id)).find((r) => r.slideId === from);
	if (row) await setSlideModelRow(digitalTwin.id, to, row.fileName, row.sensorsRef);
	return copied;
};

// ---------------------------------------------------------------------------------------------------------
// The layout decides which slides keep their files

const modelSlides = (layout: IViewerLayout | null | undefined): Set<string> =>
	new Set((layout?.slides ?? []).filter((s) => s.panels.some((p) => p.type === "model")).map((s) => s.id));

// The slides whose files go when the group's layout becomes `next` (previous: the layout saved until now; null: the
// automatic one, whose only slide is FIRST_SLIDE_ID): those of `stored` (the slides with files) that are not in
// `next` (a slide removed, or one never saved: a new slide whose editing was cancelled), and those that had a 3D
// Model panel and no longer have it.
export const removedModelSlides = (
	previous: IViewerLayout | null,
	next: IViewerLayout | null,
	stored: string[]
): string[] => {
	const nextIds = new Set(next ? next.slides.map((s) => s.id) : [FIRST_SLIDE_ID]);
	const before = previous ? modelSlides(previous) : new Set([FIRST_SLIDE_ID]);
	const after = next ? modelSlides(next) : new Set([FIRST_SLIDE_ID]);
	return stored.filter((id) => !nextIds.has(id) || (before.has(id) && !after.has(id)));
};

// The slides in the order of the layout (the automatic one: FIRST_SLIDE_ID), and then the others with files
export const slidesInOrder = (layout: IViewerLayout | null, stored: string[]): string[] => {
	const order = layout ? layout.slides.map((s) => s.id) : [FIRST_SLIDE_ID];
	return [...order.filter((id) => stored.includes(id)), ...stored.filter((id) => !order.includes(id)).sort()];
};

// ---------------------------------------------------------------------------------------------------------
// Twins of older versions: the model at the root of their folder

// The slides that get the model of the root: those of the saved layout with a 3D Model panel; none, or no saved
// layout: the first slide (that of the automatic layout)
export const rootModelTargets = (layout: IViewerLayout | null): string[] => {
	const slides = [...modelSlides(layout)];
	if (slides.length > 0) return slides;
	return [layout?.slides[0]?.id ?? FIRST_SLIDE_ID];
};

// Moves the model and the FEM results at the root of each twin's folder to its slides (rootModelTargets), with the
// twin's current sensors; the root's Parquet is removed (pipelines converts each slide's again). Replica 1, at
// start; nothing to do once moved.
export const migrateRootModels = async (log: (message: string) => void): Promise<number> => {
	const twins = (
		await readQuery<IDigitalTwin & { layout: IViewerLayout | null }>(
			`SELECT grafanadb.digital_twin.id, grafanadb.digital_twin.group_id AS "groupId",
			grafanadb.digital_twin.asset_id AS "assetId", grafanadb.group.org_id AS "orgId",
			grafanadb.viewer_layout.layout
			FROM grafanadb.digital_twin
			INNER JOIN grafanadb.group ON grafanadb.group.id = grafanadb.digital_twin.group_id
			LEFT JOIN grafanadb.viewer_layout ON grafanadb.viewer_layout.digital_twin_id = grafanadb.digital_twin.id`,
			[]
		)
	).rows;
	let moved = 0;
	for (const twin of twins) {
		const root = twinKeyBase(twin);
		const objects = [...(await listObjects(`${root}/gltfFile`)), ...(await listObjects(`${root}/femResJson`))];
		if (objects.length === 0) continue;
		const targets = rootModelTargets(twin.layout);
		const sensorsRef = (
			await readQuery<{ sensorRef: string }>(
				`SELECT grafanadb.sensor.sensor_ref AS "sensorRef" FROM grafanadb.sensor
				INNER JOIN grafanadb.digital_twin_sensor ON grafanadb.digital_twin_sensor.sensor_id = grafanadb.sensor.id
				WHERE grafanadb.digital_twin_sensor.digital_twin_id = $1`,
				[twin.id]
			)
		).rows.map((r) => r.sensorRef);
		const model = objects
			.filter((o) => o.key.startsWith(`${root}/gltfFile/`))
			.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())[0];
		for (const slideId of targets) {
			await copyPrefix(root, modelKeyBase(twin, slideId), ["gltfFile", "femResJson"]);
			if (model) await setSlideModelRow(twin.id, slideId, model.key.split("/").pop() ?? "", sensorsRef);
		}
		await deleteKeys(objects.map((o) => o.key));
		await removePrefix(`${root}/femResParquet`);
		for (const slideId of targets) {
			await natsClient.jsPublish("femResults", "create", twin.id, { groupId: twin.groupId, digitalTwinId: twin.id, slideId });
		}
		log(`Digital twin ${twin.id}: its 3D model and FEM results moved to the slides ${targets.join(", ")}`);
		moved++;
	}
	return moved;
};
