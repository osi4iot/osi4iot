// The sensors a 3D model points at: the objects of type "sensor" (extras.sensorRef) and the animations driven by a
// sensor (extras.clipSensorRef). admin_api links the twin to them, so that the viewer knows each sensor's topic.
import * as THREE from "three";

type GltfNode = { extras?: { type?: string; sensorRef?: string; clipSensorRef?: string } };

// from the JSON of a .gltf
export const getSensorsRefFromDigitalTwinGltfData = (digitalTwinGltfData: unknown): string[] => {
    const data = (typeof digitalTwinGltfData === "string" ? JSON.parse(digitalTwinGltfData) : digitalTwinGltfData) as {
        nodes?: GltfNode[];
    } | null;
    const sensorsRef: string[] = [];
    const add = (ref: unknown) => {
        if (typeof ref === "string" && ref && !sensorsRef.includes(ref)) sensorsRef.push(ref);
    };
    for (const node of data?.nodes ?? []) {
        if (!node?.extras) continue;
        if (node.extras.type === "sensor") add(node.extras.sensorRef);
        if (node.extras.clipSensorRef !== undefined) add(node.extras.clipSensorRef);
    }
    return sensorsRef;
};

// from a parsed scene (a .glb or a .gltf: the extras are the objects' userData)
export function getSensorsRef(object: THREE.Object3D | null | undefined): string[] {
    const sensorsRef: string[] = [];
    const add = (ref: unknown) => {
        if (typeof ref === "string" && ref && !sensorsRef.includes(ref)) sensorsRef.push(ref);
    };
    object?.traverse((node: THREE.Object3D) => {
        if (!node.name || !node.userData) return;
        if (node.userData.type === "sensor") add(node.userData.sensorRef);
        if (node.userData.clipSensorRef !== undefined) add(node.userData.clipSensorRef);
    });
    return sensorsRef;
}
