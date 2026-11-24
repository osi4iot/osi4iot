import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyCodeButton } from "./CopyCodeButton";

describe("Copy code button", () => {
    afterEach(() => vi.useRealTimers());

    it("copies the code and shows a check for a moment", async () => {
        vi.useFakeTimers();
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
        render(<CopyCodeButton code="return msg;" label="Copy the code of On Message" />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copy the code of On Message" }));
        });
        expect(writeText).toHaveBeenCalledWith("return msg;");
        expect(screen.getByRole("button")).toHaveTextContent("Copied");
        act(() => {
            vi.advanceTimersByTime(1600);
        });
        expect(screen.getByRole("button")).toHaveTextContent("Copy");
    });

    it("copies through a text area without the Clipboard API (http)", async () => {
        Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
        const exec = vi.fn().mockReturnValue(true);
        (document as any).execCommand = exec;
        render(<CopyCodeButton code="x" />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copy the code" }));
        });
        expect(exec).toHaveBeenCalledWith("copy");
        expect(screen.getByRole("button")).toHaveTextContent("Copied");
        expect(document.querySelector("textarea")).toBeNull();
    });
});
