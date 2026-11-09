// Data for the asset switcher (Ctrl K): which assets the user can open, where they are
// (building · floor), their status and their digital twins, plus search and filters.
// Pure functions, so they are easy to test.
import { IAsset } from "../TableColumns/assetsColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";
import { IBuilding } from "../TableColumns/buildingsColumns";
import { IFloor } from "../TableColumns/floorsColumns";
import { IDigitalTwinState, ISensorState } from "../Geolocation/GeolocationContainer";
import { findOutStatus } from "../Geolocation/statusTools";

export type SwitcherStatus = "ok" | "pending" | "alerting";
export type SwitcherFilter = "all" | "alarms" | "recent";

export interface SwitcherTwin {
    digitalTwin: IDigitalTwin;
    lastUsedAt: number | null;
}

export interface SwitcherEntry {
    asset: IAsset;
    org: IOrgOfGroupsManaged | null;
    group: IGroupManaged | null;
    building: IBuilding | null;
    floor: IFloor | null;
    place: string; // "Building · Floor n"
    status: SwitcherStatus;
    twins: SwitcherTwin[]; // last used first
    lastUsedAt: number | null;
    searchText: string;
}

export interface SwitcherSection {
    place: string;
    entries: SwitcherEntry[];
}

export interface SwitcherTables {
    assets: IAsset[];
    digitalTwins: IDigitalTwin[];
    groups: IGroupManaged[];
    orgs: IOrgOfGroupsManaged[];
    buildings: IBuilding[];
    floors: IFloor[];
    digitalTwinsState: IDigitalTwinState[];
    sensorsState: ISensorState[];
}

// digital twin id → time it was last opened (ms)
export type RecentTwins = Record<string, number>;

export const RECENT_TWINS_KEY = "osi4iot.assetSwitcher.recentTwins";
export const RECENT_TWINS_MAX = 30;
export const NO_PLACE = "No building";

// Lower case, without accents, so "camara" finds "Cámara".
export const normalizeText = (text: string): string =>
    (text || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();

export const placeOf = (building: IBuilding | null, floor: IFloor | null, group: IGroupManaged | null): string => {
    if (!building) return NO_PLACE;
    const floorNumber = floor ? floor.floorNumber : group?.floorNumber;
    if (floorNumber === undefined || floorNumber === null) return building.name;
    return `${building.name} · Floor ${floorNumber}`;
};

const asStatus = (state: string): SwitcherStatus =>
    state === "alerting" ? "alerting" : state === "pending" ? "pending" : "ok";

export const buildSwitcherEntries = (tables: SwitcherTables, recent: RecentTwins): SwitcherEntry[] => {
    const { assets, digitalTwins, groups, orgs, buildings, floors, digitalTwinsState, sensorsState } = tables;
    return assets.map((asset) => {
        const org = orgs.find((o) => o.id === asset.orgId) || null;
        const group = groups.find((g) => g.id === asset.groupId) || null;
        const building = org ? buildings.find((b) => b.id === org.buildingId) || null : null;
        const floor =
            building && group
                ? floors.find((f) => f.buildingId === building.id && f.floorNumber === group.floorNumber) || null
                : null;
        const twins: SwitcherTwin[] = digitalTwins
            .filter((dt) => dt.assetId === asset.id)
            .map((dt) => ({ digitalTwin: dt, lastUsedAt: recent[String(dt.id)] ?? null }))
            .sort((a, b) => {
                const byUse = (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
                if (byUse !== 0) return byUse;
                return a.digitalTwin.description.localeCompare(b.digitalTwin.description);
            });
        const status = asStatus(
            findOutStatus(
                digitalTwinsState.filter((s) => s && s.assetId === asset.id),
                sensorsState.filter((s) => s && s.assetId === asset.id),
            ),
        );
        const lastUsedAt = twins.reduce<number | null>(
            (max, t) => (t.lastUsedAt !== null && (max === null || t.lastUsedAt > max) ? t.lastUsedAt : max),
            null,
        );
        const place = placeOf(building, floor, group);
        const searchText = normalizeText(
            [
                asset.description,
                asset.assetUid,
                asset.assetType,
                group?.name,
                group?.acronym,
                org?.name,
                place,
                ...twins.map((t) => `${t.digitalTwin.description} ${t.digitalTwin.digitalTwinUid}`),
            ]
                .filter(Boolean)
                .join(" "),
        );
        return { asset, org, group, building, floor, place, status, twins, lastUsedAt, searchText };
    });
};

// Every word of the query must appear somewhere in the entry.
export const matchesQuery = (entry: SwitcherEntry, query: string): boolean => {
    const words = normalizeText(query).split(/\s+/).filter(Boolean);
    return words.every((word) => entry.searchText.includes(word));
};

export const filterEntries = (entries: SwitcherEntry[], query: string, filter: SwitcherFilter): SwitcherEntry[] => {
    let result = entries.filter((entry) => matchesQuery(entry, query));
    if (filter === "alarms") result = result.filter((entry) => entry.status !== "ok");
    if (filter === "recent") {
        result = result
            .filter((entry) => entry.lastUsedAt !== null)
            .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
    }
    return result;
};

const STATUS_ORDER: Record<SwitcherStatus, number> = { alerting: 0, pending: 1, ok: 2 };

// Groups the entries by building · floor. Inside a place: alarms first, then by name.
// With the "recent" filter there is a single section, in the order of use.
export const groupByPlace = (entries: SwitcherEntry[], filter: SwitcherFilter): SwitcherSection[] => {
    if (filter === "recent") return entries.length ? [{ place: "Recently opened", entries }] : [];
    const sections = new Map<string, SwitcherEntry[]>();
    for (const entry of entries) {
        const list = sections.get(entry.place) || [];
        list.push(entry);
        sections.set(entry.place, list);
    }
    return Array.from(sections.entries())
        .sort(([a], [b]) => {
            if (a === NO_PLACE) return 1;
            if (b === NO_PLACE) return -1;
            return a.localeCompare(b, undefined, { numeric: true });
        })
        .map(([place, list]) => ({
            place,
            entries: [...list].sort(
                (a, b) =>
                    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
                    a.asset.description.localeCompare(b.asset.description),
            ),
        }));
};

export const countAlarms = (entries: SwitcherEntry[]): number => entries.filter((e) => e.status !== "ok").length;

export const readRecentTwins = (storage: Storage | null = safeLocalStorage()): RecentTwins => {
    try {
        const raw = storage?.getItem(RECENT_TWINS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const result: RecentTwins = {};
        for (const [id, at] of Object.entries(parsed)) {
            if (typeof at === "number" && Number.isFinite(at)) result[id] = at;
        }
        return result;
    } catch {
        return {};
    }
};

// Remembers that a twin was opened; keeps only the latest RECENT_TWINS_MAX twins.
export const rememberTwin = (
    recent: RecentTwins,
    digitalTwinId: number,
    at: number,
    storage: Storage | null = safeLocalStorage(),
): RecentTwins => {
    const next: RecentTwins = { ...recent, [String(digitalTwinId)]: at };
    const kept = Object.entries(next)
        .sort(([, a], [, b]) => b - a)
        .slice(0, RECENT_TWINS_MAX);
    const result = Object.fromEntries(kept);
    try {
        storage?.setItem(RECENT_TWINS_KEY, JSON.stringify(result));
    } catch {
        // private mode or storage full: the order is only a convenience
    }
    return result;
};

function safeLocalStorage(): Storage | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

// The shortcut opens the switcher unless the user is typing (Monaco also uses Ctrl K chords).
export const isEditableTarget = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el || typeof el !== "object") return false;
    if (el.isContentEditable) return true;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    return typeof el.closest === "function" && !!el.closest(".monaco-editor, [contenteditable='true']");
};

export const isSwitcherShortcut = (e: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    target: EventTarget | null;
}): boolean => {
    if (e.altKey || isEditableTarget(e.target)) return false;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === "k") return true;
    return !e.ctrlKey && !e.metaKey && e.key === "/";
};
