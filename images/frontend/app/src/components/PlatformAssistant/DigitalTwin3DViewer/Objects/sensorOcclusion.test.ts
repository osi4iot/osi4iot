import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { findOccluder, isPointOccluded } from "./Sensors";

// A camera on +z looking at the origin, a sensor at the origin and a wall between them
const setup = () => {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const sensor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const wallMaterial = new THREE.MeshStandardMaterial();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2), wallMaterial);
    wall.position.set(0, 0, 3);
    scene.add(sensor, wall);
    scene.updateMatrixWorld(true);
    return { scene, camera, sensor, wall, wallMaterial };
};

describe("sensor markers behind objects", () => {
    it("a marker behind an opaque object is hidden, not by its own sensor", () => {
        const { scene, camera, sensor, wall, wallMaterial } = setup();
        const point = new THREE.Vector3(0, 0, 0);
        expect(isPointOccluded(point, camera, scene, sensor)).toBe(true);

        // the wall made transparent to see through it, or hidden: the marker is seen
        wallMaterial.transparent = true;
        wallMaterial.opacity = 0.3;
        expect(isPointOccluded(point, camera, scene, sensor)).toBe(false);
        wallMaterial.opacity = 1;
        wall.visible = false;
        expect(isPointOccluded(point, camera, scene, sensor)).toBe(false);
        wall.visible = true;

        // the sensor's own object never hides its marker; a marker beside the wall is seen
        expect(isPointOccluded(point, camera, new THREE.Scene().add(sensor), sensor)).toBe(false);
        expect(isPointOccluded(new THREE.Vector3(3, 3, 0), camera, scene, sensor)).toBe(false);
    });
});

describe("sensors on or inside other objects", () => {
    it("a sensor inside a column or an enclosing mesh keeps its marker; one behind another object does not", () => {
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 200);
        camera.position.set(0, 0, 50);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        // a small gauge at the axis of a column (radius 1), all inside a large dome
        const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial());
        const column = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 10), new THREE.MeshStandardMaterial());
        const dome = new THREE.Mesh(new THREE.SphereGeometry(30), new THREE.MeshStandardMaterial());
        scene.add(gauge, column, dome);
        scene.updateMatrixWorld(true);
        expect(findOccluder(new THREE.Vector3(0, 0, 0), camera, scene, gauge)).toBeNull();

        // another column in front of it hides it (also when its material is double sided)
        const other: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 10),
            new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
        );
        other.position.set(0, 0, 5);
        other.name = "front column";
        scene.add(other);
        scene.updateMatrixWorld(true);
        expect(findOccluder(new THREE.Vector3(0, 0, 0), camera, scene, gauge)?.name).toBe("front column");

        // a shadow catcher never hides anything
        other.material = new THREE.ShadowMaterial();
        expect(findOccluder(new THREE.Vector3(0, 0, 0), camera, scene, gauge)).toBeNull();
    });
});

describe("sensors on the surface of a column", () => {
    it("the gauges on the far side of the column are hidden, those in front are not", () => {
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 200);
        camera.position.set(0, 0, 50);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        // one mesh for the column and a wide base (its bounding box holds every gauge)
        const column = new THREE.Mesh(
            new THREE.CylinderGeometry(2, 2, 20, 48).translate(0, 5, 0),
            new THREE.MeshStandardMaterial(),
        );
        const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 2, 48).translate(0, -6, 0));
        column.add(base);
        column.name = "tower";
        const gauge = (y: number, z: number) => {
            const g = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.2), new THREE.MeshStandardMaterial());
            g.position.set(0, y, z);
            scene.add(g);
            return g;
        };
        const front = gauge(2, 2.15);
        const back = gauge(4, -2.15);
        scene.add(column);
        scene.updateMatrixWorld(true);
        expect(findOccluder(front.getWorldPosition(new THREE.Vector3()), camera, scene, front)).toBeNull();
        expect(findOccluder(back.getWorldPosition(new THREE.Vector3()), camera, scene, back)?.name).toBe("tower");
        // the materials keep their side after the check
        expect((column.material as THREE.Material).side).toBe(THREE.FrontSide);
    });
});