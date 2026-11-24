// Loading and downloading the Viewer data of a digital twin (viewerData.ts) with admin_api: each part to its place —
// the 3D model and the FEM results to the twin's files (digital_twin_upload_file, then digital_twin_model registers
// the model), the simulator format (digital_twin_simulator_format), the pipeline (digital_twin_pipeline) and the
// viewer configuration (viewer_layout, viewer_settings and the images: applyViewerConfig).
import { AxiosError } from "axios";
import { toast } from "react-toastify";
import { axiosAuth, checkGltfFile, digitalTwinFormatValidation } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import axiosErrorHandler from "../../../../tools/axiosErrorHandler";
import { parseGltf } from "../../../../tools/gltfLoader";
import { getSensorsRef, getSensorsRefFromDigitalTwinGltfData } from "../../../../tools/modelSensorsRef";
import { DOMAIN_NAME, PROTOCOL } from "../Utils/constants";
import { ApiAuth } from "./viewerLayoutApi";
import { applyViewerConfig } from "./viewerConfigApi";
import { parseViewerConfig } from "./viewerConfig";
import { isZipName, readViewerPackage } from "./viewerPackage";
import { DataFile, PART_LABELS, ViewerDataItem, pipelineNodesOf, simulatorFormatOf } from "./viewerData";

export interface TwinRef {
    groupId: number;
    digitalTwinId: number;
}

// a slide of the twin's Viewer: each one has its own 3D model and FEM results (admin_api slideModels.ts)
export interface SlideRef extends TwinRef {
    slideId: string;
}
const slideQuery = (ref: SlideRef) => `?slide=${encodeURIComponent(ref.slideId)}`;

const url = (op: string, { groupId, digitalTwinId }: TwinRef) =>
    `${PROTOCOL}://${DOMAIN_NAME}/admin_api/digital_twin_${op}/${groupId}/${digitalTwinId}`;

const axiosOf = ({ refreshToken, authDispatch }: ApiAuth) => getAxiosInstance(refreshToken, authDispatch);

const messageOf = (error: unknown): string => {
    const e = error as AxiosError<{ message?: string }>;
    return e?.response?.data?.message || (error instanceof Error ? error.message : "Unknown error");
};

export type Progress = (fraction: number) => void;

// a model and its FEM results go to a slide's folders
const upload = async (ref: SlideRef, folder: string, file: DataFile, auth: ApiAuth, onProgress?: Progress) => {
    const form = new FormData();
    form.append("file", file.data, file.name);
    await axiosOf(auth).post(`${url("upload_file", ref)}/${folder}/${encodeURIComponent(file.name)}${slideQuery(ref)}`, form, {
        ...(axiosAuth(auth.accessToken, "multipart/form-data") as object),
        onUploadProgress: (e: { loaded: number; total?: number }) => {
            if (onProgress && e.total) onProgress(e.loaded / e.total);
        },
    } as any);
};

// The sensors a model points at, or why it is not a valid model
export const readModel = async (file: DataFile): Promise<{ sensorsRef: string[] } | { error: string }> => {
    const name = file.name.toLowerCase();
    try {
        if (name.endsWith(".gltf")) {
            const data = JSON.parse(await file.data.text());
            if (checkGltfFile(data) !== "OK") return { error: "The glTF file has no meshes" };
            return { sensorsRef: getSensorsRefFromDigitalTwinGltfData(data) };
        }
        if (name.endsWith(".glb")) {
            const gltf = await parseGltf(await file.data.arrayBuffer());
            return { sensorsRef: getSensorsRef(gltf.scene) };
        }
        return { error: "A 3D model must be a .glb or .gltf file" };
    } catch (error) {
        return { error: `Not a valid 3D model: ${error instanceof Error ? error.message : String(error)}` };
    }
};

// 1. its sensors exist in the asset; 2. the file; 3. registered (the twin's type and sensors follow it)
export const loadModel = async (ref: SlideRef, file: DataFile, auth: ApiAuth, onProgress?: Progress): Promise<boolean> => {
    const read = await readModel(file);
    if ("error" in read) {
        toast.error(`${file.name}: ${read.error}`);
        return false;
    }
    try {
        const check = await axiosOf(auth).post(
            url("model_check", ref),
            { sensorsRef: read.sensorsRef },
            axiosAuth(auth.accessToken) as any,
        );
        const missing: string[] = check.data?.missingSensorsRef ?? [];
        if (missing.length > 0) {
            toast.error(`${file.name}: the asset has no sensor with the reference ${missing.join(", ")}. Create the sensors first.`);
            return false;
        }
        await upload(ref, "gltfFile", file, auth, onProgress);
        await axiosOf(auth).put(
            `${url("model", ref)}${slideQuery(ref)}`,
            { fileName: file.name, sensorsRef: read.sensorsRef },
            axiosAuth(auth.accessToken) as any,
        );
        return true;
    } catch (error) {
        toast.error(`3D model not loaded: ${messageOf(error)}`);
        return false;
    }
};

export const removeModel = async (ref: SlideRef, auth: ApiAuth): Promise<boolean> => {
    try {
        await axiosOf(auth).delete(`${url("model", ref)}${slideQuery(ref)}`, axiosAuth(auth.accessToken) as any);
        return true;
    } catch (error) {
        axiosErrorHandler(error as AxiosError, auth.authDispatch);
        return false;
    }
};

export const loadFemResults = async (ref: SlideRef, file: DataFile, auth: ApiAuth, onProgress?: Progress): Promise<boolean> => {
    try {
        await upload(ref, "femResJson", file, auth, onProgress);
        return true;
    } catch (error) {
        toast.error(`${file.name}: FEM results not loaded: ${messageOf(error)}`);
        return false;
    }
};

export const setMaxFemResults = async (ref: TwinRef, max: number, auth: ApiAuth): Promise<boolean> => {
    try {
        await axiosOf(auth).put(url("fem_settings", ref), { maxNumResFemFiles: max }, axiosAuth(auth.accessToken) as any);
        return true;
    } catch (error) {
        toast.error(`Not saved: ${messageOf(error)}`);
        return false;
    }
};

// saves a simulator format (digital_twin_simulator_format): from a file, or written in the Simulator panel
export const saveSimulatorFormat = async (
    ref: TwinRef,
    format: Record<string, unknown>,
    fileName: string,
    auth: ApiAuth,
    lastModifDate = new Date().toISOString(),
): Promise<boolean> => {
    try {
        await axiosOf(auth).put(url("simulator_format", ref), { format, fileName, lastModifDate }, axiosAuth(auth.accessToken) as any);
        return true;
    } catch (error) {
        toast.error(`Simulator format not saved: ${messageOf(error)}`);
        return false;
    }
};

export const loadSimulatorFormat = async (ref: TwinRef, file: DataFile, auth: ApiAuth): Promise<boolean> => {
    const format = simulatorFormatOf(await file.data.text());
    if (!format || !digitalTwinFormatValidation(format)) {
        toast.error(`${file.name}: each parameter needs label, units, minValue, maxValue, defaultValue and step`);
        return false;
    }
    const lastModifDate = file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString();
    return saveSimulatorFormat(ref, format, file.name, auth, lastModifDate);
};

export const loadPipeline = async (ref: TwinRef, file: DataFile, auth: ApiAuth): Promise<boolean> => {
    const nodes = pipelineNodesOf(await file.data.text());
    if (!nodes) {
        toast.error(`${file.name}: not a pipeline (a YAML with a list of nodes)`);
        return false;
    }
    try {
        const lastModifDate = file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString();
        await axiosOf(auth).patch(
            `${PROTOCOL}://${DOMAIN_NAME}/admin_api/digital_twin_pipeline/${ref.groupId}/${ref.digitalTwinId}`,
            { pipelineFileName: file.name, pipelineFileLastModifDate: lastModifDate, nodes, reinitialize: false },
            axiosAuth(auth.accessToken) as any,
        );
        return true;
    } catch (error) {
        toast.error(`Pipeline not loaded: ${messageOf(error)}`);
        return false;
    }
};

// A viewer configuration (.json, or a .zip with its images): saved for the group straight away
export const loadConfig = async (
    ref: TwinRef,
    file: DataFile,
    viewerSettings: Record<string, unknown> | null | undefined,
    auth: ApiAuth,
): Promise<boolean> => {
    let text: string;
    let images: { fileName: string; data: Uint8Array }[] = [];
    if (isZipName(file.name)) {
        const read = readViewerPackage(new Uint8Array(await file.data.arrayBuffer()));
        if ("error" in read) {
            toast.error(`${file.name}: ${read.error}`);
            return false;
        }
        text = read.configText;
        images = read.images;
    } else text = await file.data.text();
    const parsed = parseViewerConfig(text);
    if ("error" in parsed) {
        toast.error(`${file.name}: ${parsed.error}`);
        return false;
    }
    return applyViewerConfig(ref.groupId, ref.digitalTwinId, parsed, viewerSettings, auth, images);
};

export interface ApplyContext {
    auth: ApiAuth;
    // where a model or FEM results without a slide of their own go (the slide shown)
    slideId?: string;
    viewerSettings?: Record<string, unknown> | null;
    // which item is loading and how far its upload went
    onStep?: (item: ViewerDataItem, fraction: number) => void;
}

// Loads the chosen items in their order; what was loaded and what failed
export const applyViewerData = async (ref: TwinRef, items: ViewerDataItem[], ctx: ApplyContext) => {
    const loaded: ViewerDataItem[] = [];
    const failed: ViewerDataItem[] = [];
    for (const item of items) {
        const progress = (fraction: number) => ctx.onStep?.(item, fraction);
        progress(0);
        let ok = false;
        const slideId = item.slideId ?? ctx.slideId;
        if ((item.part === "model" || item.part === "fem") && !slideId) {
            toast.error(`${item.file.name}: load it in a 3D Model panel`);
            ok = false;
        } else if (item.part === "model") ok = await loadModel({ ...ref, slideId: slideId as string }, item.file, ctx.auth, progress);
        else if (item.part === "fem") ok = await loadFemResults({ ...ref, slideId: slideId as string }, item.file, ctx.auth, progress);
        else if (item.part === "simulator") ok = await loadSimulatorFormat(ref, item.file, ctx.auth);
        else if (item.part === "config") ok = await loadConfig(ref, item.file, ctx.viewerSettings, ctx.auth);
        else if (item.part === "pipeline") ok = await loadPipeline(ref, item.file, ctx.auth);
        (ok ? loaded : failed).push(item);
    }
    if (loaded.length > 0) {
        const names = [...new Set(loaded.map((i) => PART_LABELS[i.part]))].join(", ");
        toast.success(`Loaded: ${names}`);
    }
    return { loaded, failed };
};

// ---------------------------------------------------------------------------------------------------------
// Downloads

export interface FemFileInfo {
    name: string;
    lastModified: string;
    size: number;
}

export const listFemResults = async (ref: SlideRef, auth: ApiAuth): Promise<FemFileInfo[]> => {
    try {
        const response = await axiosOf(auth).get(`${url("file_list", ref)}/femResJson${slideQuery(ref)}`, axiosAuth(auth.accessToken) as any);
        const list = (response.data ?? []) as { fileName: string; lastModified: string; size: number }[];
        return list.map((f) => ({ name: f.fileName.split("/").pop() ?? f.fileName, lastModified: f.lastModified, size: f.size }));
    } catch {
        return [];
    }
};

// a Blob: the browser keeps it in its own storage, not in the page's memory (a model can be very big)
const downloadBlob = async (address: string, auth: ApiAuth, onProgress?: Progress): Promise<Blob> => {
    const response = await axiosOf(auth).get(address, {
        ...(axiosAuth(auth.accessToken) as object),
        responseType: "blob",
        onDownloadProgress: (e: { loaded: number; total?: number }) => {
            if (onProgress && e.total) onProgress(e.loaded / e.total);
        },
    } as any);
    return response.data as Blob;
};

export const fetchFemResults = async (ref: SlideRef, auth: ApiAuth): Promise<DataFile[]> => {
    const files: DataFile[] = [];
    for (const f of await listFemResults(ref, auth)) {
        try {
            files.push({
                name: f.name,
                data: await downloadBlob(`${url("download_file", ref)}/femResJson/${encodeURIComponent(f.name)}${slideQuery(ref)}`, auth),
            });
        } catch {
            toast.warning(`${f.name}: not downloaded`);
        }
    }
    return files;
};

// a slide's 3D model, by the name it is stored with
export const fetchModel = async (ref: SlideRef, fileName: string, auth: ApiAuth, onProgress?: Progress): Promise<DataFile | null> => {
    if (!/\.(glb|gltf)$/i.test(fileName)) return null;
    try {
        return {
            name: fileName,
            data: await downloadBlob(`${url("download_file", ref)}/gltfFile/${encodeURIComponent(fileName)}${slideQuery(ref)}`, auth, onProgress),
        };
    } catch (error) {
        toast.error(`3D model not downloaded: ${messageOf(error)}`);
        return null;
    }
};

// The 3D models of the slides (in the order of the group's layout)
export interface SlideModelEntry {
    slideId: string;
    gltfFileName: string;
    gltfFileDate: string;
    gltfFileSize: number;
    femResults: number;
}
export const listSlideModels = async (ref: TwinRef, auth: ApiAuth): Promise<SlideModelEntry[]> => {
    try {
        const response = await axiosOf(auth).get(url("slide_models", ref), axiosAuth(auth.accessToken) as any);
        return (response.data ?? []) as SlideModelEntry[];
    } catch {
        return [];
    }
};

// A duplicated slide gets a copy of the files of its source's model (removed again if the slide is not saved)
export const copySlideModel = async (ref: TwinRef, from: string, to: string, auth: ApiAuth): Promise<boolean> => {
    try {
        await axiosOf(auth).post(url("slide_copy", ref), { from, to }, axiosAuth(auth.accessToken) as any);
        return true;
    } catch (error) {
        toast.error(`The 3D model of the slide was not copied: ${messageOf(error)}`);
        return false;
    }
};
