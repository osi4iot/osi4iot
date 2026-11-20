import { describe, expect, it } from "vitest";
import { objectFieldMeasurement, objectFieldValue } from "./objectFields";

describe("campos de los objetos 3D", () => {
    const payload = {
        temperature: 21.5,
        "v.1": 7,
        battery: { voltage: 3.7 },
        power: { dc: { voltage: 48 } },
        sensors: [{ t: 20 }, { t: 22 }, { t: "x" }],
        acc: [0.1, 0.2],
        door: true,
    };

    it("lee campos de primer nivel, anidados, JSON Pointer y *", () => {
        expect(objectFieldValue(payload, "temperature")).toBe(21.5);
        expect(objectFieldValue(payload, "v.1")).toBe(7);
        expect(objectFieldValue(payload, "battery.voltage")).toBe(3.7);
        expect(objectFieldValue(payload, "/power/dc/voltage")).toBe(48);
        expect(objectFieldValue(payload, "sensors.1.t")).toBe(22);
        expect(objectFieldValue(payload, "sensors.*.t")).toEqual([20, 22, null]);
        expect(objectFieldValue(payload, "acc")).toEqual([0.1, 0.2]);
        expect(objectFieldValue(payload, "door")).toBe(1);
        expect(objectFieldValue(payload, "battery.current")).toBeUndefined();
        expect(objectFieldValue(payload, undefined)).toBeUndefined();
    });

    it("encuentra la medida de la tarjeta por su clave o por su ruta", () => {
        const measurements = {
            "battery.voltage": { type: "number" as const, label: "Batería", units: "V" },
            dc: { type: "number" as const, label: "DC", units: "V", path: "/power/dc/voltage" },
        };
        expect(objectFieldMeasurement(measurements, "battery.voltage")?.label).toBe("Batería");
        expect(objectFieldMeasurement(measurements, "/battery/voltage")?.label).toBe("Batería");
        expect(objectFieldMeasurement(measurements, "power.dc.voltage")?.label).toBe("DC");
        expect(objectFieldMeasurement(measurements, "other")).toBeUndefined();
    });
});
