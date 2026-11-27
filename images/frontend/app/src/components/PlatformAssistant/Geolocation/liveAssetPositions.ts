// The live position of the assets that move (their type's geolocation mode is "dynamic"): the map subscribes by NATS
// to the topics of their geolocation sensors ("Mobile geolocation": latitude, longitude; "Geolocation": Latitude,
// Longitude), given by admin_api with their last kept position (measurement_last_of_assets_geolocation), and moves
// their markers with each message. Keeping the position is the pipeline's (AssetState node, "Update geolocation of
// current asset", in iot_data.assetState): here it only moves on the screen.

export interface LivePosition {
    latitude: number;
    longitude: number;
}

const finite = (v: unknown): number | null => {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const field = (payload: Record<string, unknown>, names: string[]): unknown => {
    for (const name of names) if (name in payload) return payload[name];
    const keys = Object.keys(payload);
    for (const name of names) {
        const key = keys.find((k) => k.toLowerCase() === name);
        if (key !== undefined) return payload[key];
    }
    return undefined;
};

// the position of a message (its text), or null if it has none valid
export const positionOfMessage = (text: string): LivePosition | null => {
    let payload: unknown;
    try {
        payload = JSON.parse(text);
    } catch {
        return null;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const p = payload as Record<string, unknown>;
    const latitude = finite(field(p, ["latitude", "lat"]));
    const longitude = finite(field(p, ["longitude", "lon", "lng"]));
    if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude };
};

// the asset of each subject of its geolocation sensors
export const assetOfSubjects = (entries: { assetUid: string; natsSubjects?: unknown }[]): Record<string, string> => {
    const assetOf: Record<string, string> = {};
    for (const entry of entries) {
        if (!Array.isArray(entry.natsSubjects)) continue;
        for (const subject of entry.natsSubjects) {
            if (typeof subject === "string" && subject !== "") assetOf[subject] = entry.assetUid;
        }
    }
    return assetOf;
};

// the assets with the position kept in their state (admin_api: only the assets that move; null: none, the asset
// keeps its own)
export const withKeptPositions = <A extends { assetUid: string; latitude: number; longitude: number }>(
    assets: A[],
    kept: { assetUid: string; latitude?: unknown; longitude?: unknown }[],
): A[] => {
    const byAsset = new Map<string, LivePosition>();
    for (const entry of kept) {
        if (typeof entry.latitude === "number" && typeof entry.longitude === "number") {
            byAsset.set(entry.assetUid, { latitude: entry.latitude, longitude: entry.longitude });
        }
    }
    if (byAsset.size === 0) return assets;
    return assets.map((asset) => {
        const position = byAsset.get(asset.assetUid);
        return position ? { ...asset, latitude: position.latitude, longitude: position.longitude } : asset;
    });
};

// the assets with their live position (an asset without one keeps its own)
export const withLivePositions = <A extends { assetUid: string; latitude: number; longitude: number }>(
    assets: A[],
    live: Record<string, LivePosition>,
): A[] => {
    if (Object.keys(live).length === 0) return assets;
    return assets.map((asset) => {
        const position = live[asset.assetUid];
        return position ? { ...asset, latitude: position.latitude, longitude: position.longitude } : asset;
    });
};
