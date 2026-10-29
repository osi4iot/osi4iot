import { describe, expect, it } from "vitest";
import { measurementsTextError, toMeasurements } from "./measurements";

const oldSchema = {
    type: "object",
    properties: {
        accelerations: { type: "array", description: "Ax,Ay,Az", units: "m/s^2", items: { type: "number" } },
        temperature: { type: "number", description: "Temperature", units: "°C" },
    },
};

describe("toMeasurements", () => {
    it("converts the JSON schema of older versions", () => {
        expect(toMeasurements(JSON.stringify(oldSchema))).toEqual({
            accelerations: { type: "array", label: "Ax,Ay,Az", units: "m/s^2" },
            temperature: { type: "number", label: "Temperature", units: "°C" },
        });
    });
    it("keeps the current format and fills defaults", () => {
        expect(toMeasurements({ t: { type: "number" } })).toEqual({ t: { type: "number", label: "t", units: "-" } });
        expect(toMeasurements("{}")).toEqual({});
        expect(toMeasurements("not json")).toEqual({});
    });
});

describe("measurementsTextError", () => {
    it("validates the editor text", () => {
        expect(measurementsTextError('{ "t": { "type": "number", "label": "T", "units": "K" } }')).toBeNull();
        expect(measurementsTextError(JSON.stringify(oldSchema))).toBeNull();
        expect(measurementsTextError("[1]")).not.toBeNull();
        expect(measurementsTextError('{ "t": { "type": "string" } }')).not.toBeNull();
        expect(measurementsTextError("{")).not.toBeNull();
    });
});
