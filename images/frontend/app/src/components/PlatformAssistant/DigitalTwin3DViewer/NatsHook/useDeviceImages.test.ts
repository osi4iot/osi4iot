import { describe, expect, it } from "vitest";
import { deviceImageSubjects } from "./useDeviceImages";

describe("device images", () => {
    it("finds the subjects of the device topics shown", () => {
        const data = [
            { topicId: 1, topicRef: "dev2dtm_1", natsSubject: "dev2dtm/Group_g/Topic_a", lastMeasurement: null },
            { topicId: 2, topicRef: "dev2dtm_2", natsSubject: "Warning: Topic with id: 2 not exists any more", lastMeasurement: null },
        ];
        expect(deviceImageSubjects(data, ["dev2dtm_1", "dev2dtm_2", "dev2dtm_9"])).toEqual([{ ref: "dev2dtm_1", subject: "dev2dtm.Group_g.Topic_a" }]);
    });
});
