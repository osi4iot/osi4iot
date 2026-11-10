import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TimePicker from "./TimePicker";

const NOW = Date.parse("2026-11-09T12:00:00Z");

describe("Time picker", () => {
    it("chooses a quick range, an absolute one and the refresh", () => {
        const onChange = vi.fn();
        const onRefresh = vi.fn();
        render(<TimePicker time={{ from: "now-1h", to: "now", refresh: "10s" }} onChange={onChange} onRefresh={onRefresh} now={() => NOW} />);
        fireEvent.click(screen.getByRole("button", { name: /Last 1 hour/ }));
        fireEvent.click(screen.getByRole("button", { name: "Last 24 hours" }));
        expect(onChange).toHaveBeenLastCalledWith({ from: "now-24h", to: "now", refresh: "10s" });

        fireEvent.click(screen.getByRole("button", { name: /Last 1 hour/ }));
        fireEvent.change(screen.getByLabelText("From"), { target: { value: "yesterday" } });
        expect(screen.getByRole("button", { name: "Apply time range" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-09 08:00" } });
        fireEvent.change(screen.getByLabelText("To"), { target: { value: "now-1h" } });
        fireEvent.click(screen.getByRole("button", { name: "Apply time range" }));
        expect(onChange).toHaveBeenLastCalledWith({ from: "2026-11-09T08:00", to: "now-1h", refresh: "10s" });

        fireEvent.click(screen.getByRole("button", { name: "Auto refresh: 10s" }));
        fireEvent.click(screen.getByRole("option", { name: "1m" }));
        expect(onChange).toHaveBeenLastCalledWith({ from: "now-1h", to: "now", refresh: "1m" });
        fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
        expect(onRefresh).toHaveBeenCalled();
    });

    it("moves the range back and zooms out", () => {
        const onChange = vi.fn();
        render(<TimePicker time={{ from: "now-2h", to: "now", refresh: "" }} onChange={onChange} onRefresh={() => {}} now={() => NOW} />);
        fireEvent.click(screen.getByRole("button", { name: "Move the range back" }));
        expect(onChange).toHaveBeenLastCalledWith({ from: new Date(NOW - 3 * 3600_000).toISOString(), to: new Date(NOW - 3600_000).toISOString(), refresh: "" });
        fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
        expect(onChange).toHaveBeenLastCalledWith({ from: new Date(NOW - 4 * 3600_000).toISOString(), to: new Date(NOW).toISOString(), refresh: "" });
    });
});
