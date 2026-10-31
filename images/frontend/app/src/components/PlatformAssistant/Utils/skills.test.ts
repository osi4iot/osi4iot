import { describe, expect, it } from "vitest";
import { freeSkillName, readSkillMdHeader, readZip, setSkillMdName, skillsFromZip, writeZip } from "./skills";

const deflateRaw = async (text: string): Promise<Uint8Array> => {
    const source = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        },
    });
    const stream = source.pipeThrough(
        new CompressionStream("deflate-raw") as unknown as TransformStream<Uint8Array, Uint8Array>,
    );
    return new Uint8Array(await new Response(stream).arrayBuffer());
};

// A zip with deflated entries, as zip tools write them (writeZip stores).
const deflatedZip = async (files: Record<string, string>): Promise<Blob> => {
    const parts: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    const names = Object.keys(files);
    for (const path of names) {
        const name = new TextEncoder().encode(path);
        const data = await deflateRaw(files[path]);
        const local = new Uint8Array(30 + name.length);
        const l = new DataView(local.buffer);
        l.setUint32(0, 0x04034b50, true);
        l.setUint16(8, 8, true);
        l.setUint32(18, data.length, true);
        l.setUint16(26, name.length, true);
        local.set(name, 30);
        parts.push(local, data);
        const c = new Uint8Array(46 + name.length);
        const v = new DataView(c.buffer);
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(10, 8, true);
        v.setUint32(20, data.length, true);
        v.setUint16(28, name.length, true);
        v.setUint32(42, offset, true);
        c.set(name, 46);
        central.push(c);
        offset += local.length + data.length;
    }
    const size = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, names.length, true);
    e.setUint16(10, names.length, true);
    e.setUint32(12, size, true);
    e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end] as BlobPart[]);
};

const skillMd = (name: string) => `---\nname: ${name}\ndescription: "Use when: testing"\n---\nSteps.\n`;

describe("skills zip files", () => {
    it("reads back what it writes", async () => {
        const files = { "SKILL.md": skillMd("max-load"), "refs/checklist.md": "á é ñ ✓" };
        const read = await readZip(writeZip("max-load", files));
        expect(read).toEqual({ "max-load/SKILL.md": files["SKILL.md"], "max-load/refs/checklist.md": "á é ñ ✓" });
        expect(skillsFromZip(read)).toEqual([{ name: "max-load", files }]);
    });

    it("reads deflated zips with one or several skills", async () => {
        const one = await readZip(
            await deflatedZip({ "SKILL.md": skillMd("one"), "a.txt": "A", "__MACOSX/x": "junk" }),
        );
        expect(skillsFromZip(one)).toEqual([{ name: "one", files: { "SKILL.md": skillMd("one"), "a.txt": "A" } }]);

        const several = await readZip(
            await deflatedZip({ "a/SKILL.md": skillMd("skill-a"), "b/SKILL.md": skillMd("skill-b"), "b/x.md": "X" }),
        );
        expect(
            skillsFromZip(several)
                .map((s) => s.name)
                .sort(),
        ).toEqual(["skill-a", "skill-b"]);
    });

    it("refuses what is not a skill", async () => {
        await expect(readZip(new Blob(["not a zip"]))).rejects.toThrow("Not a zip file");
        expect(() => skillsFromZip({ "README.md": "x" })).toThrow("No SKILL.md");
        expect(readSkillMdHeader("no frontmatter").error).not.toBe("");
        expect(readSkillMdHeader(skillMd("x"))).toEqual({ name: "x", description: "Use when: testing", error: "" });
    });
});

describe("duplicating skills", () => {
    it("renames the frontmatter only", () => {
        const md = `---\nname: viewer-ui-options\ndescription: "x"\n---\nname: not this one\n`;
        const renamed = setSkillMdName(md, "viewer-ui-options-custom");
        expect(readSkillMdHeader(renamed).name).toBe("viewer-ui-options-custom");
        expect(renamed.endsWith("name: not this one\n")).toBe(true);
    });

    it("finds a free name", () => {
        expect(freeSkillName("a-custom", [])).toBe("a-custom");
        expect(freeSkillName("a-custom", ["a-custom", "a-custom-2"])).toBe("a-custom-3");
    });
});
