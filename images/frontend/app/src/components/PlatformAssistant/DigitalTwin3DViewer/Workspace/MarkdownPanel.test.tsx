import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownEditor, MarkdownView, renderMarkdownPanel } from "./MarkdownPanel";
import { createLiveValueStore } from "./liveValues";

describe("Text panels", () => {
    it("draws markdown, LaTeX, links and images, and nothing that can run", () => {
        const html = renderMarkdownPanel("# Rotor\n\n> note\n\n---\n[docs](https://example.com/a_b) ![plot](https://example.com/p.png) [bad](javascript:alert(1)) $x^2$ <img src=x onerror=alert(1)>");
        expect(html).toContain('<h1 class="md-heading">Rotor</h1>');
        expect(html).toContain('<blockquote class="md-quote">note</blockquote>');
        expect(html).toContain('<hr class="md-rule"/>');
        expect(html).toContain('href="https://example.com/a_b"');
        expect(html).toContain('<img class="md-image" src="https://example.com/p.png"');
        expect(html).not.toContain('href="javascript');
        expect(html).toContain("katex");
        expect(html).not.toContain("<img src=x");
    });

    it("shows the values as they arrive", async () => {
        vi.useFakeTimers();
        const store = createLiveValueStore();
        render(<MarkdownView text={"Rotor: **{{dtm2sim.rotorRpm|1}} rpm**"} store={store} />);
        expect(screen.getByText("– rpm")).toBeInTheDocument();
        act(() => {
            store.publish("dtm2sim", { rotorRpm: 10.04 });
            vi.advanceTimersByTime(300);
        });
        expect(screen.getByText("10.0 rpm")).toBeInTheDocument();
        vi.useRealTimers();
    });

    it("edits the text and offers the fields of the last message", () => {
        const store = createLiveValueStore();
        store.publish("dtm2sim", { rotorRpm: 9.5, pose: { distance: 1.2 } });
        const onApply = vi.fn();
        render(<MarkdownEditor panel={{ id: "markdown-1", type: "markdown", text: "", x: 0, y: 0, w: 4, h: 4 }} store={store} topics={[{ ref: "dtm2sim", label: "dtm2sim" }, { ref: "dev2pdb_1", label: "dev2pdb_1", fields: [{ path: "Ay", label: "Acceleration_y", units: "m/s²", sensor: "Acceleration" }] }]} onApply={onApply} onDiscard={vi.fn()} />);
        const area = screen.getByRole("textbox", { name: "Markdown text" });
        fireEvent.change(area, { target: { value: "Speed: " } });
        (area as HTMLTextAreaElement).selectionStart = (area as HTMLTextAreaElement).selectionEnd = 7;
        fireEvent.click(screen.getByRole("button", { name: "pose.distance" }));
        expect(area).toHaveValue("Speed: {{dtm2sim.pose.distance}}");
        expect(screen.getByLabelText("Preview")).toHaveTextContent("Speed: 1.2");
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: "markdown-1", text: "Speed: {{dtm2sim.pose.distance}}" }));
    });
});
