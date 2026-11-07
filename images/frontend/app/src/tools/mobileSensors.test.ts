import { describe, expect, it, vi } from "vitest";
import type { NatsConnection } from "@nats-io/nats-core";
import { findMobileTopic, isMobileSensorType, MOBILE_SENSOR_TOPIC_TYPE } from "./mobileSensors";
import ReadMobileGeolocation from "./ReadingMobileGeolocation";
import { IMobileTopic } from "../components/PlatformAssistant/TableColumns/topicsColumns";

const topic = (assetUid: string, sensorType: string, sensorDescription: string): IMobileTopic => ({
    id: 1,
    orgAcronym: "ORG",
    groupAcronym: "G1",
    assetDescription: "Pump with phone",
    sensorType,
    sensorDescription,
    groupUid: "g1",
    assetUid,
    topicUid: `t_${assetUid}_${sensorType}`,
});

describe("mobile sensor types", () => {
    it("are the seven the page can feed, with their topic types", () => {
        expect(MOBILE_SENSOR_TOPIC_TYPE).toEqual({
            "Mobile geolocation": "dev2pdb_wt",
            "Mobile accelerations": "dev2pdb_wt",
            "Mobile orientation": "dev2pdb_wt",
            "Mobile motion": "dev2pdb_wt",
            "Mobile photo": "dev2dtm",
            "Mobile video": "dev2dtm",
            "Mobile audio": "dev2dtm",
        });
        expect(isMobileSensorType("Mobile geolocation")).toBe(true);
        expect(isMobileSensorType("Temperature")).toBe(false);
    });

    it("finds the chosen sensor by asset and description, and keeps its type", () => {
        const topics = [topic("a1", "Mobile accelerations", "Front axle phone"), topic("a2", "Mobile geolocation", "GPS")];
        expect(findMobileTopic(topics, "Asset_a1", "Front axle phone")?.sensorType).toBe("Mobile accelerations");
        expect(findMobileTopic(topics, "Asset_a2", "GPS")?.topicUid).toBe("t_a2_Mobile geolocation");
        expect(findMobileTopic(topics, "Asset_a1", "GPS")).toBeUndefined();
    });
});

// A fake browser: positions are given by the test, ticks are run by hand
const fakeGeolocation = () => {
    let success: PositionCallback | null = null;
    let failure: PositionErrorCallback | null = null;
    const geo = {
        watchPosition: vi.fn((ok: PositionCallback, ko?: PositionErrorCallback | null) => {
            success = ok;
            failure = ko ?? null;
            return 7;
        }),
        clearWatch: vi.fn(),
        getCurrentPosition: vi.fn(),
    };
    const fix = (longitude: number, latitude: number) =>
        success?.({ coords: { longitude, latitude } } as GeolocationPosition);
    const fail = (code: number) =>
        failure?.({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "" } as GeolocationPositionError);
    return { geo: geo as unknown as Geolocation, raw: geo, fix, fail };
};

const fakeClock = () => {
    let tick: (() => void) | null = null;
    const clock = {
        setInterval: vi.fn((fn: () => void) => {
            tick = fn;
            return 1 as unknown as ReturnType<typeof setInterval>;
        }),
        clearInterval: vi.fn(),
    };
    return { clock: clock as any, raw: clock, tick: () => tick?.() };
};

const fakeNats = () => {
    const published: { subject: string; payload: any }[] = [];
    const nc = {
        publish: (subject: string, data: Uint8Array) =>
            published.push({ subject, payload: JSON.parse(new TextDecoder().decode(data)) }),
    } as unknown as NatsConnection;
    return { nc, published };
};

describe("ReadMobileGeolocation", () => {
    it("sends { timestamp, longitude, latitude } every period until the time is over", () => {
        const { geo, raw, fix } = fakeGeolocation();
        const { clock, raw: rawClock, tick } = fakeClock();
        const { nc, published } = fakeNats();
        const reading = vi.fn();
        const progress = vi.fn();

        ReadMobileGeolocation(nc, "dev2pdb_wt.Group_g1.Topic_t1", 15, 5, {
            setIsSensorReadings: reading, setReadingProgress: progress, onError: vi.fn(),
        }, geo, clock);

        expect(published).toHaveLength(0); // nothing until the first fix
        fix(-0.37, 39.47);
        expect(reading).toHaveBeenCalledWith(true);
        expect(rawClock.setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
        fix(-0.38, 39.48); // a newer position: the next tick sends it
        tick();
        tick();

        expect(published.map((p) => p.subject)).toEqual(Array(3).fill("dev2pdb_wt.Group_g1.Topic_t1"));
        expect(published[0].payload).toMatchObject({ longitude: -0.37, latitude: 39.47 });
        expect(published[2].payload).toMatchObject({ longitude: -0.38, latitude: 39.48 });
        expect(typeof published[0].payload.timestamp).toBe("string");
        expect(progress).toHaveBeenLastCalledWith(100);
        // 15 s / 5 s = 3 readings: then it stops by itself
        expect(raw.clearWatch).toHaveBeenCalledWith(7);
        expect(rawClock.clearInterval).toHaveBeenCalled();
        expect(reading).toHaveBeenLastCalledWith(false);
        tick();
        expect(published).toHaveLength(3);
    });

    it("says why when the browser refuses the location", () => {
        const { geo, raw, fail } = fakeGeolocation();
        const { nc, published } = fakeNats();
        const onError = vi.fn();
        ReadMobileGeolocation(nc, "s", 60, 5, { setIsSensorReadings: vi.fn(), setReadingProgress: vi.fn(), onError }, geo, fakeClock().clock);
        fail(1);
        expect(onError).toHaveBeenCalledWith(expect.stringContaining("permission denied"));
        expect(raw.clearWatch).toHaveBeenCalledWith(7);
        expect(published).toHaveLength(0);
    });

    it("stops when cancelled", () => {
        const { geo, raw, fix } = fakeGeolocation();
        const { clock, tick } = fakeClock();
        const { nc, published } = fakeNats();
        const r = ReadMobileGeolocation(nc, "s", 60, 5, { setIsSensorReadings: vi.fn(), setReadingProgress: vi.fn(), onError: vi.fn() }, geo, clock);
        fix(1, 2);
        r.stop();
        tick();
        expect(published).toHaveLength(1);
        expect(raw.clearWatch).toHaveBeenCalledWith(7);
    });

    it("reports a browser without geolocation", () => {
        const onError = vi.fn();
        ReadMobileGeolocation(fakeNats().nc, "s", 60, 5, { setIsSensorReadings: vi.fn(), setReadingProgress: vi.fn(), onError }, undefined);
        expect(onError).toHaveBeenCalledWith(expect.stringContaining("cannot give"));
    });
});
