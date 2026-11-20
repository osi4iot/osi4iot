// The images of the Picture panels: files of the digital twin in admin_api (folder viewerImages of its files:
// digital_twin_upload_file, _file_list, _download_file, _delete_file). An image is read once per viewer and
// kept (an object URL; an SVG also as text, to draw it inline with its animations).
import { AxiosError } from "axios";
import { toast } from "react-toastify";
import { axiosAuth } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import axiosErrorHandler from "../../../../tools/axiosErrorHandler";
import { DOMAIN_NAME, PROTOCOL } from "../Utils/constants";
import { ApiAuth } from "./viewerLayoutApi";

export const VIEWER_IMAGES_FOLDER = "viewerImages";
export const VIEWER_IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}\.(png|jpe?g|webp|gif|svg)$/i;
export const VIEWER_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export interface ViewerImageInfo {
    fileName: string;
    lastModified: string;
    size: number;
}

export interface LoadedViewerImage {
    url: string;
    // SVG: its text (cleaned before it is drawn)
    svg?: string;
}

const base = (what: string, groupId: number, digitalTwinId: number) => `${PROTOCOL}://${DOMAIN_NAME}/admin_api/digital_twin_${what}/${groupId}/${digitalTwinId}`;

export const isSvgName = (fileName: string) => /\.svg$/i.test(fileName);

// a name admin_api accepts, from the name of a file of the user's computer
export const viewerImageName = (name: string): string | null => {
    const dot = name.lastIndexOf(".");
    const ext = dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
    if (!/^(png|jpe?g|webp|gif|svg)$/.test(ext)) return null;
    const stem = (dot === -1 ? name : name.slice(0, dot))
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9_.-]+/g, "_")
        .replace(/^[^A-Za-z0-9_]+/, "")
        .slice(0, 70);
    return `${stem || "image"}.${ext}`;
};

export const listViewerImages = async (groupId: number, digitalTwinId: number, { accessToken, refreshToken, authDispatch }: ApiAuth): Promise<ViewerImageInfo[]> => {
    try {
        const response = await getAxiosInstance(refreshToken, authDispatch).get(`${base("file_list", groupId, digitalTwinId)}/${VIEWER_IMAGES_FOLDER}`, axiosAuth(accessToken) as any);
        return ((response.data ?? []) as ViewerImageInfo[]).map((f) => ({ ...f, fileName: f.fileName.split("/").pop() ?? f.fileName }));
    } catch {
        return [];
    }
};

export const uploadViewerImage = async (groupId: number, digitalTwinId: number, file: File, fileName: string, { accessToken, refreshToken, authDispatch }: ApiAuth): Promise<boolean> => {
    if (file.size > VIEWER_IMAGE_MAX_BYTES) {
        toast.error(`${file.name}: an image must have at most 10 MB`);
        return false;
    }
    const data = new FormData();
    data.append("file", file, fileName);
    try {
        await getAxiosInstance(refreshToken, authDispatch).post(
            `${base("upload_file", groupId, digitalTwinId)}/${VIEWER_IMAGES_FOLDER}/${encodeURIComponent(fileName)}`,
            data,
            axiosAuth(accessToken, "multipart/form-data") as any,
        );
        // uploaded by hand from a Picture panel while a .zip waits to be saved: this one wins over the zip's
        dropPending(groupId, digitalTwinId, fileName);
        imageChanged(groupId, digitalTwinId, fileName);
        return true;
    } catch (error) {
        axiosErrorHandler(error as AxiosError, authDispatch);
        return false;
    }
};

export const deleteViewerImage = async (groupId: number, digitalTwinId: number, fileName: string, { accessToken, refreshToken, authDispatch }: ApiAuth): Promise<boolean> => {
    try {
        await getAxiosInstance(refreshToken, authDispatch).delete(
            `${base("delete_file", groupId, digitalTwinId)}/${VIEWER_IMAGES_FOLDER}/${encodeURIComponent(fileName)}`,
            axiosAuth(accessToken) as any,
        );
        imageChanged(groupId, digitalTwinId, fileName);
        return true;
    } catch (error) {
        axiosErrorHandler(error as AxiosError, authDispatch);
        return false;
    }
};

// the images read, by twin and name
const loaded = new Map<string, Promise<LoadedViewerImage | null>>();
const cacheKey = (groupId: number, digitalTwinId: number, fileName: string) => `${groupId}/${digitalTwinId}/${fileName}`;

// An image uploaded again (or removed) under the same name: the panels that show it read it again. Their
// file name does not change, so without this they would keep what they had (e.g. "could not be read" for
// the image a configuration names before it is uploaded) until the page is reloaded.
type ViewerImageListener = (groupId: number, digitalTwinId: number, fileName: string) => void;
const listeners = new Set<ViewerImageListener>();

export const onViewerImageChange = (listener: ViewerImageListener): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const imageChanged = (groupId: number, digitalTwinId: number, fileName: string) => {
    loaded.delete(cacheKey(groupId, digitalTwinId, fileName));
    listeners.forEach((listener) => listener(groupId, digitalTwinId, fileName));
};

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };

// The images of a configuration .zip loaded in the Viewer and not saved yet: the Picture panels show them as if
// they were the twin's, until the layout is saved for the group (they are uploaded then) or the edit is cancelled.
const pending = new Map<string, LoadedViewerImage>();

function dropPending(groupId: number, digitalTwinId: number, fileName: string) {
    const key = cacheKey(groupId, digitalTwinId, fileName);
    const image = pending.get(key);
    if (!image) return;
    pending.delete(key);
    URL.revokeObjectURL(image.url);
}

export const isPendingViewerImage = (groupId: number, digitalTwinId: number, fileName: string) =>
    pending.has(cacheKey(groupId, digitalTwinId, fileName));

const imageBlob = (fileName: string, data: Uint8Array | Blob) => {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return new Blob([data as BlobPart], { type: IMAGE_TYPES[ext] ?? "application/octet-stream" });
};

export const setPendingViewerImages = async (groupId: number, digitalTwinId: number, images: { fileName: string; data: Uint8Array }[] | null) => {
    const prefix = `${groupId}/${digitalTwinId}/`;
    for (const [key, image] of Array.from(pending.entries())) {
        if (!key.startsWith(prefix)) continue;
        pending.delete(key);
        URL.revokeObjectURL(image.url);
        imageChanged(groupId, digitalTwinId, key.slice(prefix.length));
    }
    for (const image of images ?? []) {
        const blob = imageBlob(image.fileName, image.data);
        pending.set(cacheKey(groupId, digitalTwinId, image.fileName), {
            url: URL.createObjectURL(blob),
            svg: isSvgName(image.fileName) ? await blob.text() : undefined,
        });
        imageChanged(groupId, digitalTwinId, image.fileName);
    }
};

// Uploads the images of a configuration .zip to the twin (they replace the twin's with the same name); the names
// of those that could not be uploaded
export const uploadViewerImages = async (groupId: number, digitalTwinId: number, images: { fileName: string; data: Uint8Array }[], auth: ApiAuth): Promise<string[]> => {
    const failed: string[] = [];
    for (const image of images) {
        const file = new File([imageBlob(image.fileName, image.data)], image.fileName);
        if (!(await uploadViewerImage(groupId, digitalTwinId, file, image.fileName, auth))) failed.push(image.fileName);
    }
    return failed;
};

// The bytes of an image of the twin (or pending), for the configuration .zip downloaded
export const viewerImageBytes = async (groupId: number, digitalTwinId: number, fileName: string, auth: ApiAuth): Promise<Uint8Array | null> => {
    const image = await loadViewerImage(groupId, digitalTwinId, fileName, auth);
    if (!image) return null;
    try {
        return new Uint8Array(await (await fetch(image.url)).arrayBuffer());
    } catch {
        return null;
    }
};

export const loadViewerImage = (groupId: number, digitalTwinId: number, fileName: string, { accessToken, refreshToken, authDispatch }: ApiAuth): Promise<LoadedViewerImage | null> => {
    const key = cacheKey(groupId, digitalTwinId, fileName);
    const waiting = pending.get(key);
    if (waiting) return Promise.resolve(waiting);
    let promise = loaded.get(key);
    if (!promise) {
        promise = (async () => {
            try {
                const response = await getAxiosInstance(refreshToken, authDispatch).get(
                    `${base("download_file", groupId, digitalTwinId)}/${VIEWER_IMAGES_FOLDER}/${encodeURIComponent(fileName)}`,
                    { ...(axiosAuth(accessToken) as any), responseType: "blob" },
                );
                const blob = imageBlob(fileName, response.data as Blob);
                return { url: URL.createObjectURL(blob), svg: isSvgName(fileName) ? await blob.text() : undefined };
            } catch {
                loaded.delete(key);
                return null;
            }
        })();
        loaded.set(key, promise);
    }
    return promise;
};
