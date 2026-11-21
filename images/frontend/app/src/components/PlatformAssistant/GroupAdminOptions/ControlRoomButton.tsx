// "Create control room": the control room of a group (Group admin → Groups managed) or the overview of an
// organization (Organization admin → Orgs managed, and → Groups on its default group; it lives in the default group). admin_api creates a virtual asset (its context:
// "group" or "organization") and its digital twin, which then appear on the map with their own icon and open as
// any other digital twin (admin_api asset/controlRoom.ts). Only the group's administrators create it.
import { FC, useState } from "react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { AxiosError, AxiosResponse } from "axios";
import { axiosAuth, getDomainName, getProtocol } from "../../../tools/tools";
import { getAxiosInstance } from "../../../tools/axiosIntance";
import axiosErrorHandler from "../../../tools/axiosErrorHandler";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import { reloadTable, useTable } from "../../../state";

export type ControlRoomContext = "group" | "organization";

// the asset types of the virtual assets (admin_api controlRoom.ts): only theirs, not for a real asset
export const CONTROL_ROOM_TYPE_NAMES = ["Group control room", "Organization overview"];
export const isControlRoomAssetType = (type: string | undefined): boolean => !!type && CONTROL_ROOM_TYPE_NAMES.includes(type);
export const isVirtualAsset = (asset: { context?: string } | undefined): boolean =>
    asset?.context === "group" || asset?.context === "organization";

interface AssetLike {
    id: number;
    groupId: number;
    context?: string;
}

interface DigitalTwinLike {
    assetId: number;
}

// What exists of the control room of a kind in a group: nothing, its asset without its digital twin, or both
export const controlRoomStatus = (
    assets: AssetLike[],
    digitalTwins: DigitalTwinLike[],
    groupId: number,
    context: ControlRoomContext,
): "none" | "asset" | "ready" => {
    const asset = assets.find((a) => a.groupId === groupId && a.context === context);
    if (!asset) return "none";
    return digitalTwins.some((dt) => dt.assetId === asset.id) ? "ready" : "asset";
};

const Button = styled.button`
    background-color: #3274d9;
    padding: 4px 10px;
    color: white;
    border: 1px solid #2c3235;
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;

    &:hover {
        background-color: #2461c0;
    }

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;

const Ready = styled.span`
    color: #7ed99a;
    white-space: nowrap;
`;

const ControlRoomButton: FC<{ groupId: number; context: ControlRoomContext }> = ({ groupId, context }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const assets = useTable("assets") as unknown as AssetLike[];
    const digitalTwins = useTable("digitalTwins") as unknown as DigitalTwinLike[];
    const [creating, setCreating] = useState(false);
    const status = controlRoomStatus(assets, digitalTwins, groupId, context);
    const what = context === "group" ? "control room" : "overview";

    if (status === "ready") return <Ready title={`The ${what} is on the map: open it as any digital twin`}>✓ Created</Ready>;

    const create = () => {
        setCreating(true);
        const url = `${getProtocol()}://${getDomainName()}/admin_api/control_room/${groupId}`;
        getAxiosInstance(refreshToken, authDispatch)
            .post(url, { context }, axiosAuth(accessToken))
            .then((response: AxiosResponse<{ message: string }>) => {
                toast.success(response.data.message);
                for (const table of ["assets", "digitalTwins", "topics", "assetTopics", "assetTypes", "groupsViewable"] as const) {
                    reloadTable(table);
                }
            })
            .catch((error: AxiosError) => axiosErrorHandler(error, authDispatch))
            .finally(() => setCreating(false));
    };

    return (
        <Button type="button" onClick={create} disabled={creating}>
            {creating ? "Creating…" : status === "asset" ? `Recreate ${what}` : `Create ${what}`}
        </Button>
    );
};

// The overview of an organization (Organization admin → Orgs managed): the button of its default group
export const OrgOverviewButton: FC<{ orgId: number }> = ({ orgId }) => {
    const groups = useTable("groups") as unknown as { id: number; orgId: number; isOrgDefaultGroup: unknown }[];
    const defaultGroup = groups.find(
        (g) => Number(g.orgId) === Number(orgId) && (g.isOrgDefaultGroup === true || g.isOrgDefaultGroup === "Default"),
    );
    if (!defaultGroup) return <span style={{ color: "#9aa1aa" }}>…</span>;
    return <ControlRoomButton groupId={defaultGroup.id} context="organization" />;
};

export default ControlRoomButton;
