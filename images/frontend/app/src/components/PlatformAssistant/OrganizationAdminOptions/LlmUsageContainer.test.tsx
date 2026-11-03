import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const get = vi.fn();
const put = vi.fn();
vi.mock("../../../tools/axiosIntance", () => ({ getAxiosInstance: () => ({ get, put }) }));
vi.mock("../../../contexts/authContext", () => ({
    useAuthState: () => ({ accessToken: "a", refreshToken: "r" }),
    useAuthDispatch: () => vi.fn(),
}));

import LlmUsageContainer, {
    breakdownRows,
    currentMonth,
    fillDays,
    fillMonths,
    monthRange,
    monthWithinRetention,
    niceMax,
    shiftMonth,
} from "./LlmUsageContainer";

const totals = (input: number, output: number, extra = {}) => ({
    operations: 1,
    requests: 2,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: 0,
    reasoningTokens: 0,
    audioSeconds: 0,
    characters: 0,
    ...extra,
});

const summary = {
    from: "",
    to: "",
    totals: totals(900, 100, { operations: 3, requests: 5, audioSeconds: 90, characters: 120 }),
    byProviderModel: [{ ...totals(900, 100), providerType: "openai", providerHost: "api.openai.com", model: "gpt-4o" }],
    bySource: [{ ...totals(800, 100), source: "ai_agent" }, { ...totals(100, 0, { characters: 120 }), source: "text2speech" }],
    byGroup: [{ ...totals(900, 100), groupId: 1, groupName: "Eolic" }],
    byDigitalTwin: [{ ...totals(900, 100), digitalTwinUid: "dt1", digitalTwinName: "Eolic tower yellow", groupName: "Eolic" }],
    byNode: [{ ...totals(900, 100), nodeUid: "n1", nodeName: "AI Agent", nodeType: "AiAgent", digitalTwinUid: "dt1" }],
    byUser: [{ ...totals(900, 100), userName: "dicapua" }],
    daily: [{ ...totals(900, 100), day: `${currentMonth()}-01` }],
    monthlyTokenLimit: 1200,
    warningPercent: 80,
    monthTokens: 1000,
};

describe("LlmUsage helpers", () => {
    it("works with months and days in UTC", () => {
        expect(shiftMonth("2026-01", -1)).toBe("2025-12");
        expect(shiftMonth("2026-12", 1)).toBe("2027-01");
        expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28", days: 28 });
        const days = fillDays("2026-11", [{ ...totals(1, 1), day: "2026-11-03" }]);
        expect(days).toHaveLength(30);
        expect(days[2].inputTokens).toBe(1);
        expect(days[0].inputTokens).toBe(0);
        expect(niceMax(0)).toBe(1);
        expect(niceMax(1234)).toBe(2000);
        expect(niceMax(4100)).toBe(5000);
        const now = new Date(Date.UTC(2026, 10, 2));
        expect(monthWithinRetention("2025-09", 400, now)).toBe(true); // its last days are kept
        expect(monthWithinRetention("2025-08", 400, now)).toBe(false);
        const filled = fillMonths([{ ...totals(1, 1), month: "2026-08", byModel: [], bySource: [] }], now);
        expect(filled.map((m) => m.month)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
        expect(filled[1].inputTokens).toBe(0);
    });

    it("names the rows of each breakdown", () => {
        expect(breakdownRows(summary as any, "source").map((r) => r.name)).toEqual(["AI Agent", "Text2Speech"]);
        expect(breakdownRows(summary as any, "model")[0].secondary).toBe("openai · api.openai.com");
    });
});

describe("LlmUsageContainer", () => {
    it("shows the month's usage, the limit and saves a new limit", async () => {
        get.mockImplementation((url: string) =>
            Promise.resolve(
                url.includes("/llm_usage_trend/")
                    ? {
                          data: {
                              retentionYears: 5,
                              months: [
                                  {
                                      ...totals(900, 100),
                                      month: currentMonth(),
                                      byModel: [{ ...totals(900, 100), providerType: "openai", providerHost: "api.openai.com", model: "gpt-4o" }],
                                      bySource: [],
                                  },
                              ],
                          },
                      }
                    : { data: summary },
            ),
        );
        put.mockResolvedValue({ data: {} });
        render(<LlmUsageContainer orgsManaged={[{ id: 7, name: "Org", llmEnabled: true } as any]} />);
        await screen.findByText("Tokens");
        expect(get.mock.calls[0][0]).toMatch(/\/llm_usage\/7\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/);
        expect(screen.getByText("1,000", { selector: ".value" })).toBeInTheDocument();
        expect(screen.getByText("Over 80 %")).toBeInTheDocument();
        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1000");

        expect(get.mock.calls.some((call) => /\/llm_usage_trend\/7$/.test(call[0]))).toBe(true);
        expect(await screen.findByText(/Tokens per month · last 5 years/)).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Tokens per month" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("tab", { name: "Node type" }));
        const table = screen.getAllByRole("table")[0];
        expect(within(table).getByText("Text2Speech")).toBeInTheDocument();
        expect(within(table).getByText("120 chars")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Monthly limit (tokens)"), { target: { value: "2,000,000" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(put).toHaveBeenCalled());
        expect(put.mock.calls[0][0]).toMatch(/\/llm_usage_limit\/7$/);
        expect(put.mock.calls[0][1]).toEqual({ monthlyTokenLimit: 2000000, warningPercent: 80 });
    });
});
