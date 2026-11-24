import { describe, expect, it } from "vitest";
import { slideModelKey } from "./slideModel";
import { slideModelCacheKey } from "../../../../tools/fileSystem";

describe("the 3D model of a slide", () => {
    it("is another one when its slide, its file or its date change", () => {
        const info = { gltfFileName: "pump.glb", gltfFileDate: "2026-11-24", gltfFileSize: 10, femResults: 0 };
        expect(slideModelKey("slide-1", info)).toBe("slide-1|pump.glb|2026-11-24");
        expect(slideModelKey("s-a", info)).not.toBe(slideModelKey("slide-1", info));
        expect(slideModelKey("slide-1", { ...info, gltfFileDate: "2026-11-25" })).not.toBe(slideModelKey("slide-1", info));
        expect(slideModelKey("slide-1", undefined)).toBeNull();
        expect(slideModelKey(null, info)).toBeNull();
    });

    it("is kept in the browser apart from the other slides' (a twin's uid has no '-')", () => {
        expect(slideModelCacheKey("Abc123xX", "s-k2")).toBe("Abc123xX--s-k2");
        expect(slideModelCacheKey("Abc123xX", "s-k2").split("--")[0]).toBe("Abc123xX");
    });
});
