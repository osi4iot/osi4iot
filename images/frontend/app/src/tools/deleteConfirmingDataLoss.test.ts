import { AxiosError, AxiosInstance } from "axios";
import { describe, expect, it, vi } from "vitest";
import { deleteConfirmingDataLoss } from "./deleteConfirmingDataLoss";

const conflict = () =>
    new AxiosError("Conflict", "409", undefined, undefined, {
        status: 409,
        statusText: "Conflict",
        headers: {},
        config: {} as never,
        data: { message: "Deleting this sensor leaves 120 stored measurements…" },
    });

describe("borrado con medidas guardadas", () => {
    it("pregunta y repite el borrado confirmado", async () => {
        const del = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ data: { message: "ok" } });
        const confirm = vi.fn(() => true);
        const r = await deleteConfirmingDataLoss({ delete: del } as unknown as AxiosInstance, "/admin_api/sensor/1/id/2", {}, confirm);
        expect(confirm).toHaveBeenCalledWith("Deleting this sensor leaves 120 stored measurements…");
        expect(del).toHaveBeenLastCalledWith("/admin_api/sensor/1/id/2?confirmDataLoss=true", {});
        expect(r.data.message).toBe("ok");
    });
    it("sin confirmación no borra", async () => {
        const del = vi.fn().mockRejectedValueOnce(conflict());
        await expect(
            deleteConfirmingDataLoss({ delete: del } as unknown as AxiosInstance, "/x", {}, () => false),
        ).rejects.toMatchObject({ response: { data: { message: "Not deleted: the stored measurements are kept." } } });
        expect(del).toHaveBeenCalledTimes(1);
    });
    it("los demás errores pasan tal cual", async () => {
        const other = new AxiosError("Forbidden", "403", undefined, undefined, {
            status: 403,
            statusText: "",
            headers: {},
            config: {} as never,
            data: { message: "Only an administrator…" },
        });
        const del = vi.fn().mockRejectedValueOnce(other);
        await expect(deleteConfirmingDataLoss({ delete: del } as unknown as AxiosInstance, "/x", {}, () => true)).rejects.toBe(other);
    });
});
