import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SoundToggle } from "./WorkspaceControls";

describe("SoundToggle", () => {
    it("says clearly whether the viewer is muted and toggles it", () => {
        const onToggle = vi.fn();
        const { rerender } = render(<SoundToggle visible enabled={false} onToggle={onToggle} />);
        const button = screen.getByRole("button", { name: "Sound muted: turn it on" });
        expect(button.getAttribute("aria-pressed")).toBe("false");
        // an icon: its name is in its label and tooltip
        expect(button.getAttribute("title")).toContain("muted");
        fireEvent.click(button);
        expect(onToggle).toHaveBeenCalledTimes(1);
        rerender(<SoundToggle visible enabled onToggle={onToggle} />);
        const on = screen.getByRole("button", { name: "Sound on: mute the viewer" });
        expect(on.getAttribute("aria-pressed")).toBe("true");
        expect(on.getAttribute("title")).toContain("Sound on");
    });

    it("is hidden when the twin cannot send sounds", () => {
        render(<SoundToggle visible={false} enabled={false} onToggle={() => undefined} />);
        expect(screen.queryByRole("button")).toBeNull();
    });
});
