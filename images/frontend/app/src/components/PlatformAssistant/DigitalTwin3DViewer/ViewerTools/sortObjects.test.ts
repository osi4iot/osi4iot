import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { sortObjects } from "./ViewerUtils";

// Escena de prueba con la estructura que produce GLTFLoader (nombres ya saneados, materiales compartidos).
const buildScene = () => {
    const scene = new THREE.Group();
    scene.name = "Scene";
    const shared = new THREE.MeshStandardMaterial({ name: "Shared" });
    const makeMesh = (name: string, material: THREE.Material = shared) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
        mesh.name = name;
        return mesh;
    };
    // Dos objetos de primer nivel (grupos) cuyos hijos comparten material
    const groupA = new THREE.Group();
    groupA.name = "GroupA";
    groupA.add(makeMesh("PartA"));
    const groupB = new THREE.Group();
    groupB.name = "GroupB";
    const partB = makeMesh("PartB");
    groupB.add(partB);
    // Nodo animado por datos de la plataforma (no debe recibir clips sin declarar)
    const driven = makeMesh("Driven", new THREE.MeshStandardMaterial({ name: "DrivenMat" }));
    driven.userData = { animationType: "custom" };
    // Nodo con clip declarado al estilo Blender ("<Acción>" frente a "<Acción>_<Objeto>")
    const sparks = makeMesh("Sparks", new THREE.MeshStandardMaterial({ name: "SparksMat" }));
    sparks.userData = { type: "generic", animationType: "blenderEndless", clipName: "SparksAction" };
    scene.add(groupA, groupB, driven, sparks);

    const track = (node: string) => new THREE.VectorKeyframeTrack(`${node}.position`, [0, 1], [0, 0, 0, 1, 0, 0]);
    const animations = [
        // sin declarar, anima nodos de dos objetos y un nodo controlado por datos
        new THREE.AnimationClip("Unclaimed", 2, [track("PartA"), track("PartB"), track("Driven")]),
        new THREE.AnimationClip("SparksAction_Sparks", 1, [track("Sparks")]),
    ];
    const nodes: Record<string, THREE.Object3D> = {};
    const materials: Record<string, THREE.Material> = {};
    scene.traverse((o: any) => {
        nodes[o.name] = o;
        if (o.material) materials[o.material.name] = o.material;
    });
    return { scene, nodes, materials, animations, partB };
};

describe("sortObjects", () => {
    it("reproduce los clips sin declarar, repartidos por objeto y sin tocar los nodos controlados por datos", () => {
        const { scene, nodes, materials, animations } = buildScene();
        const { genericObjects } = sortObjects(nodes, materials as any, animations, scene);
        const byName = Object.fromEntries(genericObjects.map((o) => [o.node.name, o.node as any]));

        const clipA = byName.GroupA.animations[0] as THREE.AnimationClip;
        const clipB = byName.GroupB.animations[0] as THREE.AnimationClip;
        expect(clipA.tracks.map((t) => t.name)).toEqual(["PartA.position"]);
        expect(clipB.tracks.map((t) => t.name)).toEqual(["PartB.position"]);
        // misma duración que el clip original para que sigan sincronizados
        expect(clipA.duration).toBe(2);
        expect(byName.GroupA.blenderAnimationTypes).toContain("blenderEndless");
        expect(byName.Driven.animations).toEqual([]);
    });

    it("encuentra el clip declarado aunque Blender lo exporte como <Acción>_<Objeto>", () => {
        const { scene, nodes, materials, animations } = buildScene();
        const { genericObjects } = sortObjects(nodes, materials as any, animations, scene);
        const sparks = genericObjects.find((o) => o.node.name === "Sparks")!.node as any;
        expect(sparks.animations.map((c: THREE.AnimationClip) => c.name)).toEqual(["SparksAction_Sparks"]);
    });

    it("da a cada objeto sus propios materiales (resaltar uno no ilumina a los demás)", () => {
        const { scene, nodes, materials, animations, partB } = buildScene();
        const { genericObjects } = sortObjects(nodes, materials as any, animations, scene);
        const partA = genericObjects.find((o) => o.node.name === "GroupA")!.node.children[0] as THREE.Mesh;
        expect(partA.material).not.toBe(partB.material);
        ((partA.material as THREE.MeshStandardMaterial).emissive as THREE.Color).set(0x00ff00);
        expect((partB.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0);
    });
});
