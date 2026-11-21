// What may be deleted, and by whom (README, "Permissions"):
//  - An Editor of the group may delete sensors, topics, assets and digital twins that hold no expensive resources;
//    only an Admin may delete the others. Expensive resources:
//      · a digital twin with knowledge base documents (RAG), a pipeline on GPU (pipelineRequiresGpu) or a pipeline
//        with paid AI services (AiAgent, AiTool, Translator, Transcriptor, Text2Speech with OpenAI);
//      · an asset with archives in S3 (asset S3 folders), or with such a digital twin.
//  - Whoever deletes it, a sensor, topic, asset or digital twin whose topics have stored measurements needs an
//    explicit confirmation (?confirmDataLoss=true): without it the answer is 409 with how many measurements would
//    be lost (they stay in the IoT database, but nothing names them any more).
import { Response } from "express";
import { readQuery } from "../../config/dbconfig";
import { timescaledbReadQuery } from "../../config/timescaledb_config";
import HttpException from "../../exceptions/HttpException";
import { GroupRole } from "../../middleware/auth.middleware";

// pipeline nodes that use paid AI services
const PAID_AI_NODES = ["AiAgent", "AiTool", "Translator", "Transcriptor"];

// counting more than this many measurements is not needed to warn (and would be slow)
const MAX_COUNTED_MEASUREMENTS = 1_000_000;

interface IPipelineNode {
	type?: string;
	settings?: Record<string, unknown>;
}

const parseNodes = (data: unknown): IPipelineNode[] => {
	let value = data;
	for (let i = 0; i < 2 && typeof value === "string"; i++) {
		try {
			value = JSON.parse(value);
		} catch {
			return [];
		}
	}
	return Array.isArray(value) ? (value as IPipelineNode[]) : [];
};

// The paid AI services a pipeline uses (node types), none if it uses none
export const paidAiServicesOfPipeline = (pipelineFileData: unknown): string[] => {
	const found = new Set<string>();
	for (const node of parseNodes(pipelineFileData)) {
		const type = node?.type ?? "";
		if (PAID_AI_NODES.includes(type)) found.add(type);
		if (type === "Text2Speech" && node.settings?.ttsMode !== "edge-tts") found.add("Text2Speech (OpenAI)");
	}
	return Array.from(found);
};

// Why a digital twin holds expensive resources (empty: it does not)
export const expensiveResourcesOfDigitalTwin = async (digitalTwinId: number): Promise<string[]> => {
	const result = await readQuery(
		`SELECT description, pipeline_requires_gpu AS "requiresGpu", pipeline_file_data AS "pipeline",
		(SELECT COUNT(*) FROM grafanadb.digital_twin_knowledge_document dk WHERE dk.digital_twin_id = $1) AS "documents"
		FROM grafanadb.digital_twin WHERE id = $1`,
		[digitalTwinId]
	);
	const row = result.rows[0] as
		| { description: string; requiresGpu: boolean; pipeline: unknown; documents: number }
		| undefined;
	if (!row) return [];
	const name = `the digital twin "${row.description}"`;
	const reasons: string[] = [];
	// the digital twin of a control room (controlRoom.ts): only the group's administrators delete it
	const kind = await readQuery(
		`SELECT a.context FROM grafanadb.digital_twin dt INNER JOIN grafanadb.asset a ON a.id = dt.asset_id WHERE dt.id = $1`,
		[digitalTwinId]
	);
	const context = (kind.rows[0] as { context?: string } | undefined)?.context;
	if (context && context !== "asset") reasons.push(`${name} is the ${context === "group" ? "group's control room" : "organization's overview"}`);
	if (Number(row.documents) > 0) reasons.push(`${name} reads ${row.documents} knowledge base document(s)`);
	if (row.requiresGpu) reasons.push(`the pipeline of ${name} runs on GPU`);
	const paid = paidAiServicesOfPipeline(row.pipeline);
	if (paid.length > 0) reasons.push(`the pipeline of ${name} uses paid AI services (${paid.join(", ")})`);
	return reasons;
};

// Why an asset holds expensive resources (its S3 archives, its digital twins)
export const expensiveResourcesOfAsset = async (assetId: number): Promise<string[]> => {
	const reasons: string[] = [];
	// the virtual asset of a control room (controlRoom.ts): only the group's administrators delete it
	const kind = await readQuery(`SELECT context FROM grafanadb.asset WHERE id = $1`, [assetId]);
	const context = (kind.rows[0] as { context?: string } | undefined)?.context;
	if (context && context !== "asset") reasons.push(`it is the ${context === "group" ? "group's control room" : "organization's overview"}`);
	const folders = await readQuery(`SELECT COUNT(*) AS "count" FROM grafanadb.s3_folder WHERE asset_id = $1`, [assetId]);
	const archives = Number((folders.rows[0] as { count?: number } | undefined)?.count ?? 0);
	if (archives > 0) reasons.push(`the asset keeps archives in S3 (${archives} folder(s))`);
	const twins = await readQuery(`SELECT id FROM grafanadb.digital_twin WHERE asset_id = $1`, [assetId]);
	for (const twin of twins.rows as { id: number }[]) {
		reasons.push(...(await expensiveResourcesOfDigitalTwin(Number(twin.id))));
	}
	return reasons;
};

// The topics (Topic_<uid>, as the IoT database names them) of a digital twin, an asset (with its digital twins'),
// a sensor or a topic
export const topicsOfDigitalTwin = async (digitalTwinId: number): Promise<string[]> => {
	const result = await readQuery(
		`SELECT t.topic_uid AS "topicUid" FROM grafanadb.digital_twin_topic dtt
		INNER JOIN grafanadb.topic t ON t.id = dtt.topic_id WHERE dtt.digital_twin_id = $1`,
		[digitalTwinId]
	);
	return (result.rows as { topicUid: string }[]).map((r) => `Topic_${r.topicUid}`);
};

export const topicsOfAsset = async (assetId: number): Promise<string[]> => {
	const result = await readQuery(
		`SELECT t.topic_uid AS "topicUid" FROM grafanadb.asset_topic at
		INNER JOIN grafanadb.topic t ON t.id = at.topic_id WHERE at.asset_id = $1`,
		[assetId]
	);
	const topics = (result.rows as { topicUid: string }[]).map((r) => `Topic_${r.topicUid}`);
	const twins = await readQuery(`SELECT id FROM grafanadb.digital_twin WHERE asset_id = $1`, [assetId]);
	for (const twin of twins.rows as { id: number }[]) topics.push(...(await topicsOfDigitalTwin(Number(twin.id))));
	return Array.from(new Set(topics));
};

export const topicOfId = async (topicId: number): Promise<string[]> => {
	const result = await readQuery(`SELECT topic_uid AS "topicUid" FROM grafanadb.topic WHERE id = $1`, [topicId]);
	return (result.rows as { topicUid: string }[]).map((r) => `Topic_${r.topicUid}`);
};

// How many measurements of a group are stored in these topics (at most MAX_COUNTED_MEASUREMENTS)
export const storedMeasurements = async (groupUid: string, topics: string[]): Promise<number> => {
	if (topics.length === 0) return 0;
	const result = await timescaledbReadQuery(
		`SELECT COUNT(*) AS "count" FROM (
			SELECT 1 FROM iot_data.thingData WHERE group_uid = $1 AND topic = ANY($2::text[]) LIMIT $3
		) AS stored`,
		[groupUid, topics, MAX_COUNTED_MEASUREMENTS]
	);
	return Number((result.rows[0] as { count: number | string } | undefined)?.count ?? 0);
};

interface IDeletionRequest {
	query: Record<string, unknown>;
	groupRole?: GroupRole;
	group?: { groupUid: string };
}

// Checks a deletion: 403 for an Editor when what is deleted holds expensive resources, 409 when its topics have
// stored measurements and the deletion is not confirmed. what: "this digital twin", "this asset"...
export const checkDeletion = async (
	req: IDeletionRequest,
	res: Response,
	what: string,
	expensive: () => Promise<string[]>,
	topics: () => Promise<string[]>
): Promise<void> => {
	if (req.groupRole !== "Admin") {
		const reasons = await expensive();
		if (reasons.length > 0) {
			throw new HttpException(
				req as never,
				res,
				403,
				`Only an administrator of the group can delete ${what}: ${reasons.join("; ")}.`
			);
		}
	}
	const confirmed = String(req.query?.confirmDataLoss ?? "") === "true";
	if (!confirmed && req.group) {
		const count = await storedMeasurements(req.group.groupUid, await topics());
		if (count > 0) {
			const amount = count >= MAX_COUNTED_MEASUREMENTS ? `more than ${MAX_COUNTED_MEASUREMENTS}` : String(count);
			throw new HttpException(
				req as never,
				res,
				409,
				`Deleting ${what} leaves ${amount} stored measurements without a sensor to name them. Confirm to delete it anyway.`
			);
		}
	}
};

// nothing expensive (sensors and topics)
export const noExpensiveResources = (): Promise<string[]> => Promise.resolve<string[]>([]);
