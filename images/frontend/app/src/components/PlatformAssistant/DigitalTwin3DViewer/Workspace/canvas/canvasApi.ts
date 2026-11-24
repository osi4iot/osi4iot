// The scene of a slide's Canvas in admin_api (slideCanvas.ts): read by the group's viewers, written by its editors
import { AxiosError } from "axios";
import { axiosAuth } from "../../../../../tools/tools";
import { getAxiosInstance } from "../../../../../tools/axiosIntance";
import { DOMAIN_NAME, PROTOCOL } from "../../Utils/constants";
import { ApiAuth } from "../viewerLayoutApi";
import { SlideRef } from "../viewerDataApi";
import { CanvasScene, sanitizeCanvasScene } from "./canvasScene";

const url = ({ groupId, digitalTwinId, slideId }: SlideRef) =>
    `${PROTOCOL}://${DOMAIN_NAME}/admin_api/digital_twin_slide_canvas/${groupId}/${digitalTwinId}?slide=${encodeURIComponent(slideId)}`;

// the scene, or null when the slide has none yet
export const loadSlideCanvas = async (
    ref: SlideRef,
    { accessToken, refreshToken, authDispatch }: ApiAuth,
    signal?: AbortSignal,
): Promise<CanvasScene | null> => {
    try {
        const response = await getAxiosInstance(refreshToken, authDispatch).get(url(ref), { ...(axiosAuth(accessToken) as object), signal } as any);
        return sanitizeCanvasScene(response.data);
    } catch (error) {
        if ((error as AxiosError)?.response?.status === 404) return null;
        throw error;
    }
};

export const saveSlideCanvas = async (ref: SlideRef, scene: CanvasScene, { accessToken, refreshToken, authDispatch }: ApiAuth): Promise<void> => {
    await getAxiosInstance(refreshToken, authDispatch).put(url(ref), { scene }, axiosAuth(accessToken) as any);
};
