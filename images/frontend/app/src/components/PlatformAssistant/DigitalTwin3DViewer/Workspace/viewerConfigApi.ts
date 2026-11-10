// A viewer configuration file applied to a digital twin from its create or edit form: the file's layout replaces
// the group's (admin_api /viewer_layout) and its lighting the twin's (viewer_settings.lighting; the other viewer
// settings are kept).
import { AxiosError } from "axios";
import { toast } from "react-toastify";
import { axiosAuth } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import axiosErrorHandler from "../../../../tools/axiosErrorHandler";
import { viewerSettingsUrl } from "../Utils/twinViewerSettings";
import { ApiAuth, viewerLayoutUrl } from "./viewerLayoutApi";
import { ParsedViewerConfig } from "./viewerConfig";

// true when everything the file brings was saved
export const applyViewerConfig = async (
    groupId: number,
    digitalTwinId: number,
    config: ParsedViewerConfig,
    currentViewerSettings: Record<string, unknown> | null | undefined,
    { accessToken, refreshToken, authDispatch }: ApiAuth,
): Promise<boolean> => {
    const axios = getAxiosInstance(refreshToken, authDispatch);
    let ok = true;
    if (config.layout) {
        try {
            await axios.put(viewerLayoutUrl(groupId, digitalTwinId), { layout: config.layout }, axiosAuth(accessToken) as any);
        } catch (error) {
            ok = false;
            axiosErrorHandler(error as AxiosError, authDispatch);
        }
    }
    if (config.lighting) {
        try {
            const viewerSettings = { ...(currentViewerSettings ?? {}), lighting: config.lighting };
            await axios.put(viewerSettingsUrl(groupId, digitalTwinId), { viewerSettings }, axiosAuth(accessToken) as any);
        } catch (error) {
            ok = false;
            axiosErrorHandler(error as AxiosError, authDispatch);
        }
    }
    if (ok) {
        const what = [config.layout ? "layout" : "", config.lighting ? "lighting" : ""].filter(Boolean).join(" and ");
        toast.success(`The viewer ${what} of the file ${what.includes("and") ? "have" : "has"} been saved`);
    }
    return ok;
};
