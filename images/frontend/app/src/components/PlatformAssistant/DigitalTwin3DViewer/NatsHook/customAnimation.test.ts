import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { updateCustomAnimationState } from "./useNatsSubcription";

// A model exported without OSI4IOT's properties (OC4.glb): the rotor node "rotate" has no animationType
const model = () => {
    const root = new THREE.Group();
    root.name = "assembly";
    const rotate = new THREE.Group();
    rotate.name = "rotate";
    rotate.position.set(0.001, 1.145, -0.2576);
    rotate.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.1); // its orientation in the glb
    const hub = new THREE.Group();
    hub.name = "Hub v23:1";
    rotate.add(hub);
    root.add(rotate);
    return { root: root as any, rotate: rotate as any };
};

describe("customAnimation", () => {
    it("moves a node named in the message, without animationType custom", () => {
        const { root, rotate } = model();
        root.customAnimationObjectNames = [];
        const ini = rotate.quaternion.clone();
        const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
        updateCustomAnimationState(root, { customAnimation: { rotate: { quaternion: turn.toArray() } } });
        expect(rotate.quaternion.angleTo(turn.clone().multiply(ini))).toBeLessThan(1e-9);
        // the next turn is from the glb's orientation, not from the last one
        const turn2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
        updateCustomAnimationState(root, { customAnimation: { rotate: { quaternion: turn2.toArray() } } });
        expect(rotate.quaternion.angleTo(turn2.clone().multiply(ini))).toBeLessThan(1e-9);
    });

    it("finds descendants, and ignores unknown names and bad entries", () => {
        const { root, rotate } = model();
        updateCustomAnimationState(root, { customAnimation: { "Hub v23:1": { position: [0, 0.1, 0] }, nothing: { position: [1, 1, 1] }, bad: null } });
        expect(rotate.children[0].position.y).toBeCloseTo(0.1);
        expect(() => updateCustomAnimationState(root, { customAnimation: null })).not.toThrow();
    });
});
