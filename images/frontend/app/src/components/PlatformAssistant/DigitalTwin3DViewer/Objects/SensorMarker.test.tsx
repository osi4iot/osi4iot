import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SensorMarker, { formatAge, formatSensorNumber, sensorMarkerRows } from "./SensorMarker";
import { isSensorValue } from "../ViewerTools/ViewerUtils";

describe("sensor values", () => {
    it("formats numbers for the card", () => {
        expect(formatSensorNumber(0)).toBe("0");
        expect(formatSensorNumber(12.3456)).toBe("12.35");
        expect(formatSensorNumber(-0.25)).toBe("-0.25");
        expect(formatSensorNumber(8.817e-5)).toBe("8.817e-5");
        expect(formatSensorNumber(-6.2e-6)).toBe("-6.2e-6");
        expect(formatSensorNumber(2_500_000)).toBe("2.5e6");
        expect(formatSensorNumber(NaN)).toBe("—");
        expect(formatAge(1)).toBe("just now");
        expect(formatAge(42)).toBe("42 s ago");
        expect(formatAge(180)).toBe("3 min ago");
    });

    it("gives a row per component of an array, with its label", () => {
        const rows = sensorMarkerRows([0.01, -0.02, 4.5], { type: "array", label: "Ax, Ay,Az", units: "m/s^2" }, "acc");
        expect(rows).toEqual([
            { label: "Ax", value: "0.01" },
            { label: "Ay", value: "-0.02" },
            { label: "Az", value: "4.5" },
        ]);
        expect(sensorMarkerRows(3, undefined, "temp")).toEqual([{ label: "temp", value: "3" }]);
        expect(sensorMarkerRows(null, undefined, "temp")).toEqual([]);
    });

    it("takes numbers and numeric arrays as sensor values", () => {
        expect(isSensorValue(1.5)).toBe(true);
        expect(isSensorValue([1, 2, 3])).toBe(true); // before, only arrays with a null were taken
        expect(isSensorValue([null, 2, null])).toBe(true);
        expect(isSensorValue([null, null])).toBe(false);
        expect(isSensorValue([])).toBe(false);
        expect(isSensorValue(["a"])).toBe(false);
        expect(isSensorValue("3")).toBe(false);
    });
});

describe("SensorMarker", () => {
    it("shows the sensor's name and current value on hover, and opens its dashboard", () => {
        const onOpen = vi.fn();
        render(
            <SensorMarker
                title="Strain gauge 1"
                subtitle="Strain gauge · sensor_1"
                measurement={{ type: "number", label: "Eps_1", units: "-" }}
                fieldName="Eps_1"
                value={8.817e-5}
                status="live"
                lastValueAt={Date.now() - 3000}
                hasDashboard
                onOpen={onOpen}
            />,
        );
        expect(screen.queryByRole("tooltip")).toBeNull();
        const pin = screen.getByRole("button", { name: /Strain gauge 1: Eps_1 8.817e-5/ });
        fireEvent.pointerEnter(pin);
        const card = screen.getByRole("tooltip");
        expect(card.textContent).toContain("Strain gauge 1");
        expect(card.textContent).toContain("8.817e-5");
        expect(card.textContent).toContain("Live · 3 s ago");
        expect(card.textContent).not.toContain(" -"); // "-" units are not shown
        fireEvent.click(pin);
        expect(onOpen).toHaveBeenCalled();
        fireEvent.pointerLeave(pin);
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("shows each component of an array sensor with its units", () => {
        render(
            <SensorMarker
                title="Mobile accelerations"
                measurement={{ type: "array", label: "Ax,Ay,Az", units: "m/s²" }}
                fieldName="mobile_accelerations"
                value={[0.01, -0.03, 4.4]}
                status="stale"
                lastValueAt={null}
                hasDashboard={false}
                onOpen={() => {}}
            />,
        );
        fireEvent.focus(screen.getByRole("button"));
        const card = screen.getByRole("tooltip");
        expect(card.textContent).toContain("Az");
        expect(card.textContent).toContain("4.4 m/s²");
        expect(card.textContent).toContain("No recent data");
        expect(card.textContent).not.toContain("dashboard");
    });
});
