// The 3D model of the slide shown. Each slide of a twin's Viewer has its own model (admin_api slideModels.ts:
// digitalTwin_<id>/slides/<slideId>/gltfFile), listed with the twin (slideModels). The Viewer shows the model of the
// slide it shows: it is read from the browser's storage when it is there and current (slideModelCacheKey), else
// downloaded, and parsed; the last ones parsed are kept in memory, so going back to a slide is immediate.
import { useEffect, useMemo, useRef, useState } from "react";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import { existGltfDataLocallyStored, read3DModelFile, slideModelCacheKey, write3DModelFile } from "../../../../tools/fileSystem";
import formatDateString from "../../../../tools/formatDate";
import { loadAndParseGltfFile } from "../../../../tools/loadAndParseGltfFile";
import { axiosAuth } from "../../../../tools/tools";
import { DOMAIN_NAME, PROTOCOL } from "../Utils/constants";
import { IDigitalTwinGltfData, SlideModelInfo, createUrl } from "../ViewerTools/ViewerUtils";
import type { ApiAuth } from "../Workspace/viewerLayoutApi";

export interface LoadedModel {
    gltfFile: unknown;
    url: string;
}

// what identifies a slide's model: its slide, its file and the file's date (a new upload is another model)
export const slideModelKey = (slideId: string | null, info: SlideModelInfo | undefined): string | null =>
    slideId && info?.gltfFileName ? `${slideId}|${info.gltfFileName}|${info.gltfFileDate}` : null;

// the models parsed, by key: the newest MODELS_IN_MEMORY
const MODELS_IN_MEMORY = 4;
const parsed = new Map<string, LoadedModel>();
const remember = (key: string, model: LoadedModel) => {
    parsed.delete(key);
    parsed.set(key, model);
    while (parsed.size > MODELS_IN_MEMORY) {
        const [oldest, old] = parsed.entries().next().value as [string, LoadedModel];
        parsed.delete(oldest);
        URL.revokeObjectURL(old.url);
    }
};
export const forgetSlideModels = () => {
    for (const model of parsed.values()) URL.revokeObjectURL(model.url);
    parsed.clear();
};

const isGlb = (fileName: string) => fileName.toLowerCase().endsWith(".glb");

export interface SlideModelSource {
    digitalTwinUid: string;
    groupId: number;
    digitalTwinId: number;
    auth: ApiAuth;
}

// the file of a slide's model: from the browser's storage, or downloaded (and kept there)
const readModelFile = async (
    source: SlideModelSource,
    slideId: string,
    info: SlideModelInfo,
    onProgress: (fraction: number) => void,
): Promise<Blob | string> => {
    const cacheKey = slideModelCacheKey(source.digitalTwinUid, slideId);
    const date = formatDateString(info.gltfFileDate);
    const glb = isGlb(info.gltfFileName);
    try {
        if (await existGltfDataLocallyStored(cacheKey, info.gltfFileName, date)) {
            const stored = await read3DModelFile(cacheKey, info.gltfFileName);
            onProgress(1);
            return glb ? (stored as Blob) : JSON.stringify(stored);
        }
    } catch {
        // not readable: downloaded again
    }
    const address = `${PROTOCOL}://${DOMAIN_NAME}/admin_api/digital_twin_${glb ? "glbfile" : "gltffile"}/${source.groupId}/${
        source.digitalTwinId
    }?slide=${encodeURIComponent(slideId)}`;
    const response = await getAxiosInstance(source.auth.refreshToken, source.auth.authDispatch).get(address, {
        ...(axiosAuth(source.auth.accessToken) as object),
        responseType: glb ? "blob" : "text",
        onDownloadProgress: (e: { loaded: number; total?: number }) => {
            const total = e.total || info.gltfFileSize;
            if (total) onProgress(Math.min(1, e.loaded / total));
        },
    } as any);
    const file: Blob | string = glb ? (response.data as Blob) : typeof response.data === "string" ? response.data : JSON.stringify(response.data);
    try {
        await write3DModelFile(cacheKey, file, info.gltfFileName, date);
    } catch {
        // the browser keeps nothing: downloaded again next time
    }
    return file;
};

export const loadSlideModel = async (
    source: SlideModelSource,
    slideId: string,
    info: SlideModelInfo,
    onProgress: (fraction: number) => void = () => undefined,
): Promise<LoadedModel> => {
    const key = slideModelKey(slideId, info) as string;
    const known = parsed.get(key);
    if (known) return known;
    const file = await readModelFile(source, slideId, info, onProgress);
    const url = createUrl(file);
    try {
        const gltfFile = await loadAndParseGltfFile(url);
        const model = { gltfFile, url };
        remember(key, model);
        return model;
    } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
    }
};

export interface SlideModelState {
    // the twin's data with the model of the slide (none: gltfFile and digitalTwinGltfUrl null)
    data: IDigitalTwinGltfData;
    // the model is being read (fraction of its download)
    loading: number | null;
    error: string | null;
}

// The twin's data with the model of a slide. slideId null: the last one stays (a slide without a 3D Model panel shows
// no model, and going back needs nothing new).
export const useSlideModel = (
    base: IDigitalTwinGltfData,
    slideId: string | null,
    source: SlideModelSource | null,
): SlideModelState => {
    const [shown, setShown] = useState<string | null>(slideId);
    useEffect(() => {
        if (slideId !== null) setShown(slideId);
    }, [slideId]);
    const info = shown ? base.slideModels?.[shown] : undefined;
    const key = slideModelKey(shown, info);
    const [model, setModel] = useState<{ key: string; model: LoadedModel } | null>(() =>
        key && parsed.get(key) ? { key, model: parsed.get(key) as LoadedModel } : null,
    );
    const [loading, setLoading] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const sourceRef = useRef(source);
    sourceRef.current = source;

    useEffect(() => {
        setError(null);
        if (!key || !shown || !info) {
            setLoading(null);
            return;
        }
        const known = parsed.get(key);
        if (known) {
            setModel({ key, model: known });
            setLoading(null);
            return;
        }
        const src = sourceRef.current;
        if (!src) return;
        let cancelled = false;
        setLoading(0);
        loadSlideModel(src, shown, info, (f) => !cancelled && setLoading(f))
            .then((loaded) => {
                if (cancelled) return;
                setModel({ key, model: loaded });
                setLoading(null);
            })
            .catch((e) => {
                if (cancelled) return;
                setLoading(null);
                const glb = isGlb(info.gltfFileName);
                setError(
                    `The 3D model ${info.gltfFileName} could not be loaded${
                        !glb && /firefox/i.test(navigator.userAgent) ? " (glTF files are not fully supported by Firefox: use GLB)" : ""
                    }: ${e instanceof Error ? e.message : String(e)}`,
                );
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const data = useMemo<IDigitalTwinGltfData>(() => {
        const current = model && model.key === key ? model.model : null;
        return {
            ...base,
            slideId: shown ?? undefined,
            gltfFile: current ? current.gltfFile : null,
            digitalTwinGltfUrl: current ? current.url : null,
            gltfFileName: current ? info?.gltfFileName ?? "" : "",
        };
    }, [base, shown, model, key, info?.gltfFileName]);

    return { data, loading, error };
};
