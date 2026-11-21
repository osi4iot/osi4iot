// The control rooms: a digital twin whose asset is not a real one but a virtual asset of a group ("group": the
// group's control room, with the state, alarms, approvals, health… of all its assets) or of an organization
// ("organization": its overview, in the organization's default group, where its BI panels go). The context of
// an asset says which (grafanadb.asset.context; "asset", a real asset, by default); it is set when the asset is
// created and never changes. At most one virtual asset of each kind per group (a unique partial index).
//
// A virtual asset has its own asset type (one per organization and kind, predefined: not editable nor deletable),
// whose icon shows it on the map; no device topics nor physical sensors, only topics for computed values
// (dtm2pdb_n: the first one is created with it); and its digital twin is a "Grafana dashboard" one (no 3D
// model), created with it. Only the group's administrators create and delete it (README, "Permissions").
import { nanoid } from "nanoid";
import pool from "../../config/dbconfig";
import { logger } from "../../config/winston";
import IGroup from "../group/interfaces/Group.interface";
import IAsset, { AssetContext } from "./asset.interface";
import IAssetType from "./assetType.interface";
import CreateAssetDto from "./asset.dto";
import {
	checkInitialAssetGeolocation,
	createNewAsset,
	getAssetByPropName,
	getAssetTopicByAssetIdAndTopicRef,
	getAssetTypeByTypeAndOrgId,
	insertAssetType,
} from "./assetDAL";
import { createDashboard } from "../group/dashboardDAL";
import { getTopicByProp } from "../topic/topicDAL";
import { createDigitalTwin, getDigitalTwinByProp } from "../digitalTwin/digitalTwinDAL";
import IDigitalTwin from "../digitalTwin/digitalTwin.interface";

export type VirtualContext = Exclude<AssetContext, "asset">;

export const ASSET_CONTEXTS: AssetContext[] = ["asset", "group", "organization"];

export const isVirtualContext = (context: unknown): context is VirtualContext =>
	context === "group" || context === "organization";

// The schema of the context, for the existing databases (migration.ts creates the column for the new ones):
// it can run again
export const ensureAssetContextColumn = async (): Promise<void> => {
	await pool.query(`ALTER TABLE grafanadb.asset
		ADD COLUMN IF NOT EXISTS context VARCHAR(16) NOT NULL DEFAULT 'asset'`);
	await pool.query(`DO $$ BEGIN
		ALTER TABLE grafanadb.asset ADD CONSTRAINT chk_asset_context CHECK (context IN ('asset', 'group', 'organization'));
	EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
	// one control room per group, one overview per organization (in its default group)
	await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_virtual_context
		ON grafanadb.asset (group_id, context) WHERE context <> 'asset'`);
};

// The asset type of each kind of virtual asset (its icon on the map)
export const CONTROL_ROOM_ASSET_TYPES: Record<VirtualContext, { type: string; iconSvgFileName: string; iconSvgString: string }> = {
	group: {
		type: "Group control room",
		iconSvgFileName: "group_control_room_icon.svg",
		iconSvgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill-rule="evenodd" d="M64 48h384c26.5 0 48 21.5 48 48v240c0 26.5-21.5 48-48 48H304l12 48h52c13.3 0 24 10.7 24 24s-10.7 24-24 24H144c-13.3 0-24-10.7-24-24s10.7-24 24-24h52l12-48H64c-26.5 0-48-21.5-48-48V96c0-26.5 21.5-48 48-48zM64 96v240h384V96zM112 296a32 32 0 1 1 0.1 0zM112 168a32 32 0 1 1 0.1 0zM224 240h176a16 16 0 0 1 0 32H224a16 16 0 0 1 0-32zM224 280h120a12 12 0 0 1 0 24H224a12 12 0 0 1 0-24zM224 128h176a16 16 0 0 1 0 32H224a16 16 0 0 1 0-32zM224 168h120a12 12 0 0 1 0 24H224a12 12 0 0 1 0-24z"/></svg>`,
	},
	organization: {
		type: "Organization overview",
		iconSvgFileName: "organization_overview_icon.svg",
		iconSvgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M48 32c13.3 0 24 10.7 24 24v360h392c13.3 0 24 10.7 24 24s-10.7 24-24 24H72c-26.5 0-48-21.5-48-48V56c0-13.3 10.7-24 24-24zM128 280c0-8.8 7.2-16 16-16h48c8.8 0 16 7.2 16 16v104h-80zM240 200c0-8.8 7.2-16 16-16h48c8.8 0 16 7.2 16 16v184h-80zM352 136c0-8.8 7.2-16 16-16h48c8.8 0 16 7.2 16 16v248h-80zM136 216l112-96 64 48 96-96-24-24h88v88l-24-24-128 128-64-48-96 80z"/></svg>`,
	},
};

export const CONTROL_ROOM_TYPE_NAMES = Object.values(CONTROL_ROOM_ASSET_TYPES).map((t) => t.type);

// a type of the virtual assets: not for a real asset, and not editable nor deletable
export const isControlRoomAssetType = (type: string | undefined): boolean =>
	!!type && CONTROL_ROOM_TYPE_NAMES.includes(type);

// The asset type of a kind of virtual asset in an organization, created the first time
export const controlRoomAssetType = async (orgId: number, context: VirtualContext): Promise<IAssetType> => {
	const kind = CONTROL_ROOM_ASSET_TYPES[context];
	const existing = await getAssetTypeByTypeAndOrgId(orgId, kind.type);
	if (existing) return existing;
	const assetTypeUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	const insert = insertAssetType({
		orgId,
		assetTypeUid,
		type: kind.type,
		iconSvgFileName: kind.iconSvgFileName,
		iconSvgString: kind.iconSvgString,
		geolocationMode: "static",
		markerSvgFileName: "-",
		markerSvgString: "",
		assetStateFormat: "{}",
		isPredefined: true,
	} as IAssetType);
	try {
		return await insert;
	} catch (error) {
		// created at the same time by another request (UNIQUE (org_id, type)): that one
		const again = await pool.query<{ id: number }>(`SELECT id FROM grafanadb.asset_type WHERE org_id = $1 AND type = $2`, [
			orgId,
			kind.type,
		]);
		if (again.rows[0]) return { ...(await getAssetTypeByTypeAndOrgId(orgId, kind.type)), id: again.rows[0].id };
		throw error;
	}
};

interface AssetIdRow {
	id: number;
}

// The virtual asset of a kind in a group (null: none)
export const virtualAssetOfGroup = async (groupId: number, context: VirtualContext): Promise<IAsset | null> => {
	const result = await pool.query<AssetIdRow>(
		`SELECT id FROM grafanadb.asset WHERE group_id = $1 AND context = $2`,
		[groupId, context]
	);
	const id = result.rows[0]?.id;
	return id ? (await getAssetByPropName("id", id)) ?? null : null;
};

// What stops creating a control room of a kind in a group ("" nothing)
export const controlRoomProblem = (group: IGroup, context: VirtualContext): string => {
	if (context === "organization" && !group.isOrgDefaultGroup) {
		return "The overview of an organization goes in its default group";
	}
	return "";
};

export interface IControlRoom {
	asset: IAsset;
	digitalTwin: IDigitalTwin;
	created: "both" | "digitalTwin";
}

// Creates the virtual asset of the kind and its digital twin; when the asset already exists without its digital
// twin (it was deleted), only the digital twin. Null: both exist already.
export const createControlRoom = async (
	group: IGroup,
	context: VirtualContext,
	organizationName: string
): Promise<IControlRoom | null> => {
	let asset = await virtualAssetOfGroup(group.id, context);
	let created: IControlRoom["created"] = "digitalTwin";
	if (asset) {
		const existing = await getDigitalTwinByProp("asset_id", asset.id);
		if (existing) return null;
	} else {
		const assetType = await controlRoomAssetType(group.orgId, context);
		const description = context === "group" ? `Control room of ${group.acronym}` : `Overview of ${organizationName}`;
		const assetData: CreateAssetDto = {
			assetTypeId: assetType.id,
			description: description.slice(0, 190),
			iconRadio: 1.0,
			iconSizeFactor: 1.0,
			longitude: 0,
			latitude: 0,
			// a topic for the values its pipeline computes (KPIs of the group or organization)
			topicsRef: [
				{
					topicRef: "dtm2pdb_1",
					topicType: "dtm2pdb",
					description: "Computed indicators",
					mqttAccessControl: "None",
				},
			],
			sensorsRef: [],
		};
		// in the middle of the group's area, as a new asset
		await checkInitialAssetGeolocation(group, assetData);
		asset = await createNewAsset(group, assetData, false, context);
		created = "both";
	}

	// its digital twin: no 3D model; its Grafana dashboard on the computed indicators' topic
	const digitalTwinUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	const assetTopic = await getAssetTopicByAssetIdAndTopicRef(asset.id, "dtm2pdb_1");
	const topic = assetTopic ? await getTopicByProp("id", assetTopic.topicId) : null;
	if (!topic) throw new Error("its topic for computed indicators (dtm2pdb_1) is missing");
	const dashboardId = await createDashboard(group, topic.topicUid, `DT_${digitalTwinUid}`);
	const digitalTwin = await createDigitalTwin(
		group,
		asset,
		{
			digitalTwinUid,
			description: asset.description,
			type: "Grafana dashboard",
			maxNumResFemFiles: 1,
			chatAssistantEnabled: false,
			chatAssistantLanguage: "none",
			digitalTwinSimulationFormat: "{}",
			sensorsRef: [],
		},
		dashboardId
	);
	if (!digitalTwin) throw new Error("its digital twin could not be created");
	logger.log("info", `Control room (${context}) of group ${group.id}: asset ${asset.id}, digital twin ${digitalTwin.id}`);
	return { asset, digitalTwin, created };
};

interface AssetTopicRefRow {
	topicRef: string;
	context: string;
}

// What stops a sensor of an asset on a topic ("" nothing): a virtual asset has no physical sensors, only computed
// ones (on its dtm2pdb_n topics)
export const virtualAssetSensorProblem = async (assetId: number, topicId: unknown): Promise<string> => {
	const result = await pool.query<AssetTopicRefRow>(
		`SELECT COALESCE(at.topic_ref, '') AS "topicRef", a.context
		 FROM grafanadb.asset a
		 LEFT JOIN grafanadb.asset_topic at ON at.asset_id = a.id AND at.topic_id = $2
		 WHERE a.id = $1`,
		[assetId, Number(topicId) || 0]
	);
	const row = result.rows[0];
	if (!row || row.context === "asset") return "";
	if (/^dtm2pdb_\d+$/.test(row.topicRef)) return "";
	return "A control room has no physical sensors: its sensors are computed ones, on its topics for computed sensors (dtm2pdb_n)";
};
