// The 3D models of the slides of a digital twin's Viewer (README, "Viewer data"). Each slide has at most one
// "3D Model" panel, and that panel its own files in S3, under the slide's id (immutable: a slide keeps it when it is
// renamed or moved; a duplicated slide gets a new one):
//
//   org_data/org_<org>/group_<group>/digitalTwin_<dt>/slides/<slideId>/
//       gltfFile/<model>.glb|.gltf     the model (one)
//       femResJson/<results>.json      its FEM results (the newest maxNumResFemFiles)
//       femResParquet/…                the same, converted by pipelines for the AI agents
//
// A slide with a canvas can have a 3D Model panel in each frame of its drawing: the scope of such a model is
// "<slideId>:<frameId>" (MODEL_SCOPE), its files under slides/<slideId>/frames/<frameId>/ (the same folders). The
// scope is what the API takes (?slide=), what the database keeps (slide_id) and what the messages of that model's
// simulator carry ("$slide"). A model panel moved to another frame takes its files with it (movedModels).
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
// the scope of a model: a slide, or a frame of its canvas (slide:frame)
export const MODEL_SCOPE = /^[A-Za-z0-9_-]{1,40}(?::[A-Za-z0-9_-]{1,40})?$/;
// the folder of a slide's frames (slides/<slideId>/frames/<frameId>/…)
export const FRAMES_FOLDER = "frames";
// where the files of moved models wait while they are moved (slides/<slideId>/moving/<n>/…)
const MOVING_FOLDER = "moving";

export const scopeOf = (slideId: string, frame?: string): string => (frame ? `${slideId}:${frame}` : slideId);
export const slideOfScope = (scope: string): string => scope.split(":")[0];

export const twinKeyBase = (digitalTwin: Pick<IDigitalTwin, "orgId" | "groupId" | "id">): string =>
	`org_data/org_${digitalTwin.orgId}/group_${digitalTwin.groupId}/digitalTwin_${digitalTwin.id}`;

// where the files of a model are, by its scope: a slide (slides/<slideId>), a frame of its canvas
// (slides/<slideId>/frames/<frameId>); "": the root of the twin's folder, as before slides had models
export const modelKeyBase = (digitalTwin: Pick<IDigitalTwin, "orgId" | "groupId" | "id">, scope: string): string => {
	if (!scope) return twinKeyBase(digitalTwin);
	const [slideId, frame] = scope.split(":");
	return `${twinKeyBase(digitalTwin)}/slides/${slideId}${frame ? `/${FRAMES_FOLDER}/${frame}` : ""}`;
};

// the slide of a request (?slide=…): "" when none; null when it is not a slide's id
export const slideOfQuery = (value: unknown): string | null => {
	if (value === undefined || value === "") return "";
	return typeof value === "string" && SLIDE_ID.test(value) ? value : null;
};

// the scope of a model of a request (?slide=<slideId> or <slideId>:<frameId>): "" when none; null when invalid
export const scopeOfQuery = (value: unknown): string | null => {
	if (value === undefined || value === "") return "";
	return typeof value === "string" && MODEL_SCOPE.test(value) ? value : null;
};

export const SLIDE_MODEL_DDL = `
CREATE TABLE IF NOT EXISTS grafanadb.digital_twin_slide_model(
	digital_twin_id bigint NOT NULL,
	slide_id VARCHAR(81) NOT NULL,
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
	// slide_id is a scope (slide:frame) since the frames of a canvas have models: the tables of older versions grow
	const width = await pool.query(
		`SELECT character_maximum_length AS len FROM information_schema.columns
		WHERE table_schema = 'grafanadb' AND table_name = 'digital_twin_slide_model' AND column_name = 'slide_id'`
	);
	const len = Number(width.rows[0]?.len ?? 81);
	if (len < 81) await pool.query("ALTER TABLE grafanadb.digital_twin_slide_model ALTER COLUMN slide_id TYPE VARCHAR(81)");
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

// the scope, folder and file of a key under <twin>/slides/: slides/<slideId>/<folder>/<file> or
// slides/<slideId>/frames/<frameId>/<folder>/<file>; null for anything else (a canvas, files being moved…)
export const modelFileOfKey = (rest: string): { scope: string; folder: string; file: string } | null => {
	const parts = rest.split("/");
	if (parts.length === 3 && SLIDE_ID.test(parts[0]) && parts[1] !== FRAMES_FOLDER && parts[2]) {
		return { scope: parts[0], folder: parts[1], file: parts[2] };
	}
	if (parts.length === 5 && SLIDE_ID.test(parts[0]) && parts[1] === FRAMES_FOLDER && SLIDE_ID.test(parts[2]) && parts[4]) {
		return { scope: scopeOf(parts[0], parts[2]), folder: parts[3], file: parts[4] };
	}
	return null;
};

// the files under <twin>/slides/, by scope (a slide, or a frame of its canvas: modelFileOfKey)
export const slideModelsFromKeys = (keyBase: string, objects: IS3Object[]): Record<string, ISlideModelInfo> => {
	const prefix = `${keyBase}/slides/`;
	const bySlide: Record<string, ISlideModelInfo> = {};
	const newest: Record<string, number> = {};
	for (const o of objects) {
		if (!o.key.startsWith(prefix)) continue;
		const found = modelFileOfKey(o.key.slice(prefix.length));
		if (!found) continue;
		const { scope: slideId, folder } = found;
		const rest = [found.file];
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

const removeModelFolders = async (digitalTwin: Pick<IDigitalTwin, "orgId" | "groupId" | "id">, scope: string): Promise<void> => {
	for (const folder of MODEL_FOLDERS) await removePrefix(`${modelKeyBase(digitalTwin, scope)}/${folder}`);
};

// removes the files of these scopes (model, FEM results and their Parquet) and what the database keeps of them
export const removeSlideFiles = async (digitalTwin: IDigitalTwin, scopes: string[]): Promise<void> => {
	const ids = scopes.filter((id) => MODEL_SCOPE.test(id));
	if (ids.length === 0) return;
	// only the model's folders: its Canvas (slideCanvas.ts) has its own life
	for (const id of ids) await removeModelFolders(digitalTwin, id);
	await deleteSlideModelRows(digitalTwin.id, ids);
	await refreshTwinFromModels(digitalTwin);
};

// a duplicated slide gets a copy of the files of its models, those of the frames of its canvas too (the Parquet
// too: pipelines finds it current), and of its Canvas (whose frames keep their ids). The scopes copied.
export const copySlideFiles = async (digitalTwin: IDigitalTwin, from: string, to: string): Promise<{ copied: number; scopes: string[] }> => {
	const copied = await copyPrefix(modelKeyBase(digitalTwin, from), modelKeyBase(digitalTwin, to), [...MODEL_FOLDERS, "canvas", FRAMES_FOLDER]);
	const scopes: string[] = [];
	for (const row of await getSlideModelRows(digitalTwin.id)) {
		if (slideOfScope(row.slideId) !== from) continue;
		const scope = `${to}${row.slideId.slice(from.length)}`;
		await setSlideModelRow(digitalTwin.id, scope, row.fileName, row.sensorsRef);
		scopes.push(scope);
	}
	return { copied, scopes };
};

// A model panel moved to another frame (or into a frame, or out of it): its files go with it, to its new scope.
// The files are first copied apart (two models can swap their frames), then the targets emptied and filled, and the
// database follows. The scopes left behind are removed with removedModelSlides (they had a model and no longer do).
// Returns the scopes filled (their FEM results are converted again by pipelines).
export const moveModels = async (digitalTwin: IDigitalTwin, moves: IModelMove[], stored: string[]): Promise<string[]> => {
	const todo = moves.filter((m) => stored.includes(m.from) && m.from !== m.to);
	if (todo.length === 0) return [];
	const rows = await getSlideModelRows(digitalTwin.id);
	const base = twinKeyBase(digitalTwin);
	const staged = todo.map((m, i) => ({ ...m, tmp: `${base}/slides/${slideOfScope(m.from)}/${MOVING_FOLDER}/${i}` }));
	for (const m of staged) await copyPrefix(modelKeyBase(digitalTwin, m.from), m.tmp, MODEL_FOLDERS);
	for (const m of staged) {
		await removeModelFolders(digitalTwin, m.to);
		await copyPrefix(m.tmp, modelKeyBase(digitalTwin, m.to), MODEL_FOLDERS);
		await removePrefix(m.tmp);
	}
	await deleteSlideModelRows(digitalTwin.id, staged.map((m) => m.to));
	for (const m of staged) {
		const row = rows.find((r) => r.slideId === m.from);
		if (row) await setSlideModelRow(digitalTwin.id, m.to, row.fileName, row.sensorsRef);
	}
	return staged.map((m) => m.to);
};

// ---------------------------------------------------------------------------------------------------------
// The layout decides which slides keep their files

// the scopes of the 3D Model panels of a layout (a slide, or slide:frame for one in a frame of its canvas)
const modelSlides = (layout: IViewerLayout | null | undefined): Set<string> =>
	new Set((layout?.slides ?? []).flatMap((s) => s.panels.filter((p) => p.type === "model").map((p) => scopeOf(s.id, p.frame))));

export interface IModelMove {
	from: string;
	to: string;
}

// the 3D Model panels whose scope changes from `previous` to `next` (the same panel of the same slide, in another
// frame): their files go with them (moveModels)
export const movedModels = (previous: IViewerLayout | null, next: IViewerLayout | null): IModelMove[] => {
	if (!previous || !next) return [];
	const moves: IModelMove[] = [];
	for (const slide of next.slides) {
		const before = previous.slides.find((s) => s.id === slide.id);
		if (!before) continue;
		for (const panel of slide.panels) {
			if (panel.type !== "model") continue;
			const old = before.panels.find((p) => p.id === panel.id && p.type === "model");
			if (!old) continue;
			const from = scopeOf(slide.id, old.frame);
			const to = scopeOf(slide.id, panel.frame);
			if (from !== to) moves.push({ from, to });
		}
	}
	return moves;
};

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
	return stored.filter((id) => !nextIds.has(slideOfScope(id)) || (before.has(id) && !after.has(id)));
};

// The slides in the order of the layout (the automatic one: FIRST_SLIDE_ID), and then the others with files
// (the frames of a slide right after it)
export const slidesInOrder = (layout: IViewerLayout | null, stored: string[]): string[] => {
	const order = layout ? layout.slides.map((s) => s.id) : [FIRST_SLIDE_ID];
	const ofSlide = (id: string) => stored.filter((s) => slideOfScope(s) === id).sort((a, b) => (a === id ? -1 : b === id ? 1 : a.localeCompare(b)));
	return [...order.flatMap(ofSlide), ...stored.filter((s) => !order.includes(slideOfScope(s))).sort()];
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
