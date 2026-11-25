// The formulas of a Canvas: LaTeX drawn by MathJax (tools/mathTex.ts) as a picture of the drawing, an SVG of paths
// (an Excalidraw image element and its file). The element keeps its LaTeX, color and size (customData.osi4iotTex),
// so that it can be edited again (a double click while drawing, or Edit formula). Its size: that of a text of that
// font size (an ex: 0.44 of it). In the dark theme it is inverted as the rest of the drawing (Excalidraw does not
// reset SVG pictures), so its colors are those of the drawing's palette.
import { texToPicture } from "../../../../../tools/mathTex";
import { CanvasElement, FRAME_HEIGHT, FRAME_WIDTH } from "./canvasScene";

export const FORMULA_KEY = "osi4iotTex";
export const FORMULA_SIZE_MIN = 8;
export const FORMULA_SIZE_MAX = 200;
export const FORMULA_SIZE_DEFAULT = 28;
// the palette of the drawing's strokes (Excalidraw's)
export const FORMULA_COLORS: { color: string; label: string }[] = [
    { color: "#1e1e1e", label: "Ink" },
    { color: "#1971c2", label: "Blue" },
    { color: "#2f9e44", label: "Green" },
    { color: "#e8590c", label: "Orange" },
    { color: "#e03131", label: "Red" },
    { color: "#7048e8", label: "Violet" },
    { color: "#5c636a", label: "Gray" },
];
const COLOR = /^#[0-9a-fA-F]{6}$/;
const EX = 0.44;

export interface CanvasFormula {
    tex: string;
    color: string;
    size: number;
    // inline math (as between $ … $: smaller fractions, limits beside): false or missing is display math
    inline?: boolean;
}

export const sanitizeFormula = (raw: unknown): CanvasFormula | null => {
    if (!raw || typeof raw !== "object") return null;
    const f = raw as Record<string, unknown>;
    if (typeof f.tex !== "string" || !f.tex.trim() || f.tex.length > 4000) return null;
    const size = typeof f.size === "number" && Number.isFinite(f.size) ? Math.min(FORMULA_SIZE_MAX, Math.max(FORMULA_SIZE_MIN, f.size)) : FORMULA_SIZE_DEFAULT;
    const formula: CanvasFormula = { tex: f.tex, color: typeof f.color === "string" && COLOR.test(f.color) ? f.color : FORMULA_COLORS[0].color, size };
    if (f.inline === true) formula.inline = true;
    return formula;
};

// the formula of an element of the scene (null: not one)
export const formulaOf = (element: CanvasElement | undefined | null): CanvasFormula | null => {
    if (!element || element.type !== "image" || element.isDeleted) return null;
    const data = (element as { customData?: Record<string, unknown> }).customData;
    return sanitizeFormula(data?.[FORMULA_KEY]);
};

// a short hash of a text (the id of a picture: the same formula, the same file)
const hashOf = (text: string): string => {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619);
        h2 = Math.imul(h2 ^ c, 2246822519);
    }
    return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
};

const toBase64 = (text: string): string => {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
};

export interface FormulaPicture {
    fileId: string;
    dataURL: string;
    width: number;
    height: number;
    // TeX that MathJax could not read (drawn in red in its place)
    error: boolean;
}

// the picture of a formula: its file (an SVG) and its size in the drawing
export const formulaPicture = (formula: CanvasFormula): FormulaPicture => {
    const { svg, width, height, error } = texToPicture(formula.tex, formula.color, EX * formula.size, !formula.inline);
    return { fileId: `tex-${hashOf(svg)}`, dataURL: `data:image/svg+xml;base64,${toBase64(svg)}`, width, height, error };
};

// the file of a picture, as Excalidraw keeps it (addFiles, scene.files)
export const formulaFile = (picture: FormulaPicture, now = Date.now()) => ({
    id: picture.fileId,
    mimeType: "image/svg+xml",
    dataURL: picture.dataURL,
    created: now,
    lastRetrieved: now,
});

const randomInt = () => Math.floor(Math.random() * 2 ** 31);
const randomId = () =>
    Array.from({ length: 20 }, () => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 62)]).join("");

// A new element of a formula centered on a point (in a frame: frameId), or the same element with another formula
// (`previous`: it keeps its id, place, frame and angle; its size follows the new picture, from its top left corner)
export const formulaElement = (
    formula: CanvasFormula,
    picture: FormulaPicture,
    at: { x: number; y: number; frameId?: string | null },
    previous?: CanvasElement,
): CanvasElement => {
    const now = Date.now();
    const base: CanvasElement = previous
        ? { ...previous, version: Number(previous.version ?? 1) + 1 }
        : {
              id: randomId(),
              type: "image",
              x: at.x - picture.width / 2,
              y: at.y - picture.height / 2,
              angle: 0,
              strokeColor: "transparent",
              backgroundColor: "transparent",
              fillStyle: "solid",
              strokeWidth: 1,
              strokeStyle: "solid",
              roughness: 0,
              opacity: 100,
              groupIds: [],
              frameId: at.frameId ?? null,
              roundness: null,
              seed: randomInt(),
              version: 1,
              isDeleted: false,
              boundElements: null,
              link: null,
              locked: false,
              status: "saved",
              scale: [1, 1],
              crop: null,
          };
    return {
        ...base,
        width: picture.width,
        height: picture.height,
        fileId: picture.fileId,
        versionNonce: randomInt(),
        updated: now,
        customData: { ...((base as { customData?: Record<string, unknown> }).customData ?? {}), [FORMULA_KEY]: formula },
    };
};

// the point a new formula goes to: the middle of the frame shown, else of what is shown
export const formulaSpot = (frame: CanvasElement | undefined, shown: { x: number; y: number; width: number; height: number }) =>
    frame
        ? {
              x: Number(frame.x) + Number(frame.width ?? FRAME_WIDTH) / 2,
              y: Number(frame.y) + Number(frame.height ?? FRAME_HEIGHT) / 2,
              frameId: String(frame.id),
          }
        : { x: shown.x + shown.width / 2, y: shown.y + shown.height / 2, frameId: null };
