import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
    buildViewerPackage,
    describePackageImages,
    layoutImageNames,
    packageImageWarnings,
    readViewerPackage,
    VIEWER_PACKAGE_MAX_FILES,
} from "./viewerPackage";
import { WorkspaceLayout } from "./workspaceLayout";

const config = JSON.stringify({ format: "osi4iot-viewer-config", version: 1 });
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const svg = strToU8('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');

const layout = {
    slides: [
        {
            id: "s1",
            title: "Slide 1",
            tag: "Slide_1",
            panels: [
                { id: "p1", type: "picture", file: "status.svg", x: 0, y: 0, w: 4, h: 4 },
                { id: "p2", type: "picture", file: "plan.png", x: 4, y: 0, w: 4, h: 4 },
                { id: "p3", type: "model", x: 0, y: 4, w: 8, h: 6 },
            ],
        },
    ],
} as unknown as WorkspaceLayout;

describe("viewer package (.zip)", () => {
    it("reads back the configuration and the images of the zip it builds", () => {
        const zip = buildViewerPackage("viewer_config.json", config, [
            { fileName: "status.svg", data: svg },
            { fileName: "plan.png", data: png },
        ]);
        const read = readViewerPackage(zip);
        if ("error" in read) throw new Error(read.error);
        expect(read.configName).toBe("viewer_config.json");
        expect(read.configText).toBe(config);
        expect(read.images.map((i) => i.fileName)).toEqual(["plan.png", "status.svg"]);
        expect(Array.from(read.images[0].data)).toEqual(Array.from(png));
        expect(read.ignored).toEqual([]);
        expect(describePackageImages(read.images)).toMatch(/^2 images \(0\.00 MB\)$/);
    });

    it("takes images at the root, ignores the rest and says why", () => {
        const zip = zipSync({
            "my_twin.json": strToU8(config),
            "plan.png": png,
            "notes.txt": strToU8("hi"),
            "other/plan2.png": png,
            "bad name!.png": png,
            "__MACOSX/._plan.png": png,
            ".DS_Store": strToU8("x"),
            "pipeline.json": strToU8('{"nodes": []}'),
        });
        const read = readViewerPackage(zip);
        if ("error" in read) throw new Error(read.error);
        expect(read.configName).toBe("my_twin.json");
        expect(read.images.map((i) => i.fileName)).toEqual(["plan.png"]);
        expect(read.ignored.join("\n")).toMatch(/notes\.txt: not a configuration or an image/);
        expect(read.ignored.join("\n")).toMatch(/other\/plan2\.png: images go at the root or in viewerImages\//);
        expect(read.ignored.join("\n")).toMatch(/bad name!\.png: not a valid name/);
        expect(read.ignored.join("\n")).toMatch(/pipeline\.json: not a viewer configuration/);
        expect(read.ignored.join("\n")).not.toMatch(/MACOSX|DS_Store/);
    });

    it("refuses what is not a zip, a zip without configuration and a zip with too many files", () => {
        expect(readViewerPackage(strToU8(config))).toEqual({ error: "The file is not a valid zip." });
        expect(readViewerPackage(zipSync({ "plan.png": png }))).toEqual({ error: "The zip has no viewer configuration (.json)." });
        const many: Record<string, Uint8Array> = { "viewer_config.json": strToU8(config) };
        for (let i = 0; i < VIEWER_PACKAGE_MAX_FILES; i++) many[`img${i}.png`] = png;
        expect(readViewerPackage(zipSync(many))).toEqual({ error: `The zip has more than ${VIEWER_PACKAGE_MAX_FILES} files.` });
    });

    it("tells which images replace the twin's and which the layout misses", () => {
        expect(layoutImageNames(layout)).toEqual(["plan.png", "status.svg"]);
        const images = [{ fileName: "status.svg", data: svg }];
        expect(packageImageWarnings(layout, images, ["status.svg", "old.png"])).toEqual({ replaces: ["status.svg"], missing: ["plan.png"] });
        // the twin's images unknown: nothing is said
        expect(packageImageWarnings(layout, images, null)).toEqual({ replaces: [], missing: [] });
    });
});
