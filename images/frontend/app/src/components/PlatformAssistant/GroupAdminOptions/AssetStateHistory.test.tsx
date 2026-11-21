import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const get = vi.fn();
const put = vi.fn();
vi.mock("../../../tools/axiosIntance", () => ({ getAxiosInstance: () => ({ get, put }) }));
vi.mock("../../../contexts/authContext", () => ({
    useAuthState: () => ({ accessToken: "a", refreshToken: "r" }),
    useAuthDispatch: () => vi.fn(),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AssetStateHistory, { snapshotLabel } from "./AssetStateHistory";

describe("State history of an asset (Edit asset)", () => {
    it("names the intervals of the copies", () => {
        expect(snapshotLabel(0)).toBe("No copies");
        expect(snapshotLabel(15)).toBe("Every 15 min");
        expect(snapshotLabel(60)).toBe("Every hour");
        expect(snapshotLabel(240)).toBe("Every 4 h");
        expect(snapshotLabel(1440)).toBe("Once a day");
    });

    it("is off by default and saves what is chosen", async () => {
        get.mockResolvedValue({ data: { statusChanges: false, snapshotMinutes: 0, rows: 0, lastRecorded: null } });
        put.mockResolvedValue({ data: { statusChanges: true, snapshotMinutes: 15, rows: 0, lastRecorded: null } });
        render(<AssetStateHistory groupId={3} assetId={5} />);
        await screen.findByText("Nothing kept yet.");
        expect(get.mock.calls[0][0]).toMatch(/\/admin_api\/asset_state_history\/3\/5$/);
        const save = screen.getByText("Save state history") as HTMLButtonElement;
        expect(save.disabled).toBe(true);
        expect((screen.getByLabelText("Keep every change of status") as HTMLInputElement).checked).toBe(false);

        fireEvent.click(screen.getByLabelText("Keep every change of status"));
        fireEvent.change(screen.getByLabelText("Copy of the whole state"), { target: { value: "15" } });
        expect(save.disabled).toBe(false);
        fireEvent.click(save);
        await waitFor(() => expect(put).toHaveBeenCalled());
        expect(put.mock.calls[0][1]).toEqual({ statusChanges: true, snapshotMinutes: 15 });
        await waitFor(() => expect((screen.getByText("Save state history") as HTMLButtonElement).disabled).toBe(true));
    });

    it("says how much is kept", async () => {
        get.mockResolvedValue({ data: { statusChanges: true, snapshotMinutes: 60, rows: 1234, lastRecorded: "2026-11-21T09:00:00Z" } });
        render(<AssetStateHistory groupId={3} assetId={5} />);
        expect(await screen.findByText(/rows kept/)).toHaveTextContent((1234).toLocaleString());
    });
});
