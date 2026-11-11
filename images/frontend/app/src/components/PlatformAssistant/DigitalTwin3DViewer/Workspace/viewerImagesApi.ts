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
        loaded.delete(cacheKey(groupId, digitalTwinId, fileName));
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
        loaded.delete(cacheKey(groupId, digitalTwinId, fileName));
        return true;
    } catch (error) {
        axiosErrorHandler(error as AxiosError, authDispatch);
        return false;
    }
};

// the images read, by twin and name
const loaded = new Map<string, Promise<LoadedViewerImage | null>>();
const cacheKey = (groupId: number, digitalTwinId: number, fileName: string) => `${groupId}/${digitalTwinId}/${fileName}`;

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };

export const loadViewerImage = (groupId: number, digitalTwinId: number, fileName: string, { accessToken, refreshToken, authDispatch }: ApiAuth): Promise<LoadedViewerImage | null> => {
    const key = cacheKey(groupId, digitalTwinId, fileName);
    let promise = loaded.get(key);
    if (!promise) {
        promise = (async () => {
            try {
                const response = await getAxiosInstance(refreshToken, authDispatch).get(
                    `${base("download_file", groupId, digitalTwinId)}/${VIEWER_IMAGES_FOLDER}/${encodeURIComponent(fileName)}`,
                    { ...(axiosAuth(accessToken) as any), responseType: "blob" },
                );
                const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
                const blob = new Blob([response.data as Blob], { type: IMAGE_TYPES[ext] ?? "application/octet-stream" });
                return { url: URL.createObjectURL(blob), svg: ext === "svg" ? await blob.text() : undefined };
            } catch {
                loaded.delete(key);
                return null;
            }
        })();
        loaded.set(key, promise);
    }
    return promise;
};
