import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const post = vi.fn();
const tables: Record<string, unknown[]> = { assets: [], digitalTwins: [] };
const reloadTable = vi.fn();
vi.mock("../../../tools/axiosIntance", () => ({ getAxiosInstance: () => ({ post }) }));
vi.mock("../../../contexts/authContext", () => ({
    useAuthState: () => ({ accessToken: "a", refreshToken: "r" }),
    useAuthDispatch: () => vi.fn(),
}));
vi.mock("../../../state", () => ({ useTable: (name: string) => tables[name] ?? [], reloadTable: (name: string) => reloadTable(name) }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ControlRoomButton, { controlRoomStatus, isControlRoomAssetType, isVirtualAsset } from "./ControlRoomButton";

describe("Create control room", () => {
    it("knows what exists of a control room", () => {
        const assets = [
            { id: 1, groupId: 3, context: "asset" },
            { id: 2, groupId: 3, context: "group" },
            { id: 3, groupId: 4, context: "organization" },
        ];
        expect(controlRoomStatus(assets, [{ assetId: 2 }], 3, "group")).toBe("ready");
        expect(controlRoomStatus(assets, [], 3, "group")).toBe("asset");
        expect(controlRoomStatus(assets, [], 3, "organization")).toBe("none");
        expect(controlRoomStatus(assets, [{ assetId: 3 }], 4, "organization")).toBe("ready");
    });

    it("tells the types and assets of the control rooms", () => {
        expect(isControlRoomAssetType("Group control room")).toBe(true);
        expect(isControlRoomAssetType("Machine")).toBe(false);
        expect(isVirtualAsset({ context: "organization" })).toBe(true);
        expect(isVirtualAsset({ context: "asset" })).toBe(false);
        expect(isVirtualAsset({})).toBe(false);
    });

    it("creates it and reloads the tables", async () => {
        tables.assets = [];
        tables.digitalTwins = [];
        post.mockResolvedValue({ data: { message: "The control room of the group has been created" } });
        render(<ControlRoomButton groupId={3} context="group" />);
        fireEvent.click(screen.getByText("Create control room"));
        await waitFor(() => expect(post).toHaveBeenCalled());
        expect(post.mock.calls[0][0]).toMatch(/\/admin_api\/control_room\/3$/);
        expect(post.mock.calls[0][1]).toEqual({ context: "group" });
        await waitFor(() => expect(reloadTable).toHaveBeenCalledWith("assets"));
        expect(reloadTable).toHaveBeenCalledWith("digitalTwins");
    });

    it("says when it exists", () => {
        tables.assets = [{ id: 9, groupId: 5, context: "organization" }];
        tables.digitalTwins = [{ assetId: 9 }];
        render(<ControlRoomButton groupId={5} context="organization" />);
        expect(screen.getByText("✓ Created")).toBeInTheDocument();
    });
});
