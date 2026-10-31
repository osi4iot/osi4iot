import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	ListObjectsV2CommandOutput,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import s3Client from "../../config/s3Config";
import process_env from "../../config/api_config";
import pool from "../../config/dbconfig";
import { ISkillFrontmatter, SkillScope, readSkillFrontmatter, skillRef, validateSkillFiles } from "./skillFormat";
import { BUILTIN_SKILLS, isBuiltinSkill } from "./builtinSkills";
import { logger } from "../../config/winston";

// Where the skills live in the bucket (pipelines reads them there, in
// nodes/aiAgentSkills.go):
//
//   platform_data/skills/<name>/SKILL.md (+ files)                 platform
//   org_data/org_<org>/group_<group>/skills/<name>/SKILL.md (+ files) group
//
// The bucket is the only copy: there is no table. A group's skills go
// with its folder when the group is deleted.

export const platformSkillsFolder = (): string => "platform_data/skills";

export const groupSkillsFolder = (orgId: number, groupId: number): string =>
	`org_data/org_${orgId}/group_${groupId}/skills`;

export interface ISkillFileInfo {
	path: string;
	size: number;
}

// A skill as the API lists it.
export interface ISkillSummary extends Omit<ISkillFrontmatter, "name"> {
	scope: SkillScope;
	ref: string;
	name: string;
	files: ISkillFileInfo[];
	size: number;
	lastModified: string;
	// A SKILL.md pipelines would not load (edited outside the platform):
	// the skill is listed with the reason, so it can be fixed or deleted.
	error: string;
	// One of the platform's built-in skills (builtinSkills.ts): read-only.
	builtin: boolean;
}

interface IObjectInfo {
	key: string;
	size: number;
	lastModified: Date;
}

const listObjects = async (prefix: string): Promise<IObjectInfo[]> => {
	const out: IObjectInfo[] = [];
	let token: string | undefined;
	do {
		const page: ListObjectsV2CommandOutput = await s3Client.send(
			new ListObjectsV2Command({
				Bucket: process_env.S3_BUCKET_NAME,
				Prefix: prefix,
				ContinuationToken: token,
			})
		);
		for (const obj of page.Contents ?? []) {
			if (obj.Key) out.push({ key: obj.Key, size: obj.Size ?? 0, lastModified: obj.LastModified ?? new Date(0) });
		}
		token = page.IsTruncated ? page.NextContinuationToken : undefined;
	} while (token);
	return out;
};

const readObject = async (key: string): Promise<string> => {
	const data = await s3Client.send(new GetObjectCommand({ Bucket: process_env.S3_BUCKET_NAME, Key: key }));
	return (await data.Body?.transformToString("utf-8")) ?? "";
};

const contentType = (path: string): string =>
	/\.(md|markdown)$/i.test(path) ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8";

// The skills of a folder (platformSkillsFolder or groupSkillsFolder), by
// name, with their frontmatter.
export const listSkills = async (folder: string, scope: SkillScope): Promise<ISkillSummary[]> => {
	const objects = await listObjects(`${folder}/`);
	const bySkill = new Map<string, IObjectInfo[]>();
	for (const obj of objects) {
		const rel = obj.key.slice(folder.length + 1);
		const slash = rel.indexOf("/");
		if (slash <= 0) continue; // not inside a skill's folder
		const name = rel.slice(0, slash);
		if (!bySkill.has(name)) bySkill.set(name, []);
		bySkill.get(name).push(obj);
	}

	const skills = await Promise.all(
		Array.from(bySkill.entries()).map(async ([name, objs]): Promise<ISkillSummary | null> => {
			const prefix = `${folder}/${name}/`;
			const files = objs
				.map((o) => ({ path: o.key.slice(prefix.length), size: o.size }))
				.sort((a, b) => a.path.localeCompare(b.path));
			if (!files.some((f) => f.path === "SKILL.md")) return null; // not a skill
			const lastModified = new Date(Math.max(...objs.map((o) => o.lastModified.getTime())));
			const summary: ISkillSummary = {
				scope,
				ref: skillRef(scope, name),
				name,
				description: "",
				version: "",
				tags: [],
				requiresMcp: [],
				files,
				size: files.reduce((sum, f) => sum + f.size, 0),
				lastModified: lastModified.toISOString(),
				error: "",
				builtin: scope === "platform" && isBuiltinSkill(name),
			};
			try {
				const fm = readSkillFrontmatter(await readObject(`${prefix}SKILL.md`), name);
				summary.description = fm.description;
				summary.version = fm.version;
				summary.tags = fm.tags;
				summary.requiresMcp = fm.requiresMcp;
			} catch (err) {
				summary.error = (err as Error).message;
			}
			return summary;
		})
	);
	return skills.filter((s): s is ISkillSummary => s !== null).sort((a, b) => a.name.localeCompare(b.name));
};

export const skillExists = async (folder: string, name: string): Promise<boolean> => {
	const page = await s3Client.send(
		new ListObjectsV2Command({
			Bucket: process_env.S3_BUCKET_NAME,
			Prefix: `${folder}/${name}/SKILL.md`,
			MaxKeys: 1,
		})
	);
	return (page.KeyCount ?? 0) > 0;
};

// All the files of a skill, with their content: null when there is no such skill.
export const readSkillFiles = async (folder: string, name: string): Promise<Record<string, string> | null> => {
	const prefix = `${folder}/${name}/`;
	const objects = await listObjects(prefix);
	if (!objects.some((o) => o.key === `${prefix}SKILL.md`)) return null;
	const files: Record<string, string> = {};
	for (const obj of objects) {
		files[obj.key.slice(prefix.length)] = await readObject(obj.key);
	}
	return files;
};

// Writes a skill (already validated), replacing what was there: the new
// files are written first and the ones it no longer has deleted after, so
// the skill is never missing. SKILL.md goes last: pipelines takes a change
// of any file for a new version anyway.
export const writeSkillFiles = async (folder: string, name: string, files: Record<string, string>): Promise<void> => {
	const prefix = `${folder}/${name}/`;
	const before = await listObjects(prefix);
	const paths = Object.keys(files).sort((a, b) =>
		a === "SKILL.md" ? 1 : b === "SKILL.md" ? -1 : a.localeCompare(b)
	);
	for (const path of paths) {
		await s3Client.send(
			new PutObjectCommand({
				Bucket: process_env.S3_BUCKET_NAME,
				Key: `${prefix}${path}`,
				Body: files[path],
				ContentType: contentType(path),
			})
		);
	}
	for (const obj of before) {
		if (!(obj.key.slice(prefix.length) in files)) {
			await s3Client.send(new DeleteObjectCommand({ Bucket: process_env.S3_BUCKET_NAME, Key: obj.key }));
		}
	}
};

export const deleteSkill = async (folder: string, name: string): Promise<void> => {
	const objects = await listObjects(`${folder}/${name}/`);
	// SKILL.md first: without it the folder is no longer a skill.
	objects.sort((a, b) => (a.key.endsWith("/SKILL.md") ? -1 : b.key.endsWith("/SKILL.md") ? 1 : 0));
	for (const obj of objects) {
		await s3Client.send(new DeleteObjectCommand({ Bucket: process_env.S3_BUCKET_NAME, Key: obj.key }));
	}
};

// An AiAgent node that uses a skill.
export interface ISkillUse {
	digitalTwinId: number;
	digitalTwinUid: string;
	groupId: number;
	nodeName: string;
}

// The AiAgent nodes whose "skills" setting has ref ("platform:<name>" or
// "group:<name>"), in every group or in one.
export const findSkillUses = async (ref: string, groupId?: number): Promise<ISkillUse[]> => {
	const params: (string | number)[] = [`%${ref}%`];
	let query = `SELECT id, digital_twin_uid AS "digitalTwinUid", group_id AS "groupId", pipeline_file_data AS "data"
		FROM grafanadb.digital_twin WHERE pipeline_file_data LIKE $1`;
	if (groupId !== undefined) {
		params.push(groupId);
		query += " AND group_id = $2";
	}
	const result = await pool.query(query, params);
	const uses: ISkillUse[] = [];
	for (const row of result.rows as { id: number; digitalTwinUid: string; groupId: number; data: string }[]) {
		let nodes: unknown;
		try {
			nodes = JSON.parse(row.data);
		} catch {
			continue;
		}
		if (!Array.isArray(nodes)) continue;
		for (const node of nodes as { type?: string; name?: string; settings?: unknown }[]) {
			if (node?.type !== "AiAgent") continue;
			let settings = node.settings;
			if (typeof settings === "string") {
				try {
					settings = JSON.parse(settings);
				} catch {
					continue;
				}
			}
			const skills = (settings as { skills?: unknown })?.skills;
			if (Array.isArray(skills) && skills.includes(ref)) {
				uses.push({
					digitalTwinId: row.id,
					digitalTwinUid: row.digitalTwinUid,
					groupId: row.groupId,
					nodeName: node.name || "",
				});
			}
		}
	}
	return uses;
};

// Writes the built-in skills to the bucket when they are not there or
// differ from this version of the platform (an edit made outside the
// platform is undone too). Called when admin_api starts; a failure is
// logged and does not stop admin_api (the next start tries again).
export const seedBuiltinSkills = async (): Promise<void> => {
	const folder = platformSkillsFolder();
	for (const builtin of BUILTIN_SKILLS) {
		try {
			const { files } = validateSkillFiles(builtin.name, builtin.files);
			const current = await readSkillFiles(folder, builtin.name);
			const same =
				current !== null &&
				Object.keys(current).length === Object.keys(files).length &&
				Object.entries(files).every(([path, content]) => current[path] === content);
			if (same) continue;
			await writeSkillFiles(folder, builtin.name, files);
			logger.log("info", `Built-in skill '${builtin.name}' ${current ? "updated" : "created"}`);
		} catch (error) {
			logger.log("error", `Built-in skill '${builtin.name}' could not be written: ${(error as Error).message}`);
		}
	}
};