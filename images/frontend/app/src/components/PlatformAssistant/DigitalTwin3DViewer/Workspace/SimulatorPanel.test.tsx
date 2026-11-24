import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SimulatorPanel, { SimulationParameter } from "./SimulatorPanel";

const format: Record<string, SimulationParameter> = {
    temperature: { label: "Temperature", units: "ºC", minValue: 0, maxValue: 50, defaultValue: 20, step: 1 },
    pressure: { label: "Pressure", units: "bar", minValue: 0, maxValue: 10, defaultValue: 1, step: 0.5 },
};

const props = () => ({
    format,
    values: { temperature: 25 } as Record<string, number>,
    simulating: false,
    onChange: vi.fn(),
    onToggleSimulation: vi.fn(),
    onGetLastMeasurements: vi.fn(),
});

describe("Simulator panel", () => {
    it("shows a slider per parameter, with the values being simulated or the defaults", () => {
        const p = props();
        render(<SimulatorPanel {...p} />);
        expect(screen.getByText("Temperature")).toBeInTheDocument();
        expect(screen.getByText("Pressure")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Showing the sensors' measurements");
        fireEvent.click(screen.getByRole("button", { name: "Reset to default values" }));
        expect(p.onChange).toHaveBeenCalledWith({ temperature: 20, pressure: 1 });
        fireEvent.click(screen.getByRole("button", { name: "Get last measurements" }));
        expect(p.onGetLastMeasurements).toHaveBeenCalled();
    });

    it("starts and stops the simulation", () => {
        const p = props();
        const { rerender } = render(<SimulatorPanel {...p} />);
        fireEvent.click(screen.getByRole("button", { name: /Start simulation/ }));
        expect(p.onToggleSimulation).toHaveBeenCalledTimes(1);
        rerender(<SimulatorPanel {...p} simulating />);
        expect(screen.getByRole("status")).toHaveTextContent("Sending simulated values to the digital twin");
        fireEvent.click(screen.getByRole("button", { name: /Stop simulation/ }));
        expect(p.onToggleSimulation).toHaveBeenCalledTimes(2);
    });

    it("says when the twin has no format", () => {
        render(<SimulatorPanel {...props()} format={{}} canEdit />);
        expect(screen.getByText(/This digital twin has no simulator format\. Write its parameters with the Edit icon .* with its Upload icon/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Start simulation/ })).toBeNull();
    });
});
