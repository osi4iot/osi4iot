// What a route of a group names must be of that group. groupExists (which every route with :groupId goes through)
// calls groupOwnershipProblem after it finds the group: the ids of the path (:assetId, :digitalTwinId, :mlModelId,
// :topicId, :dashboardId), the item of a route by property (/asset/:groupId/:propName/:propValue and the same for
// digital twins, sensors, topics, ML models and S3 folders) and the topicId of a body (sensors) must belong to the
// group of the route. Otherwise the item is "not found", as if it did not exist: the roles of a group (Viewer,
// Editor, Admin) give nothing over the items of another group.
//
// The property names are those the controllers accept (with their column); any other is left to the controller,
// which refuses it.
import pool from "../config/dbconfig";

type ItemKind = "asset" | "digitalTwin" | "mlModel" | "topic" | "dashboard" | "sensor" | "s3Folder";

const KIND_TEXT: Record<ItemKind, string> = {
	asset: "asset",
	digitalTwin: "digital twin",
	mlModel: "ML model",
	topic: "topic",
	dashboard: "dashboard",
	sensor: "sensor",
	s3Folder: "S3 folder",
};

// the parameters of a path that are ids of items
const ID_PARAMS: Record<string, ItemKind> = {
	assetId: "asset",
	digitalTwinId: "digitalTwin",
	mlModelId: "mlModel",
	topicId: "topic",
	dashboardId: "dashboard",
};

// the routes by property of each kind (the path of the route, as the controllers declare it)
const PROP_ROUTES: Record<string, ItemKind> = {
	"/asset/:groupId/:propName/:propValue": "asset",
	"/digital_twin/:groupId/:propName/:propValue": "digitalTwin",
	"/sensor/:groupId/:propName/:propValue": "sensor",
	"/topic/:groupId/:propName/:propValue": "topic",
	"/ml_model/:groupId/:propName/:propValue": "mlModel",
	"/asset_s3_folder/:groupId/:assetId/:propName/:propValue": "s3Folder",
};

// the column of each property name accepted (fixed texts: never what the request says)
const PROP_COLUMNS: Record<ItemKind, Record<string, string>> = {
	asset: { id: "id", assetUid: "asset_uid", asset_uid: "asset_uid" },
	digitalTwin: { id: "id", digitalTwinUid: "digital_twin_uid", digital_twin_uid: "digital_twin_uid" },
	sensor: { id: "id", sensorUid: "sensor_uid", sensor_uid: "sensor_uid" },
	topic: { id: "id", topicUid: "topic_uid", topic_uid: "topic_uid" },
	mlModel: { id: "id", mlModelUid: "ml_model_uid", ml_model_uid: "ml_model_uid" },
	s3Folder: { id: "id", folderName: "folderName" },
	dashboard: { id: "id" },
};

interface GroupRow {
	groupId: number | string;
}

// The groups of the items of a kind whose column has the value (several: an S3 folder's versions, a dashboard
// shared with several teams)
const groupsOfItem = async (kind: ItemKind, column: string, value: string | number): Promise<number[]> => {
	let sql: string;
	switch (kind) {
		case "asset":
			sql = `SELECT group_id AS "groupId" FROM grafanadb.asset WHERE ${column} = $1`;
			break;
		case "digitalTwin":
			sql = `SELECT group_id AS "groupId" FROM grafanadb.digital_twin WHERE ${column} = $1`;
			break;
		case "mlModel":
			sql = `SELECT group_id AS "groupId" FROM grafanadb.ml_model WHERE ${column} = $1`;
			break;
		case "topic":
			sql = `SELECT group_id AS "groupId" FROM grafanadb.topic WHERE ${column} = $1`;
			break;
		case "sensor":
			sql = `SELECT grafanadb.asset.group_id AS "groupId" FROM grafanadb.sensor
				INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
				WHERE grafanadb.sensor.${column} = $1`;
			break;
		case "s3Folder":
			sql = `SELECT group_id AS "groupId" FROM grafanadb.s3_folder WHERE ${column} = $1`;
			break;
		case "dashboard":
			sql = `SELECT grafanadb.group.id AS "groupId" FROM grafanadb.dashboard
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.dashboard.folder_id = grafanadb.dashboard_acl.dashboard_id
				INNER JOIN grafanadb.group ON grafanadb.dashboard_acl.team_id = grafanadb.group.team_id
				WHERE grafanadb.dashboard.${column} = $1`;
			break;
	}
	const result = await pool.query<GroupRow>(sql, [value]);
	return result.rows.map((row) => Number(row.groupId));
};

const isId = (value: string) => /^\d{1,15}$/.test(value);

interface OwnershipRequest {
	params: Record<string, string>;
	route?: { path?: unknown };
	body?: unknown;
}

// What the request names that is not of the group (a text for the 404), or null when everything is of the group
export const groupOwnershipProblem = async (req: OwnershipRequest, groupId: number): Promise<string | null> => {
	const checks: { kind: ItemKind; column: string; value: string | number; shown: string }[] = [];
	for (const [param, kind] of Object.entries(ID_PARAMS)) {
		const value = req.params[param];
		if (value === undefined) continue;
		// a malformed id: the controller says what is wrong with it
		if (!isId(value)) continue;
		checks.push({ kind, column: "id", value: Number(value), shown: `id ${value}` });
	}
	const routePath = typeof req.route?.path === "string" ? req.route.path : "";
	const propKind = PROP_ROUTES[routePath];
	const { propName, propValue } = req.params;
	if (propKind && propName !== undefined && propValue !== undefined) {
		const column = PROP_COLUMNS[propKind][propName];
		if (column && (column !== "id" || isId(propValue))) {
			checks.push({ kind: propKind, column, value: column === "id" ? Number(propValue) : propValue, shown: `${propName} ${propValue}` });
		}
	}
	// the topic of a sensor (create, update)
	const body = req.body as { topicId?: unknown } | undefined;
	if (body && typeof body === "object" && body.topicId !== undefined && body.topicId !== null) {
		const topicId = Number(body.topicId);
		if (!Number.isSafeInteger(topicId)) return "The topic was not found";
		checks.push({ kind: "topic", column: "id", value: topicId, shown: `id ${topicId}` });
	}
	for (const check of checks) {
		const groups = await groupsOfItem(check.kind, check.column, check.value);
		// none: the controller says it does not exist; of other groups only: not found here either
		if (groups.length > 0 && !groups.includes(groupId)) {
			return `The ${KIND_TEXT[check.kind]} with ${check.shown} was not found in this group`;
		}
	}
	return null;
};
