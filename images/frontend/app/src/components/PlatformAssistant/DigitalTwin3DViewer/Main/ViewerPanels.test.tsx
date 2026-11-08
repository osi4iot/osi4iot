import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BackToSplit, PanelHeader, Splitter } from "./ViewerPanels";

describe("Viewer page panels", () => {
    it("puts a panel full page and brings it back", () => {
        const full = vi.fn();
        render(<PanelHeader kind="model" onFullPage={full} />);
        expect(screen.getByRole("heading", { name: "3D model" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Show the 3D model full page" }));
        expect(full).toHaveBeenCalledTimes(1);

        const back = vi.fn();
        render(<BackToSplit kind="image" top={76} left={12} onBack={back} />);
        expect(screen.getByRole("group", { name: "Image full page" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Back to split view" }));
        expect(back).toHaveBeenCalledTimes(1);
    });

    it("resizes the panels with the arrow keys", () => {
        const onShare = vi.fn();
        render(
            <Splitter
                rect={{ left: 800, top: 76, width: 12, height: 600 }}
                stacked={false}
                share={0.6}
                shareAtPoint={() => 0.5}
                onShare={onShare}
                originRef={{ current: null }}
            />,
        );
        const splitter = screen.getByRole("separator", { name: "Resize the 3D model and image panels" });
        expect(splitter).toHaveAttribute("aria-valuenow", "60");
        fireEvent.keyDown(splitter, { key: "ArrowLeft" });
        expect(onShare.mock.calls.at(-1)![0]).toBeCloseTo(0.55);
        fireEvent.keyDown(splitter, { key: "ArrowRight" });
        expect(onShare.mock.calls.at(-1)![0]).toBeCloseTo(0.65);
    });
});
