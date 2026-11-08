import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
    fitDistance,
    orthoZoomForPerspectiveDistance,
    perspectiveDistanceForOrthoZoom,
    sanitizeCameraCommand,
    sendCameraCommand,
    subscribeCameraCommands,
    targetAlongView,
    viewPose,
} from "./cameraControl";

describe("camera commands", () => {
    it("keep only the valid fields", () => {
        expect(sanitizeCameraCommand(null)).toBeNull();
        expect(sanitizeCameraCommand([1, 2])).toBeNull();
        expect(sanitizeCameraCommand({ view: "sideways" })).toBeNull();
        expect(
            sanitizeCameraCommand({
                view: "top",
                position: [1, 2, "3"], // not a number: left out
                target: [0, 0, 0],
                quaternion: [0, 0, 0, 2], // normalized
                fov: 500, // clamped
                projection: "fisheye", // not a projection: left out
                transitionMs: -5, // clamped
                follow: true,
            }),
        ).toEqual({ view: "top", target: [0, 0, 0], quaternion: [0, 0, 0, 1], fov: 150, transitionMs: 0, follow: true });
        expect(sanitizeCameraCommand({ quaternion: [0, 0, 0, 0] })).toBeNull();
    });

    it("go to every subscriber, and invalid ones to none", () => {
        const a = vi.fn();
        const b = vi.fn();
        const offA = subscribeCameraCommands(a);
        const offB = subscribeCameraCommands(b);
        expect(sendCameraCommand({ view: "iso" })).toBe(true);
        expect(sendCameraCommand({ nothing: 1 })).toBe(false);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledWith({ view: "iso" });
        offA();
        sendCameraCommand({ view: "fit" });
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(2);
        offB();
    });
});

describe("camera views", () => {
    const center = new THREE.Vector3(1, 2, 3);
    const viewport = { width: 1600, height: 900 };

    it("look at the model's centre from each side, far enough to see it whole", () => {
        const front = viewPose("front", center, 2, 45, viewport);
        expect(front.target.toArray()).toEqual([1, 2, 3]);
        const dir = front.position.clone().sub(center).normalize();
        expect(dir.x).toBeCloseTo(0);
        expect(dir.z).toBeCloseTo(1);
        // the sphere fits in the vertical field of view (the narrower one in a wide viewport)
        const distance = front.position.distanceTo(center);
        expect(Math.asin(2 / distance)).toBeLessThan((45 * Math.PI) / 360 + 1e-9);
        const top = viewPose("top", center, 2, 45, viewport);
        expect(top.position.y).toBeGreaterThan(center.y);
        expect(top.up.toArray()).toEqual([0, 0, -1]);
        // the orthographic zoom shows the sphere within the smaller side
        expect(2 * 2 * front.orthoZoom).toBeLessThan(viewport.height);
    });

    it("fit keeps the direction", () => {
        const current = new THREE.Vector3(3, 0, 4);
        const fit = viewPose("fit", center, 1, 45, viewport, current);
        const dir = fit.position.clone().sub(center).normalize();
        expect(dir.x).toBeCloseTo(0.6);
        expect(dir.z).toBeCloseTo(0.8);
    });

    it("a narrow viewport frames with the horizontal field of view", () => {
        expect(fitDistance(1, 45, 0.5)).toBeGreaterThan(fitDistance(1, 45, 2));
    });

    it("orthographic and perspective show the same at the switch", () => {
        const height = 900;
        const distance = perspectiveDistanceForOrthoZoom(300, height, 45);
        expect(orthoZoomForPerspectiveDistance(distance, height, 45)).toBeCloseTo(300, 9);
        // half the visible height is the same
        expect(distance * Math.tan((45 * Math.PI) / 360)).toBeCloseTo(height / 2 / 300, 9);
    });

    it("the target of a pose is along its view, at the model's depth", () => {
        const position = new THREE.Vector3(0, 0, 10);
        const q = new THREE.Quaternion(); // looks along -Z
        expect(targetAlongView(position, q, new THREE.Vector3(2, 0, 0)).toArray()).toEqual([0, 0, 0]);
    });
});
