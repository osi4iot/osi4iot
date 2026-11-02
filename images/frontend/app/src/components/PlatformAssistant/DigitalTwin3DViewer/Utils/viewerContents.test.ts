import { describe, expect, it } from "vitest";
import { resolveCollectionKeys, resolveSimulatorValues, viewerContents } from "./viewerContents";

describe("viewer contents for the AI agent", () => {
    it("lists the collections of the viewer", () => {
        expect(
            viewerContents({
                sensorCollectionNames: ["Strain gauges", "Wind speed", "Strain gauges"],
                genericObjectCollectionNames: ["Sea", ""],
                femResultNames: ["Disp_Z"],
            }),
        ).toEqual({
            sensors: ["Strain gauges", "Wind speed"],
            assets: [],
            animatedObjects: [],
            genericObjects: ["Sea"],
            femSimulationObjects: [],
            femResults: ["Disp_Z"],
            simulator: [],
        });
    });

    it("takes a collection written with other capitals or spaces as the one it means", () => {
        const existing = { Sea: { hide: false }, "Tower base": { hide: false }, sea2: {}, SEA2: {} };
        expect(resolveCollectionKeys({ sea: { hide: true } }, existing)).toEqual({ Sea: { hide: true } });
        expect(resolveCollectionKeys({ " tower  BASE ": { opacity: 0.4 } }, existing)).toEqual({
            "Tower base": { opacity: 0.4 },
        });
        // ambiguous or unknown: as written
        expect(resolveCollectionKeys({ Sea2: { hide: true } }, existing)).toEqual({ Sea2: { hide: true } });
        expect(resolveCollectionKeys({ Ship: { hide: true } }, existing)).toEqual({ Ship: { hide: true } });
    });
});

describe("simulator values from the AI agent", () => {
    const format = {
        windSpeed: { label: "Wind speed", units: "m/sec", minValue: 0, maxValue: 29 },
        windDirection: { label: "Wind direction", units: "degrees", minValue: 0, maxValue: 360 },
    };
    it("takes the fields by their name or label and keeps the values in range", () => {
        expect(resolveSimulatorValues({ windSpeed: 25 }, format)).toEqual({ windSpeed: 25 });
        expect(resolveSimulatorValues({ "wind speed": "20", Wind_Direction: 400 }, format)).toEqual({
            windSpeed: 20,
            windDirection: 360,
        });
        expect(resolveSimulatorValues({ windspeed: -3, pressure: 4, windDirection: "x" }, format)).toEqual({
            windSpeed: 0,
        });
    });
    it("tells the agent the inputs of the simulator", () => {
        const contents = viewerContents({ simulationFormat: format, simulatorState: { windSpeed: 2 } });
        expect(contents.simulator).toEqual([
            { field: "windSpeed", label: "Wind speed", units: "m/sec", min: 0, max: 29, value: 2 },
            { field: "windDirection", label: "Wind direction", units: "degrees", min: 0, max: 360, value: null },
        ]);
    });
});

