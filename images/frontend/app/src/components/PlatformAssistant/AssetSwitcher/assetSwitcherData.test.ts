import { describe, expect, it } from "vitest";
import {
    buildSwitcherEntries,
    filterEntries,
    groupByPlace,
    isSwitcherShortcut,
    normalizeText,
    readRecentTwins,
    rememberTwin,
    RECENT_TWINS_KEY,
    RECENT_TWINS_MAX,
    SwitcherTables,
} from "./assetSwitcherData";

const memoryStorage = (): Storage => {
    const data = new Map<string, string>();
    return {
        get length() {
            return data.size;
        },
        clear: () => data.clear(),
        getItem: (k) => (data.has(k) ? data.get(k)! : null),
        key: (i) => Array.from(data.keys())[i] ?? null,
        removeItem: (k) => void data.delete(k),
        setItem: (k, v) => void data.set(k, String(v)),
    };
};

const tables = (): SwitcherTables => ({
    assets: [
        { id: 1, orgId: 10, groupId: 100, assetUid: "a1", description: "OC4 tower", assetType: "Wind turbine" },
        { id: 2, orgId: 10, groupId: 100, assetUid: "a2", description: "Cámara puerta", assetType: "Mobile" },
        { id: 3, orgId: 10, groupId: 101, assetUid: "a3", description: "Bomba", assetType: "Pump" },
    ] as any,
    digitalTwins: [
        { id: 11, assetId: 1, description: "OC4 floating turbine", digitalTwinUid: "dt11", type: "Glb 3D model" },
        { id: 12, assetId: 1, description: "OC4 rotor study", digitalTwinUid: "dt12", type: "Gltf 3D model" },
        { id: 21, assetId: 2, description: "Door camera", digitalTwinUid: "dt21", type: "Grafana dashboard" },
    ] as any,
    groups: [
        { id: 100, name: "Wind lab", acronym: "WL", orgId: 10, floorNumber: 0 },
        { id: 101, name: "Hydraulics", acronym: "HY", orgId: 10, floorNumber: 1 },
    ] as any,
    orgs: [{ id: 10, name: "Lab", acronym: "LAB", buildingId: 5 }] as any,
    buildings: [{ id: 5, name: "Main building" }] as any,
    floors: [
        { id: 50, buildingId: 5, floorNumber: 0 },
        { id: 51, buildingId: 5, floorNumber: 1 },
    ] as any,
    digitalTwinsState: [{ orgId: 10, groupId: 101, assetId: 3, digitalTwinId: 99, state: "alerting" }],
    sensorsState: [{ orgId: 10, groupId: 100, assetId: 2, sensorId: 7, state: "pending" }],
});

describe("asset switcher data", () => {
    it("places each asset in its building and floor, with its status", () => {
        const entries = buildSwitcherEntries(tables(), {});
        const byId = Object.fromEntries(entries.map((e) => [e.asset.id, e]));
        expect(byId[1].place).toBe("Main building · Floor 0");
        expect(byId[3].place).toBe("Main building · Floor 1");
        expect(byId[1].status).toBe("ok");
        expect(byId[2].status).toBe("pending");
        expect(byId[3].status).toBe("alerting");
        expect(byId[3].twins).toHaveLength(0);
    });

    it("puts the last used twin first", () => {
        const entries = buildSwitcherEntries(tables(), { "12": 2000, "11": 1000 });
        const tower = entries.find((e) => e.asset.id === 1)!;
        expect(tower.twins.map((t) => t.digitalTwin.id)).toEqual([12, 11]);
        expect(tower.lastUsedAt).toBe(2000);
    });

    it("searches without accents, by every word, also in groups and twins", () => {
        const entries = buildSwitcherEntries(tables(), {});
        expect(normalizeText("  Cámara ")).toBe("camara");
        expect(filterEntries(entries, "camara", "all").map((e) => e.asset.id)).toEqual([2]);
        expect(filterEntries(entries, "rotor", "all").map((e) => e.asset.id)).toEqual([1]);
        expect(filterEntries(entries, "hydraulics", "all").map((e) => e.asset.id)).toEqual([3]);
        expect(filterEntries(entries, "oc4 study", "all").map((e) => e.asset.id)).toEqual([1]);
        expect(filterEntries(entries, "oc4 pump", "all")).toHaveLength(0);
    });

    it("filters by alarms and by recent use", () => {
        const entries = buildSwitcherEntries(tables(), { "21": 5000, "11": 9000 });
        expect(filterEntries(entries, "", "alarms").map((e) => e.asset.id).sort()).toEqual([2, 3]);
        expect(filterEntries(entries, "", "recent").map((e) => e.asset.id)).toEqual([1, 2]);
    });

    it("groups by place with alarms first, and recent as one list", () => {
        const entries = buildSwitcherEntries(tables(), { "21": 5000 });
        const sections = groupByPlace(filterEntries(entries, "", "all"), "all");
        expect(sections.map((s) => s.place)).toEqual(["Main building · Floor 0", "Main building · Floor 1"]);
        expect(sections[0].entries.map((e) => e.asset.id)).toEqual([2, 1]);
        const recent = groupByPlace(filterEntries(entries, "", "recent"), "recent");
        expect(recent).toHaveLength(1);
        expect(recent[0].entries.map((e) => e.asset.id)).toEqual([2]);
    });

    it("remembers the recent twins in the storage, keeping the latest ones", () => {
        const storage = memoryStorage();
        let recent = readRecentTwins(storage);
        expect(recent).toEqual({});
        for (let i = 0; i < RECENT_TWINS_MAX + 5; i++) recent = rememberTwin(recent, i, 1000 + i, storage);
        expect(Object.keys(recent)).toHaveLength(RECENT_TWINS_MAX);
        expect(recent["0"]).toBeUndefined();
        expect(readRecentTwins(storage)).toEqual(recent);
        storage.setItem(RECENT_TWINS_KEY, "{bad json");
        expect(readRecentTwins(storage)).toEqual({});
        expect(readRecentTwins(null)).toEqual({});
    });

    it("opens with Ctrl K, Cmd K or /, but not while typing", () => {
        const key = (k: string, opts: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }>, target: any = document.body) =>
            isSwitcherShortcut({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target, ...opts });
        expect(key("k", { ctrlKey: true })).toBe(true);
        expect(key("K", { metaKey: true })).toBe(true);
        expect(key("/", {})).toBe(true);
        expect(key("k", {})).toBe(false);
        expect(key("k", { ctrlKey: true, shiftKey: true })).toBe(false);
        expect(key("k", { ctrlKey: true }, document.createElement("input"))).toBe(false);
        expect(key("/", {}, document.createElement("textarea"))).toBe(false);
        const monaco = document.createElement("div");
        monaco.className = "monaco-editor";
        const inner = document.createElement("div");
        monaco.appendChild(inner);
        expect(key("k", { ctrlKey: true }, inner)).toBe(false);
    });
});
