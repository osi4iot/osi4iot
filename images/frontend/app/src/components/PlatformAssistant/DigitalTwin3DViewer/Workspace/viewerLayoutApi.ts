// The group's layout of the Viewer page of a digital twin, in admin_api (/viewer_layout). Saving it or going
// back to the automatic layout needs a group administrator.
import { AxiosError } from "axios";
import { toast } from "react-toastify";
import { axiosAuth } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import axiosErrorHandler from "../../../../tools/axiosErrorHandler";
import { DOMAIN_NAME, PROTOCOL } from "../Utils/constants";
import { WorkspaceLayout } from "./workspaceLayout";

export interface SavedViewerLayout {
    layout: WorkspaceLayout | null;
    updatedBy?: string;
    updatedAt?: string;
}

export interface ApiAuth {
    accessToken: string;
    refreshToken: string;
    authDispatch: any;
}

export const viewerLayoutUrl = (groupId: number, digitalTwinId: number) =>
    `${PROTOCOL}://${DOMAIN_NAME}/admin_api/viewer_layout/${groupId}/${digitalTwinId}`;

// null when it could not be read (the page then uses the automatic layout, without a message: older
// platforms have no such endpoint)
export const fetchViewerLayout = async (
    groupId: number,
    digitalTwinId: number,
    { accessToken, refreshToken, authDispatch }: ApiAuth,
): Promise<SavedViewerLayout | null> => {
    try {
        const response = await getAxiosInstance(refreshToken, authDispatch).get(
            viewerLayoutUrl(groupId, digitalTwinId),
            axiosAuth(accessToken) as any,
        );
        return (response.data as SavedViewerLayout) ?? { layout: null };
    } catch {
        return null;
    }
};

export const saveViewerLayout = async (
    groupId: number,
    digitalTwinId: number,
    layout: WorkspaceLayout,
    { accessToken, refreshToken, authDispatch }: ApiAuth,
): Promise<SavedViewerLayout | null> => {
    try {
        const response = await getAxiosInstance(refreshToken, authDispatch).put(
            viewerLayoutUrl(groupId, digitalTwinId),
            { layout },
            axiosAuth(accessToken) as any,
        );
        toast.success(response.data?.message ?? "Layout saved for the group");
        return response.data as SavedViewerLayout;
    } catch (error) {
        axiosErrorHandler(error as AxiosError, authDispatch);
        return null;
    }
};

export const deleteViewerLayout = async (
    groupId: number,
    digitalTwinId: number,
    { accessToken, refreshToken, authDispatch }: ApiAuth,
): Promise<boolean> => {
    try {
        const response = await getAxiosInstance(refreshToken, authDispatch).delete(
            viewerLayoutUrl(groupId, digitalTwinId),
            axiosAuth(accessToken) as any,
        );
        toast.success(response.data?.message ?? "Back to the automatic layout");
        return true;
    } catch (error) {
        axiosErrorHandler(error as AxiosError, authDispatch);
        return false;
    }
};
