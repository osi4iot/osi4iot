import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GroupUsage, GroupUsageCard, usedPercent } from "./GroupAiUsageContainer";

const usage = (over: Partial<GroupUsage>): GroupUsage => ({
    groupId: 2,
    name: "Demo",
    acronym: "DEMO",
    month: "2026-11",
    monthTokens: 850_000,
    monthlyTokenLimit: 1_000_000,
    warningPercent: 80,
    state: "warning",
    ...over,
});

describe("Group admin → AI usage", () => {
    it("works out the share of the limit used", () => {
        expect(usedPercent(usage({}))).toBe(85);
        expect(usedPercent(usage({ monthlyTokenLimit: 0 }))).toBe(0);
        expect(usedPercent(usage({ monthTokens: 50_000_000 }))).toBe(999);
    });

    it("shows the tokens, the limit, the share and the state", () => {
        render(<GroupUsageCard usage={usage({})} />);
        expect(screen.getByText("85 %")).toBeInTheDocument();
        expect(screen.getByText("Near the limit")).toBeInTheDocument();
        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "850000");
    });

    it("says when the group is stopped, and when there is no limit", () => {
        const { unmount } = render(<GroupUsageCard usage={usage({ monthTokens: 1_200_000, state: "stopped" })} />);
        expect(screen.getByText("Stopped until the month ends")).toBeInTheDocument();
        unmount();
        render(<GroupUsageCard usage={usage({ monthlyTokenLimit: 0, state: "none" })} />);
        expect(screen.getByText("No limit")).toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });
});
