import { describe, expect, it } from "vitest";
import { assetTopicKind, assetTopicsRef, checkAssetTopicsRef } from "./assetTopics";

describe("asset topics by their reference", () => {
    it("tells the asset's topics from the digital twin's", () => {
        expect(assetTopicKind("dev2pdb_3")).toBe("dev2pdb");
        expect(assetTopicKind("dev2dtm_2")).toBe("dev2dtm");
        expect(assetTopicKind("dtm2dev_1")).toBe("dtm2dev");
        expect(assetTopicKind("dev2dtm")).toBeNull();
        expect(assetTopicKind("dtm2dev")).toBeNull();
        expect(assetTopicKind("sim2dtm")).toBeNull();
    });

    it("groups and orders them by number", () => {
        const refs = ["dev2dtm", "dev2pdb_10", "dev2dtm_2", "dev2pdb_2", "dtm2dev_1", "dev2dtm_1", "sim2dtm", "dev2pdb_1"];
        expect(assetTopicsRef(refs.map((topicRef) => ({ topicRef })))).toEqual({
            dev2pdb: ["dev2pdb_1", "dev2pdb_2", "dev2pdb_10"],
            dev2dtm: ["dev2dtm_1", "dev2dtm_2"],
            dtm2dev: ["dtm2dev_1"],
        });
        expect(assetTopicsRef(undefined)).toEqual({ dev2pdb: [], dev2dtm: [], dtm2dev: [] });
    });
});

describe("topic references of a new asset", () => {
    it("asks for the name of the type", () => {
        expect(
            checkAssetTopicsRef([
                { topicRef: "dev2pdb_1", topicType: "dev2pdb_wt" },
                { topicRef: "dev2dtm_1", topicType: "dev2dtm" },
                { topicRef: "dtm2dev_1", topicType: "dtm2dev" },
            ]),
        ).toBeNull();
        expect(checkAssetTopicsRef([{ topicRef: "dev2pdb_5", topicType: "dev2dtm" }])).toMatch(/dev2dtm_<number>/);
        expect(checkAssetTopicsRef([{ topicRef: "dtm2dev_1", topicType: "dtm2dev" }, { topicRef: "dtm2dev_1", topicType: "dtm2dev" }])).toMatch(/repeated/);
        expect(checkAssetTopicsRef({})).toMatch(/list/);
    });
});
