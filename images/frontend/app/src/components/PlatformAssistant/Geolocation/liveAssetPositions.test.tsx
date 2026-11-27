import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { assetOfSubjects, positionOfMessage, withKeptPositions, withLivePositions } from "./liveAssetPositions";

const encoder = new TextEncoder();

// a NATS client whose subscriptions are fed by the test
const subscriptions: Record<string, { push: (text: string) => void; unsubscribe: () => void }> = {};
const fakeClient = {
    subscribe: (subject: string) => {
        const queue: { subject: string; data: Uint8Array }[] = [];
        let wake: (() => void) | null = null;
        let closed = false;
        subscriptions[subject] = {
            push: (text) => {
                queue.push({ subject, data: encoder.encode(text) });
                wake?.();
            },
            unsubscribe: () => {
                closed = true;
                wake?.();
            },
        };
        return {
            unsubscribe: () => subscriptions[subject].unsubscribe(),
            async *[Symbol.asyncIterator]() {
                while (!closed) {
                    if (queue.length) yield queue.shift()!;
                    else await new Promise<void>((r) => (wake = r));
                }
            },
        };
    },
};
vi.mock("../DigitalTwin3DViewer/Utils/customHooks", () => ({ useNatsConnection: () => ({ natsClient: fakeClient, connectionStatus: "Connected" }) }));

describe("live positions of the assets that move", () => {
    it("reads the position of a message of either geolocation sensor", () => {
        expect(positionOfMessage('{"timestamp":"x","latitude":41.38,"longitude":2.11}')).toEqual({ latitude: 41.38, longitude: 2.11 });
        expect(positionOfMessage('{"Latitude":"41.5","Longitude":"-3.2"}')).toEqual({ latitude: 41.5, longitude: -3.2 });
        expect(positionOfMessage('{"latitude":95,"longitude":0}')).toBeNull();
        expect(positionOfMessage('{"temperature":20}')).toBeNull();
        expect(positionOfMessage("not json")).toBeNull();
    });

    it("maps the subjects to their assets and moves only the assets with a live position", () => {
        expect(assetOfSubjects([{ assetUid: "a", natsSubjects: ["s1", "s2"] }, { assetUid: "b" }])).toEqual({ s1: "a", s2: "a" });
        const assets = [
            { assetUid: "a", latitude: 1, longitude: 2 },
            { assetUid: "b", latitude: 3, longitude: 4 },
        ];
        expect(withLivePositions(assets, {})).toBe(assets);
        expect(withLivePositions(assets, { a: { latitude: 5, longitude: 6 } })).toEqual([
            { assetUid: "a", latitude: 5, longitude: 6 },
            { assetUid: "b", latitude: 3, longitude: 4 },
        ]);
    });

    it("places the assets at the position kept in their state, live ones over it", () => {
        const assets = [
            { assetUid: "a", latitude: 1, longitude: 2 },
            { assetUid: "b", latitude: 3, longitude: 4 },
            { assetUid: "c", latitude: 5, longitude: 6 },
        ];
        const kept = withKeptPositions(assets, [
            { assetUid: "a", latitude: 10, longitude: 20 },
            { assetUid: "b", latitude: null, longitude: null },
        ]);
        expect(kept).toEqual([
            { assetUid: "a", latitude: 10, longitude: 20 },
            { assetUid: "b", latitude: 3, longitude: 4 },
            { assetUid: "c", latitude: 5, longitude: 6 },
        ]);
        expect(withKeptPositions(assets, [])).toBe(assets);
        expect(withLivePositions(kept, { a: { latitude: 11, longitude: 21 } })[0]).toEqual({ assetUid: "a", latitude: 11, longitude: 21 });
    });

    it("gives the positions that arrive by NATS, at most once a second", async () => {
        vi.useFakeTimers();
        const { default: LiveAssetPositions } = await import("./LiveAssetPositions");
        const onPositions = vi.fn();
        const view = render(<LiveAssetPositions assetOfSubject={{ "dev2pdb_wt.Group_g.Topic_t": "a" }} onPositions={onPositions} />);
        await act(async () => {
            subscriptions["dev2pdb_wt.Group_g.Topic_t"].push('{"latitude":41,"longitude":2}');
            subscriptions["dev2pdb_wt.Group_g.Topic_t"].push('{"humidity":3}');
            subscriptions["dev2pdb_wt.Group_g.Topic_t"].push('{"latitude":41.001,"longitude":2.001}');
            await Promise.resolve();
        });
        expect(onPositions).not.toHaveBeenCalled();
        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        expect(onPositions).toHaveBeenCalledTimes(1);
        expect(onPositions).toHaveBeenCalledWith({ a: { latitude: 41.001, longitude: 2.001 } });
        view.unmount();
        vi.useRealTimers();
    });
});
