import { act, renderHook } from "@testing-library/react";
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../../contexts/authContext";
import { usePipelineState } from "./customHooks";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const dt = { digitalTwinUid: "dt1", pipelineFileData: "x" } as any;

const setup = () => renderHook(() => usePipelineState(dt, null, "", () => {}), { wrapper });

describe("usePipelineState (estado del pipeline sin parpadeos)", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("un 'unknown' de otra réplica justo después de 'running' no cambia el estado", () => {
        const { result } = setup();
        act(() => result.current.handlePipelineStatusChange("running"));
        act(() => result.current.handlePipelineStatusChange("unknown"));
        act(() => vi.advanceTimersByTime(3000));
        expect(result.current.pipelineStatus).toBe("running");
    });

    it("un 'unknown' que llega antes que 'running' no se llega a mostrar", () => {
        const { result } = setup();
        act(() => result.current.handlePipelineStatusChange("running"));
        act(() => vi.advanceTimersByTime(10000));
        act(() => result.current.handlePipelineStatusChange("unknown"));
        act(() => vi.advanceTimersByTime(200));
        act(() => result.current.handlePipelineStatusChange("running"));
        act(() => vi.advanceTimersByTime(3000));
        expect(result.current.pipelineStatus).toBe("running");
    });

    it("un 'unknown' sin estado conocido reciente sí se aplica", () => {
        const { result } = setup();
        act(() => result.current.handlePipelineStatusChange("running"));
        act(() => vi.advanceTimersByTime(10000));
        act(() => result.current.handlePipelineStatusChange("unknown"));
        expect(result.current.pipelineStatus).toBe("running");
        act(() => vi.advanceTimersByTime(2000));
        expect(result.current.pipelineStatus).toBe("unknown");
    });

    it("los estados conocidos se aplican al momento y el líder -1 de otra réplica se ignora", () => {
        const { result } = setup();
        act(() => result.current.handlePipelineStatusChange("Stopped"));
        expect(result.current.pipelineStatus).toBe("stopped");
        act(() => result.current.handlePipelineLeaderReplicaIndexChange(2));
        act(() => result.current.handlePipelineLeaderReplicaIndexChange(-1));
        expect(result.current.pipelineLeaderReplicaIndex).toBe(2);
    });
});
