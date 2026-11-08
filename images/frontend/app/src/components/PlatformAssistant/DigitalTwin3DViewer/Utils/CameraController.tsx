// The viewer's camera driven by commands (Utils/cameraControl.ts): moves to views and poses with a smooth
// transition, follows a stream of poses (a phone camera seen by a pipeline) with the user's orbit controls off,
// and switches between the orthographic and the perspective camera keeping what is seen.
import { FC, MutableRefObject, useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import {
    CameraCommand,
    orthoZoomForPerspectiveDistance,
    perspectiveDistanceForOrthoZoom,
    smoothing,
    subscribeCameraCommands,
    targetAlongView,
    viewPose,
} from "./cameraControl";

export interface SceneBounds {
    center: THREE.Vector3;
    radius: number;
}

export interface FollowStatus {
    // poses are arriving (the last one less than FOLLOW_TIMEOUT_MS ago)
    active: boolean;
    // the user took the camera back: the poses are not applied until they follow again
    released: boolean;
}

const FOLLOW_TIMEOUT_MS = 2500;
const DEFAULT_TRANSITION_MS = 700;
const FOLLOW_SPEED = 12; // 1/s: the camera reaches a new pose in ~0.25 s, smoothing a 10-30 Hz stream

type ControlsLike = { target: THREE.Vector3; enabled: boolean; update: () => void } | null;

interface Tween {
    start: number;
    duration: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromQuat: THREE.Quaternion;
    toQuat: THREE.Quaternion;
    fromZoom: number;
    toZoom: number;
    fromFov?: number;
    toFov?: number;
}

interface CameraControllerProps {
    projection: string;
    fov: number;
    controlsRef: MutableRefObject<any>;
    boundsRef: MutableRefObject<SceneBounds | null>;
    // the user's choice in the viewer (follow / release)
    followReleased: boolean;
    onFollowStatus: (status: FollowStatus) => void;
    // a command asks for another projection or field of view: they are viewer options
    onProjectionRequest: (projection: "orthographic" | "perspective") => void;
    onFovRequest: (fov: number) => void;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const CameraController: FC<CameraControllerProps> = ({
    projection,
    fov,
    controlsRef,
    boundsRef,
    followReleased,
    onFollowStatus,
    onProjectionRequest,
    onFovRequest,
}) => {
    const liveCamera = useThree((state) => state.camera);
    // the command handlers are subscribed once: they read the current camera and fov from refs
    const cameraRef = useRef(liveCamera);
    cameraRef.current = liveCamera;
    const fovRef = useRef(fov);
    fovRef.current = fov;
    const size = useThree((state) => state.size);
    const invalidate = useThree((state) => state.invalidate);
    const perspective = projection === "perspective";

    const tween = useRef<Tween | null>(null);
    const followGoal = useRef<{ position: THREE.Vector3; quaternion: THREE.Quaternion; fov?: number } | null>(null);
    const lastFollowAt = useRef(0);
    const followActive = useRef(false);
    const releasedRef = useRef(followReleased);
    releasedRef.current = followReleased;
    const statusRef = useRef<FollowStatus>({ active: false, released: followReleased });
    const pending = useRef<CameraCommand[]>([]);
    const lastCamera = useRef<THREE.Camera | null>(null);
    const sizeRef = useRef(size);
    sizeRef.current = size;
    const perspectiveRef = useRef(perspective);
    perspectiveRef.current = perspective;

    const controls = (): ControlsLike => controlsRef.current ?? null;
    // the orbit controls' target of the last frame, and the controls it belongs to: when the projection changes,
    // the controls are made again for the new camera (with their target at the origin) before this component
    // sees the change, so the target is kept here and given to the new controls as soon as they appear
    const lastTarget = useRef<THREE.Vector3 | null>(null);
    const knownControls = useRef<ControlsLike>(null);
    const pendingTarget = useRef<THREE.Vector3 | null>(null);

    const reportStatus = (active: boolean) => {
        const next = { active, released: releasedRef.current };
        if (next.active !== statusRef.current.active || next.released !== statusRef.current.released) {
            statusRef.current = next;
            onFollowStatus(next);
        }
    };
    useEffect(() => reportStatus(followActive.current), [followReleased]); // eslint-disable-line react-hooks/exhaustive-deps

    // The same view when the projection changes: the perspective camera at the distance that shows what the
    // orthographic one showed, and back.
    useLayoutEffect(() => {
        const camera = liveCamera;
        const previous = lastCamera.current;
        lastCamera.current = camera;
        if (!previous || previous === camera) return;
        const target = lastTarget.current?.clone() ?? boundsRef.current?.center.clone() ?? new THREE.Vector3();
        const dir = previous.position.clone().sub(target);
        if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
        dir.normalize();
        const height = Math.max(sizeRef.current.height, 1);
        if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera && (previous as THREE.OrthographicCamera).isOrthographicCamera) {
            const distance = perspectiveDistanceForOrthoZoom((previous as THREE.OrthographicCamera).zoom, height, fov);
            camera.position.copy(target).addScaledVector(dir, distance);
        } else if ((camera as THREE.OrthographicCamera).isOrthographicCamera && (previous as THREE.PerspectiveCamera).isPerspectiveCamera) {
            const distance = previous.position.distanceTo(target);
            const ortho = camera as THREE.OrthographicCamera;
            ortho.zoom = orthoZoomForPerspectiveDistance(distance, height, (previous as THREE.PerspectiveCamera).fov);
            const radius = boundsRef.current?.radius ?? distance;
            camera.position.copy(target).addScaledVector(dir, Math.max(distance, radius * 3));
            ortho.updateProjectionMatrix();
        }
        camera.up.copy(previous.up);
        camera.lookAt(target);
        // the orbit controls are made again for the new camera: they get the target when they appear
        pendingTarget.current = target;
        const c = controls();
        if (c && c !== knownControls.current) {
            c.target.copy(target);
            c.update();
            knownControls.current = c;
            pendingTarget.current = null;
        }
        invalidate();
    }, [liveCamera]); // eslint-disable-line react-hooks/exhaustive-deps

    const startTween = (to: { position: THREE.Vector3; target: THREE.Vector3; quaternion?: THREE.Quaternion; up?: THREE.Vector3; zoom?: number; fov?: number }, durationMs: number) => {
        const camera = cameraRef.current;
        const ctrl = controls();
        const fromTarget = ctrl?.target?.clone() ?? targetAlongView(camera.position, camera.quaternion, boundsRef.current?.center);
        let toQuat = to.quaternion;
        if (!toQuat) {
            // the orientation that looks at the target with that up
            const m = new THREE.Matrix4().lookAt(to.position, to.target, to.up ?? camera.up);
            toQuat = new THREE.Quaternion().setFromRotationMatrix(m);
        }
        if (to.up) camera.up.copy(to.up);
        const ortho = camera as THREE.OrthographicCamera;
        const persp = camera as THREE.PerspectiveCamera;
        tween.current = {
            start: performance.now(),
            duration: Math.max(durationMs, 0),
            fromPos: camera.position.clone(),
            toPos: to.position.clone(),
            fromTarget,
            toTarget: to.target.clone(),
            fromQuat: camera.quaternion.clone(),
            toQuat,
            fromZoom: ortho.isOrthographicCamera ? ortho.zoom : 1,
            toZoom: ortho.isOrthographicCamera ? (to.zoom ?? ortho.zoom) : 1,
            fromFov: persp.isPerspectiveCamera ? persp.fov : undefined,
            toFov: persp.isPerspectiveCamera ? (to.fov ?? persp.fov) : undefined,
        };
        if (ctrl) ctrl.enabled = false;
        invalidate();
    };

    const apply = (command: CameraCommand) => {
        const camera = cameraRef.current;
        const fov = fovRef.current;
        if (command.projection && (command.projection === "perspective") !== perspectiveRef.current) {
            onProjectionRequest(command.projection);
            // the camera changes on the next render: the rest of the command waits for it
            pending.current.push({ ...command, projection: undefined });
            return;
        }
        if (command.follow) {
            if (!perspectiveRef.current && command.quaternion) {
                // a real camera is followed with a perspective one
                onProjectionRequest("perspective");
            }
            lastFollowAt.current = performance.now();
            if (!followActive.current) {
                followActive.current = true;
            }
            reportStatus(true);
            if (releasedRef.current || !command.position) return;
            const position = new THREE.Vector3(...command.position);
            const quaternion = command.quaternion
                ? new THREE.Quaternion(...command.quaternion)
                : new THREE.Quaternion().setFromRotationMatrix(
                      new THREE.Matrix4().lookAt(
                          position,
                          command.target ? new THREE.Vector3(...command.target) : (boundsRef.current?.center ?? new THREE.Vector3()),
                          new THREE.Vector3(0, 1, 0),
                      ),
                  );
            const first = followGoal.current === null;
            followGoal.current = { position, quaternion, fov: command.fov };
            tween.current = null;
            const ctrl = controls();
            if (ctrl) ctrl.enabled = false;
            if (first || command.transitionMs === 0) {
                camera.position.copy(position);
                camera.quaternion.copy(quaternion);
            }
            invalidate();
            return;
        }
        // an explicit move (the AI agent, a view button) or {follow: false} ends the following now, not when the
        // poses stop for FOLLOW_TIMEOUT_MS: otherwise the next pose would undo the move
        if (followActive.current) {
            followActive.current = false;
            followGoal.current = null;
            const ctrl = controls();
            if (ctrl) {
                ctrl.enabled = true;
                ctrl.target.copy(targetAlongView(camera.position, camera.quaternion, boundsRef.current?.center));
                ctrl.update();
            }
            reportStatus(false);
        }
        if (command.fov !== undefined) onFovRequest(command.fov);
        const duration = command.transitionMs ?? DEFAULT_TRANSITION_MS;
        const bounds = boundsRef.current;
        if (command.view) {
            if (!bounds || bounds.radius <= 0) return;
            const ctrl = controls();
            const currentDir = camera.position.clone().sub(ctrl?.target ?? bounds.center);
            const pose = viewPose(command.view, bounds.center, bounds.radius, command.fov ?? fov, sizeRef.current, currentDir);
            const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
            // the orthographic camera stays far (it does not change the size): only its zoom frames the model
            const position = ortho
                ? pose.target.clone().add(pose.position.clone().sub(pose.target).setLength(bounds.radius * 4))
                : pose.position;
            startTween({ position, target: pose.target, up: pose.up, zoom: pose.orthoZoom, fov: command.fov }, duration);
            return;
        }
        if (command.position || command.quaternion || command.target) {
            const position = command.position ? new THREE.Vector3(...command.position) : camera.position.clone();
            const quaternion = command.quaternion ? new THREE.Quaternion(...command.quaternion) : undefined;
            const target = command.target
                ? new THREE.Vector3(...command.target)
                : quaternion
                  ? targetAlongView(position, quaternion, bounds?.center)
                  : (controls()?.target?.clone() ?? bounds?.center.clone() ?? new THREE.Vector3());
            startTween({ position, target, quaternion, up: new THREE.Vector3(0, 1, 0), fov: command.fov }, duration);
        }
    };

    useEffect(() => subscribeCameraCommands((command) => apply(command)), []); // eslint-disable-line react-hooks/exhaustive-deps

    // the rest of a command that changed the projection, once the new camera is there
    useEffect(() => {
        const waiting = pending.current;
        pending.current = [];
        waiting.forEach((command) => apply(command));
    }, [liveCamera]); // eslint-disable-line react-hooks/exhaustive-deps

    useFrame(({ camera }, dt) => {
        const ctrl = controls();
        const now = performance.now();
        if (ctrl && ctrl !== knownControls.current) {
            knownControls.current = ctrl;
            if (pendingTarget.current) {
                ctrl.target.copy(pendingTarget.current);
                ctrl.update();
                pendingTarget.current = null;
            }
        }
        if (ctrl) {
            if (!lastTarget.current) lastTarget.current = new THREE.Vector3();
            lastTarget.current.copy(ctrl.target);
        }
        // following
        if (followActive.current && now - lastFollowAt.current > FOLLOW_TIMEOUT_MS) {
            followActive.current = false;
            followGoal.current = null;
            if (ctrl) {
                ctrl.enabled = true;
                ctrl.target.copy(targetAlongView(camera.position, camera.quaternion, boundsRef.current?.center));
                ctrl.update();
            }
            reportStatus(false);
        }
        const goal = followGoal.current;
        if (goal && followActive.current && !releasedRef.current) {
            const a = smoothing(dt, FOLLOW_SPEED);
            camera.position.lerp(goal.position, a);
            camera.quaternion.slerp(goal.quaternion, a);
            const persp = camera as THREE.PerspectiveCamera;
            if (goal.fov !== undefined && persp.isPerspectiveCamera && Math.abs(persp.fov - goal.fov) > 1e-3) {
                persp.fov += (goal.fov - persp.fov) * a;
                persp.updateProjectionMatrix();
            }
            if (ctrl) ctrl.enabled = false;
            return;
        }
        if (releasedRef.current && followActive.current && ctrl && !ctrl.enabled) {
            // released while following: the user has the camera
            ctrl.target.copy(targetAlongView(camera.position, camera.quaternion, boundsRef.current?.center));
            ctrl.enabled = true;
            ctrl.update();
        }
        // transition to a view or pose
        const t = tween.current;
        if (!t) return;
        const k = t.duration <= 0 ? 1 : Math.min(1, (now - t.start) / t.duration);
        const e = ease(k);
        camera.position.lerpVectors(t.fromPos, t.toPos, e);
        camera.quaternion.slerpQuaternions(t.fromQuat, t.toQuat, e);
        const ortho = camera as THREE.OrthographicCamera;
        if (ortho.isOrthographicCamera) {
            ortho.zoom = t.fromZoom + (t.toZoom - t.fromZoom) * e;
            ortho.updateProjectionMatrix();
        }
        const persp = camera as THREE.PerspectiveCamera;
        if (persp.isPerspectiveCamera && t.fromFov !== undefined && t.toFov !== undefined) {
            persp.fov = t.fromFov + (t.toFov - t.fromFov) * e;
            persp.updateProjectionMatrix();
        }
        if (k >= 1) {
            tween.current = null;
            if (ctrl) {
                ctrl.target.copy(t.toTarget);
                ctrl.enabled = true;
                ctrl.update();
            }
        }
    });

    const radius = boundsRef.current?.radius ?? 1;
    return perspective ? (
        <PerspectiveCamera
            makeDefault
            fov={fov}
            near={Math.max(radius * 0.002, 0.001)}
            far={Math.max(radius * 200, 100)}
            position={liveCamera.position.toArray() as [number, number, number]}
        />
    ) : null;
};
