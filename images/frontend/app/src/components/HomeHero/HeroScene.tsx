// Escena 3D de la página de inicio: un aerogenerador real (izquierda) y su gemelo digital (derecha),
// sensores IoT que envían sus medidas por flujos de datos a un núcleo de IA y, de ahí, al gemelo, todo
// sobre una planta hexagonal (Industria 4.0).
//  - Arrastrar: girar la cámara.
//  - Clic en el aerogenerador: ráfaga de viento. El rotor se acelera, los sensores lo detectan, los datos
//    viajan al núcleo de IA y el gemelo reproduce el movimiento con un pequeño retardo de sincronización.
//  - Pasar el ratón por un sensor: muestra su medida.
//  - Los conceptos (Digital twins, IoT, Industry 4.0, AI) resaltan su parte de la escena (heroState).
import { FC, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Sparkles } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import styled from "styled-components";
import { Concept, conceptColor, useHeroStore } from "./heroState";

const PHYS = new THREE.Vector3(-2.5, 0, 0);
const TWIN = new THREE.Vector3(2.5, 0, 0);
const AI = new THREE.Vector3(0, 4.6, -1.4);
const HUB_HEIGHT = 3.72;
const BASE_SPEED = 0.9; // rad/s del rotor sin ráfagas
const TWIN_DELAY = 0.3; // s de retardo del gemelo (latencia de sincronización)

const C = {
    twin: new THREE.Color(conceptColor("twin")),
    iot: new THREE.Color(conceptColor("iot")),
    industry: new THREE.Color(conceptColor("industry")),
    ai: new THREE.Color(conceptColor("ai")),
    fem: new THREE.Color(conceptColor("fem")),
};

// Escala de colores de los resultados FEM (azul = poca tensión, rojo = mucha), como en el visor 3D
const femColor = (value: number, target: THREE.Color) =>
    target.setHSL(0.66 * (1 - Math.min(1, Math.max(0, value))), 1, 0.52);

// Tensión de von Mises máxima mostrada en la leyenda (MPa)
const femMaxStress = (sim: Sim) => 40 + 180 * sim.load;

// Factor de exageración de la deformación (como en el visor: mayor al resaltar "FEM results")
const femExaggeration = (sim: Sim) => 1 + 3.2 * Math.max(0, sim.level.fem - 1);

// ---------------------------------------------------------------------------------------------------
// Simulación compartida (objeto mutable: se actualiza en cada fotograma sin volver a renderizar React)
// ---------------------------------------------------------------------------------------------------
interface Sim {
    time: number;
    gust: number; // 0..1, intensidad de la ráfaga actual
    load: number; // 0..1, carga del viento sobre el aerogenerador (resultados FEM)
    gustStart: number;
    speed: number;
    angle: number;
    twinAngle: number;
    history: { t: number; angle: number }[];
    ripples: { t: number; origin: THREE.Vector3; color: THREE.Color }[];
    aiPulse: number;
    twinFlash: number;
    level: Record<Concept, number>; // resalte de cada concepto (0.3 atenuado, 1 normal, 1.7 resaltado)
}

const newSim = (): Sim => ({
    time: 0,
    gust: 0,
    gustStart: -100,
    speed: BASE_SPEED,
    angle: 0,
    twinAngle: 0,
    history: [],
    ripples: [],
    aiPulse: 0,
    twinFlash: 0,
    load: 0.22,
    level: { twin: 1, iot: 1, industry: 1, ai: 1, fem: 1 },
});

const smoothstep = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

const Simulation: FC<{ sim: Sim }> = ({ sim }) => {
    const gustRequested = useHeroStore((s) => s.gustRequested);
    const lastGust = useRef(gustRequested);
    const nextIdleRipple = useRef(2);
    const invalidate = useThree((state) => state.invalidate);
    // con "reducir movimiento" la escena solo se dibuja a demanda: una ráfaga se anima igualmente
    useEffect(() => invalidate(), [gustRequested, invalidate]);

    useFrame((_, rawDelta) => {
        const dt = Math.min(rawDelta, 0.05);
        sim.time += dt;
        const t = sim.time;

        if (lastGust.current !== gustRequested) {
            lastGust.current = gustRequested;
            sim.gustStart = t;
            sim.ripples.push({ t, origin: PHYS.clone(), color: C.industry });
            nextIdleRipple.current = t + 9;
        }
        const since = t - sim.gustStart;
        sim.gust = since < 0 ? 0 : smoothstep(0, 0.35, since) * Math.exp(-Math.max(0, since - 0.35) / 1.8);
        if (since < 7) invalidate();
        // los datos llegan al núcleo de IA y, después, al gemelo
        if (since > 0.6 && since < 0.6 + dt * 1.5) sim.aiPulse = 1;
        if (since > 1.0 && since < 1.0 + dt * 1.5) {
            sim.twinFlash = 1;
            sim.ripples.push({ t, origin: TWIN.clone(), color: C.twin });
        }
        if (t > nextIdleRipple.current) {
            sim.ripples.push({ t, origin: new THREE.Vector3(0, 0, 0), color: C.industry });
            nextIdleRipple.current = t + 7;
        }
        sim.ripples = sim.ripples.filter((r) => t - r.t < 6);
        sim.load = 0.22 + 0.78 * sim.gust + 0.03 * Math.sin(t * 1.7) * Math.sin(t * 0.63);
        sim.aiPulse *= Math.exp(-dt * 2.2);
        sim.twinFlash *= Math.exp(-dt * 2.5);

        const target = BASE_SPEED + 5.5 * sim.gust;
        sim.speed += (target - sim.speed) * Math.min(1, dt * 2.5);
        sim.angle += sim.speed * dt;
        sim.history.push({ t, angle: sim.angle });
        while (sim.history.length > 2 && sim.history[1].t < t - TWIN_DELAY) sim.history.shift();
        sim.twinAngle = sim.history[0].angle;

        const focus = useHeroStore.getState().focus;
        (Object.keys(sim.level) as Concept[]).forEach((key) => {
            const goal = focus === null ? 1 : focus === key ? 1.7 : 0.3;
            sim.level[key] += (goal - sim.level[key]) * Math.min(1, dt * 4);
        });
    }, -1);
    return null;
};

// ---------------------------------------------------------------------------------------------------
// Aerogenerador (real y gemelo)
// ---------------------------------------------------------------------------------------------------
const useTurbineGeometries = () =>
    useMemo(() => {
        const tower = new THREE.CylinderGeometry(0.08, 0.2, HUB_HEIGHT, 28, 14, true);
        tower.translate(0, HUB_HEIGHT / 2, 0);
        const nacelle = new THREE.CapsuleGeometry(0.17, 0.62, 6, 18);
        nacelle.rotateX(Math.PI / 2);
        nacelle.translate(0, HUB_HEIGHT + 0.02, -0.08);
        const hub = new THREE.SphereGeometry(0.15, 24, 16);
        hub.scale(1, 1, 1.4);
        const blade = new THREE.BoxGeometry(0.16, 1.85, 0.035, 1, 12, 1);
        blade.translate(0, 0.98, 0);
        // pala afilada y ligeramente torsionada
        const pos = blade.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const y = pos.getY(i);
            const k = y / 1.9;
            const taper = 1 - 0.72 * k;
            const twist = 0.35 * k;
            const x = pos.getX(i) * taper;
            const z = pos.getZ(i);
            pos.setXYZ(i, x * Math.cos(twist) - z * Math.sin(twist), y, x * Math.sin(twist) + z * Math.cos(twist));
        }
        blade.computeVertexNormals();
        const pad = new THREE.CylinderGeometry(0.55, 0.62, 0.12, 6);
        pad.translate(0, 0.06, 0);

        // Resultados FEM: la torre y las palas con un color por vértice. La torre FEM comparte posiciones
        // con la torre (se deforman a la vez); se guardan las posiciones sin deformar.
        const towerRest = (tower.attributes.position.array as Float32Array).slice();
        const femTower = new THREE.BufferGeometry();
        femTower.setIndex(tower.index);
        femTower.setAttribute("position", tower.attributes.position);
        femTower.setAttribute(
            "color",
            new THREE.BufferAttribute(new Float32Array(tower.attributes.position.count * 3), 3),
        );
        const femBlade = blade.clone();
        femBlade.setAttribute(
            "color",
            new THREE.BufferAttribute(new Float32Array(blade.attributes.position.count * 3), 3),
        );
        // tensión relativa de cada vértice de la torre: momento flector / módulo resistente de la sección,
        // mayor en la cara de barlovento y sotavento (z) que en los costados
        const towerStress = new Float32Array(tower.attributes.position.count);
        let maxStress = 0;
        for (let i = 0; i < towerStress.length; i++) {
            const x = towerRest[i * 3];
            const y = towerRest[i * 3 + 1];
            const z = towerRest[i * 3 + 2];
            const radius = THREE.MathUtils.lerp(0.2, 0.08, y / HUB_HEIGHT);
            const side = Math.abs(z) / Math.max(1e-6, Math.hypot(x, z));
            towerStress[i] = ((HUB_HEIGHT - y) / radius ** 3) * (0.5 + 0.5 * side);
            maxStress = Math.max(maxStress, towerStress[i]);
        }
        towerStress.forEach((s, i) => (towerStress[i] = s / maxStress));
        const bladeStress = new Float32Array(blade.attributes.position.count);
        for (let i = 0; i < bladeStress.length; i++)
            bladeStress[i] = (1 - blade.attributes.position.getY(i) / 1.9) ** 2;
        return { tower, nacelle, hub, blade, pad, towerRest, femTower, femBlade, towerStress, bladeStress };
    }, []);

interface TurbineProps {
    sim: Sim;
    variant: "physical" | "twin";
    position: THREE.Vector3;
}

const Turbine: FC<TurbineProps> = ({ sim, variant, position }) => {
    const geo = useTurbineGeometries();
    const rotor = useRef<THREE.Group>(null);
    const top = useRef<THREE.Group>(null);
    const scan = useRef<THREE.Mesh>(null);
    const femMaterial = useMemo(
        () =>
            new THREE.MeshBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
                toneMapped: false,
            }),
        [],
    );
    const femTmp = useMemo(() => new THREE.Color(), []);
    const requestGust = useHeroStore((s) => s.requestGust);
    const isTwin = variant === "twin";

    const materials = useMemo(() => {
        if (isTwin) {
            const wire = new THREE.MeshBasicMaterial({
                color: C.twin,
                wireframe: true,
                transparent: true,
                opacity: 0.55,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });
            const glow = new THREE.MeshBasicMaterial({
                color: C.twin,
                transparent: true,
                opacity: 0.08,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            return { body: wire, shell: glow, blade: wire, pad: wire };
        }
        const body = new THREE.MeshStandardMaterial({
            color: "#e4e8ee",
            metalness: 0.45,
            roughness: 0.32,
            side: THREE.DoubleSide,
        });
        const blade = new THREE.MeshStandardMaterial({ color: "#f4f6f9", metalness: 0.2, roughness: 0.4 });
        const pad = new THREE.MeshStandardMaterial({ color: "#2a3342", metalness: 0.6, roughness: 0.5 });
        return { body, shell: null, blade, pad };
    }, [isTwin]);

    useFrame(() => {
        if (rotor.current) rotor.current.rotation.z = -(isTwin ? sim.twinAngle : sim.angle);

        // deformación de la torre por el empuje del viento (el viento llega de frente, empuja hacia -z);
        // el gemelo la muestra exagerada, como el visor de resultados FEM
        const bend = sim.load * (isTwin ? 0.16 * femExaggeration(sim) : 0.05);
        const positions = geo.tower.attributes.position as THREE.BufferAttribute;
        const rest = geo.towerRest;
        for (let i = 0; i < positions.count; i++) {
            const h = rest[i * 3 + 1] / HUB_HEIGHT;
            positions.setZ(i, rest[i * 3 + 2] - bend * h * h);
        }
        positions.needsUpdate = true;
        if (top.current) {
            top.current.position.z = -bend;
            top.current.rotation.x = (2 * bend) / HUB_HEIGHT;
        }

        if (isTwin) {
            const fem = sim.level.fem;
            femMaterial.opacity = 0.32 * Math.min(1, fem) + 0.6 * Math.max(0, (fem - 1) / 0.7);
            const colors = geo.femTower.attributes.color as THREE.BufferAttribute;
            for (let i = 0; i < colors.count; i++) {
                femColor(sim.load * geo.towerStress[i], femTmp);
                colors.setXYZ(i, femTmp.r, femTmp.g, femTmp.b);
            }
            colors.needsUpdate = true;
            const bladeColors = geo.femBlade.attributes.color as THREE.BufferAttribute;
            const spin = sim.speed / (BASE_SPEED + 5.5);
            for (let i = 0; i < bladeColors.count; i++) {
                femColor((0.25 + 0.75 * Math.max(sim.load, spin)) * geo.bladeStress[i], femTmp);
                bladeColors.setXYZ(i, femTmp.r, femTmp.g, femTmp.b);
            }
            bladeColors.needsUpdate = true;
        }
        if (isTwin) {
            const level = sim.level.twin;
            const flash = sim.twinFlash;
            (materials.body as THREE.MeshBasicMaterial).opacity = Math.min(1, 0.45 * level + 0.5 * flash);
            if (materials.shell) materials.shell.opacity = 0.06 * level + 0.25 * flash;
            if (scan.current) {
                scan.current.position.y = 0.2 + (Math.sin(sim.time * 0.9) * 0.5 + 0.5) * (HUB_HEIGHT - 0.2);
                (scan.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * level;
            }
        } else {
            const level = sim.level.industry;
            (materials.body as THREE.MeshStandardMaterial).emissive.setRGB(0.05, 0.08, 0.14).multiplyScalar(level);
        }
    });

    const onClick = (event: ThreeEvent<MouseEvent>) => {
        if (isTwin) return;
        event.stopPropagation();
        requestGust();
    };
    const setCursor = (value: string) => () => {
        if (!isTwin) document.body.style.cursor = value;
    };

    return (
        <group
            position={position}
            onClick={onClick}
            onPointerOver={setCursor("pointer")}
            onPointerOut={setCursor("auto")}
        >
            <mesh geometry={geo.pad} material={materials.pad} />
            <mesh geometry={geo.tower} material={materials.body} />
            {materials.shell && <mesh geometry={geo.tower} material={materials.shell} />}
            {isTwin && <mesh geometry={geo.femTower} material={femMaterial} />}
            {/* góndola y rotor siguen la punta de la torre deformada (giro alrededor de su base) */}
            <group ref={top}>
                <mesh geometry={geo.nacelle} material={materials.body} />
                <group ref={rotor} position={[0, HUB_HEIGHT + 0.02, 0.36]}>
                    <mesh geometry={geo.hub} material={materials.body} />
                    {[0, 1, 2].map((i) => (
                        <group key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]}>
                            <mesh geometry={geo.blade} material={materials.blade} />
                            {isTwin && <mesh geometry={geo.femBlade} material={femMaterial} />}
                        </group>
                    ))}
                </group>
            </group>
            {isTwin && (
                <mesh ref={scan} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.3, 0.36, 48]} />
                    <meshBasicMaterial
                        color={C.twin}
                        transparent
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                        side={THREE.DoubleSide}
                    />
                </mesh>
            )}
        </group>
    );
};

// ---------------------------------------------------------------------------------------------------
// Planta hexagonal (Industria 4.0) con ondas
// ---------------------------------------------------------------------------------------------------
const HEX = 0.52;
const FLOOR_RADIUS = 9;

const HexFloor: FC<{ sim: Sim }> = ({ sim }) => {
    const cells = useMemo(() => {
        const out: THREE.Vector3[] = [];
        const R = 11;
        for (let q = -R; q <= R; q++) {
            for (let r = -R; r <= R; r++) {
                if (Math.abs(q + r) > R) continue;
                const x = HEX * Math.sqrt(3) * (q + r / 2);
                const z = HEX * 1.5 * r;
                if (Math.hypot(x, z) < FLOOR_RADIUS) out.push(new THREE.Vector3(x, 0, z));
            }
        }
        return out;
    }, []);
    const tiles = useRef<THREE.InstancedMesh>(null);
    const lines = useRef<THREE.InstancedMesh>(null);
    const color = useMemo(() => new THREE.Color(), []);
    // contorno de cada hexágono, tumbado sobre el suelo (RingGeometry se crea en el plano XY)
    const ringGeometry = useMemo(
        () => new THREE.RingGeometry(HEX * 0.86, HEX * 0.94, 6, 1, Math.PI / 2).rotateX(-Math.PI / 2),
        [],
    );

    // antes del primer fotograma: con instanceColor ya creado el material se compila con colores por instancia
    useLayoutEffect(() => {
        const m = new THREE.Matrix4();
        cells.forEach((p, i) => {
            m.makeTranslation(p.x, -0.04, p.z);
            tiles.current!.setMatrixAt(i, m);
            m.makeTranslation(p.x, 0.003, p.z);
            lines.current!.setMatrixAt(i, m);
            lines.current!.setColorAt(i, color.setRGB(0, 0, 0));
        });
        tiles.current!.instanceMatrix.needsUpdate = true;
        lines.current!.instanceMatrix.needsUpdate = true;
    }, [cells, color]);

    useFrame(() => {
        const mesh = lines.current;
        if (!mesh) return;
        const t = sim.time;
        const level = sim.level.industry;
        cells.forEach((p, i) => {
            const fade = 1 - smoothstep(FLOOR_RADIUS * 0.45, FLOOR_RADIUS, Math.hypot(p.x, p.z));
            let r = 0.035 * level;
            let g = 0.065 * level;
            let b = 0.13 * level;
            for (const ripple of sim.ripples) {
                const age = t - ripple.t;
                const d = Math.hypot(p.x - ripple.origin.x, p.z - ripple.origin.z);
                const front = age * 3.2;
                const k = Math.exp(-((d - front) ** 2) / 0.35) * Math.exp(-age * 0.55) * 1.8;
                r += ripple.color.r * k;
                g += ripple.color.g * k;
                b += ripple.color.b * k;
            }
            mesh.setColorAt(i, color.setRGB(r * fade, g * fade, b * fade));
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    return (
        <group>
            <instancedMesh ref={tiles} args={[undefined, undefined, cells.length]} receiveShadow>
                <cylinderGeometry args={[HEX * 0.95, HEX * 0.95, 0.08, 6]} />
                <meshStandardMaterial color="#121822" metalness={0.5} roughness={0.65} />
            </instancedMesh>
            <instancedMesh ref={lines} args={[ringGeometry, undefined, cells.length]}>
                <meshBasicMaterial
                    transparent
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                    toneMapped={false}
                />
            </instancedMesh>
        </group>
    );
};

// ---------------------------------------------------------------------------------------------------
// Sensores IoT
// ---------------------------------------------------------------------------------------------------
interface SensorDef {
    name: string;
    unit: string;
    local: THREE.Vector3;
    value: (sim: Sim) => number;
    digits: number;
}

const noise = (t: number, seed: number) => Math.sin(t * 2.3 + seed) * 0.5 + Math.sin(t * 5.7 + seed * 2.1) * 0.25;

const SENSORS: SensorDef[] = [
    {
        name: "Rotor speed",
        unit: "rpm",
        local: new THREE.Vector3(0, HUB_HEIGHT + 0.02, 0.62),
        value: (sim) => (sim.speed * 60) / (2 * Math.PI),
        digits: 1,
    },
    {
        name: "Nacelle temperature",
        unit: "°C",
        local: new THREE.Vector3(0, HUB_HEIGHT + 0.22, -0.3),
        value: (sim) => 41.5 + 7 * sim.gust + 0.4 * noise(sim.time, 1),
        digits: 1,
    },
    {
        name: "Tower vibration",
        unit: "mm/s",
        local: new THREE.Vector3(0.15, 2.1, 0.06),
        value: (sim) => 1.2 + 4.5 * sim.gust + 0.25 * noise(sim.time * 3, 2),
        digits: 2,
    },
    {
        name: "Power output",
        unit: "kW",
        local: new THREE.Vector3(0.36, 0.3, 0.32),
        value: (sim) => Math.min(2000, 420 * (sim.speed / BASE_SPEED) ** 1.5) + 8 * noise(sim.time, 3),
        digits: 0,
    },
];

const sensorWorld = (i: number, base: THREE.Vector3) => SENSORS[i].local.clone().add(base);

const LabelBox = styled.div<{ $color: string; $visible: boolean }>`
    pointer-events: none;
    opacity: ${({ $visible }) => ($visible ? 1 : 0)};
    transition: opacity 0.2s ease;
    white-space: nowrap;
    transform: translate(14px, -50%);
    padding: 6px 10px;
    border-radius: 10px;
    background: rgba(9, 13, 20, 0.82);
    border: 1px solid ${({ $color }) => $color}66;
    color: #e8edf3;
    font:
        500 12px Roboto,
        "Helvetica Neue",
        Arial,
        sans-serif;
    backdrop-filter: blur(6px);

    b {
        display: block;
        font:
            650 15px "Archivo Variable",
            Roboto,
            sans-serif;
        font-stretch: 110%;
        color: ${({ $color }) => $color};
    }
`;

const Sensor: FC<{ sim: Sim; index: number }> = ({ sim, index }) => {
    const def = SENSORS[index];
    const halo = useRef<THREE.Mesh>(null);
    const core = useRef<THREE.MeshBasicMaterial>(null);
    const hovered = useHeroStore((s) => s.hoveredSensor === index);
    const setHovered = useHeroStore((s) => s.setHoveredSensor);
    const position = useMemo(() => sensorWorld(index, PHYS), [index]);

    useFrame(({ camera }) => {
        const t = sim.time;
        const level = sim.level.iot;
        const beat = (t * 1.3 + index * 0.37) % 1;
        if (halo.current) {
            halo.current.quaternion.copy(camera.quaternion);
            const s = 1 + beat * (1.8 + 2 * sim.gust);
            halo.current.scale.setScalar(s);
            (halo.current.material as THREE.MeshBasicMaterial).opacity = (1 - beat) * 0.7 * level;
        }
        if (core.current) core.current.color.copy(C.iot).multiplyScalar(1.2 + level + (hovered ? 1.5 : 0));
    });

    return (
        <group position={position}>
            <mesh
                onPointerOver={(e) => {
                    e.stopPropagation();
                    setHovered(index);
                    document.body.style.cursor = "pointer";
                }}
                onPointerOut={() => {
                    setHovered(null);
                    document.body.style.cursor = "auto";
                }}
            >
                <sphereGeometry args={[0.13, 12, 12]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh>
                <sphereGeometry args={[0.055, 16, 12]} />
                <meshBasicMaterial ref={core} toneMapped={false} />
            </mesh>
            <mesh ref={halo}>
                <ringGeometry args={[0.07, 0.085, 32]} />
                <meshBasicMaterial
                    color={C.iot}
                    transparent
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
};

// ---------------------------------------------------------------------------------------------------
// Flujos de datos: sensor -> núcleo de IA -> gemelo
// ---------------------------------------------------------------------------------------------------
const PARTICLES_PER_CURVE = 7;

const arc = (from: THREE.Vector3, to: THREE.Vector3, lift: number) => {
    const mid = from.clone().lerp(to, 0.5);
    mid.y += lift;
    mid.z += 0.8;
    return new THREE.QuadraticBezierCurve3(from, mid, to);
};

const DataFlows: FC<{ sim: Sim }> = ({ sim }) => {
    const curves = useMemo(
        () =>
            SENSORS.flatMap((_, i) => [
                { curve: arc(sensorWorld(i, PHYS), AI, 1.1 - i * 0.15), kind: "up" as const, seed: i * 0.21 },
                { curve: arc(AI, sensorWorld(i, TWIN), 0.9 - i * 0.12), kind: "down" as const, seed: i * 0.33 },
            ]),
        [],
    );
    const lineGeometries = useMemo(
        () => curves.map(({ curve }) => new THREE.BufferGeometry().setFromPoints(curve.getPoints(64))),
        [curves],
    );
    const upLine = useMemo(
        () =>
            new THREE.LineBasicMaterial({
                color: C.iot,
                transparent: true,
                opacity: 0.2,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }),
        [],
    );
    const downLine = useMemo(
        () =>
            new THREE.LineBasicMaterial({
                color: C.twin,
                transparent: true,
                opacity: 0.2,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }),
        [],
    );
    const lineObjects = useMemo(
        () => lineGeometries.map((g, i) => new THREE.Line(g, curves[i].kind === "up" ? upLine : downLine)),
        [lineGeometries, curves, upLine, downLine],
    );
    const particles = useRef<THREE.InstancedMesh>(null);
    const count = curves.length * PARTICLES_PER_CURVE;
    const tmp = useMemo(
        () => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), c: new THREE.Color(), phase: { up: 0, down: 0 } }),
        [],
    );
    useLayoutEffect(() => {
        for (let i = 0; i < count; i++) particles.current!.setColorAt(i, tmp.c.setRGB(0, 0, 0));
    }, [count, tmp]);

    useFrame((_, rawDelta) => {
        const dt = Math.min(rawDelta, 0.05);
        const mesh = particles.current;
        if (!mesh) return;
        const speed = 0.22 * (1 + 3 * sim.gust);
        tmp.phase.up += dt * speed;
        tmp.phase.down += dt * speed;
        upLine.opacity = 0.14 * sim.level.iot * (1 + 2 * sim.gust);
        downLine.opacity = 0.14 * sim.level.twin * (1 + 2 * sim.gust);
        let n = 0;
        curves.forEach(({ curve, kind, seed }) => {
            const level =
                kind === "up"
                    ? Math.max(sim.level.iot, sim.level.ai * 0.8)
                    : Math.max(sim.level.twin, sim.level.ai * 0.8);
            for (let k = 0; k < PARTICLES_PER_CURVE; k++) {
                const t = (tmp.phase[kind] + seed + k / PARTICLES_PER_CURVE) % 1;
                curve.getPoint(t, tmp.p);
                const size = 0.02 + 0.022 * Math.sin(Math.PI * t) * (1 + 0.8 * sim.gust);
                tmp.m.makeScale(size, size, size).setPosition(tmp.p);
                mesh.setMatrixAt(n, tmp.m);
                mesh.setColorAt(
                    n,
                    tmp.c
                        .copy(kind === "up" ? C.iot : C.twin)
                        .multiplyScalar(1.4 * level * (0.5 + Math.sin(Math.PI * t))),
                );
                n++;
            }
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    return (
        <group>
            {lineObjects.map((line, i) => (
                <primitive key={i} object={line} />
            ))}
            <instancedMesh ref={particles} args={[undefined, undefined, count]}>
                <sphereGeometry args={[1, 10, 8]} />
                <meshBasicMaterial toneMapped={false} />
            </instancedMesh>
        </group>
    );
};

// ---------------------------------------------------------------------------------------------------
// Núcleo de IA: red neuronal en una esfera
// ---------------------------------------------------------------------------------------------------
const AiCore: FC<{ sim: Sim }> = ({ sim }) => {
    const { nodes, edges } = useMemo(() => {
        const N = 64;
        const pts: THREE.Vector3[] = [];
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < N; i++) {
            const y = 1 - (i / (N - 1)) * 2;
            const r = Math.sqrt(1 - y * y);
            const th = golden * i;
            const jitter = 0.82 + (((i * 7919) % 100) / 100) * 0.3;
            pts.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).multiplyScalar(0.85 * jitter));
        }
        const seg: number[] = [];
        const seen = new Set<string>();
        pts.forEach((p, i) => {
            pts.map((q, j) => ({ j, d: p.distanceToSquared(q) }))
                .filter(({ j }) => j !== i)
                .sort((a, b) => a.d - b.d)
                .slice(0, 3)
                .forEach(({ j }) => {
                    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    seg.push(p.x, p.y, p.z, pts[j].x, pts[j].y, pts[j].z);
                });
        });
        const edgeGeometry = new THREE.BufferGeometry();
        edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
        return { nodes: pts, edges: edgeGeometry };
    }, []);
    const group = useRef<THREE.Group>(null);
    const nodeMesh = useRef<THREE.InstancedMesh>(null);
    const edgeMaterial = useRef<THREE.LineBasicMaterial>(null);
    const shell = useRef<THREE.MeshBasicMaterial>(null);
    const tmp = useMemo(() => ({ m: new THREE.Matrix4(), c: new THREE.Color() }), []);
    useLayoutEffect(() => {
        nodes.forEach((_, i) => nodeMesh.current!.setColorAt(i, tmp.c.setRGB(0, 0, 0)));
    }, [nodes, tmp]);

    useFrame((_, rawDelta) => {
        const dt = Math.min(rawDelta, 0.05);
        const level = sim.level.ai;
        const pulse = sim.aiPulse;
        if (group.current) {
            group.current.rotation.y += dt * (0.25 + 1.2 * pulse);
            group.current.rotation.x = Math.sin(sim.time * 0.3) * 0.2;
            group.current.scale.setScalar(1 + 0.18 * pulse);
        }
        if (edgeMaterial.current) edgeMaterial.current.opacity = Math.min(1, 0.22 * level + 0.5 * pulse);
        if (shell.current) shell.current.opacity = 0.18 * level + 0.3 * pulse;
        const mesh = nodeMesh.current;
        if (!mesh) return;
        nodes.forEach((p, i) => {
            const spark = Math.max(0, Math.sin(sim.time * 1.7 + i * 2.39)) ** 12;
            const s = 0.035 + 0.03 * spark + 0.02 * pulse;
            tmp.m.makeScale(s, s, s).setPosition(p);
            mesh.setMatrixAt(i, tmp.m);
            mesh.setColorAt(i, tmp.c.copy(C.ai).multiplyScalar(level * (0.9 + 2.2 * spark + 2 * pulse)));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    return (
        <group position={AI}>
            <group ref={group}>
                <lineSegments geometry={edges}>
                    <lineBasicMaterial
                        ref={edgeMaterial}
                        color={C.ai}
                        transparent
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                    />
                </lineSegments>
                <instancedMesh ref={nodeMesh} args={[undefined, undefined, nodes.length]}>
                    <sphereGeometry args={[1, 10, 8]} />
                    <meshBasicMaterial toneMapped={false} />
                </instancedMesh>
                <mesh>
                    <icosahedronGeometry args={[0.3, 1]} />
                    <meshBasicMaterial
                        ref={shell}
                        color={C.ai}
                        wireframe
                        transparent
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                        toneMapped={false}
                    />
                </mesh>
            </group>
            <pointLight color={C.ai} intensity={6} distance={6} />
        </group>
    );
};

// ---------------------------------------------------------------------------------------------------
// Etiquetas de cada parte
// ---------------------------------------------------------------------------------------------------
const PartLabel = styled.div<{ $color: string }>`
    pointer-events: none;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px 4px 8px;
    border-radius: 999px;
    background: rgba(9, 13, 20, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #d5dce5;
    font:
        500 12px Roboto,
        "Helvetica Neue",
        Arial,
        sans-serif;

    &::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: ${({ $color }) => $color};
        box-shadow: 0 0 10px ${({ $color }) => $color};
    }
`;

// ---------------------------------------------------------------------------------------------------
// Etiquetas HTML sobre la escena: se dibujan fuera del Canvas y se colocan proyectando su punto 3D en
// cada fotograma (sin crear una raíz de React por etiqueta).
// ---------------------------------------------------------------------------------------------------
interface Anchor {
    position: THREE.Vector3;
    element: HTMLElement | null;
    value?: HTMLElement | null;
    sensor?: number;
    format?: (sim: Sim) => string;
}
type Anchors = Map<string, Anchor>;

const AnchorProjector: FC<{ anchors: Anchors; sim: Sim }> = ({ anchors, sim }) => {
    const { camera, size } = useThree();
    const v = useMemo(() => new THREE.Vector3(), []);
    const lastText = useRef(0);
    useFrame(() => {
        const updateText = sim.time - lastText.current > 0.15;
        if (updateText) lastText.current = sim.time;
        anchors.forEach((anchor) => {
            if (updateText && anchor.value && anchor.format) anchor.value.textContent = anchor.format(sim);
            if (!anchor.element) return;
            v.copy(anchor.position).project(camera);
            const hidden = v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2;
            anchor.element.style.visibility = hidden ? "hidden" : "visible";
            const x = (v.x * 0.5 + 0.5) * size.width;
            const y = (-v.y * 0.5 + 0.5) * size.height;
            anchor.element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
            if (updateText && anchor.value && anchor.sensor !== undefined) {
                const def = SENSORS[anchor.sensor];
                anchor.value.textContent = `${def.value(sim).toFixed(def.digits)} ${def.unit}`;
            }
        });
    });
    return null;
};

const Overlay = styled.div`
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 1;

    & > * {
        position: absolute;
        left: 0;
        top: 0;
        will-change: transform;
    }
`;

const PartLabelAnchor = styled.div`
    & > div {
        transform: translate(-50%, -100%);
    }

    /* en pantallas pequeñas se solaparían; los conceptos de debajo ya explican cada parte */
    @media (max-width: 600px) {
        display: none;
    }
`;

const PART_LABELS = [
    {
        id: "phys",
        text: "Physical asset",
        concept: "industry" as Concept,
        position: new THREE.Vector3(PHYS.x, HUB_HEIGHT + 2.15, 0),
    },
    {
        id: "twin",
        text: "Digital twin",
        concept: "twin" as Concept,
        position: new THREE.Vector3(TWIN.x, HUB_HEIGHT + 2.15, 0),
    },
    { id: "ai", text: "AI pipeline", concept: "ai" as Concept, position: new THREE.Vector3(AI.x, AI.y + 1.25, AI.z) },
];

// Leyenda de los resultados FEM junto al gemelo, como la del visor 3D
const FEM_LEGEND_POSITION = new THREE.Vector3(TWIN.x + 1.15, 2.9, 0);

// degradado de la leyenda con los mismos colores que se pintan en el modelo (arriba el máximo)
const FEM_GRADIENT = (() => {
    const c = new THREE.Color();
    const stops = Array.from({ length: 11 }, (_, i) => {
        femColor(1 - i / 10, c);
        return `#${c.getHexString()} ${i * 10}%`;
    });
    return `linear-gradient(${stops.join(", ")})`;
})();

// marcas de la escala: del máximo (arriba) a cero (abajo)
const FEM_TICKS = [1, 0.75, 0.5, 0.25, 0];

const formatPa = (value: number) => (value <= 0 ? "0" : value.toExponential(4));

const FemLegend = styled.div<{ $opacity: number }>`
    opacity: ${({ $opacity }) => $opacity};
    transition: opacity 0.3s ease;
    transform: translate(0, -50%);
    padding: 12px 16px 14px 14px;
    border-radius: 14px;
    background: rgba(17, 20, 26, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #e6e8eb;
    font:
        400 12px Roboto,
        "Helvetica Neue",
        Arial,
        sans-serif;
    white-space: nowrap;

    h4 {
        margin: 0 0 10px;
        font:
            500 13px Roboto,
            "Helvetica Neue",
            Arial,
            sans-serif;
    }

    @media (max-width: 600px) {
        display: none;
    }
`;

const FemScale = styled.div`
    position: relative;
    display: flex;
    gap: 8px;
    height: 150px;

    i {
        width: 16px;
        height: 100%;
        /* contorno sin borde: con borde el degradado se repetía debajo y asomaba una línea arriba y abajo */
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
        background: ${FEM_GRADIENT};
    }

    ol {
        position: relative;
        margin: 0;
        padding: 0;
        list-style: none;
        width: 74px;
    }

    li {
        position: absolute;
        left: 0;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        gap: 6px;
        font-variant-numeric: tabular-nums;
    }

    li::before {
        content: "";
        width: 7px;
        height: 2px;
        background: #e6e8eb;
    }
`;

const SceneLabels: FC<{ anchors: Anchors }> = ({ anchors }) => {
    const hovered = useHeroStore((s) => s.hoveredSensor);
    const focusIot = useHeroStore((s) => s.focus === "iot");
    const focus = useHeroStore((s) => s.focus);
    const register =
        (id: string, position: THREE.Vector3, sensor?: number, format?: (sim: Sim) => string) =>
        (element: HTMLElement | null) => {
            // React asigna antes la referencia del valor (hijo) que la de la etiqueta: se completa el ancla
            const anchor = anchors.get(id) ?? { position, element: null };
            Object.assign(anchor, { position, element, sensor, format });
            anchors.set(id, anchor);
        };
    // valores de las marcas de la leyenda FEM (sin posición propia: solo se actualiza su texto)
    const registerTick = (k: number, fraction: number) => (element: HTMLElement | null) => {
        anchors.set(`femTick${k}`, {
            position: FEM_LEGEND_POSITION,
            element: null,
            value: element,
            format: (sim) => formatPa(fraction * femMaxStress(sim) * 1e6),
        });
    };
    const registerValue = (id: string) => (element: HTMLElement | null) => {
        const anchor = anchors.get(id) ?? { position: new THREE.Vector3(), element: null };
        anchor.value = element;
        anchors.set(id, anchor);
    };
    return (
        <Overlay aria-hidden>
            {PART_LABELS.map((label) => (
                <PartLabelAnchor
                    key={label.id}
                    ref={register(label.id, label.position)}
                    style={{ visibility: "hidden" }}
                >
                    <PartLabel $color={conceptColor(label.concept)}>{label.text}</PartLabel>
                </PartLabelAnchor>
            ))}
            <div ref={register("femLegend", FEM_LEGEND_POSITION)} style={{ visibility: "hidden" }}>
                <FemLegend $opacity={focus === "fem" ? 1 : focus === null ? 0.75 : 0.2}>
                    <h4>Von Mises [Pa]</h4>
                    <FemScale>
                        <i />
                        <ol>
                            {FEM_TICKS.map((fraction, k) => (
                                <li key={fraction} style={{ top: `${(1 - fraction) * 100}%` }}>
                                    <span ref={registerTick(k, fraction)}>{formatPa(fraction * 220e6)}</span>
                                </li>
                            ))}
                        </ol>
                    </FemScale>
                </FemLegend>
            </div>
            {SENSORS.map((def, i) => (
                <div
                    key={def.name}
                    ref={register(`sensor${i}`, sensorWorld(i, PHYS), i)}
                    style={{ visibility: "hidden" }}
                >
                    <LabelBox $color={conceptColor("iot")} $visible={hovered === i || focusIot}>
                        {def.name}
                        <b ref={registerValue(`sensor${i}`)}>&nbsp;</b>
                    </LabelBox>
                </div>
            ))}
        </Overlay>
    );
};

// ---------------------------------------------------------------------------------------------------
// Cámara: en pantallas anchas la escena se desplaza a la derecha para dejar sitio al texto
// ---------------------------------------------------------------------------------------------------
const TARGET = new THREE.Vector3(0, 2.2, 0);
const INTRO_SECONDS = 2.8;

// Entrada: la cámara se acerca desde lejos y desde arriba (el único movimiento orquestado de la página)
const CameraRig: FC<{ shift: number; intro: boolean }> = ({ shift, intro }) => {
    const { camera, size } = useThree();
    const elapsed = useRef(intro ? 0 : INTRO_SECONDS);
    const offset = useMemo(() => new THREE.Vector3(), []);
    useFrame((_, delta) => {
        if (elapsed.current >= INTRO_SECONDS) return;
        elapsed.current = Math.min(INTRO_SECONDS, elapsed.current + Math.min(delta, 0.05));
        const k = 1 - Math.pow(1 - elapsed.current / INTRO_SECONDS, 3);
        const portrait = size.width / size.height < 1;
        const distance = THREE.MathUtils.lerp(22, portrait ? 15.5 : 14.8, k);
        const height = THREE.MathUtils.lerp(7.5, 1.6, k);
        offset.copy(camera.position).sub(TARGET);
        offset.y = 0;
        offset.setLength(Math.sqrt(Math.max(0, distance * distance - height * height)));
        camera.position.set(TARGET.x + offset.x, TARGET.y + height, TARGET.z + offset.z);
    }, -2);
    useEffect(() => {
        const cam = camera as THREE.PerspectiveCamera;
        const portrait = size.width / size.height < 1;
        cam.fov = portrait ? 47 : 38;
        if (shift > 0 && !portrait)
            cam.setViewOffset(size.width, size.height, -size.width * shift, 0, size.width, size.height);
        else cam.clearViewOffset();
        cam.updateProjectionMatrix();
    }, [camera, size, shift]);
    return null;
};

interface HeroSceneProps {
    // fracción del ancho que se desplaza la escena a la derecha (texto a la izquierda)
    shift?: number;
    reducedMotion?: boolean;
}

const SceneContent: FC<{ sim: Sim; reducedMotion: boolean }> = ({ sim, reducedMotion }) => (
    <>
        <color attach="background" args={["#070a10"]} />
        <fog attach="fog" args={["#070a10", 15, 32]} />
        <hemisphereLight args={["#9fb8ff", "#0b1220", 0.6]} />
        <directionalLight position={[-4, 8, 6]} intensity={2.2} color="#fff4e6" />
        <directionalLight position={[6, 3, -6]} intensity={1.4} color="#5d8bff" />
        <Simulation sim={sim} />
        <HexFloor sim={sim} />
        <Turbine sim={sim} variant="physical" position={PHYS} />
        <Turbine sim={sim} variant="twin" position={TWIN} />
        {SENSORS.map((_, i) => (
            <Sensor key={i} sim={sim} index={i} />
        ))}
        <DataFlows sim={sim} />
        <AiCore sim={sim} />
        {!reducedMotion && (
            <Sparkles
                count={70}
                scale={[16, 7, 10]}
                position={[0, 3.2, -2]}
                size={2.2}
                speed={0.25}
                color="#8fb4ff"
                opacity={0.5}
            />
        )}
    </>
);

const Wrapper = styled.div`
    position: absolute;
    inset: 0;
`;

const HeroScene: FC<HeroSceneProps> = ({ shift = 0, reducedMotion = false }) => {
    const sim = useMemo(newSim, []);
    const anchors = useMemo<Anchors>(() => new Map(), []);
    // la escena empieza con una ráfaga para que se vea el recorrido de los datos (salvo con "reducir
    // movimiento": entonces solo se mueve cuando el usuario lo pide)
    useEffect(() => {
        if (reducedMotion) return;
        const id = window.setTimeout(() => useHeroStore.getState().requestGust(), 1200);
        return () => window.clearTimeout(id);
    }, [reducedMotion]);

    return (
        <Wrapper>
            <Canvas
                dpr={[1, 1.75]}
                camera={{ position: [0, 3.9, 14.5], fov: 38, near: 0.1, far: 70 }}
                gl={{ antialias: false, powerPreference: "high-performance" }}
                frameloop={reducedMotion ? "demand" : "always"}
                onPointerMissed={() => useHeroStore.getState().setHoveredSensor(null)}
                aria-label="Interactive 3D scene: a wind turbine, its sensors, an AI pipeline and its digital twin"
                role="img"
            >
                <CameraRig shift={shift} intro={!reducedMotion} />
                <SceneContent sim={sim} reducedMotion={reducedMotion} />
                <AnchorProjector anchors={anchors} sim={sim} />
                <OrbitControls
                    target={TARGET}
                    enablePan={false}
                    enableZoom={false}
                    enableDamping
                    autoRotate={!reducedMotion}
                    autoRotateSpeed={0.35}
                    minPolarAngle={0.9}
                    maxPolarAngle={1.52}
                />
                <EffectComposer multisampling={4}>
                    <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.55} luminanceSmoothing={0.2} />
                    <Vignette offset={0.3} darkness={0.6} />
                </EffectComposer>
            </Canvas>
            <SceneLabels anchors={anchors} />
        </Wrapper>
    );
};

export default HeroScene;
