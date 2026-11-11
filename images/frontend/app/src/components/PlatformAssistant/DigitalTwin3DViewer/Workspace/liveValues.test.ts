import { describe, expect, it, vi } from "vitest";
import { createLiveValueStore, fieldPaths, fillPlaceholders, formatLiveValue, liveTopicRefs, placeholdersOf, topicRefsOf } from "./liveValues";

describe("live values of the NATS messages", () => {
    it("reads the placeholders of a text", () => {
        expect(placeholdersOf("rpm {{ dtm2sim.rotorRpm | 1 }} at {{dtm2sim.camera.position.0}}")).toEqual([
            { text: "{{ dtm2sim.rotorRpm | 1 }}", topicRef: "dtm2sim", path: ["rotorRpm"], decimals: 1 },
            { text: "{{dtm2sim.camera.position.0}}", topicRef: "dtm2sim", path: ["camera", "position", "0"], decimals: undefined },
        ]);
        expect(topicRefsOf(["{{dtm2sim.a}} {{dev2pdb_2.windSpeed}}", "{{dtm2sim.b}}", "{{nothing}}"])).toEqual(["dev2pdb_2", "dtm2sim"]);
    });

    it("fills a text with the last values", () => {
        const store = createLiveValueStore();
        const listener = vi.fn();
        store.subscribe("dtm2sim", listener);
        store.publish("dtm2sim", { rotorRpm: 12.3456, camera: { position: [1.5, 2, 3] }, ok: true, name: "OC4" });
        expect(listener).toHaveBeenCalledTimes(1);
        expect(fillPlaceholders("{{dtm2sim.rotorRpm|1}} rpm · x={{dtm2sim.camera.position.0}} · {{dtm2sim.ok}} {{dtm2sim.name}} · {{dtm2sim.none}} · {{dev2pdb_1.x}}", store.get)).toBe(
            "12.3 rpm · x=1.5 · true OC4 · – · –",
        );
        expect(formatLiveValue(0.000012)).toBe("1.200e-5");
        expect(formatLiveValue({ a: 1 })).toBe('{"a":1}');
    });

    it("lists the fields of a message and the topics a panel can name", () => {
        expect(fieldPaths({ rotorRpm: 1, camera: { position: [1, 2] }, "bad key": 3 })).toEqual(["rotorRpm", "camera.position.0", "camera.position.1"]);
        const data = [
            { topicId: 1, topicRef: "dtm2sim", natsSubject: "dtm2sim/a", lastMeasurement: null },
            { topicId: 2, topicRef: "llm2sim", natsSubject: "llm2sim/a", lastMeasurement: null },
            { topicId: 3, topicRef: "dev2pdb_1", natsSubject: "", lastMeasurement: null },
        ];
        expect(liveTopicRefs(data as any)).toEqual(["dtm2sim"]);
    });

    it("keeps the fields of every kind of message of a topic", () => {
        const store = createLiveValueStore();
        store.publish("dtm2sim", { rotorRpm: 10, camera: { position: [1, 2, 3] } });
        // a message of another kind (the view of the assistant): the fields seen before are still offered
        store.publish("dtm2sim", { camera: { view: "top" } });
        expect(store.fields("dtm2sim")).toEqual(["camera.view", "rotorRpm", "camera.position.0", "camera.position.1", "camera.position.2"]);
        expect(store.fields("nothing")).toEqual([]);
        // and their last values
        expect(store.get("dtm2sim")?.payload).toEqual({ rotorRpm: 10, camera: { position: [1, 2, 3], view: "top" } });
    });
});
