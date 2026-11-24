// @vitest-environment node
// (jsdom's Blob has no stream(); every browser's has)
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { listZipEntries, readZipEntry, writeZip } from "./zipStream";

const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

// pseudo-random bytes: they do not compress, like a .glb
const noise = (n: number) => {
    const out = new Uint8Array(n);
    let x = 12345;
    for (let i = 0; i < n; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        out[i] = x >> 16;
    }
    return out;
};

describe("zipStream", () => {
    it("lists and reads a zip made by fflate, stored and deflated entries", async () => {
        const model = noise(200_000);
        const text = "x".repeat(300_000);
        const zip = zipSync({
            "models/pump.glb": [model, { level: 0 }],
            "fem/r1.json": strToU8(text),
            "empty.txt": new Uint8Array(0),
            "folder/": new Uint8Array(0),
        });
        const blob = new Blob([zip]);
        const entries = await listZipEntries(blob);
        if ("error" in entries) throw new Error(entries.error);
        expect(entries.map((e) => [e.path, e.size])).toEqual([
            ["models/pump.glb", model.length],
            ["fem/r1.json", text.length],
            ["empty.txt", 0],
        ]);
        expect(entries[0].method).toBe(0);
        expect(entries[1].method).toBe(8);
        expect(await bytes(await readZipEntry(blob, entries[0]))).toEqual(model);
        expect(strFromU8(await bytes(await readZipEntry(blob, entries[1])))).toBe(text);
        expect((await readZipEntry(blob, entries[2])).size).toBe(0);
    });

    it("writes a zip that any reader opens", async () => {
        const model = noise(100_000);
        const zip = await writeZip([
            { path: "models/m.glb", data: new Blob([model]), deflate: false },
            { path: "manifest.json", data: new Blob(['{"a":1}']), deflate: true },
            { path: "empty.json", data: new Blob([]), deflate: true },
        ]);
        const entries = unzipSync(await bytes(zip));
        expect(entries["models/m.glb"]).toEqual(model);
        expect(strFromU8(entries["manifest.json"])).toBe('{"a":1}');
        expect(entries["empty.json"].length).toBe(0);
        // and it reads back with listZipEntries (fflate's streaming zip uses data descriptors)
        const listed = await listZipEntries(zip);
        if ("error" in listed) throw new Error(listed.error);
        expect(await bytes(await readZipEntry(zip, listed[0]))).toEqual(model);
    });

    it("says why a file is not a zip it can read", async () => {
        expect(await listZipEntries(new Blob(["not a zip at all, just text"]))).toEqual({ error: "The file is not a valid zip." });
        expect(await listZipEntries(new Blob(["x"]))).toEqual({ error: "The file is not a valid zip." });
    });
});
