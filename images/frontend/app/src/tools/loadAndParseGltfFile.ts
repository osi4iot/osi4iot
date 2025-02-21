import { GLTFLoader } from "three-stdlib";

export type ObjectMap = {
    nodes: { [name: string]: THREE.Object3D }
    materials: { [name: string]: THREE.Material }
    animations: THREE.AnimationClip[]
}

export const loadAndParseGltfFile = async (url: string):Promise<ObjectMap> => {
    const loader = new GLTFLoader();
    const data: ObjectMap = { nodes: {}, materials: {}, animations: [] };
    try {
        const gltf = await loader.loadAsync(url);
        const { scene, animations } = gltf;
        if (scene) {
            scene.traverse((obj: any) => {
                if (obj.name) data.nodes[obj.name] = obj
                if (obj.material && !data.materials[obj.material.name]) data.materials[obj.material.name] = obj.material
            })
        }
        if (animations.length !== 0) {
            data.animations = animations;
        }
    } catch (error) {
        throw new Error("Error loading GLTF file");
    }
    return data;
}