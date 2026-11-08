// The digital twin's own viewer settings in admin_api (viewer_settings of grafanadb.digital_twin): for now its
// lighting, which everyone opening the twin sees the first time. Saving it needs a group administrator.
import { AxiosError, AxiosResponse } from "axios";
import { toast } from "react-toastify";
import { axiosAuth } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import axiosErrorHandler from "../../../../tools/axiosErrorHandler";
import { DOMAIN_NAME, PROTOCOL } from "./constants";
import { LightingOptions } from "./lighting";
import { IDigitalTwin } from "../../TableColumns/digitalTwinsColumns";

export const viewerSettingsUrl = (groupId: number, digitalTwinId: number) =>
    `${PROTOCOL}://${DOMAIN_NAME}/admin_api/digital_twin_viewer_settings/${groupId}/${digitalTwinId}`;

// Saves the lighting as the twin's own; resolves to true when saved. The twin object is updated too, so that
// the viewer opened again in this session starts from it.
export const saveTwinLighting = async (
    digitalTwin: IDigitalTwin,
    lighting: LightingOptions,
    accessToken: string,
    refreshToken: string,
    authDispatch: any,
): Promise<boolean> => {
    const viewerSettings = { ...(digitalTwin.viewerSettings ?? {}), lighting };
    try {
        const response: AxiosResponse<{ message?: string }> = await getAxiosInstance(refreshToken, authDispatch).put(
            viewerSettingsUrl(digitalTwin.groupId, digitalTwin.id),
            { viewerSettings },
            axiosAuth(accessToken),
        );
        digitalTwin.viewerSettings = viewerSettings;
        toast.success(response.data?.message ?? "Lighting saved for the digital twin");
        return true;
    } catch (error) {
        axiosErrorHandler(error as AxiosError, authDispatch);
        return false;
    }
};
