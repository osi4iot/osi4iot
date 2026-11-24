import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./Headers";

const props = (overrides: Record<string, unknown> = {}) => ({
    isAssistantPanelOpen: false,
    isNatsConnected: true,
    digitalTwinState: "OK",
    activeViewer: "3D" as const,
    showOnlyPipelineViewer: false,
    handleAssistantPanelOpenAndClose: vi.fn(),
    handleToggleActiveViewer: () => {},
    handleSetActiveViewer: () => {},
    handlePipelineLogsOpen: () => {},
    handleOpenGrafanaDashboard: () => {},
    handleDigitalTwinStateShield: () => {},
    handleDeployPipeline: () => {},
    handleStopPipeline: () => {},
    handleFileUpload: () => {},
    handleDownloadYamlFile: () => {},
    handleReinitiatePipeline: () => {},
    isPipelineUiChanged: false,
    close3DViewer: () => {},
    assetWithCameraSelected: true,
    pipelineStatus: "running",
    pipelineLeaderReplicaIndex: 0,
    ...overrides,
});

describe("Header: pipeline logs only in the pipeline view", () => {
    it("has no logs button in the 3D view and flags new errors on the Pipeline tab", () => {
        render(<Header {...(props({ pipelineErrors: 2 }) as any)} />);
        expect(screen.queryByRole("button", { name: /Pipeline logs/ })).toBeNull();
        expect(screen.getByRole("tab", { name: "Pipeline (2 new pipeline errors)" })).toBeInTheDocument();
    });

    it("shows the logs button with the error count in the pipeline view", () => {
        render(<Header {...(props({ activeViewer: "pipeline", pipelineErrors: 3 }) as any)} />);
        expect(screen.getByRole("button", { name: "Pipeline logs (3 new pipeline errors)" })).toHaveTextContent("3");
    });

    it("has no logs button for a viewer of the group (the logs are for editors and administrators)", () => {
        render(<Header {...(props({ activeViewer: "pipeline", showOnlyPipelineViewer: true, canSeePipelineLogs: false }) as any)} />);
        expect(screen.queryByRole("button", { name: /Pipeline logs/ })).toBeNull();
    });
});

describe("Header: the chat button (the side panel is the chat)", () => {
    it("opens and closes the chat", () => {
        const toggle = vi.fn();
        const { rerender } = render(<Header {...(props({ chatEnabled: true, handleAssistantPanelOpenAndClose: toggle }) as any)} />);
        fireEvent.click(screen.getByRole("button", { name: "Chat with assistant" }));
        expect(toggle).toHaveBeenCalledTimes(1);
        rerender(<Header {...(props({ chatEnabled: true, assistantPanelWidth: 600 }) as any)} />);
        expect(screen.getByRole("button", { name: "Close the chat" })).toHaveAttribute("aria-pressed", "true");
    });

    it("is only there when the twin has a chat, with the unread answer dot", () => {
        const { rerender } = render(<Header {...(props() as any)} />);
        expect(screen.queryByRole("button", { name: "Chat with assistant" })).toBeNull();
        rerender(<Header {...(props({ viewerHasModel: false, chatEnabled: true, chatUnread: true }) as any)} />);
        expect(screen.getByRole("button", { name: "Chat with assistant" })).toBeInTheDocument();
        expect(screen.getByLabelText("New answer from the assistant")).toBeInTheDocument();
    });
});

describe("Header: the Viewer page", () => {
    it("has two views, Viewer and Pipeline", () => {
        render(<Header {...(props() as any)} />);
        expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Viewer", "Pipeline"]);
        expect(screen.getByRole("tab", { name: "Viewer" })).toHaveAttribute("aria-selected", "true");
    });

    it("offers the Viewer to a twin without 3D model but with a camera", () => {
        const { rerender } = render(<Header {...(props({ showOnlyPipelineViewer: true, activeViewer: "pipeline" }) as any)} />);
        expect(screen.queryByRole("tab")).toBeNull();
        rerender(<Header {...(props({ showOnlyPipelineViewer: true, viewerAvailable: true, activeViewer: "pipeline" }) as any)} />);
        expect(screen.getByRole("tab", { name: "Viewer" })).toBeInTheDocument();
    });

    it("reports its height, so that the panels start below it", () => {
        const onHeight = vi.fn();
        render(<Header {...(props({ onHeightChange: onHeight }) as any)} />);
        expect(onHeight).toHaveBeenCalled();
    });
});
