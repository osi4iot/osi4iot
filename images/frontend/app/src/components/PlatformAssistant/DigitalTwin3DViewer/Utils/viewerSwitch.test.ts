import { describe, expect, it, vi } from "vitest";
import { createHandlers } from "./handlers";

const make = (activeViewer: "3D" | "pipeline", isAssistantPanelOpen: boolean, ref: { current: boolean }) => {
    const setters = {
        setActiveViewer: vi.fn(),
        setIsAssistantPanelOpen: vi.fn(),
        setShowDtSimulatorModal: vi.fn(),
    };
    const handlers = createHandlers(
        { activeViewer, isAssistantPanelOpen, reopenAssistantPanelRef: ref } as any,
        setters as any,
    );
    return { handlers, setters };
};

describe("switching between the viewer and the pipeline", () => {
    it("reopens the assistant panel when coming back to the viewer", () => {
        const ref = { current: false };
        const toPipeline = make("3D", true, ref);
        toPipeline.handlers.handleSetActiveViewer("pipeline");
        expect(toPipeline.setters.setIsAssistantPanelOpen).toHaveBeenCalledWith(false);
        const back = make("pipeline", false, ref);
        back.handlers.handleSetActiveViewer("3D");
        expect(back.setters.setIsAssistantPanelOpen).toHaveBeenCalledWith(true);
        expect(ref.current).toBe(false);
    });

    it("keeps it closed when it was closed", () => {
        const ref = { current: false };
        make("3D", false, ref).handlers.handleToggleActiveViewer();
        const back = make("pipeline", false, ref);
        back.handlers.handleToggleActiveViewer();
        expect(back.setters.setIsAssistantPanelOpen).not.toHaveBeenCalled();
        expect(back.setters.setActiveViewer).toHaveBeenCalledWith("3D");
    });
});
