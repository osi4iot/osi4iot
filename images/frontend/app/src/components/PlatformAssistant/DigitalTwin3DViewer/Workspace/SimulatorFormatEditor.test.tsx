import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SimulatorFormatEditor, { formatOf, formatProblems, newRow, rowsOf } from "./SimulatorFormatEditor";

const format = { load: { label: "Load", units: "kN", minValue: 0, maxValue: 10, defaultValue: 2, step: 0.5 } };

describe("simulator format: rules", () => {
    it("a format read and written again is the same", () => {
        expect(formatOf(rowsOf(format))).toEqual(format);
    });

    it("finds wrong names, repeated names, numbers and ranges", () => {
        const rows = rowsOf(format);
        const bad = (patch: object) => Object.values(formatProblems([{ ...rows[0], ...patch }]).rows)[0];
        expect(bad({})).toBeUndefined();
        expect(bad({ name: "with space" })).toMatch(/name/);
        expect(bad({ label: " " })).toMatch(/label/);
        expect(bad({ minValue: "" })).toMatch(/numbers/);
        expect(bad({ minValue: "10" })).toMatch(/lower than the maximum/);
        expect(bad({ defaultValue: "11" })).toMatch(/between/);
        expect(bad({ step: "0" })).toMatch(/greater than 0/);
        expect(bad({ step: "20" })).toMatch(/range/);
        const twice = [rows[0], { ...rows[0], key: 999 }];
        expect(formatProblems(twice).rows[999]).toMatch(/already/);
    });

    it("a new parameter takes a name not used yet and is valid", () => {
        const rows = [{ ...newRow([]), name: "param_1" }];
        const next = newRow(rows);
        expect(next.name).toBe("param_2");
        expect(formatProblems([...rows, next]).rows).toEqual({});
    });
});

describe("simulator format editor", () => {
    it("adds, removes and saves the parameters", async () => {
        const onSave = vi.fn().mockResolvedValue(true);
        render(<SimulatorFormatEditor format={format} onSave={onSave} onCancel={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
        fireEvent.change(screen.getByRole("textbox", { name: "Name of param_2" }), { target: { value: "speed" } });
        fireEvent.change(screen.getByRole("textbox", { name: "Units of speed" }), { target: { value: "m/s" } });
        fireEvent.click(screen.getByRole("button", { name: "Save format" }));
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave.mock.calls[0][0]).toEqual({
            ...format,
            speed: { label: "Parameter 2", units: "m/s", minValue: 0, maxValue: 1, defaultValue: 0, step: 0.1 },
        });
        fireEvent.click(screen.getByRole("button", { name: "Remove load" }));
        expect(screen.queryByRole("textbox", { name: "Name of load" })).toBeNull();
    });

    it("does not save while a parameter is wrong, and says why", () => {
        const onSave = vi.fn();
        render(<SimulatorFormatEditor format={format} onSave={onSave} onCancel={vi.fn()} />);
        fireEvent.change(screen.getByRole("textbox", { name: "Maximum of load" }), { target: { value: "-1" } });
        fireEvent.click(screen.getByRole("button", { name: "Save format" }));
        expect(onSave).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent("lower than the maximum");
        expect(screen.getByRole("button", { name: "Save format" })).toBeDisabled();
        fireEvent.change(screen.getByRole("textbox", { name: "Maximum of load" }), { target: { value: "8" } });
        expect(screen.getByRole("button", { name: "Save format" })).toBeEnabled();
    });

    it("Cancel leaves without saving", () => {
        const onCancel = vi.fn();
        render(<SimulatorFormatEditor format={{}} onSave={vi.fn()} onCancel={onCancel} />);
        expect(screen.getByText("No parameters. Add the first one.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onCancel).toHaveBeenCalled();
    });
});
