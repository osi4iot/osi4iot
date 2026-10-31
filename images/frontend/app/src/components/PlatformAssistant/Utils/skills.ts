import YAML from "yaml";
import { getDomainName, getProtocol } from "../../../tools/tools";

// Skills of the AI agents: SKILL.md bundles (frontmatter with name and
// description, markdown instructions, optional text files) that an
// AiAgent node gives its agent. admin_api stores them in the bucket and
// checks them (skill/skillFormat.ts); pipelines loads them
// (nodes/aiAgentSkills.go). Two scopes: the platform's, for everyone, and
// each group's. A node stores "platform:<name>" / "group:<name>".

export type SkillScope = "platform" | "group";

export interface ISkillFileInfo {
    path: string;
    size: number;
}

// As admin_api lists them.
export interface ISkillSummary {
    scope: SkillScope;
    ref: string;
    name: string;
    description: string;
    version: string;
    tags: string[];
    requiresMcp: string[];
    files: ISkillFileInfo[];
    size: number;
    lastModified: string;
    // A SKILL.md pipelines would not load: why.
    error: string;
    // A built-in skill of the platform: read-only, duplicated to adapt it.
    builtin: boolean;
}

export interface IMcpServerInfo {
    name: string;
    label: string;
    description: string;
    condition: string;
}

export type SkillFiles = Record<string, string>;

// As admin_api checks them (it has the last word).
export const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKILL_NAME_MAX_LENGTH = 64;
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
export const SKILL_ZIP_MAX_SIZE = 10 * 1024 * 1024;

export const isValidSkillName = (name: string) => name.length <= SKILL_NAME_MAX_LENGTH && SKILL_NAME_RE.test(name);

const domainName = getDomainName();
const protocol = getProtocol();
const api = `${protocol}://${domainName}/admin_api`;

// Where a scope's skills are managed: the platform's, or a group's.
export const skillsListUrl = (scope: SkillScope, groupId?: number) =>
    scope === "platform" ? `${api}/platform_skills` : `${api}/group_skills/${groupId}`;

export const skillUrl = (scope: SkillScope, name: string, groupId?: number) =>
    scope === "platform"
        ? `${api}/platform_skill/${encodeURIComponent(name)}`
        : `${api}/group_skill/${groupId}/${encodeURIComponent(name)}`;

export const groupAvailableSkillsUrl = (groupId: number) => `${api}/group_available_skills/${groupId}`;

// A platform skill's files, for a group admin (to view or duplicate it).
export const groupPlatformSkillUrl = (groupId: number, name: string) =>
    `${api}/group_platform_skill/${groupId}/${encodeURIComponent(name)}`;

export const mcpServersUrl = () => `${api}/ai_agent_mcp_servers`;

export const newSkillTemplate = (name: string): SkillFiles => ({
    "SKILL.md": `---
name: ${name}
description: "When the agent should use this skill: the task it covers and the requests that call for it."
version: "1.0"
tags: []
requires_mcp: []
---

# ${name}

Steps the agent follows, in order:

1. ...
2. ...

## Answer

How the answer must look.
`,
});

// The name and description in a SKILL.md's frontmatter, to name a skill
// that comes in a zip and to warn early; admin_api checks it fully.
export const readSkillMdHeader = (skillMd: string): { name: string; description: string; error: string } => {
    const m = /^\s*---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd);
    if (!m)
        return { name: "", description: "", error: "SKILL.md must start with a frontmatter block between '---' lines" };
    try {
        const data = YAML.parse(m[1]) as Record<string, unknown> | null;
        const name = typeof data?.name === "string" ? data.name.trim() : "";
        const description = typeof data?.description === "string" ? data.description.trim() : "";
        return { name, description, error: "" };
    } catch (e) {
        return { name: "", description: "", error: `Invalid frontmatter: ${(e as Error).message}` };
    }
};

// The SKILL.md with another name in its frontmatter (a renamed new skill,
// a duplicate).
export const setSkillMdName = (skillMd: string, name: string): string => {
    const m = /^(\s*---\r?\n)([\s\S]*?)(\r?\n---)/.exec(skillMd);
    if (!m) return skillMd;
    const frontmatter = /^name:.*$/m.test(m[2])
        ? m[2].replace(/^name:.*$/m, `name: ${name}`)
        : `name: ${name}\n${m[2]}`;
    return m[1] + frontmatter + m[3] + skillMd.slice(m[0].length);
};

// A name not taken yet: base, base-2, base-3...
export const freeSkillName = (base: string, taken: string[]): string => {
    const root = base.slice(0, SKILL_NAME_MAX_LENGTH - 3);
    if (!taken.includes(root)) return root;
    for (let i = 2; ; i++) if (!taken.includes(`${root}-${i}`)) return `${root}-${i}`;
};

export const fileExtension = (path: string) => {
    const name = path.split("/").pop() || "";
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot).toLowerCase() : "";
};

// 512 B, 12.3 KB, 4.56 MB.
export const formatSkillSize = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes < 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(kb < 10 ? 2 : 1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
};

// ---- zip files ----
//
// A skill (or several) can be uploaded as a .zip and downloaded as one.
// The zip is read and written here, in the browser, so admin_api only
// handles text: { path: content }. Reading supports the "stored" and
// "deflate" methods (what every zip tool writes), through the browser's
// DecompressionStream; writing uses "stored".

const textDecoder = new TextDecoder("utf-8", { fatal: true });

const inflateRaw = async (data: Uint8Array): Promise<Uint8Array> => {
    const source = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(data);
            controller.close();
        },
    });
    const stream = source.pipeThrough(
        new DecompressionStream("deflate-raw") as unknown as TransformStream<Uint8Array, Uint8Array>,
    );
    return new Uint8Array(await new Response(stream).arrayBuffer());
};

// The files of a zip, by path; folders and the macOS / Windows extras are skipped.
export const readZip = async (file: Blob): Promise<SkillFiles> => {
    const buf = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    // End of central directory: the last 22 bytes, plus a comment of up to 64 KB.
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error("Not a zip file");
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    if (p === 0xffffffff || count === 0xffff) throw new Error("ZIP64 files are not supported");

    const files: SkillFiles = {};
    for (let n = 0; n < count; n++) {
        if (view.getUint32(p, true) !== 0x02014b50) throw new Error("Corrupt zip file");
        const method = view.getUint16(p + 10, true);
        const compressedSize = view.getUint32(p + 20, true);
        const nameLength = view.getUint16(p + 28, true);
        const extraLength = view.getUint16(p + 30, true);
        const commentLength = view.getUint16(p + 32, true);
        const localOffset = view.getUint32(p + 42, true);
        const path = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLength));
        p += 46 + nameLength + extraLength + commentLength;

        const base = path.split("/").pop() || "";
        if (path.endsWith("/") || path.startsWith("__MACOSX/") || base === ".DS_Store" || base === "Thumbs.db")
            continue;

        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const raw = buf.subarray(start, start + compressedSize);
        let data: Uint8Array;
        if (method === 0) data = raw;
        else if (method === 8) data = await inflateRaw(raw);
        else throw new Error(`${path}: unsupported compression method (${method})`);
        try {
            files[path] = textDecoder.decode(data);
        } catch {
            throw new Error(`${path}: not a UTF-8 text file`);
        }
    }
    return files;
};

// The skills in a zip's files: SKILL.md at the top (one skill), or one
// folder per skill, each with its SKILL.md (one or several). The skill's
// name is its frontmatter's (or its folder's).
export const skillsFromZip = (files: SkillFiles): { name: string; files: SkillFiles }[] => {
    const paths = Object.keys(files);
    if ("SKILL.md" in files) {
        const { name } = readSkillMdHeader(files["SKILL.md"]);
        if (!name) throw new Error("The SKILL.md of the zip has no name in its frontmatter");
        return [{ name, files }];
    }
    const folders = paths.filter((p) => /^[^/]+\/SKILL\.md$/.test(p)).map((p) => p.split("/")[0]);
    if (folders.length === 0) throw new Error("No SKILL.md in the zip: at its top, or in a folder per skill");
    return folders.map((folder) => {
        const prefix = `${folder}/`;
        const skillFiles: SkillFiles = {};
        for (const path of paths) {
            if (path.startsWith(prefix)) skillFiles[path.slice(prefix.length)] = files[path];
        }
        const { name } = readSkillMdHeader(skillFiles["SKILL.md"]);
        return { name: name || folder, files: skillFiles };
    });
};

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = (data: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

// A zip ("stored") with the files under <folder>/, the layout readZip
// takes back.
export const writeZip = (folder: string, files: SkillFiles): Blob => {
    const encoder = new TextEncoder();
    const local: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    const entries = Object.keys(files).sort();
    for (const path of entries) {
        const name = encoder.encode(`${folder}/${path}`);
        const data = encoder.encode(files[path]);
        const crc = crc32(data);

        const header = new Uint8Array(30 + name.length);
        const h = new DataView(header.buffer);
        h.setUint32(0, 0x04034b50, true);
        h.setUint16(4, 20, true);
        h.setUint16(6, 0x0800, true); // UTF-8 names
        h.setUint32(14, crc, true);
        h.setUint32(18, data.length, true);
        h.setUint32(22, data.length, true);
        h.setUint16(26, name.length, true);
        header.set(name, 30);
        local.push(header, data);

        const entry = new Uint8Array(46 + name.length);
        const c = new DataView(entry.buffer);
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 20, true);
        c.setUint16(6, 20, true);
        c.setUint16(8, 0x0800, true);
        c.setUint32(16, crc, true);
        c.setUint32(20, data.length, true);
        c.setUint32(24, data.length, true);
        c.setUint16(28, name.length, true);
        c.setUint32(42, offset, true);
        entry.set(name, 46);
        central.push(entry);

        offset += header.length + data.length;
    }
    const centralSize = central.reduce((s, e) => s + e.length, 0);
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, entries.length, true);
    e.setUint16(10, entries.length, true);
    e.setUint32(12, centralSize, true);
    e.setUint32(16, offset, true);
    return new Blob([...local, ...central, end] as BlobPart[], { type: "application/zip" });
};

export const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
