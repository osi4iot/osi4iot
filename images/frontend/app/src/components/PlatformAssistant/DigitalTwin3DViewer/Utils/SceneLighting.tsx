// Lighting of the 3D viewer inside the <Canvas>: tone mapping and exposure of the renderer, the environment
// (generated "neutral" studio or an HDR of the public folder), glass and liquid tweaks, and the
// post-processing (ambient occlusion and bloom). The lights themselves are in Stage.
import { FC, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Bloom, EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { environmentFile, toneMappingOf } from "./lighting";

const DEG = Math.PI / 180;

// Tone mapping and exposure: the Canvas only takes them when it is created. Changing the tone mapping makes
// three.js rebuild the materials' programs by itself (it is part of their cache key). With post-processing
// (effectsActive), EffectComposer sets NoToneMapping and its ToneMapping effect does it; when the effects are
// turned off, EffectComposer gives back the tone mapping it found, and this effect (it depends on
// effectsActive) sets the current one again.
export const RendererLighting: FC<{ toneMapping: string; exposure: number; effectsActive: boolean }> = ({
    toneMapping,
    exposure,
    effectsActive,
}) => {
    const gl = useThree((state) => state.gl);
    const invalidate = useThree((state) => state.invalidate);
    useLayoutEffect(() => {
        if (!effectsActive) gl.toneMapping = toneMappingOf(toneMapping).three;
        gl.toneMappingExposure = exposure;
        invalidate();
    }, [gl, toneMapping, exposure, effectsActive, invalidate]);
    return null;
};

// three's RoomEnvironment (a soft studio room) prefiltered once per renderer; as the background too, blurred
const NeutralEnvironment: FC<{ intensity: number; rotation: number; background: boolean; backgroundBlur: number }> = ({
    intensity,
    rotation,
    background,
    backgroundBlur,
}) => {
    const gl = useThree((state) => state.gl);
    const scene = useThree((state) => state.scene);
    const texture = useMemo(() => {
        const pmrem = new THREE.PMREMGenerator(gl);
        const room = new RoomEnvironment();
        const target = pmrem.fromScene(room, 0.04);
        room.traverse((o) => {
            const mesh = o as THREE.Mesh;
            mesh.geometry?.dispose();
            (mesh.material as THREE.Material | undefined)?.dispose?.();
        });
        pmrem.dispose();
        return target;
    }, [gl]);
    useEffect(() => () => texture.dispose(), [texture]);
    useLayoutEffect(() => {
        const previous = scene.environment;
        scene.environment = texture.texture;
        return () => {
            if (scene.environment === texture.texture) scene.environment = previous;
        };
    }, [scene, texture]);
    useLayoutEffect(() => {
        scene.environmentIntensity = intensity;
        scene.environmentRotation.set(0, rotation * DEG, 0);
    }, [scene, intensity, rotation]);
    useEffect(
        () => () => {
            scene.environmentIntensity = 1;
            scene.environmentRotation.set(0, 0, 0);
        },
        [scene],
    );
    useLayoutEffect(() => {
        if (!background) return;
        const previous = scene.background;
        scene.background = texture.texture;
        return () => {
            if (scene.background === texture.texture) scene.background = previous;
        };
    }, [scene, texture, background]);
    useLayoutEffect(() => {
        scene.backgroundBlurriness = backgroundBlur;
        scene.backgroundIntensity = intensity;
        scene.backgroundRotation.set(0, rotation * DEG, 0);
    }, [scene, backgroundBlur, intensity, rotation]);
    useEffect(
        () => () => {
            scene.backgroundBlurriness = 0;
            scene.backgroundIntensity = 1;
            scene.backgroundRotation.set(0, 0, 0);
        },
        [scene],
    );
    return null;
};

interface SceneEnvironmentProps {
    environment: string;
    intensity: number;
    rotation: number;
    background: boolean;
    backgroundBlur: number;
}

export const SceneEnvironment: FC<SceneEnvironmentProps> = ({ environment, intensity, rotation, background, backgroundBlur }) => {
    if (environment === "neutral")
        return (
            <NeutralEnvironment intensity={intensity} rotation={rotation} background={background} backgroundBlur={backgroundBlur} />
        );
    const file = environmentFile(environment);
    if (!file) return null;
    const euler = new THREE.Euler(0, rotation * DEG, 0);
    return (
        <Environment
            files={file}
            environmentIntensity={intensity}
            environmentRotation={euler}
            background={background}
            backgroundBlurriness={backgroundBlur}
            backgroundRotation={euler}
        />
    );
};

// Glass and liquids (materials with transmission): with thinGlass their thickness is 0 (a thin sheet: what is
// behind is not shifted); and they cast no shadow (a real glass lets the light through). The objects clone
// their materials when they change, so the check runs a few times per second, not only when the option changes.
export const GlassTweaks: FC<{ thinGlass: boolean }> = ({ thinGlass }) => {
    const scene = useThree((state) => state.scene);
    const frame = useRef(0);
    const apply = () => {
        scene.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            let transmissive = false;
            for (const m of materials as THREE.MeshPhysicalMaterial[]) {
                if (!m || !(m.transmission > 0)) continue;
                transmissive = true;
                if (m.userData.modelThickness === undefined) m.userData.modelThickness = m.thickness;
                const want = thinGlass ? 0 : m.userData.modelThickness;
                if (m.thickness !== want) m.thickness = want;
            }
            if (transmissive && mesh.castShadow) mesh.castShadow = false;
        });
    };
    useEffect(apply);
    useFrame(() => {
        frame.current = (frame.current + 1) % 20;
        if (frame.current === 0) apply();
    });
    return null;
};

interface SceneEffectsProps {
    ambientOcclusion: boolean;
    bloom: boolean;
    bloomIntensity: number;
    toneMapping: string;
    // the model's bounding radius: the occlusion radius follows the model's size
    radius: number;
}

// Post-processing only when an effect is on: with it, EffectComposer disables the renderer's tone mapping and
// the ToneMapping effect (last) does it, with the same mode. The exposure stays the renderer's.
export const SceneEffects: FC<SceneEffectsProps> = ({ ambientOcclusion, bloom, bloomIntensity, toneMapping, radius }) => {
    if (!ambientOcclusion && !bloom) return null;
    const aoRadius = Math.max(radius * 0.08, 1e-4);
    return (
        <EffectComposer multisampling={4}>
            <>
                {ambientOcclusion && (
                    <N8AO aoRadius={aoRadius} distanceFalloff={aoRadius * 0.5} intensity={2} halfRes quality="medium" />
                )}
                {bloom && <Bloom mipmapBlur intensity={bloomIntensity} luminanceThreshold={1} luminanceSmoothing={0.2} />}
                <ToneMapping mode={toneMappingOf(toneMapping).effect} />
            </>
        </EffectComposer>
    );
};
