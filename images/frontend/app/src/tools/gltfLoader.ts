import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// Cargador glTF común de la plataforma. Usa el GLTFLoader oficial de la misma versión de three
// y soporta los modelos comprimidos que admite cualquier visor glTF de referencia:
// KHR_draco_mesh_compression, EXT_meshopt_compression y KHR_texture_basisu (KTX2).
// Los decodificadores los sirve el plugin "three-decoders" de vite.config.ts en /libs/.

const BASE_URL = import.meta.env.BASE_URL || "/";

let dracoLoader: DRACOLoader | null = null;
let ktx2Loader: KTX2Loader | null = null;

const getDracoLoader = () => {
    if (!dracoLoader) dracoLoader = new DRACOLoader().setDecoderPath(`${BASE_URL}libs/draco/`);
    return dracoLoader;
};

const getKtx2Loader = () => {
    if (!ktx2Loader) {
        ktx2Loader = new KTX2Loader().setTranscoderPath(`${BASE_URL}libs/basis/`);
        // detectSupport necesita un renderer para conocer los formatos comprimidos de la GPU.
        const renderer = new THREE.WebGLRenderer();
        ktx2Loader.detectSupport(renderer);
        renderer.dispose();
        renderer.forceContextLoss();
    }
    return ktx2Loader;
};

/** Extensiones declaradas por el modelo (GLB binario o glTF JSON). */
export const getGltfExtensionsUsed = (data: ArrayBuffer | string): string[] => {
    try {
        let json: any;
        if (typeof data === "string") {
            json = JSON.parse(data);
        } else {
            const view = new DataView(data);
            const isGlb = data.byteLength > 20 && view.getUint32(0, true) === 0x46546c67; // "glTF"
            if (!isGlb) {
                json = JSON.parse(new TextDecoder().decode(data));
            } else {
                const jsonLength = view.getUint32(12, true);
                json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength)));
            }
        }
        return Array.isArray(json?.extensionsUsed) ? json.extensionsUsed : [];
    } catch {
        return [];
    }
};

export const createGltfLoader = (extensionsUsed: string[] = []) => {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(getDracoLoader());
    loader.setMeshoptDecoder(MeshoptDecoder);
    if (extensionsUsed.includes("KHR_texture_basisu")) loader.setKTX2Loader(getKtx2Loader());
    return loader;
};

/** Lee y parsea un modelo glTF/GLB desde una URL (incluidas blob:) o desde sus datos. */
export const parseGltf = async (source: string | ArrayBuffer): Promise<GLTF> => {
    let data: ArrayBuffer | string;
    if (typeof source === "string" && /^(blob:|data:|https?:|\/)/.test(source)) {
        data = await (await fetch(source)).arrayBuffer();
    } else {
        data = source;
    }
    const loader = createGltfLoader(getGltfExtensionsUsed(data));
    return loader.parseAsync(data, "");
};
