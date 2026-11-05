import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import PipelineLogs, { PipelineLog } from "./PipelineLogs";
import { MAX_PIPELINE_LOGS, appendCapped, capLogs, countByLevel, groupLogs, levelOf, summaryOf } from "./pipelineLogsModel";

const log = (overrides: Partial<PipelineLog> = {}): PipelineLog => ({
    level: "debug",
    component: "node",
    name: "Tower state",
    uid: "uid-tower",
    message: "",
    outputIndex: 0,
    payload: { windSpeed: 3.6, status: "OK" },
    state: {},
    date: "2026-11-02 15:33:02",
    receivedAt: new Date(2026, 10, 2, 15, 33, 2, 418).getTime(),
    ...overrides,
});

describe("pipelineLogsModel", () => {
    it("keeps only the newest logs", () => {
        let logs: PipelineLog[] = [];
        for (let i = 0; i < MAX_PIPELINE_LOGS + 20; i++) logs = appendCapped(logs, log({ uid: `u${i}` }));
        expect(logs).toHaveLength(MAX_PIPELINE_LOGS);
        expect(logs[0].uid).toBe("u20");
        expect(capLogs(Array.from({ length: 600 }, () => log()))).toHaveLength(MAX_PIPELINE_LOGS);
    });

    it("groups identical consecutive logs only", () => {
        const a = log();
        const groups = groupLogs([a, log(), log(), log({ payload: { windSpeed: 4 } }), log()]);
        expect(groups.map((g) => g.count)).toEqual([3, 1, 1]);
    });

    it("summarises debug, info and error logs in one line", () => {
        expect(summaryOf(log())).toBe('out 0 · {windSpeed: 3.6, status: "OK"}');
        expect(summaryOf(log({ level: "error", message: "dial tcp: no such host\nmore", description: "Request failed" }))).toBe(
            "dial tcp: no such host",
        );
        expect(summaryOf(log({ level: "info", message: '{"a":1}', description: "Started" }))).toBe("Started");
    });

    it("knows the warnings of the nodes and of the scripts (go.logger.Warnf)", () => {
        const warning = log({ level: "warning", message: "Message without a number in payload.rms", description: "Warning from node" });
        expect(levelOf(warning)).toBe("warning");
        expect(levelOf(log({ level: "WARN" }))).toBe("warning");
        expect(summaryOf(warning)).toBe("Message without a number in payload.rms");
        expect(countByLevel([warning, log(), warning])).toMatchObject({ all: 3, warning: 2, debug: 1 });
    });
});

const Harness = ({ initial, onShowInFlow }: { initial: PipelineLog[]; onShowInFlow?: (uid: string, isError: boolean) => void }) => {
    const [logs, setLogs] = useState(initial);
    return (
        <PipelineLogs
            logMessages={logs}
            setLogMessages={setLogs}
            canShowInFlow={(uid) => uid === "uid-weather"}
            onShowInFlow={onShowInFlow}
        />
    );
};

describe("PipelineLogs", () => {
    const logs = [
        log(),
        log(),
        log({ level: "error", name: "Wheather API", uid: "uid-weather", message: "dial tcp: lookup api: no such host" }),
        log({ level: "info", name: "AI Agent", uid: "uid-agent", component: "node", description: "Answer sent" }),
    ];

    it("shows one line per log, groups repeats and filters by level and text", () => {
        render(<Harness initial={logs} />);
        const list = screen.getByRole("list", { name: "Logs" });
        expect(within(list).getAllByRole("listitem")).toHaveLength(3);
        expect(within(list).getByText("×2")).toBeInTheDocument();
        expect(within(list).getAllByText("15:33:02.418").length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole("tab", { name: /Errors/ }));
        expect(within(list).getAllByRole("listitem")).toHaveLength(1);
        fireEvent.click(screen.getByRole("tab", { name: /All/ }));
        fireEvent.change(screen.getByLabelText("Filter by node or text"), { target: { value: "agent" } });
        expect(within(list).getAllByRole("listitem")).toHaveLength(1);
        expect(within(list).getByText("Answer sent")).toBeInTheDocument();
    });

    it("expands a log and finds its node in the flow", () => {
        const show = vi.fn();
        render(<Harness initial={logs} onShowInFlow={show} />);
        fireEvent.click(screen.getByText("dial tcp: lookup api: no such host"));
        fireEvent.click(screen.getByRole("button", { name: "Show in flow" }));
        expect(show).toHaveBeenCalledWith("uid-weather", true);
        // a node that is not in the flow cannot be shown
        fireEvent.click(screen.getAllByText('out 0 · {windSpeed: 3.6, status: "OK"}')[0]);
        expect(screen.getByRole("button", { name: "Show in flow" })).toBeDisabled();
        expect(screen.getByText("PAYLOAD")).toBeInTheDocument();
    });

    it("clears the logs", () => {
        render(<Harness initial={logs} />);
        fireEvent.click(screen.getByRole("button", { name: "Clear logs" }));
        expect(screen.getByText("No logs yet.")).toBeInTheDocument();
    });
});
