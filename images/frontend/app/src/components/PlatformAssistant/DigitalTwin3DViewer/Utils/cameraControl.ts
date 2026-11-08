// Camera of the 3D viewer controlled from outside: a pipeline (key "camera" of a dtm2sim message), the AI
// agent (uiOpts.camera) or the panel's view buttons. The commands go through a small bus, not through React
// state: a pipeline may send 10-30 poses a second (a phone camera followed by the twin).
//
// Coordinates are the viewer's (the glb's): metres of the model, Y up. A camera looks along its -Z axis
// (three.js convention); "quaternion" is its orientation, "fov" the vertical field of view in degrees.
import * as THREE from "three";

export type Vec3 = [number, number, number];

export const NAMED_VIEWS = ["front", "back", "left", "right", "top", "bottom", "iso", "fit", "reset"] as const;
export type NamedView = (typeof NAMED_VIEWS)[number];

export interface CameraCommand {
    // a view computed from the model's size ("fit" keeps the direction and frames the whole model)
    view?: NamedView;
    position?: Vec3;
    target?: Vec3;
    quaternion?: [number, number, number, number];
    // vertical field of view of the perspective camera, degrees
    fov?: number;
    projection?: "orthographic" | "perspective";
    // duration of the move; 0 jumps (default: 700 ms for views and explicit poses, smoothing when following)
    transitionMs?: number;
    // a stream of poses (a camera followed by the twin): the user's orbit controls are off while it lasts
    follow?: boolean;
}

const finiteVec = (v: unknown, n: number): number[] | undefined =>
    Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? (v as number[]) : undefined;

// A command from outside, checked field by field: what is not valid is left out. null when nothing is left.
export const sanitizeCameraCommand = (raw: unknown): CameraCommand | null => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const src = raw as Record<string, unknown>;
    const out: CameraCommand = {};
    if (typeof src.view === "string" && (NAMED_VIEWS as readonly string[]).includes(src.view)) out.view = src.view as NamedView;
    const position = finiteVec(src.position, 3);
    if (position) out.position = position as Vec3;
    const target = finiteVec(src.target, 3);
    if (target) out.target = target as Vec3;
    const q = finiteVec(src.quaternion, 4);
    if (q && Math.hypot(...q) > 1e-6) {
        const len = Math.hypot(...q);
        out.quaternion = q.map((x) => x / len) as [number, number, number, number];
    }
    if (typeof src.fov === "number" && Number.isFinite(src.fov)) out.fov = Math.min(150, Math.max(5, src.fov));
    if (src.projection === "orthographic" || src.projection === "perspective") out.projection = src.projection;
    if (typeof src.transitionMs === "number" && Number.isFinite(src.transitionMs))
        out.transitionMs = Math.min(10000, Math.max(0, src.transitionMs));
    if (typeof src.follow === "boolean") out.follow = src.follow;
    return Object.keys(out).length > 0 ? out : null;
};

// ---- the bus ----

type Listener = (command: CameraCommand) => void;
const listeners = new Set<Listener>();

export const subscribeCameraCommands = (listener: Listener) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

// Returns whether the command was valid
export const sendCameraCommand = (raw: unknown): boolean => {
    const command = sanitizeCameraCommand(raw);
    if (!command) return false;
    listeners.forEach((listener) => listener(command));
    return true;
};

// ---- views ----

// Direction from the model's centre to the camera, and the camera's up, of each named view
const VIEW_DIRECTIONS: Record<Exclude<NamedView, "fit">, { dir: Vec3; up: Vec3 }> = {
    front: { dir: [0, 0, 1], up: [0, 1, 0] },
    back: { dir: [0, 0, -1], up: [0, 1, 0] },
    right: { dir: [1, 0, 0], up: [0, 1, 0] },
    left: { dir: [-1, 0, 0], up: [0, 1, 0] },
    top: { dir: [0, 1, 0], up: [0, 0, -1] },
    bottom: { dir: [0, -1, 0], up: [0, 0, 1] },
    iso: { dir: [1, 0.8, 1], up: [0, 1, 0] },
    // the viewer's first framing (Stage)
    reset: { dir: [1, 1, 2.5], up: [0, 1, 0] },
};

// Distance at which a perspective camera sees a sphere of radius r whole, with some margin
export const fitDistance = (radius: number, fovDeg: number, aspect: number) => {
    const vHalf = (fovDeg * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect, 1e-3));
    return (radius * 1.15) / Math.sin(Math.min(vHalf, hHalf));
};

export interface ViewPose {
    position: THREE.Vector3;
    target: THREE.Vector3;
    up: THREE.Vector3;
    // for an orthographic camera: the zoom that frames the model (pixels per metre)
    orthoZoom: number;
}

// The pose of a named view. "fit" keeps currentDirection (from the target to the camera).
export const viewPose = (
    view: NamedView,
    center: THREE.Vector3,
    radius: number,
    fovDeg: number,
    viewport: { width: number; height: number },
    currentDirection?: THREE.Vector3,
): ViewPose => {
    const aspect = viewport.width / Math.max(viewport.height, 1);
    const spec = view === "fit" ? null : VIEW_DIRECTIONS[view];
    const dir = spec
        ? new THREE.Vector3(...spec.dir).normalize()
        : (currentDirection?.clone().normalize() ?? new THREE.Vector3(1, 1, 2.5).normalize());
    const up = spec ? new THREE.Vector3(...spec.up) : new THREE.Vector3(0, 1, 0);
    const distance = fitDistance(radius, fovDeg, aspect);
    // the orthographic camera sits further away (its distance does not change the size, only what it clips)
    const orthoZoom = (0.5 * Math.min(viewport.width, viewport.height)) / (radius * 1.15);
    return {
        position: center.clone().addScaledVector(dir, distance),
        target: center.clone(),
        up,
        orthoZoom: Number.isFinite(orthoZoom) && orthoZoom > 0 ? orthoZoom : 1,
    };
};

// ---- orthographic <-> perspective with the same framing ----
// R3F's orthographic camera spans the canvas in pixels: half the visible height is height / 2 / zoom.

export const perspectiveDistanceForOrthoZoom = (zoom: number, viewportHeight: number, fovDeg: number) =>
    viewportHeight / 2 / zoom / Math.tan((fovDeg * Math.PI) / 360);

export const orthoZoomForPerspectiveDistance = (distance: number, viewportHeight: number, fovDeg: number) =>
    viewportHeight / 2 / (distance * Math.tan((fovDeg * Math.PI) / 360));

// ---- the target a pose looks at ----

// A camera given by position and quaternion looks at a point along its -Z: the orbit controls need it. At the
// distance of the model's centre (or 1 when unknown).
export const targetAlongView = (position: THREE.Vector3, quaternion: THREE.Quaternion, center?: THREE.Vector3) => {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
    const distance = center ? Math.max(center.clone().sub(position).dot(forward), 1e-3) : 1;
    return position.clone().addScaledVector(forward, distance);
};

// Exponential smoothing factor for a time step (dt seconds), as a speed (1/s)
export const smoothing = (dt: number, speed: number) => 1 - Math.exp(-Math.max(dt, 0) * speed);
