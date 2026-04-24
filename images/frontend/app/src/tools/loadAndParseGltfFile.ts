import { GLTFLoader } from "three-stdlib";
import * as THREE from "three";

export type ObjectMap = {
    nodes: { [name: string]: THREE.Object3D };
    materials: { [name: string]: THREE.Material };
    animations: THREE.AnimationClip[];
    scene: THREE.Group;
};

export const loadAndParseGltfFile = async (url: string): Promise<ObjectMap> => {
    const loader = new GLTFLoader();
    const data: ObjectMap = {
        nodes: {},
        materials: {},
        animations: [],
        scene: new THREE.Group(),
    };
    try {
        const gltf = await loader.loadAsync(url);
        const { scene, animations } = gltf;

        data.scene = scene;
        data.animations = animations;

        if (scene) {
            scene.traverse((obj: any) => {
                if (obj.name) data.nodes[obj.name] = obj;
                if (obj.material && !data.materials[obj.material.name]) {
                    data.materials[obj.material.name] = obj.material;
                }
            });
        }

        Object.values(data.materials).forEach((material: any) => {
            if (material.map) {
                material.map.encoding = THREE.sRGBEncoding;
                material.map.needsUpdate = true;
            }
            if (material.emissiveMap) {
                material.emissiveMap.encoding = THREE.sRGBEncoding;
                material.emissiveMap.needsUpdate = true;
            }
            if (material.envMap) {
                material.envMap.encoding = THREE.sRGBEncoding;
                material.envMap.needsUpdate = true;
            }
            material.needsUpdate = true;
        });
    } catch (error) {
        throw new Error("Error loading GLTF file");
    }
    return data;
};
