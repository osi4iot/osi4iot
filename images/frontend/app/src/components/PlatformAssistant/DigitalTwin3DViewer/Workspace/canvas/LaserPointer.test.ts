import { describe, expect, it } from "vitest";
import { LASER_DECAY, livePoints } from "./LaserPointer";

describe("livePoints", () => {
    it("keeps the points of the trail younger than its decay", () => {
        const pts = [
            { x: 0, y: 0, t: 0 },
            { x: 1, y: 1, t: 500 },
            { x: 2, y: 2, t: 900 },
        ];
        expect(livePoints(pts, LASER_DECAY + 100)).toEqual(pts.slice(1));
        expect(livePoints(pts, 5000)).toEqual([]);
    });
});
