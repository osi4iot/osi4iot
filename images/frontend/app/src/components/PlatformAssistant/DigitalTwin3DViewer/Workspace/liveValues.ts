// The values of the NATS messages that reach the viewer, for the panels that show them as they arrive (Text and,
// the pictures with animations): the last value of each field of the messages (JSON) of each topic, by its topicRef (dtm2sim,
// dev2pdb_1...). The panels name a value as {{topicRef.path}}: {{dtm2sim.rotorRpm}}, {{dtm2sim.camera.position.0}}.
//
// Values do not go through React state of the page: a panel subscribes to the topics it names and re-renders
// itself (at most a few times a second).
import { useEffect, useState } from "react";
import { type NatsConnection } from "@nats-io/nats-core";
import { StringCodec } from "../../../../tools/natsCodec";
import type { INatsSubjectData } from "../Main/Model";
import { mqttTopicToNatsSubject } from "../NatsHook/tools";

export interface LiveMessage {
    payload: unknown;
    receivedAt: number;
}

export type LiveListener = (message: LiveMessage) => void;

export interface LiveValueStore {
    get: (topicRef: string) => LiveMessage | undefined;
    // the fields seen in the messages of a topic since the viewer was opened (not only the last one: a topic can
    // carry messages of different kinds), the plain ones first
    fields: (topicRef: string) => string[];
    subscribe: (topicRef: string, listener: LiveListener) => () => void;
    publish: (topicRef: string, payload: unknown, receivedAt?: number) => void;
}

export const createLiveValueStore = (): LiveValueStore => {
    const latest = new Map<string, LiveMessage>();
    const listeners = new Map<string, Set<LiveListener>>();
    const seen = new Map<string, Set<string>>();
    return {
        get: (topicRef) => latest.get(topicRef),
        fields: (topicRef) => sortFields(Array.from(seen.get(topicRef) ?? [])),
        subscribe: (topicRef, listener) => {
            if (!listeners.has(topicRef)) listeners.set(topicRef, new Set());
            listeners.get(topicRef)!.add(listener);
            return () => {
                listeners.get(topicRef)?.delete(listener);
            };
        },
        publish: (topicRef, payload, receivedAt = Date.now()) => {
            // the last value of each field: a message that does not carry a field (a topic can carry messages of
            // different kinds) leaves its previous value
            const message = { payload: mergeLatest(latest.get(topicRef)?.payload, payload), receivedAt };
            latest.set(topicRef, message);
            if (!seen.has(topicRef)) seen.set(topicRef, new Set());
            const known = seen.get(topicRef)!;
            if (known.size < 500) fieldPaths(payload).forEach((path) => known.add(path));
            listeners.get(topicRef)?.forEach((listener) => listener(message));
        },
    };
};

// --- the placeholders of a text: {{topicRef.path}} or {{topicRef.path|decimals}} ---------------------------

export const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_-]+)((?:\.[A-Za-z0-9_-]+)+)\s*(?:\|\s*(\d{1,2})\s*)?\}\}/g;

export interface Placeholder {
    text: string;
    topicRef: string;
    path: string[];
    decimals?: number;
}

export const placeholdersOf = (text: string): Placeholder[] =>
    Array.from(text.matchAll(PLACEHOLDER), (m) => ({
        text: m[0],
        topicRef: m[1],
        path: m[2].slice(1).split("."),
        decimals: m[3] === undefined ? undefined : Number(m[3]),
    }));

export const topicRefsOf = (texts: string[]): string[] =>
    Array.from(new Set(texts.flatMap((text) => placeholdersOf(text).map((p) => p.topicRef)))).sort();

export const valueAt = (payload: unknown, path: string[]): unknown => {
    let value: unknown = payload;
    for (const key of path) {
        if (value === null || typeof value !== "object") return undefined;
        value = (value as Record<string, unknown>)[key];
    }
    return value;
};

// how a value is shown in a text: numbers with the decimals asked (or up to 4 significant ones), texts as they
// are, the rest as JSON; "–" when the topic has sent nothing yet or the field is not in its message
export const formatLiveValue = (value: unknown, decimals?: number): string => {
    if (value === undefined || value === null) return "–";
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return String(value);
        if (decimals !== undefined) return value.toFixed(decimals);
        const abs = Math.abs(value);
        if (abs !== 0 && (abs >= 1e6 || abs < 1e-3)) return value.toExponential(3);
        return String(Number(value.toPrecision(6)));
    }
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "true" : "false";
    const text = JSON.stringify(value);
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
};

// the text with its placeholders replaced by the latest values
export const fillPlaceholders = (text: string, get: (topicRef: string) => LiveMessage | undefined): string =>
    text.replace(PLACEHOLDER, (_m, topicRef: string, path: string, decimals?: string) =>
        formatLiveValue(valueAt(get(topicRef)?.payload, path.slice(1).split(".")), decimals === undefined ? undefined : Number(decimals)),
    );

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);

// the previous values with those of a new message on top (objects field by field; lists and values replaced)
export const mergeLatest = (previous: unknown, next: unknown): unknown => {
    if (!isPlainObject(previous) || !isPlainObject(next)) return next;
    const out: Record<string, unknown> = { ...previous };
    for (const [key, value] of Object.entries(next)) out[key] = mergeLatest(previous[key], value);
    return out;
};

// plain fields first (rotorRpm, pose.distance), those inside lists after (camera.position.0), each group in order
export const sortFields = (paths: string[]): string[] => {
    const inList = (p: string) => /(^|\.)\d+(\.|$)/.test(p);
    return [...paths].sort((a, b) => Number(inList(a)) - Number(inList(b)) || a.localeCompare(b, undefined, { numeric: true }));
};

// the fields of a message (paths to its values, the arrays by index, at most `max`), to offer them in an editor
export const fieldPaths = (payload: unknown, max = 200): string[] => {
    const out: string[] = [];
    const walk = (value: unknown, path: string[]) => {
        if (out.length >= max) return;
        if (value !== null && typeof value === "object") {
            const entries = Array.isArray(value) ? value.slice(0, 20).map((v, i) => [String(i), v] as const) : Object.entries(value as object);
            for (const [key, v] of entries) {
                if (!/^[A-Za-z0-9_-]+$/.test(key)) continue;
                walk(v, [...path, key]);
            }
        } else if (path.length) out.push(path.join("."));
    };
    walk(payload, []);
    return out;
};

// --- a component re-renders with the values of the topics it names ------------------------------------------

export const useLiveTick = (store: LiveValueStore | undefined, topicRefs: string[], minIntervalMs = 250): number => {
    const [tick, setTick] = useState(0);
    const key = topicRefs.join("|");
    useEffect(() => {
        if (!store || !key) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let last = 0;
        const bump = () => {
            const wait = last + minIntervalMs - Date.now();
            if (wait <= 0) {
                last = Date.now();
                setTick((t) => t + 1);
            } else if (!timer) {
                timer = setTimeout(() => {
                    timer = null;
                    last = Date.now();
                    setTick((t) => t + 1);
                }, wait);
            }
        };
        const offs = key.split("|").map((ref) => store.subscribe(ref, bump));
        return () => {
            offs.forEach((off) => off());
            if (timer) clearTimeout(timer);
        };
    }, [store, key, minIntervalMs]);
    return tick;
};

// --- the subscription: the topics some panel names (JSON messages; images are for the Video/Photo panels) ---

// The topics a Text or Picture panel can take values from: the sensors' topics of the asset (dev2pdb_1,
// dev2pdb_2...: their fields are known, those of their sensors), and dtm2sim (what the pipeline sends to the
// viewer) and dev2sim (what the devices send to the viewer), whose fields are not known beforehand: they are
// written (the editors offer those seen in their messages).
export const LIVE_TOPIC = /^(dev2pdb_\d+|dtm2sim|dev2sim)$/;

export interface LiveField {
    path: string;
    label: string;
    units: string;
    // the sensor it belongs to (dev2pdb)
    sensor?: string;
}

export interface LiveTopic {
    ref: string;
    label: string;
    // dev2pdb: the fields of its sensors; dtm2sim and dev2sim: undefined (written)
    fields?: LiveField[];
}

const topicOrder = (ref: string) => (ref === "dtm2sim" ? 0 : ref === "dev2sim" ? 1 : 2 + Number(ref.split("_")[1] ?? 0));

export const liveTopicRefs = (natsSubjectsData: INatsSubjectData[]): string[] =>
    natsSubjectsData
        .filter((d) => d.natsSubject && !d.natsSubject.startsWith("Warning") && LIVE_TOPIC.test(d.topicRef))
        .map((d) => d.topicRef)
        .sort((a, b) => topicOrder(a) - topicOrder(b));

// the topics with what is known of them: the fields of the sensors of each dev2pdb topic (from the options of
// the charts: sensor, field, label, units) and the topic of each sensor
export const liveTopicsOf = (
    natsSubjectsData: INatsSubjectData[],
    sensorFields: { sensor: string; field: string; index?: number; label: string; units: string; sensorDescription: string }[],
    topicOfSensor: Record<string, string>,
): LiveTopic[] =>
    liveTopicRefs(natsSubjectsData).map((ref) => {
        if (ref === "dtm2sim") return { ref, label: "dtm2sim · sent by the pipeline to the viewer" };
        if (ref === "dev2sim") return { ref, label: "dev2sim · sent by the devices to the viewer" };
        const fields = sensorFields
            .filter((f) => topicOfSensor[f.sensor] === ref)
            .map((f) => ({ path: f.index === undefined ? f.field : `${f.field}.${f.index}`, label: f.label, units: f.units, sensor: f.sensorDescription }));
        const sensors = Array.from(new Set(fields.map((f) => f.sensor)));
        const names = sensors.slice(0, 3).join(", ") + (sensors.length > 3 ? "…" : "");
        return { ref, label: `${ref} · ${sensors.length ? `sensors: ${names}` : "sensors' topic"}`, fields };
    });

const sc = StringCodec();

export const useLiveValues = (
    natsClient: NatsConnection | null,
    natsSubjectsData: INatsSubjectData[],
    topicRefs: string[],
    store: LiveValueStore,
) => {
    const allowed = new Set(liveTopicRefs(natsSubjectsData));
    const key = topicRefs
        .filter((ref) => allowed.has(ref))
        .map((ref) => {
            const data = natsSubjectsData.find((d) => d.topicRef === ref)!;
            return `${ref}=${mqttTopicToNatsSubject(data.natsSubject)}`;
        })
        .join("|");
    useEffect(() => {
        if (!natsClient || !key) return;
        const subscriptions = key.split("|").map((pair) => {
            const [ref, subject] = pair.split("=");
            const sub = natsClient.subscribe(subject);
            (async () => {
                for await (const msg of sub) {
                    const contentType = msg.headers?.get("Content-Type") ?? "";
                    if (contentType && !contentType.includes("json")) continue;
                    try {
                        store.publish(ref, JSON.parse(sc.decode(msg.data)));
                    } catch {
                        // not JSON: nothing to show
                    }
                }
            })().catch(() => undefined);
            return sub;
        });
        return () => subscriptions.forEach((sub) => sub.unsubscribe());
    }, [natsClient, key, store]);
};
