import { IMobileTopic } from "../components/PlatformAssistant/TableColumns/topicsColumns";

// The sensor types the "Mobile sensors" page feeds from the phone, each with
// the topic type its form publishes to (admin_api lists the assets with at
// least one of them, whatever their asset type).
export const MOBILE_SENSOR_TOPIC_TYPE: Record<string, "dev2pdb_wt" | "dev2dtm"> = {
    "Mobile geolocation": "dev2pdb_wt",
    "Mobile accelerations": "dev2pdb_wt",
    "Mobile orientation": "dev2pdb_wt",
    "Mobile motion": "dev2pdb_wt",
    "Mobile photo": "dev2dtm",
    "Mobile video": "dev2dtm",
    "Mobile audio": "dev2dtm",
};

export const isMobileSensorType = (sensorType: string): boolean => sensorType in MOBILE_SENSOR_TOPIC_TYPE;

// The topic of the sensor chosen in the selection form (asset name +
// sensor description, which is what the form shows). Its sensorType, not its
// description, decides which form opens: a sensor of type "Mobile
// accelerations" described "Front axle phone" opens the accelerations form.
export const findMobileTopic = (
    topics: IMobileTopic[],
    assetName: string,
    sensorDescription: string,
): IMobileTopic | undefined =>
    topics.find((t) => `Asset_${t.assetUid}` === assetName && t.sensorDescription === sensorDescription);

// --- What the page remembers on this device (localStorage) -------------------------------------------------
// The last sensor chosen (the selection form opens with it, also after going back from a sensor's form or
// reloading the page) and the settings of each sensor's form (fps, JPEG quality, camera, reading times…),
// per sensor topic. Only conveniences: without storage (private mode) the forms use their defaults.
const MEMORY_KEY = "osi4iot.mobileSensors";

interface MobileSensorsMemory {
    selection?: { topicUid: string };
    settings?: Record<string, Record<string, unknown>>;
}

const readMemory = (): MobileSensorsMemory => {
    try {
        const raw = window.localStorage.getItem(MEMORY_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
};

const writeMemory = (memory: MobileSensorsMemory) => {
    try {
        window.localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
    } catch {
        // storage full or blocked: nothing is remembered
    }
};

export const rememberMobileSelection = (topic: IMobileTopic) => {
    writeMemory({ ...readMemory(), selection: { topicUid: topic.topicUid } });
};

// the sensor chosen last time, if the user still has it
export const recallMobileSelection = (topics: IMobileTopic[]): IMobileTopic | undefined => {
    const topicUid = readMemory().selection?.topicUid;
    return topicUid ? topics.find((t) => t.topicUid === topicUid) : undefined;
};

// the settings saved for a sensor, over its defaults: only the defaults' keys, with the same type
export const mobileSensorSettings = <T extends Record<string, unknown>>(topic: IMobileTopic | null | undefined, defaults: T): T => {
    const saved = topic ? readMemory().settings?.[topic.topicUid] : undefined;
    if (!saved || typeof saved !== "object") return defaults;
    const out: Record<string, unknown> = { ...defaults };
    for (const key of Object.keys(defaults)) {
        const value = saved[key];
        const def = defaults[key];
        if (typeof def === "number") {
            const n = typeof value === "string" ? Number(value) : value;
            if (typeof n === "number" && Number.isFinite(n)) out[key] = n;
        } else if (value !== undefined && value !== null && typeof value === typeof def) {
            out[key] = value;
        }
    }
    return out as T;
};

export const rememberMobileSensorSettings = (topic: IMobileTopic | null | undefined, values: Record<string, unknown>) => {
    if (!topic) return;
    const memory = readMemory();
    writeMemory({ ...memory, settings: { ...(memory.settings ?? {}), [topic.topicUid]: { ...values } } });
};
