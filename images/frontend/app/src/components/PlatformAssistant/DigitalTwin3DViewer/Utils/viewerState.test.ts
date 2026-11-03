import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useViewerState } from "./customHooks";

describe("useViewerState", () => {
    it("opens the assistant panel on the chat tab unless the user chose another", () => {
        expect(renderHook(() => useViewerState()).result.current[0].isChatAssistantOpen).toBe(true);
        const remembered = { assistantPanel: true, chatAssistant: false, pipelineLogs: false };
        expect(renderHook(() => useViewerState("3D", false, remembered)).result.current[0].isChatAssistantOpen).toBe(false);
    });
});
