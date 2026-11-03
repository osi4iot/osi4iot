import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SignalNodeSettings } from "./SignalNodesSettings";
import {
    SIGNAL_DEFAULT_SETTINGS,
    SignalNodeType,
    deadbandProblems,
    dnvCurve,
    isSignalNode,
    joinProblems,
    signalProblems,
    switchNumOutputs,
    switchProblems,
    windowKeepsSamples,
    windowProblems,
} from "./signalNodes";

describe("signal node model", () => {
    it("has valid defaults", () => {
        for (const type of ["Switch", "Deadband", "Window", "Join"] as SignalNodeType[]) {
            expect(signalProblems(type, SIGNAL_DEFAULT_SETTINGS[type])).toEqual([]);
            expect(isSignalNode(type)).toBe(true);
        }
        expect(isSignalNode("Batch")).toBe(false);
        expect(switchNumOutputs(SIGNAL_DEFAULT_SETTINGS.Switch)).toBe(2);
    });

    it("checks Switch rules like pipelines", () => {
        expect(switchProblems({ rules: [] })).toHaveLength(1);
        expect(switchProblems({ rules: [{ operator: "gt", value: "abc" }] })[0]).toMatch(/not a number/);
        expect(switchProblems({ rules: [{ operator: "between", value: "1", value2: "" }] })[0]).toMatch(/two numbers/);
        expect(switchProblems({ rules: [{ operator: "regex", value: "(" }] })[0]).toMatch(/regular expression/);
        expect(switchProblems({ rules: [{ operator: "exists" }, { operator: "eq", value: "OK" }] })).toEqual([]);
    });

    it("checks Deadband, Window and Join", () => {
        expect(deadbandProblems({ fields: [] })).toHaveLength(1);
        expect(windowProblems({ fields: ["v"], windowType: "count", size: 6000, mode: "sliding", stats: ["mean"] })[0]).toMatch(/5000/);
        expect(windowProblems({ fields: ["v"], windowType: "time", durationSeconds: 0, stats: ["mean"] })[0]).toMatch(/1 second/);
        expect(windowKeepsSamples({ mode: "tumbling", stats: ["mean", "p95"] })).toBe(true);
        expect(windowKeepsSamples({ mode: "tumbling", stats: ["mean"] })).toBe(false);
        expect(joinProblems({ mode: "all", sources: [] })[0]).toMatch(/needs the list/);
        expect(joinProblems({ sources: [{ topicRef: "a", alias: "x" }, { key: "b", alias: "x" }] })[0]).toMatch(/repeated/);
        expect(joinProblems({ keyPath: "payload.id", sources: [{ topicRef: "a" }] })[0]).toMatch(/key path "topic"/);
    });
});

const Host = ({ type, initial, onData }: { type: SignalNodeType; initial: Record<string, any>; onData: (d: any) => void }) => {
    const [data, setData] = useState<Record<string, any>>(initial);
    return (
        <SignalNodeSettings
            type={type}
            formData={data}
            topicRefs={["dev2pdb_1", "dev2pdb_2"]}
            onChange={(k, v) =>
                setData((prev) => {
                    const next = { ...prev, [k]: v };
                    onData(next);
                    return next;
                })
            }
        />
    );
};

describe("signal node editors", () => {
    it("Switch: adding and removing rules updates the outputs", () => {
        let data: any = {};
        render(<Host type="Switch" initial={{ ...SIGNAL_DEFAULT_SETTINGS.Switch, numOutputs: 2 }} onData={(d) => (data = d)} />);
        fireEvent.click(screen.getByText("+ Add rule"));
        expect(data.rules).toHaveLength(2);
        expect(data.numOutputs).toBe(3);
        fireEvent.change(screen.getByLabelText("Rule 2 operator"), { target: { value: "between" } });
        expect(screen.getByLabelText("Rule 2 second value")).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toMatch(/between needs two numbers/);
        fireEvent.click(screen.getByLabelText("Remove rule 1"));
        expect(data.numOutputs).toBe(2);
    });

    it("Deadband: fields are committed on blur and the blocked output adds one", () => {
        let data: any = {};
        render(<Host type="Deadband" initial={{ ...SIGNAL_DEFAULT_SETTINGS.Deadband }} onData={(d) => (data = d)} />);
        const fields = screen.getByLabelText("Fields");
        fireEvent.change(fields, { target: { value: "payload.v, payload.status," } });
        fireEvent.blur(fields);
        expect(data.fields).toEqual(["payload.v", "payload.status"]);
        fireEvent.click(screen.getByText(/Second output/));
        expect(data.numOutputs).toBe(2);
    });

    it("Window: statistics and the samples note", () => {
        let data: any = {};
        render(<Host type="Window" initial={{ ...SIGNAL_DEFAULT_SETTINGS.Window }} onData={(d) => (data = d)} />);
        expect(screen.queryByText(/at most 5000/)).toBeNull();
        fireEvent.click(screen.getByLabelText("Statistic p95"));
        expect(data.stats).toEqual(["count", "mean", "min", "max", "p95"]);
        expect(screen.getByText(/at most 5000/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Window type"), { target: { value: "time" } });
        expect(screen.getByLabelText("Window duration")).toBeTruthy();
    });

    it("Join: sources from the topics or a custom key", () => {
        let data: any = {};
        render(<Host type="Join" initial={{ ...SIGNAL_DEFAULT_SETTINGS.Join }} onData={(d) => (data = d)} />);
        fireEvent.click(screen.getByText("+ Add source"));
        expect(data.sources).toEqual([{ topicRef: "dev2pdb_1", alias: "" }]);
        fireEvent.change(screen.getByLabelText("Source 1 name"), { target: { value: "strain" } });
        fireEvent.change(screen.getByLabelText("Source 1"), { target: { value: "__custom" } });
        expect(data.sources[0].topicRef).toBeUndefined();
        fireEvent.change(screen.getByLabelText("Source 1 key"), { target: { value: "sensor-7" } });
        expect(data.sources[0]).toMatchObject({ key: "sensor-7", alias: "strain" });
        fireEvent.change(screen.getByLabelText("Join mode"), { target: { value: "set" } });
        expect(screen.getByLabelText("Timeout")).toBeTruthy();
    });
});

describe("lote 2 model and editors", () => {
    it("defaults: Alarm asks for its levels, the others are valid", () => {
        expect(signalProblems("Watchdog", SIGNAL_DEFAULT_SETTINGS.Watchdog)).toEqual([]);
        expect(signalProblems("MachineState", SIGNAL_DEFAULT_SETTINGS.MachineState)).toEqual([]);
        expect(signalProblems("Alarm", SIGNAL_DEFAULT_SETTINGS.Alarm)[0]).toMatch(/Warning level, the Alarm level/);
        expect(signalProblems("Alarm", { ...SIGNAL_DEFAULT_SETTINGS.Alarm, warning: "20", alarm: "25" })).toEqual([]);
        expect(signalProblems("Alarm", { condition: "high", warning: "30", alarm: "25" })[0]).toMatch(/above the Warning/);
        expect(signalProblems("Alarm", { condition: "equals", alarm: "E42" })).toEqual([]);
        expect(signalProblems("Watchdog", { timeoutSeconds: 10, keyPath: "", sources: [{ key: "a" }] })[0]).toMatch(/need a key/);
        expect(signalProblems("MachineState", { rules: [{ state: "", operator: "exists" }], shifts: ["06:00", "6:61"] })).toEqual([
            "Rule 1: the state name is required.",
            'Shift start "6:61" is not a time HH:MM.',
        ]);
    });

    it("Watchdog: the pass-through output and expected sources", () => {
        let data: any = {};
        render(<Host type="Watchdog" initial={{ ...SIGNAL_DEFAULT_SETTINGS.Watchdog }} onData={(d) => (data = d)} />);
        fireEvent.click(screen.getByText(/Third output/));
        expect(data.numOutputs).toBe(3);
        fireEvent.click(screen.getByText("+ Add source"));
        expect(data.sources).toEqual([{ topicRef: "dev2pdb_1", alias: "" }]);
    });

    it("Alarm: levels, status output and the asset note", () => {
        let data: any = {};
        render(<Host type="Alarm" initial={{ ...SIGNAL_DEFAULT_SETTINGS.Alarm }} onData={(d) => (data = d)} />);
        expect(screen.getByRole("alert").textContent).toMatch(/Warning level/);
        fireEvent.change(screen.getByLabelText("Warning level"), { target: { value: "20" } });
        fireEvent.change(screen.getByLabelText("Alarm level"), { target: { value: "25" } });
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(screen.getByText(/Status output/));
        expect(data.numOutputs).toBe(2);
        expect(screen.queryByText(/worst of the active alarms/)).toBeNull();
        fireEvent.click(screen.getByText("Update the asset status directly"));
        expect(data.updateAssetStatus).toBe(true);
        expect(screen.getByText(/worst of the active alarms/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Condition"), { target: { value: "equals" } });
        expect(screen.queryByLabelText("Hysteresis")).toBeNull();
    });

    it("Machine state: rules and shifts", () => {
        let data: any = {};
        render(<Host type="MachineState" initial={{ ...SIGNAL_DEFAULT_SETTINGS.MachineState }} onData={(d) => (data = d)} />);
        fireEvent.click(screen.getByText("+ Add state"));
        fireEvent.change(screen.getByLabelText("State 2 name"), { target: { value: "Fault" } });
        fireEvent.change(screen.getByLabelText("State 2 operator"), { target: { value: "true" } });
        expect(data.rules[1]).toMatchObject({ state: "Fault", operator: "true" });
        expect(screen.queryByLabelText("State 2 value")).toBeNull();
        const shifts = screen.getByLabelText("Shifts");
        fireEvent.change(shifts, { target: { value: "06:00, 14:00, 22:00" } });
        fireEvent.blur(shifts);
        expect(data.shifts).toEqual(["06:00", "14:00", "22:00"]);
    });
});


describe("lote 3 model and editors", () => {
    it("defaults are valid and DNV presets match the standard", () => {
        for (const type of ["Rainflow", "Vibration", "Anomaly"] as SignalNodeType[]) {
            expect([type, signalProblems(type, SIGNAL_DEFAULT_SETTINGS[type])]).toEqual([type, []]);
        }
        const air = dnvCurve("D", "air")!;
        expect(air.lines).toEqual([{ m: 3, logA: 12.164 }, { m: 5, logA: 15.606 }]);
        expect(air.kneeRange).toBeCloseTo(52.63, 1);
        const cp = dnvCurve("B1", "seawater_cp")!;
        expect(cp.lines[0]).toEqual({ m: 4, logA: 14.917 });
        expect(cp.kneeCycles).toBe(1e6);
        expect(signalProblems("Rainflow", { field: "v", scale: 1, curveSource: "custom", lines: [] })[0]).toMatch(/at least one line/);
        expect(signalProblems("Vibration", { mode: "block", fs: 0, fsPath: "" })[0]).toMatch(/sampling rate/);
        expect(signalProblems("Vibration", { mode: "block", fs: 0, fsPath: "payload.fs" })).toEqual([]);
        expect(signalProblems("Anomaly", { method: "iqr", window: 10, warmup: 20 })[0]).toMatch(/warm-up/);
    });

    it("Rainflow: copy a DNV curve to a custom one", () => {
        let data: any = {};
        render(<Host type="Rainflow" initial={{ ...SIGNAL_DEFAULT_SETTINGS.Rainflow, dnvEnvironment: "seawater_cp" }} onData={(d) => (data = d)} />);
        expect(screen.getByText(/log a₁ = 11.764/)).toBeTruthy();
        fireEvent.click(screen.getByText("Copy to a custom curve"));
        expect(data.curveSource).toBe("custom");
        expect(data.lines).toEqual([{ m: 3, logA: 11.764 }, { m: 5, logA: 15.606 }]);
        expect(screen.getByLabelText("Line 2 m")).toBeTruthy();
    });

    it("Vibration and Anomaly editors", () => {
        let data: any = {};
        const { unmount } = render(<Host type="Vibration" initial={{ ...SIGNAL_DEFAULT_SETTINGS.Vibration }} onData={(d) => (data = d)} />);
        fireEvent.click(screen.getByText("+ Add band"));
        fireEvent.change(screen.getByLabelText("Band 1 to"), { target: { value: "0.4" } });
        expect(data.bands[0]).toMatchObject({ from: 0, to: 0.4 });
        fireEvent.change(screen.getByLabelText("Vibration mode"), { target: { value: "block" } });
        expect(screen.getByLabelText("Sampling rate field")).toBeTruthy();
        unmount();
        render(<Host type="Anomaly" initial={{ ...SIGNAL_DEFAULT_SETTINGS.Anomaly }} onData={(d) => (data = d)} />);
        fireEvent.change(screen.getByLabelText("Anomaly method"), { target: { value: "ewma" } });
        expect(screen.getByLabelText("Lambda")).toBeTruthy();
        expect(screen.queryByLabelText("Window (samples)")).toBeNull();
        fireEvent.click(screen.getByText(/only the anomalies/));
        expect(data.numOutputs).toBe(2);
    });
});
