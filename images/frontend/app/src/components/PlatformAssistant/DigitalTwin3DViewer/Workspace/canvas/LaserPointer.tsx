// The laser pointer of a presentation: a layer over the canvas and its panels. The pointer is a red dot; dragging draws
// a trail that fades out. Excalidraw's own laser does not work in its view mode (any drag pans the drawing there).
import { FC, useEffect, useRef } from "react";
import styled from "styled-components";

// how long a point of the trail lasts (ms)
export const LASER_DECAY = 1000;
const COLOR = "255, 48, 48";

const Layer = styled.canvas`
    position: absolute;
    inset: 0;
    z-index: 5;
    width: 100%;
    height: 100%;
    cursor: none;
    touch-action: none;
`;

interface Point {
    x: number;
    y: number;
    t: number;
}

// the points of a trail still shown at a time
export const livePoints = (points: Point[], now: number) => points.filter((p) => now - p.t < LASER_DECAY);

export const LaserPointer: FC = () => {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        let ctx: CanvasRenderingContext2D | null = null;
        try {
            ctx = canvas?.getContext("2d") ?? null;
        } catch {
            ctx = null;
        }
        if (!canvas || !ctx) return;
        const g = ctx;
        let trails: Point[][] = [];
        let pointer: { x: number; y: number } | null = null;
        let down = false;
        let frame = 0;

        const at = (e: PointerEvent) => {
            const r = canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        };
        const draw = () => {
            frame = 0;
            const dpr = window.devicePixelRatio || 1;
            const w = Math.round(canvas.clientWidth * dpr);
            const h = Math.round(canvas.clientHeight * dpr);
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
            const now = performance.now();
            trails = trails.map((t) => livePoints(t, now)).filter((t, i, all) => t.length > 0 || (down && i === all.length - 1));
            g.lineCap = "round";
            g.lineJoin = "round";
            g.shadowColor = `rgb(${COLOR})`;
            g.shadowBlur = 10;
            for (const trail of trails) {
                for (let i = 1; i < trail.length; i++) {
                    const a = trail[i - 1];
                    const b = trail[i];
                    const life = 1 - (now - b.t) / LASER_DECAY;
                    g.strokeStyle = `rgba(${COLOR}, ${Math.max(0, life)})`;
                    g.lineWidth = 2 + 3 * life;
                    g.beginPath();
                    g.moveTo(a.x, a.y);
                    g.lineTo(b.x, b.y);
                    g.stroke();
                }
            }
            if (pointer) {
                g.fillStyle = `rgb(${COLOR})`;
                g.beginPath();
                g.arc(pointer.x, pointer.y, 5, 0, Math.PI * 2);
                g.fill();
            }
            if (trails.some((t) => t.length > 0)) frame = requestAnimationFrame(draw);
        };
        const redraw = () => {
            if (!frame) frame = requestAnimationFrame(draw);
        };
        const onDown = (e: PointerEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();
            down = true;
            canvas.setPointerCapture?.(e.pointerId);
            pointer = at(e);
            trails.push([{ ...pointer, t: performance.now() }]);
            redraw();
        };
        const onMove = (e: PointerEvent) => {
            pointer = at(e);
            if (down) trails[trails.length - 1]?.push({ ...pointer, t: performance.now() });
            redraw();
        };
        const onUp = () => {
            down = false;
            redraw();
        };
        const onLeave = () => {
            pointer = null;
            redraw();
        };
        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp);
        canvas.addEventListener("pointercancel", onUp);
        canvas.addEventListener("pointerleave", onLeave);
        return () => {
            cancelAnimationFrame(frame);
            canvas.removeEventListener("pointerdown", onDown);
            canvas.removeEventListener("pointermove", onMove);
            canvas.removeEventListener("pointerup", onUp);
            canvas.removeEventListener("pointercancel", onUp);
            canvas.removeEventListener("pointerleave", onLeave);
        };
    }, []);

    return <Layer ref={ref} data-testid="laser-pointer" aria-hidden="true" onContextMenu={(e) => e.preventDefault()} />;
};
