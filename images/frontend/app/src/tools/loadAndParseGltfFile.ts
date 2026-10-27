import { parseGltf } from "./gltfLoader";
import * as THREE from "three";

export type ObjectMap = {
    nodes: { [name: string]: THREE.Object3D };
    materials: { [name: string]: THREE.Material };
    animations: THREE.AnimationClip[];
    scene: THREE.Group;
};

export const loadAndParseGltfFile = async (url: string): Promise<ObjectMap> => {
    const data: ObjectMap = {
        nodes: {},
        materials: {},
        animations: [],
        scene: new THREE.Group(),
    };
    try {
        const gltf = await parseGltf(url);
        const { scene, animations } = gltf;

        data.scene = scene;
        data.animations = animations;

        if (scene) {
            // Propiedades originales del glTF (alphaMode BLEND, alfa, emisivo) para que el visor
            // no las pierda al cambiar opacidad/transparencia/resaltado (changeMaterialPropRecursively).
            scene.traverse((obj: any) => {
                const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
                for (const material of materials) {
                    if (material.userData.gltfOriginal) continue;
                    material.userData.gltfOriginal = {
                        transparent: material.transparent,
                        depthWrite: material.depthWrite,
                        opacity: material.opacity,
                        emissive: material.emissive && material.emissive.getHex() !== 0 ? material.emissive.getHex() : null,
                    };
                }
            });
            // Todos los materiales, aunque compartan nombre o no lo tengan (antes se indexaban solo por
            // nombre y los repetidos/sin nombre se perdían: esos objetos recibían un material por defecto).
            const materialKeys = new Map<THREE.Material, string>();
            scene.traverse((obj: any) => {
                if (obj.name) data.nodes[obj.name] = obj;
                const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
                for (const material of materials) {
                    if (materialKeys.has(material)) continue;
                    let key = material.name || "material";
                    if (data.materials[key]) key = `${key}#${material.uuid}`;
                    materialKeys.set(material, key);
                    data.materials[key] = material;
                }
            });
        }

        Object.values(data.materials).forEach((material: any) => {
            if (material.map) {
                material.map.colorSpace = THREE.SRGBColorSpace;
                material.map.needsUpdate = true;
            }
            if (material.emissiveMap) {
                material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                material.emissiveMap.needsUpdate = true;
            }
            if (material.envMap) {
                material.envMap.colorSpace = THREE.SRGBColorSpace;
                material.envMap.needsUpdate = true;
            }
            material.needsUpdate = true;
        });
    } catch (error) {
        console.error("Error loading GLTF file:", error);
        throw new Error("Error loading GLTF file");
    }
    return data;
};
