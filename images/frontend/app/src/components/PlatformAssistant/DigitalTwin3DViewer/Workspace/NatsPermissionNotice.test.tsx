import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NatsPermissionNoticeView, summarizeDenied } from "./NatsPermissionNotice";

const d = (subject: string, at = 1) => ({ subject, operation: "subscription", at });

describe("NatsPermissionNotice", () => {
    it("is hidden while nothing is refused", () => {
        render(<NatsPermissionNoticeView denied={[]} top={60} onReload={() => undefined} />);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("says what was refused and offers to reload", () => {
        const onReload = vi.fn();
        render(<NatsPermissionNoticeView denied={[d("dtm2sim.G.T"), d("dev2pdb.G.T1"), d("dev2pdb.G.T2")]} top={60} onReload={onReload} />);
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("No permission for the live data of this digital twin");
        expect(alert.textContent).toContain("3 topics");
        expect(alert.textContent).toContain("Refused: dev2pdb, dtm2sim");
        fireEvent.click(screen.getByRole("button", { name: /Reload the page/ }));
        expect(onReload).toHaveBeenCalled();
    });

    it("stays closed until something new is refused", () => {
        const { rerender } = render(<NatsPermissionNoticeView denied={[d("dtm2sim.G.T", 1)]} top={60} onReload={() => undefined} />);
        fireEvent.click(screen.getByRole("button", { name: "Close the notice" }));
        expect(screen.queryByRole("alert")).toBeNull();
        rerender(<NatsPermissionNoticeView denied={[d("dtm2sim.G.T", 1)]} top={60} onReload={() => undefined} />);
        expect(screen.queryByRole("alert")).toBeNull();
        rerender(<NatsPermissionNoticeView denied={[d("dtm2sim.G.T", 1), d("llm2sim.G.T", 5)]} top={60} onReload={() => undefined} />);
        expect(screen.getByRole("alert")).toBeTruthy();
    });

    it("summarizes many topics", () => {
        const many = ["a", "b", "c", "d", "e", "f", "g"].map((k) => d(`${k}.G.T`));
        expect(summarizeDenied(many)).toBe("a, b, c, d, e, f…");
    });
});
