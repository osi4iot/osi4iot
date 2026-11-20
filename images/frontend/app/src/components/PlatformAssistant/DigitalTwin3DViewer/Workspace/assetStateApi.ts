// The current state of the digital twin's asset, from admin_api (asset_state/:groupId/:digitalTwinId; any member
// of the group can read it).
import { axiosAuth } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import { DOMAIN_NAME, PROTOCOL } from "../Utils/constants";
import { ApiAuth } from "./viewerLayoutApi";
import { AssetStateView } from "./assetStatePanel";

export const assetStateUrl = (groupId: number, digitalTwinId: number) =>
    `${PROTOCOL}://${DOMAIN_NAME}/admin_api/asset_state/${groupId}/${digitalTwinId}`;

export type AssetStateLoader = (groupId: number, digitalTwinId: number, signal?: AbortSignal) => Promise<AssetStateView>;

export const assetStateApi = (auth: ApiAuth): AssetStateLoader => async (groupId, digitalTwinId, signal) => {
    const config = { ...(axiosAuth(auth.accessToken) as object), signal };
    const response = await getAxiosInstance(auth.refreshToken, auth.authDispatch).get(assetStateUrl(groupId, digitalTwinId), config as any);
    const data = response.data as Partial<AssetStateView> | undefined;
    return {
        assetUid: String(data?.assetUid ?? ""),
        description: String(data?.description ?? ""),
        state: data?.state && typeof data.state === "object" && !Array.isArray(data.state) ? data.state : {},
        lastUpdated: typeof data?.lastUpdated === "string" ? data.lastUpdated : null,
    };
};
