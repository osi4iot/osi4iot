import { describe, expect, it } from "vitest";
import { itemPath, measurementItems, measurementsTextError, toMeasurements, valueAtPath } from "./measurements";

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

describe("rutas de las medidas", () => {
    it("da la ruta de cada valor y los elementos de un array", () => {
        const m = toMeasurements({
            "battery.voltage": { type: "number", label: "B", units: "V" },
            v: { path: "/power/dc/voltage", type: "number", label: "V", units: "V" },
            "sensors.*.t": { type: "array", label: "N,S", units: "°C" },
            acc: { type: "array", label: "Ax,Ay", units: "g" },
        });
        expect(itemPath("battery.voltage", m["battery.voltage"])).toEqual(["battery", "voltage"]);
        expect(itemPath("v", m.v)).toEqual(["power", "dc", "voltage"]);
        expect(itemPath("sensors.*.t", m["sensors.*.t"], 1)).toEqual(["sensors", "1", "t"]);
        expect(measurementItems("acc", m.acc).map((i) => i.path.join("."))).toEqual(["acc.0", "acc.1"]);
        expect(valueAtPath({ sensors: [{ t: 1 }, { t: 2 }] }, ["sensors", "1", "t"])).toBe(2);
    });
});

describe("measurementsTextError", () => {
    it("validates the editor text", () => {
        expect(measurementsTextError('{ "t": { "type": "number", "label": "T", "units": "K" } }')).toBeNull();
        expect(measurementsTextError(JSON.stringify(oldSchema))).toBeNull();
        expect(measurementsTextError("[1]")).not.toBeNull();
        expect(measurementsTextError('{ "t": { "type": "date" } }')).not.toBeNull();
        // rutas anidadas, JSON Pointer, comodín, textos y booleanos
        expect(
            measurementsTextError(
                JSON.stringify({
                    "battery.voltage": { type: "number" },
                    v: { path: "/power/dc/voltage", type: "number" },
                    "sensors.*.t": { type: "array", label: "N,S" },
                    door: { type: "boolean" },
                    mode: { type: "string" },
                }),
            ),
        ).toBeNull();
        expect(measurementsTextError('{ "a..b": { "type": "number" } }')).toMatch(/empty level/);
        expect(measurementsTextError('{ "s.*.t": { "type": "number" } }')).toMatch(/"array"/);
        expect(measurementsTextError('{ "v": { "path": "power/dc" } }')).toMatch(/JSON Pointer/);
        expect(measurementsTextError("{")).not.toBeNull();
    });
});
