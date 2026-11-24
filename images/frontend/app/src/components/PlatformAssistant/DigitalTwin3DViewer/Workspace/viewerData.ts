// The Viewer data of a digital twin (README, "Viewer data"): what defines it besides its form — the viewer
// configuration (with its images), the 3D model, the FEM results, the simulator format and the pipeline. Each part
// loads alone from its own file, and all of them at once from one .zip:
//
//   manifest.json                      {"format": "osi4iot-viewer-data", "version": 1, ...}
//   viewer_config.json | viewer_config.zip   (the .zip when the configuration has images)
//   models/<name>.glb | .gltf
//   fem/<name>.json                    (one or more)
//   simulator/simulator_format.json
//   pipeline/pipeline.yml
//
// Loading files (one or several, a .zip of viewer data among them) tells first what each one is; the user chooses
// what to load. A zip without manifest also works: each file is recognized by its extension and its content.
//
// Files are Blobs, never one big array: the .zip of viewer data can reach VIEWER_DATA_MAX_BYTES, and it is read
// entry by entry (zipStream.ts), a stored .glb being only a slice of it. The network is viewerDataApi.ts.
import YAML from "yaml";
import {
    isFemResultsDocument,
    isPipelineDocument,
    isSimulationFormatDocument,
    isViewerConfigDocument,
} from "../../GroupAdminOptions/digitalTwinFileTargets";
import { isZipName, readViewerPackage, VIEWER_PACKAGE_MAX_BYTES } from "./viewerPackage";
import { listZipEntries, readZipEntry, writeZip, ZipInput } from "./zipStream";

export const VIEWER_DATA_FORMAT = "osi4iot-viewer-data";
// 2: a model and FEM results for each slide (slides/<slideId>/…); 1 had one (models/, fem/), still read
export const VIEWER_DATA_VERSION = 2;
// a .zip of viewer data is checked before anything is decompressed (the sizes its directory gives)
export const VIEWER_DATA_MAX_FILES = 300;
export const VIEWER_DATA_MAX_BYTES = 2000 * 1024 * 1024;
// a text file (pipeline, simulator format, viewer configuration) is read to tell what it is up to this size; a
// bigger .json can only be FEM results
export const TEXT_CHECK_MAX_BYTES = 64 * 1024 * 1024;
export const VIEWER_DATA_FILE_NAME = (digitalTwinUid: string | undefined, now = new Date()) =>
    `viewer_data_${digitalTwinUid ?? "twin"}_${now.toISOString().slice(0, 10)}.zip`;

export type ViewerDataPart = "model" | "fem" | "simulator" | "config" | "pipeline";
// the order they are loaded in: the model before its FEM results; the pipeline last (it restarts)
export const VIEWER_DATA_PARTS: ViewerDataPart[] = ["model", "fem", "simulator", "config", "pipeline"];
export const PART_LABELS: Record<ViewerDataPart, string> = {
    model: "3D model",
    fem: "FEM results",
    simulator: "Simulator format",
    config: "Viewer configuration",
    pipeline: "Pipeline",
};
// what loading each part does to what the twin has
export const PART_EFFECTS: Record<ViewerDataPart, string> = {
    model: "Replaces the 3D model of its slide",
    fem: "Added to the stored results (the oldest go beyond the limit)",
    simulator: "Replaces the simulator format",
    config: "Replaces the group's layout and the lighting (the 3D models of the slides it does not have are removed)",
    pipeline: "Replaces the pipeline and restarts it",
};

export interface DataFile {
    name: string;
    data: Blob;
    lastModified?: number;
}

export const textFile = (name: string, text: string, type = "text/plain"): DataFile => ({ name, data: new Blob([text], { type }) });

export interface ViewerDataItem {
    part: ViewerDataPart;
    file: DataFile;
    // a model or FEM results: the slide whose 3D Model panel they belong to (from the .zip of all the viewer data;
    // none: the slide they are loaded in)
    slideId?: string;
    // a short description: "binary glTF · 12.4 MB", "5 parameters"...
    summary: string;
}

export interface ViewerDataSet {
    items: ViewerDataItem[];
    // what was left out, and why
    ignored: string[];
}

const baseName = (path: string) => path.split("/").pop() ?? path;
const isNoise = (path: string) =>
    path.endsWith("/") || path.startsWith("__MACOSX/") || baseName(path).startsWith(".") || /^thumbs\.db$/i.test(baseName(path));

export const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const textOf = (file: DataFile) => file.data.text();

const parseDocument = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        try {
            return YAML.parse(text);
        } catch {
            return null;
        }
    }
};

const isManifestText = (text: string) => {
    try {
        const value = JSON.parse(text);
        return value !== null && typeof value === "object" && value.format === VIEWER_DATA_FORMAT;
    } catch {
        return false;
    }
};

// The folder of the .zip of viewer data a file came from: what it is, without reading it. The model and FEM results
// of each slide are in slides/<slideId>/models and slides/<slideId>/fem (version 2; version 1 had one model, in models
// and fem).
export type DataFolder = "models" | "fem" | "simulator" | "pipeline";
const DATA_FOLDERS: DataFolder[] = ["models", "fem", "simulator", "pipeline"];
const SLIDE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const folderOf = (path: string): DataFolder | undefined => {
    const parts = path.split("/");
    if (parts[0] === "slides" && parts.length === 4 && SLIDE_ID.test(parts[1])) {
        return parts[2] === "models" || parts[2] === "fem" ? (parts[2] as DataFolder) : undefined;
    }
    return parts.length > 1 ? DATA_FOLDERS.find((f) => f === parts[0]) : undefined;
};
// the slide of a model or FEM results of the .zip (slides/<slideId>/…)
const slideOfPath = (path: string): string | undefined => {
    const parts = path.split("/");
    return parts[0] === "slides" && parts.length === 4 && SLIDE_ID.test(parts[1]) ? parts[1] : undefined;
};

// what one file is (a .zip of viewer data is opened by readViewerDataFiles); null: the manifest, nothing to load
export const classifyFile = async (file: DataFile, folder?: DataFolder): Promise<{ item: ViewerDataItem } | { ignored: string } | null> => {
    const name = file.name.toLowerCase();
    const size = formatSize(file.data.size);
    if (name.endsWith(".glb")) return { item: { part: "model", file, summary: `binary glTF · ${size}` } };
    if (name.endsWith(".gltf")) return { item: { part: "model", file, summary: `glTF · ${size}` } };
    if (folder === "fem" && name.endsWith(".json")) return { item: { part: "fem", file, summary: size } };
    const isText = name.endsWith(".yml") || name.endsWith(".yaml") || name.endsWith(".json");
    if (isText && file.data.size > TEXT_CHECK_MAX_BYTES) {
        if (name.endsWith(".json")) return { item: { part: "fem", file, summary: `${size} (too big to check: taken as FEM results)` } };
        return { ignored: `${file.name}: too big for a pipeline or a simulator format` };
    }
    if (name.endsWith(".yml") || name.endsWith(".yaml")) {
        const text = await textOf(file);
        if (isPipelineDocument(text)) {
            const nodes = (parseDocument(text) as { nodes: unknown[] }).nodes.length;
            return { item: { part: "pipeline", file, summary: `${nodes} ${nodes === 1 ? "node" : "nodes"}` } };
        }
        if (isSimulationFormatDocument(text)) return { item: simulatorItem(file, text) };
        return { ignored: `${file.name}: not a pipeline nor a simulator format` };
    }
    if (name.endsWith(".json")) {
        const text = await textOf(file);
        if (isManifestText(text)) return null;
        if (isViewerConfigDocument(text)) return { item: { part: "config", file, summary: `layout and lighting · ${size}` } };
        if (isFemResultsDocument(text)) return { item: { part: "fem", file, summary: size } };
        if (isSimulationFormatDocument(text)) return { item: simulatorItem(file, text) };
        return { ignored: `${file.name}: not a viewer configuration, FEM results nor a simulator format` };
    }
    if (isZipName(name)) {
        if (file.data.size > VIEWER_PACKAGE_MAX_BYTES) return { ignored: `${file.name}: too big for a viewer configuration` };
        const read = readViewerPackage(new Uint8Array(await file.data.arrayBuffer()));
        if ("error" in read) return { ignored: `${file.name}: ${read.error}` };
        const images = read.images.length;
        return {
            item: {
                part: "config",
                file,
                summary: `layout and lighting with ${images} ${images === 1 ? "image" : "images"} · ${size}`,
            },
        };
    }
    return { ignored: `${file.name}: not a part of the viewer data` };
};

const simulatorItem = (file: DataFile, text: string): ViewerDataItem => {
    const parameters = Object.keys(parseDocument(text) as object).length;
    return { part: "simulator", file, summary: `${parameters} ${parameters === 1 ? "parameter" : "parameters"}` };
};

export interface ZipFile extends DataFile {
    // its path in the zip ("fem/results.json")
    path: string;
}

// The files of a .zip (its size checked first, from its directory), or why it cannot be opened. Each file is read on
// its own: a stored one is a slice of the zip, a deflated one is inflated chunk by chunk.
export const unzipViewerData = async (zip: Blob): Promise<ZipFile[] | { error: string }> => {
    const listed = await listZipEntries(zip);
    if ("error" in listed) return listed;
    const entries = listed.filter((e) => !isNoise(e.path)).sort((a, b) => a.path.localeCompare(b.path));
    if (entries.length > VIEWER_DATA_MAX_FILES) return { error: `The zip has more than ${VIEWER_DATA_MAX_FILES} files.` };
    const total = entries.reduce((sum, e) => sum + e.size, 0);
    if (total > VIEWER_DATA_MAX_BYTES) return { error: `The zip has more than ${formatSize(VIEWER_DATA_MAX_BYTES)} once decompressed.` };
    const files: ZipFile[] = [];
    try {
        for (const entry of entries) files.push({ name: baseName(entry.path), path: entry.path, data: await readZipEntry(zip, entry) });
    } catch (error) {
        return { error: error instanceof Error ? error.message : "The zip is damaged." };
    }
    return files;
};

// a .zip of viewer data (its manifest, or any file that only viewer data has), not a viewer configuration
export const isViewerDataZip = async (files: ZipFile[]): Promise<boolean> => {
    for (const f of files) {
        if (folderOf(f.path) || /\.(glb|gltf|ya?ml|zip)$/i.test(f.name)) return true;
        if (f.name.toLowerCase() === "manifest.json" && f.data.size < 1024 * 1024 && isManifestText(await textOf(f))) return true;
    }
    return false;
};

export interface ReadOptions {
    // loose pipeline files are taken (the create and edit forms); the Viewer loads the pipeline only from the .zip
    // of all the viewer data, a loose one goes to the Pipeline view
    loosePipeline?: boolean;
    // loose simulator formats are taken (the forms, the Simulator panel); the Viewer data menu leaves them to the
    // Simulator panel
    looseSimulator?: boolean;
    // loose 3D models and FEM results are taken (a 3D Model panel, for its slide; the create form, for the first
    // slide); the Viewer data menu leaves them to the 3D Model panels
    looseModel?: boolean;
}

// What some files bring: each part once (the first file of it), the FEM results all; in the order they load
export const readViewerDataFiles = async (files: DataFile[], options: ReadOptions = {}): Promise<ViewerDataSet> => {
    const loosePipeline = options.loosePipeline ?? true;
    const looseSimulator = options.looseSimulator ?? true;
    const looseModel = options.looseModel ?? true;
    const items: ViewerDataItem[] = [];
    const ignored: string[] = [];
    const take = async (file: DataFile, folder?: DataFolder, loose = true, slideId?: string) => {
        const result = await classifyFile(file, folder);
        if (!result) return;
        if (slideId && "item" in result) result.item.slideId = slideId;
        if ("ignored" in result) ignored.push(result.ignored);
        else if (loose && !looseModel && (result.item.part === "model" || result.item.part === "fem")) {
            ignored.push(`${file.name}: load a 3D model and its FEM results in the 3D Model panel of their slide (or with the .zip of all the viewer data)`);
        } else if (loose && !loosePipeline && result.item.part === "pipeline") {
            ignored.push(`${file.name}: load a pipeline in the Pipeline view (or with the .zip of all the viewer data)`);
        } else if (loose && !looseSimulator && result.item.part === "simulator") {
            ignored.push(`${file.name}: load a simulator format in the Simulator panel (or with the .zip of all the viewer data)`);
        } else items.push(result.item);
    };
    for (const file of files) {
        if (isZipName(file.name)) {
            if (file.data.size > VIEWER_DATA_MAX_BYTES) {
                ignored.push(`${file.name}: more than ${formatSize(VIEWER_DATA_MAX_BYTES)}`);
                continue;
            }
            const inner = await unzipViewerData(file.data);
            if ("error" in inner) {
                ignored.push(`${file.name}: ${inner.error}`);
                continue;
            }
            if (await isViewerDataZip(inner)) {
                for (const f of inner) await take(f, folderOf(f.path), false, slideOfPath(f.path));
                continue;
            }
        }
        await take(file);
    }
    const chosen: ViewerDataItem[] = [];
    for (const item of items) {
        // a model for each slide
        const first = chosen.find((c) => c.part === item.part && c.slideId === item.slideId);
        if (item.part !== "fem" && first) {
            ignored.push(`${item.file.name}: ${PART_LABELS[item.part].toLowerCase()} already given by ${first.file.name}`);
            continue;
        }
        if (item.part === "fem" && chosen.some((c) => c.part === "fem" && c.slideId === item.slideId && c.file.name === item.file.name)) {
            ignored.push(`${item.file.name}: another FEM results file has the same name`);
            continue;
        }
        chosen.push(item);
    }
    chosen.sort((a, b) => VIEWER_DATA_PARTS.indexOf(a.part) - VIEWER_DATA_PARTS.indexOf(b.part));
    return { items: chosen, ignored };
};

// the model and FEM results of a slide
export interface SlideFiles {
    slideId: string;
    model?: DataFile | null;
    fem?: DataFile[];
}

export interface ViewerDataContents {
    config?: DataFile | null;
    // the model and FEM results of each slide (slides/<slideId>/models, …/fem)
    slides?: SlideFiles[];
    simulator?: Record<string, unknown> | null;
    pipelineYaml?: string | null;
}

// The .zip of all the viewer data, as a Blob (written chunk by chunk: see zipStream.ts)
export const buildViewerDataZip = async (
    contents: ViewerDataContents,
    meta: { digitalTwinUid?: string; description?: string; now?: Date },
    onProgress?: (fraction: number) => void,
): Promise<Blob> => {
    const files: ZipInput[] = [];
    const parts: Record<string, unknown> = {};
    // what is already compressed (glb, zip) is stored, and so is anything big (deflating it would take long for
    // little); text is deflated
    const deflate = (name: string, data: Blob) => !/\.(glb|zip|png|jpe?g|webp)$/i.test(name) && data.size <= 50 * 1024 * 1024;
    const add = (path: string, data: Blob) => files.push({ path, data, deflate: deflate(path, data) });
    if (contents.config) {
        add(contents.config.name, contents.config.data);
        parts.config = contents.config.name;
    }
    const slides: Record<string, { model?: string; fem?: string[] }> = {};
    for (const slide of contents.slides ?? []) {
        if (!SLIDE_ID.test(slide.slideId)) continue;
        const entry: { model?: string; fem?: string[] } = {};
        if (slide.model) {
            add(`slides/${slide.slideId}/models/${slide.model.name}`, slide.model.data);
            entry.model = slide.model.name;
        }
        if (slide.fem && slide.fem.length > 0) {
            for (const f of slide.fem) add(`slides/${slide.slideId}/fem/${f.name}`, f.data);
            entry.fem = slide.fem.map((f) => f.name);
        }
        if (entry.model || entry.fem) slides[slide.slideId] = entry;
    }
    if (Object.keys(slides).length > 0) parts.slides = slides;
    if (contents.simulator && Object.keys(contents.simulator).length > 0) {
        add("simulator/simulator_format.json", new Blob([JSON.stringify(contents.simulator, null, 2)]));
        parts.simulator = "simulator_format.json";
    }
    if (contents.pipelineYaml) {
        add("pipeline/pipeline.yml", new Blob([contents.pipelineYaml]));
        parts.pipeline = "pipeline.yml";
    }
    const manifest = {
        format: VIEWER_DATA_FORMAT,
        version: VIEWER_DATA_VERSION,
        digitalTwinUid: meta.digitalTwinUid ?? "",
        description: meta.description ?? "",
        created: (meta.now ?? new Date()).toISOString(),
        parts,
    };
    add("manifest.json", new Blob([JSON.stringify(manifest, null, 2)]));
    return writeZip(files, onProgress);
};

// The pipeline as it is stored (a JSON list of nodes, their settings as JSON text) as the YAML of "Download YAML"
export const pipelineYamlOf = (pipelineFileData: string | null | undefined): string | null => {
    if (!pipelineFileData) return null;
    try {
        const nodes = JSON.parse(pipelineFileData);
        if (!Array.isArray(nodes) || nodes.length === 0) return null;
        const yamlNodes = nodes.map((node: Record<string, unknown>) => {
            let settings = node.settings;
            if (typeof settings === "string") {
                try {
                    settings = JSON.parse(settings);
                } catch {
                    // kept as text
                }
            }
            return { ...node, settings };
        });
        return YAML.stringify({ nodes: yamlNodes });
    } catch {
        return null;
    }
};

// The nodes of a pipeline file as admin_api takes them (their settings as JSON text)
export const pipelineNodesOf = (text: string): unknown[] | null => {
    const value = parseDocument(text) as { nodes?: unknown } | null;
    if (!value || !Array.isArray(value.nodes) || value.nodes.length === 0) return null;
    return value.nodes.map((node: Record<string, unknown>) => ({
        ...node,
        settings: typeof node.settings === "string" ? node.settings : JSON.stringify(node.settings ?? {}),
    }));
};

// A simulator format file (JSON or YAML) as an object, or null
export const simulatorFormatOf = (text: string): Record<string, unknown> | null => {
    const value = parseDocument(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
};
