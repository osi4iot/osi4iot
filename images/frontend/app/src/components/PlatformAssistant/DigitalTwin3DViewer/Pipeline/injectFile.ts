// Inject node with a file: an image, a video or an audio clip from the user's computer, sent from the browser to the
// pipeline in the same format as the mobile sensors (Tools/MobileVideoForm, MobilePhotoForm, MobileAudioForm), so that a
// pipeline written for a Listen on dev2dtm can be tested without the device:
//   - an image: one message with the image (image/jpeg or image/png);
//   - a video: one image/jpeg message per frame, at the chosen frames per second, X-Capture-Ts = the frame's time;
//   - an audio clip: the file as is, or, when it is larger than a NATS message, 16 kHz mono WAV segments.
// The file stays in this browser (memory and IndexedDB, per node): it is not saved with the pipeline, only its name.

export type InjectFileKind = "image" | "video" | "audio";

export interface InjectFileSettings {
    fileName?: string;
    fileKind?: InjectFileKind;
    // video
    fps?: number;
    jpegQuality?: number;
    maxSide?: number;
    speed?: number;
    loop?: boolean;
    // audio
    audioSegmentSeconds?: number;
    audioRealtime?: boolean;
}

export const INJECT_FILE_DEFAULTS = {
    fps: 10,
    jpegQuality: 0.7,
    maxSide: 1280,
    speed: 1,
    loop: false,
    audioSegmentSeconds: 20,
    audioRealtime: true,
};

// NATS's max_payload is 1 MB: the headers need some room
export const MAX_MESSAGE_BYTES = 900 * 1024;

const EXTENSION_TYPES: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    flac: "audio/flac",
    m4a: "audio/mp4",
    aac: "audio/aac",
    opus: "audio/ogg",
};

// The MIME type of a file: the browser's, or from its extension
export const mimeTypeOf = (file: { type?: string; name: string }): string => {
    const declared = (file.type || "").split(";")[0].trim().toLowerCase();
    if (declared) return declared;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    return EXTENSION_TYPES[ext] ?? "";
};

export const fileKindOf = (file: { type?: string; name: string }): InjectFileKind | null => {
    const type = mimeTypeOf(file);
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    return null;
};

// The types the pipelines take as they come (message.IsImage / IsAudio): the rest is converted
const IMAGE_AS_IS = ["image/jpeg", "image/png", "image/gif"];
const AUDIO_AS_IS = ["audio/wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/flac", "audio/aac", "audio/webm", "audio/mp4"];

export const sendsAsIs = (kind: InjectFileKind, type: string, size: number) =>
    size <= MAX_MESSAGE_BYTES && (kind === "image" ? IMAGE_AS_IS : kind === "audio" ? AUDIO_AS_IS : []).includes(type);

// Size of a frame whose longer side is at most maxSide (never enlarged), even numbers
export const scaledSize = (width: number, height: number, maxSide: number) => {
    const scale = maxSide > 0 ? Math.min(1, maxSide / Math.max(width, height, 1)) : 1;
    return { width: Math.max(2, Math.round(width * scale)), height: Math.max(2, Math.round(height * scale)) };
};

// The times (seconds) of the frames of a video of `duration` seconds sampled at fps
export const frameTimes = (duration: number, fps: number): number[] => {
    if (!(duration > 0) || !(fps > 0)) return [];
    const count = Math.floor(duration * fps + 1e-6);
    return Array.from({ length: Math.max(count, 1) }, (_, k) => k / fps);
};

// Mono at a new sampling rate (average of the channels, linear interpolation)
export const downmixResample = (channels: Float32Array[], fromRate: number, toRate: number): Float32Array => {
    const length = channels[0]?.length ?? 0;
    const mono = new Float32Array(length);
    for (const ch of channels) for (let i = 0; i < length; i++) mono[i] += ch[i] / channels.length;
    if (fromRate === toRate) return mono;
    const outLength = Math.floor((length * toRate) / fromRate);
    const out = new Float32Array(outLength);
    const ratio = fromRate / toRate;
    for (let i = 0; i < outLength; i++) {
        const x = i * ratio;
        const i0 = Math.floor(x);
        const i1 = Math.min(i0 + 1, length - 1);
        const f = x - i0;
        out[i] = mono[i0] * (1 - f) + mono[i1] * f;
    }
    return out;
};

// 16-bit PCM WAV of mono samples in [-1, 1]
export const encodeWav = (samples: Float32Array, sampleRate: number): Uint8Array => {
    const bytes = new Uint8Array(44 + samples.length * 2);
    const view = new DataView(bytes.buffer);
    const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    text(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
        const v = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    return bytes;
};

// ---- the file of each node, kept in this browser ----

const DB_NAME = "osi4iot-inject-files";
const STORE = "files";
const memory = new Map<string, File>();

const openDb = (): Promise<IDBDatabase | null> =>
    new Promise((resolve) => {
        try {
            if (typeof indexedDB === "undefined") return resolve(null);
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });

const idb = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> => {
    const db = await openDb();
    if (!db) return undefined;
    return new Promise((resolve) => {
        try {
            const req = run(db.transaction(STORE, mode).objectStore(STORE));
            req.onsuccess = () => resolve(req.result as T);
            req.onerror = () => resolve(undefined);
        } catch {
            resolve(undefined);
        }
    });
};

export const setInjectFile = async (nodeUid: string, file: File | null) => {
    if (file) memory.set(nodeUid, file);
    else memory.delete(nodeUid);
    notify(nodeUid);
    // the file survives a reload of the page (in this browser); a file too large for the quota stays in memory only
    await idb("readwrite", (s) => (file ? s.put(file, nodeUid) : s.delete(nodeUid)));
};

export const getInjectFile = async (nodeUid: string): Promise<File | null> => {
    const inMemory = memory.get(nodeUid);
    if (inMemory) return inMemory;
    const stored = await idb<File>("readonly", (s) => s.get(nodeUid));
    if (stored) {
        memory.set(nodeUid, stored);
        return stored;
    }
    return null;
};

// ---- what each node is sending ----

export interface InjectStatus {
    running: boolean;
    sent: number;
    total?: number;
    text?: string;
}

const statuses = new Map<string, InjectStatus>();
const stops = new Map<string, () => void>();
const listeners = new Map<string, Set<() => void>>();

const notify = (nodeUid: string) => listeners.get(nodeUid)?.forEach((l) => l());

const setStatus = (nodeUid: string, status: InjectStatus) => {
    statuses.set(nodeUid, status);
    notify(nodeUid);
};

// The same object while nothing changes: useSyncExternalStore re-renders forever on a new snapshot each call
const IDLE: InjectStatus = Object.freeze({ running: false, sent: 0 });

export const getInjectStatus = (nodeUid: string): InjectStatus => statuses.get(nodeUid) ?? IDLE;

export const subscribeInject = (nodeUid: string, listener: () => void) => {
    if (!listeners.has(nodeUid)) listeners.set(nodeUid, new Set());
    listeners.get(nodeUid)!.add(listener);
    return () => {
        listeners.get(nodeUid)?.delete(listener);
    };
};

export const stopInjecting = (nodeUid: string) => stops.get(nodeUid)?.();

export type Publish = (data: Uint8Array, headers: Record<string, string>) => void;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const canvasJpeg = async (canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> => {
    let q = quality;
    for (;;) {
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
        if (!blob) throw new Error("the browser could not encode the frame");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        // too large for a NATS message: lower the quality
        if (bytes.length <= MAX_MESSAGE_BYTES || q <= 0.2) return bytes;
        q = Math.max(0.2, q - 0.15);
    }
};

const sendImage = async (file: File, type: string, s: Required<InjectFileSettings>, publish: Publish, base: Record<string, string>) => {
    if (sendsAsIs("image", type, file.size)) {
        publish(new Uint8Array(await file.arrayBuffer()), { ...base, "Content-Type": type, "X-Capture-Ts": String(Date.now()) });
        return;
    }
    const bitmap = await createImageBitmap(file);
    const { width, height } = scaledSize(bitmap.width, bitmap.height, s.maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    const data = await canvasJpeg(canvas, s.jpegQuality);
    publish(data, { ...base, "Content-Type": "image/jpeg", "X-Capture-Ts": String(Date.now()) });
};

const sendVideo = async (
    file: File,
    s: Required<InjectFileSettings>,
    publish: Publish,
    base: Record<string, string>,
    stopped: () => boolean,
    progress: (sent: number, total: number) => void,
) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    try {
        await new Promise<void>((resolve, reject) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => reject(new Error("the browser cannot play this video"));
        });
        const times = frameTimes(video.duration, s.fps);
        if (times.length === 0) throw new Error("the video has no duration");
        const { width, height } = scaledSize(video.videoWidth, video.videoHeight, s.maxSide);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        const startWall = Date.now();
        let sent = 0;
        let loopOffset = 0;
        do {
            for (let k = 0; k < times.length; k++) {
                if (stopped()) return;
                const t = times[k];
                // each frame at its time: seeking does not skip frames when the encoding is slower than the video
                await new Promise<void>((resolve) => {
                    video.onseeked = () => resolve();
                    video.currentTime = t;
                });
                ctx.drawImage(video, 0, 0, width, height);
                const data = await canvasJpeg(canvas, s.jpegQuality);
                const videoTime = loopOffset + t;
                // at the video's pace (speed: faster or slower); the timestamps are the frames' own times
                await sleep(startWall + (videoTime * 1000) / s.speed - Date.now());
                if (stopped()) return;
                publish(data, {
                    ...base,
                    "Content-Type": "image/jpeg",
                    "X-Frame-Seq": String(sent),
                    "X-Capture-Ts": String(Math.round(startWall + videoTime * 1000)),
                    "Payload-Frame": String(k),
                    "Payload-VideoTime": t.toFixed(3),
                });
                sent++;
                progress(sent, times.length);
            }
            loopOffset += times.length / s.fps;
        } while (s.loop && !stopped());
    } finally {
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(url);
    }
};

const sendAudio = async (
    file: File,
    type: string,
    s: Required<InjectFileSettings>,
    publish: Publish,
    base: Record<string, string>,
    stopped: () => boolean,
    progress: (sent: number, total: number) => void,
) => {
    if (sendsAsIs("audio", type, file.size)) {
        publish(new Uint8Array(await file.arrayBuffer()), { ...base, "Content-Type": type, "X-Capture-Ts": String(Date.now()) });
        progress(1, 1);
        return;
    }
    // too large for one message (or a type the pipelines do not take): 16 kHz mono WAV segments
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    let buffer: AudioBuffer;
    try {
        buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    } finally {
        void ctx.close();
    }
    const rate = 16000;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    const mono = downmixResample(channels, buffer.sampleRate, rate);
    // 16-bit at 16 kHz: 32 kB per second
    const seconds = Math.max(1, Math.min(s.audioSegmentSeconds, Math.floor((MAX_MESSAGE_BYTES - 44) / (rate * 2))));
    const step = seconds * rate;
    const total = Math.ceil(mono.length / step);
    const start = Date.now();
    for (let i = 0; i < total; i++) {
        if (stopped()) return;
        if (s.audioRealtime) await sleep(start + (i + 1) * seconds * 1000 - Date.now()); // when the segment would have ended
        if (stopped()) return;
        publish(encodeWav(mono.subarray(i * step, (i + 1) * step), rate), {
            ...base,
            "Content-Type": "audio/wav",
            "X-Capture-Ts": String(start + i * seconds * 1000),
            "Payload-Segment": String(i),
            "Payload-Segments": String(total),
        });
        progress(i + 1, total);
    }
};

// Sends the node's file; resolves when it is all sent or stopped. Pressing the button again stops a video or audio.
export const injectFile = async (
    nodeUid: string,
    file: File,
    settings: InjectFileSettings,
    publish: Publish,
): Promise<{ sent: number; stopped: boolean }> => {
    const s = { ...INJECT_FILE_DEFAULTS, ...settings } as Required<InjectFileSettings>;
    s.fps = Math.min(30, Math.max(0.1, s.fps));
    s.speed = Math.min(8, Math.max(0.05, s.speed));
    s.jpegQuality = Math.min(1, Math.max(0.1, s.jpegQuality));
    const type = mimeTypeOf(file);
    const kind = fileKindOf(file);
    if (!kind) throw new Error(`${file.name}: not an image, a video nor an audio file`);
    let stopFlag = false;
    stops.set(nodeUid, () => {
        stopFlag = true;
    });
    let sent = 0;
    const progress = (n: number, total: number) => {
        sent = n;
        setStatus(nodeUid, { running: true, sent: n, total, text: kind === "video" ? `frame ${n}/${total}` : `${n}/${total}` });
    };
    setStatus(nodeUid, { running: true, sent: 0 });
    const base = { "Inject-Node": nodeUid, "Payload-FileName": file.name };
    try {
        if (kind === "image") {
            await sendImage(file, type, s, publish, base);
            sent = 1;
        } else if (kind === "video") {
            await sendVideo(file, s, publish, base, () => stopFlag, progress);
        } else {
            await sendAudio(file, type, s, publish, base, () => stopFlag, progress);
        }
    } finally {
        stops.delete(nodeUid);
        setStatus(nodeUid, { running: false, sent });
    }
    return { sent, stopped: stopFlag };
};
