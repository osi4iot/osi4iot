// Skills of the AI agents: the SKILL.md bundles pipelines loads with
// agent-sdk-go's pkg/skill. A skill is a folder with a SKILL.md — YAML
// frontmatter with at least a name and a description, then markdown
// instructions — and, optionally, text files the agent may read
// (read_skill_resource). Skills are never executed: their files are read.
//
// This file checks a skill before it is stored, so that pipelines never
// finds one it cannot load:
//
//   - The frontmatter is a small subset of YAML (see parseFrontmatter),
//     enough for the fields pipelines and the platform use: name,
//     description, version, tags and requires_mcp. Anything else in it is
//     refused rather than guessed at.
//   - name is the folder's name: kebab-case, at most 64 characters.
//   - Only text files, with relative paths that stay in the folder, and
//     limited sizes: load_skill puts all of SKILL.md in the model's context.

// The agents' MCP servers (pipelines' nodes/aiAgentNode.go has the same
// list): what a node can choose, and what a skill may require. The tools
// are named <server>__<tool> for the model.
export interface IMcpServerInfo {
	name: string;
	label: string;
	description: string;
	// Some are added only when what they read exists.
	condition: string;
}

export const AI_AGENT_MCP_SERVERS: IMcpServerInfo[] = [
	{
		name: "current_date",
		label: "Current date",
		description: "The current date and time (current_date__current-date).",
		condition: "",
	},
	{
		name: "calculate_expression1",
		label: "Calculator",
		description:
			"Mathematical expressions, equations, integrals and matrices (calculate_expression1__calculate_expression).",
		condition: "",
	},
	{
		name: "fem_results",
		label: "FEM results",
		description:
			"The digital twin's finite element results: list, maximum, minimum, critical, nodal and element values (fem_results__*).",
		condition: "Only when the digital twin has FEM results.",
	},
	{
		name: "documents",
		label: "Knowledge base",
		description:
			"The documents of the group's knowledge base the digital twin may read: list, read and search (documents__*).",
		condition: "Only when the group's knowledge base is enabled and the digital twin may read some documents.",
	},
	{
		name: "sensor_history",
		label: "Sensor history",
		description:
			"Historical data of the sensors of the digital twin's group, from the IoT database: sensors and their fields, statistics, history by intervals or raw, latest values (sensor_history__*).",
		condition: "",
	},
	{
		name: "asset_state",
		label: "Asset states",
		description:
			"States of the assets of the digital twin's group, as the AssetState nodes keep them: status, description, other fields, last update (asset_state__*).",
		condition: "",
	},
];

export const MCP_SERVER_NAMES = AI_AGENT_MCP_SERVERS.map((s) => s.name);

export type SkillScope = "platform" | "group";

// What a node stores in its "skills" setting: "platform:<name>" or
// "group:<name>" (the group of the node's digital twin).
export const skillRef = (scope: SkillScope, name: string): string => `${scope}:${name}`;

export const SKILL_NAME_MAX_LENGTH = 64;
export const SKILL_DESCRIPTION_MAX_LENGTH = 1024;
export const SKILL_MD_MAX_SIZE = 64 * 1024; // in the model's context when loaded
export const SKILL_FILE_MAX_SIZE = 512 * 1024;
export const SKILL_TOTAL_MAX_SIZE = 2 * 1024 * 1024;
export const SKILL_MAX_FILES = 50;
export const SKILL_MAX_PATH_DEPTH = 4;

// Text only: the agent reads them as text, and nothing in a skill runs.
export const SKILL_FILE_EXTENSIONS = [
	".md",
	".markdown",
	".txt",
	".csv",
	".tsv",
	".json",
	".yaml",
	".yml",
	".xml",
	".html",
	".htm",
	".rst",
	".sql",
	".py",
	".js",
	".ts",
	".go",
	".m",
	".sh",
	".tex",
];

const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PATH_SEGMENT_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

// A plain boolean, not a type guard: with a string argument a guard would
// narrow it to never where the name is invalid (and it is used there).
export const isValidSkillName = (name: unknown): boolean =>
	typeof name === "string" && name.length <= SKILL_NAME_MAX_LENGTH && SKILL_NAME_RE.test(name);

export const skillNameRule = `lowercase letters, digits and hyphens (kebab-case), at most ${SKILL_NAME_MAX_LENGTH} characters`;

export interface ISkillFrontmatter {
	name: string;
	description: string;
	version: string;
	tags: string[];
	requiresMcp: string[];
}

export class SkillFormatError extends Error {}

const fail = (message: string): never => {
	throw new SkillFormatError(message);
};

// SKILL.md's leading "---" block and the body after it, as pipelines
// splits them (pkg/skill's splitFrontmatter).
export const splitFrontmatter = (content: string): { frontmatter: string; body: string } => {
	const trimmed = content.replace(/^[\s﻿]+/, "");
	if (!trimmed.startsWith("---")) fail("SKILL.md must start with a YAML frontmatter block between '---' lines");
	const rest = trimmed.slice(3).replace(/^\r?\n/, "");
	const idx = rest.search(/\r?\n---/);
	if (idx < 0) fail("The frontmatter of SKILL.md is not closed: a '---' line must end it");
	const after = rest.slice(idx).replace(/^\r?\n---/, "");
	return { frontmatter: rest.slice(0, idx), body: after.replace(/^-+/, "") };
};

const unquote = (raw: string, key: string): string => {
	const v = raw.trim();
	if (v.startsWith('"')) {
		if (!v.endsWith('"') || v.length < 2) fail(`'${key}': unterminated double-quoted string`);
		try {
			return JSON.parse(v) as string;
		} catch {
			return fail(`'${key}': invalid double-quoted string`);
		}
	}
	if (v.startsWith("'")) {
		if (!v.endsWith("'") || v.length < 2) fail(`'${key}': unterminated single-quoted string`);
		return v.slice(1, -1).replace(/''/g, "'");
	}
	// A plain scalar: what YAML would read differently is refused.
	const withoutComment = v.replace(/\s+#.*$/, "");
	if (/^[[\]{}&*!|>%@`]/.test(withoutComment)) {
		fail(`'${key}': quote the value (it starts with a character YAML gives a meaning to)`);
	}
	if (/:\s/.test(withoutComment) || withoutComment.endsWith(":")) {
		fail(`'${key}': quote the value (a plain YAML value cannot contain ': ')`);
	}
	return withoutComment;
};

const parseFlowList = (raw: string, key: string): string[] => {
	const v = raw.trim();
	if (!v.endsWith("]")) fail(`'${key}': a list in brackets must end with ']'`);
	const inner = v.slice(1, -1).trim();
	if (inner === "") return [];
	return inner.split(",").map((item) => unquote(item, key));
};

// The frontmatter's YAML, as far as skills need it:
//
//   key: value                 plain, "double" or 'single' quoted
//   key: >  /  key: |          folded / literal block, indented lines below
//   key: plain text that       a plain value may go on in more indented
//     goes on here             lines (joined with spaces)
//   key: [a, b]                list
//   key:                       list, one "- item" per line below
//     - a
//   # comment
export const parseFrontmatter = (frontmatter: string): Record<string, string | string[]> => {
	const lines = frontmatter.replace(/\r\n/g, "\n").split("\n");
	const out: Record<string, string | string[]> = {};
	let i = 0;
	const indentOf = (line: string) => line.length - line.trimStart().length;
	const isBlank = (line: string) => line.trim() === "" || line.trim().startsWith("#");

	while (i < lines.length) {
		const line = lines[i];
		if (isBlank(line)) {
			i++;
			continue;
		}
		if (indentOf(line) !== 0) fail(`Frontmatter line ${i + 1}: unexpected indentation`);
		if (line.includes("\t")) fail(`Frontmatter line ${i + 1}: use spaces, not tabs`);
		const m = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*))?$/.exec(line);
		if (!m) fail(`Frontmatter line ${i + 1}: expected 'key: value'`);
		const key = m[1];
		const value = (m[2] ?? "").trim();
		if (key in out) fail(`Frontmatter: '${key}' appears twice`);
		i++;

		// The indented lines that belong to this key.
		const block: string[] = [];
		while (i < lines.length && (lines[i].trim() === "" || indentOf(lines[i]) > 0)) {
			block.push(lines[i]);
			i++;
		}
		while (block.length && block[block.length - 1].trim() === "") block.pop();

		if (value === ">" || value === "|" || value === ">-" || value === "|-") {
			if (block.length === 0) fail(`'${key}': the block is empty`);
			const minIndent = Math.min(...block.filter((l) => l.trim() !== "").map(indentOf));
			const texts = block.map((l) => l.slice(minIndent));
			out[key] = value.startsWith(">")
				? texts
						.join("\n")
						.split(/\n{2,}/)
						.map((p) => p.split("\n").join(" ").trim())
						.join("\n")
				: texts.join("\n");
		} else if (value === "") {
			const items = block.filter((l) => !isBlank(l)).map((l) => l.trim());
			if (items.length === 0) {
				out[key] = "";
			} else {
				if (!items.every((item) => item.startsWith("- "))) fail(`'${key}': expected a list of '- item' lines`);
				out[key] = items.map((item) => unquote(item.slice(2), key));
			}
		} else if (value.startsWith("[")) {
			if (block.some((l) => !isBlank(l))) fail(`'${key}': write the list in brackets on one line`);
			out[key] = parseFlowList(value, key);
		} else if (value.startsWith('"') || value.startsWith("'")) {
			if (block.some((l) => !isBlank(l))) fail(`'${key}': a quoted value must be on one line`);
			out[key] = unquote(value, key);
		} else {
			const continuation = block.filter((l) => !isBlank(l)).map((l) => l.trim());
			out[key] = [unquote(value, key), ...continuation.map((c) => unquote(c, key))].join(" ");
		}
	}
	return out;
};

const asString = (v: string | string[] | undefined, key: string): string => {
	if (v === undefined) return "";
	if (Array.isArray(v)) return fail(`'${key}' must be a text, not a list`);
	return v.trim();
};

const asList = (v: string | string[] | undefined, key: string): string[] => {
	if (v === undefined || v === "") return [];
	if (!Array.isArray(v)) return fail(`'${key}' must be a list, e.g. [a, b]`);
	return v.map((item) => item.trim()).filter((item) => item !== "");
};

const KNOWN_KEYS = ["name", "description", "version", "tags", "requires_mcp"];

// The frontmatter of a SKILL.md, checked against the folder's name.
export const readSkillFrontmatter = (skillMd: string, folderName: string): ISkillFrontmatter => {
	const { frontmatter, body } = splitFrontmatter(skillMd);
	const fields = parseFrontmatter(frontmatter);
	const unknown = Object.keys(fields).filter((k) => !KNOWN_KEYS.includes(k));
	if (unknown.length) fail(`Unknown frontmatter field(s): ${unknown.join(", ")} (use ${KNOWN_KEYS.join(", ")})`);

	const name = asString(fields.name, "name");
	const description = asString(fields.description, "description").replace(/\s+/g, " ");
	if (!name) fail("The frontmatter needs a 'name'");
	if (name !== folderName) fail(`The frontmatter's name '${name}' must be the skill's name '${folderName}'`);
	if (!description) fail("The frontmatter needs a 'description': it is what makes the agent choose the skill");
	if (description.length > SKILL_DESCRIPTION_MAX_LENGTH) {
		fail(`The description is longer than ${SKILL_DESCRIPTION_MAX_LENGTH} characters`);
	}
	if (body.trim() === "") fail("SKILL.md has no instructions after the frontmatter");

	const requiresMcp = asList(fields.requires_mcp, "requires_mcp");
	const unknownServers = requiresMcp.filter((s) => !MCP_SERVER_NAMES.includes(s));
	if (unknownServers.length) {
		fail(`requires_mcp: unknown MCP server(s) ${unknownServers.join(", ")} (use ${MCP_SERVER_NAMES.join(", ")})`);
	}
	return {
		name,
		description,
		version: asString(fields.version, "version"),
		tags: asList(fields.tags, "tags"),
		requiresMcp,
	};
};

// A file path inside a skill: relative, plain segments, a text extension.
export const checkSkillFilePath = (path: string): void => {
	if (typeof path !== "string" || path === "") fail("Empty file path");
	if (path.length > 200) fail(`${path}: path too long`);
	const segments = path.split("/");
	if (segments.length > SKILL_MAX_PATH_DEPTH) fail(`${path}: at most ${SKILL_MAX_PATH_DEPTH} levels of folders`);
	if (!segments.every((s) => PATH_SEGMENT_RE.test(s) && s !== "." && s !== "..")) {
		fail(`${path}: use plain names (letters, digits, '.', '_', '-'), no hidden files and no '..'`);
	}
	if (path === "SKILL.md") return;
	const name = segments[segments.length - 1];
	const dot = name.lastIndexOf(".");
	const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
	if (!SKILL_FILE_EXTENSIONS.includes(ext)) {
		fail(`${path}: not a text file the agent can read (use ${SKILL_FILE_EXTENSIONS.join(", ")})`);
	}
};

const byteLength = (s: string): number => Buffer.byteLength(s, "utf8");

// A whole skill, as the API receives it: { "SKILL.md": "...", "ref/x.md": "..." }.
export const validateSkillFiles = (
	folderName: string,
	files: unknown
): { frontmatter: ISkillFrontmatter; files: Record<string, string> } => {
	if (!isValidSkillName(folderName)) fail(`Invalid skill name '${folderName}': ${skillNameRule}`);
	if (!files || typeof files !== "object" || Array.isArray(files))
		fail("'files' must be an object { path: content }");
	const entries = Object.entries(files as Record<string, unknown>);
	if (entries.length === 0) fail("The skill has no files");
	if (entries.length > SKILL_MAX_FILES) fail(`At most ${SKILL_MAX_FILES} files per skill`);

	let total = 0;
	const clean: Record<string, string> = {};
	for (const [path, content] of entries) {
		checkSkillFilePath(path);
		if (typeof content !== "string") fail(`${path}: the content must be text`);
		// eslint-disable-next-line no-control-regex
		if (/\x00/.test(content as string)) fail(`${path}: binary content`);
		const size = byteLength(content as string);
		const max = path === "SKILL.md" ? SKILL_MD_MAX_SIZE : SKILL_FILE_MAX_SIZE;
		if (size > max) fail(`${path}: larger than ${Math.round(max / 1024)} KB`);
		total += size;
		clean[path] = content as string;
	}
	if (total > SKILL_TOTAL_MAX_SIZE) fail(`The skill is larger than ${SKILL_TOTAL_MAX_SIZE / (1024 * 1024)} MB`);
	if (!("SKILL.md" in clean)) fail("The skill needs a SKILL.md at its top level");

	// A file and a folder with the same name cannot both exist on disk.
	const paths = Object.keys(clean);
	for (const p of paths) {
		if (paths.some((q) => q.startsWith(`${p}/`))) fail(`${p} is both a file and a folder`);
	}
	return { frontmatter: readSkillFrontmatter(clean["SKILL.md"], folderName), files: clean };
};
