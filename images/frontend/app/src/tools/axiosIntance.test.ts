import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshTokenRequest = vi.fn();
vi.mock("./refreshTokenRequest", () => ({ default: (...args: unknown[]) => refreshTokenRequest(...args) }));

import { getAxiosInstance } from "./axiosIntance";

// requests answer 401 until they carry the renewed access token
const adapter = vi.fn(async (config: any) => {
    const auth = config.headers?.Authorization ?? config.headers?.get?.("Authorization");
    if (auth === "Bearer new-access") return { data: "ok", status: 200, statusText: "OK", headers: {}, config };
    const error: any = new Error("Unauthorized");
    error.config = config;
    error.response = { status: 401, data: { message: "jwt expired" }, headers: {}, config };
    throw error;
});

describe("token renewal", () => {
    beforeEach(() => {
        refreshTokenRequest.mockReset();
        refreshTokenRequest.mockImplementation(async (token: string) => {
            await new Promise((r) => setTimeout(r, 10));
            if (token !== "refresh-1") throw new Error("The refresh token supplied does not exist");
            return { data: { accessToken: "new-access", refreshToken: "refresh-2" } };
        });
    });

    it("renews once for the requests that get a 401 at the same time, and then uses the new refresh token", async () => {
        const instance = getAxiosInstance("refresh-1", vi.fn());
        const calls = [1, 2, 3].map(() => instance.get("/x", { adapter, headers: { Authorization: "Bearer old" } }));
        const results = await Promise.all(calls);
        expect(results.map((r) => r.data)).toEqual(["ok", "ok", "ok"]);
        expect(refreshTokenRequest).toHaveBeenCalledTimes(1);
        expect(refreshTokenRequest.mock.calls[0][0]).toBe("refresh-1");

        // a component not yet rendered again passes the replaced token: the new one is used
        refreshTokenRequest.mockImplementation(async (token: string) => {
            if (token !== "refresh-2") throw new Error("The refresh token supplied does not exist");
            return { data: { accessToken: "new-access", refreshToken: "refresh-2" } };
        });
        const again = getAxiosInstance("refresh-1", vi.fn());
        await again.get("/y", { adapter, headers: { Authorization: "Bearer old" } });
        expect(refreshTokenRequest.mock.calls[1][0]).toBe("refresh-2");
    });
});
