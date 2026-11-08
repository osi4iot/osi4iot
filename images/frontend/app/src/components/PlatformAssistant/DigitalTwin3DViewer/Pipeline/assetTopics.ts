// Topics of the asset of a digital twin (assetTopicsRef.json), by the name of their reference:
//   dev2pdb_n  measurements stored in the IoT database (types dev2pdb, dev2pdb_wt, dev2pdb_ma)
//   dev2dtm_n  device -> digital twin (photos, video, audio...)
//   dtm2dev_n  digital twin -> device (commands)
// The digital twin's own topics have no number: "dev2dtm", "dtm2dev", "sim2dtm"...
export type AssetTopicKind = "dev2pdb" | "dev2dtm" | "dtm2dev";

const ASSET_TOPIC_REF = /^(dev2pdb|dev2dtm|dtm2dev)_(\d+)$/;

export const assetTopicKind = (topicRef: string): AssetTopicKind | null => {
    const m = ASSET_TOPIC_REF.exec(topicRef ?? "");
    return m ? (m[1] as AssetTopicKind) : null;
};

export interface AssetTopicsRef {
    dev2pdb: string[];
    dev2dtm: string[];
    dtm2dev: string[];
}

// dev2pdb_2 before dev2pdb_10
const byNumber = (a: string, b: string) => Number(a.split("_").pop()) - Number(b.split("_").pop());

export const assetTopicsRef = (subjects: { topicRef: string }[] | undefined): AssetTopicsRef => {
    const out: AssetTopicsRef = { dev2pdb: [], dev2dtm: [], dtm2dev: [] };
    for (const s of subjects ?? []) {
        const kind = assetTopicKind(s.topicRef);
        if (kind && !out[kind].includes(s.topicRef)) out[kind].push(s.topicRef);
    }
    out.dev2pdb.sort(byNumber);
    out.dev2dtm.sort(byNumber);
    out.dtm2dev.sort(byNumber);
    return out;
};

// Prefix that the reference of each topic type must have in assetTopicsRef.json (null: free name)
export const assetTopicRefPrefix = (topicType: string): AssetTopicKind | null => {
    if (topicType === "dev2pdb" || topicType === "dev2pdb_wt" || topicType === "dev2pdb_ma") return "dev2pdb";
    if (topicType === "dev2dtm" || topicType === "dtm2dev") return topicType;
    return null;
};

// Check of the topic references of a new asset: null when they are fine, or what is wrong
export const checkAssetTopicsRef = (value: unknown): string | null => {
    if (!Array.isArray(value)) return "it must be a list (a JSON array)";
    const seen = new Set<string>();
    for (const t of value as { topicRef?: string; topicType?: string }[]) {
        const ref = t?.topicRef ?? "";
        if (seen.has(ref)) return `topic reference ${ref} is repeated`;
        seen.add(ref);
        const prefix = assetTopicRefPrefix(t?.topicType ?? "");
        if (prefix && !new RegExp(`^${prefix}_\\d+$`).test(ref)) {
            return `topic reference ${ref} of type ${t.topicType} must be named ${prefix}_<number> (e.g. ${prefix}_1)`;
        }
    }
    return null;
};
