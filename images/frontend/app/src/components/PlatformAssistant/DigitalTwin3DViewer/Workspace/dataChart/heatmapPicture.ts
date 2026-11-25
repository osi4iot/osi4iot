// A heat map drawn smooth: the grid as a picture (its values interpolated between the points, so its colours and the
// edge of a cut are continuous) and its contour lines (marching squares), both in the units of x and y.

import { CONTOUR_LEVELS_MAX, SurfaceGrid } from "../surface/surfacePanel";

// the picture's size at most (px), and per point of the grid
const PICTURE_MAX = 600;
const PICTURE_PER_POINT = 6;

// the values of z of the grid as computed (before a cut moves its points), row by row
export const gridValues = (grid: SurfaceGrid): number[] => grid.zs ?? grid.data.map((d) => d[2]);

// where a value falls among the values of an axis (growing or decreasing): its fractional index, or NaN outside
export const fractionalIndex = (values: number[], v: number): number => {
    const n = values.length;
    if (n < 2) return 0;
    const up = values[n - 1] >= values[0];
    const lo = up ? values[0] : values[n - 1];
    const hi = up ? values[n - 1] : values[0];
    if (v < lo || v > hi) return NaN;
    let a = 0;
    let b = n - 1;
    while (b - a > 1) {
        const m = (a + b) >> 1;
        if (values[m] <= v === up) a = m;
        else b = m;
    }
    const span = values[b] - values[a];
    return span === 0 ? a : a + (v - values[a]) / span;
};

// the value of an axis at a fractional index
const atIndex = (values: number[], f: number) => {
    const i = Math.min(values.length - 2, Math.max(0, Math.floor(f)));
    return values[i] + (f - i) * (values[i + 1] - values[i]);
};

const axisOf = (grid: SurfaceGrid, which: "x" | "y"): number[] => {
    const own = which === "x" ? grid.xs : grid.ys;
    if (own) return own;
    return which === "x"
        ? Array.from({ length: grid.columns }, (_, c) => grid.data[c][0])
        : Array.from({ length: grid.rows }, (_, r) => grid.data[r * grid.columns][1]);
};

export const gridAxes = (grid: SurfaceGrid) => ({ xs: axisOf(grid, "x"), ys: axisOf(grid, "y") });

// z between the points of the grid (bilinear), NaN where a point around is missing
export const sampleGrid = (z: number[], rows: number, columns: number, fc: number, fr: number): number => {
    if (!Number.isFinite(fc) || !Number.isFinite(fr)) return NaN;
    const c = Math.min(columns - 2, Math.max(0, Math.floor(fc)));
    const r = Math.min(rows - 2, Math.max(0, Math.floor(fr)));
    const u = fc - c;
    const v = fr - r;
    const z00 = z[r * columns + c];
    const z01 = z[r * columns + c + 1];
    const z10 = z[(r + 1) * columns + c];
    const z11 = z[(r + 1) * columns + c + 1];
    return (1 - v) * ((1 - u) * z00 + u * z01) + v * ((1 - u) * z10 + u * z11);
};

const hexToRgb = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// the colours of a palette in 256 steps
export const paletteTable = (palette: string[]): Uint8ClampedArray => {
    const stops = palette.map(hexToRgb);
    const table = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
        const t = (i / 255) * (stops.length - 1);
        const k = Math.min(stops.length - 2, Math.floor(t));
        const f = t - k;
        for (let ch = 0; ch < 3; ch++) table[i * 3 + ch] = stops[k][ch] + f * (stops[k + 1][ch] - stops[k][ch]);
    }
    return table;
};

// The pixels of the picture (RGBA, the first row at the top: the largest y), or null if the grid cannot be drawn
export const heatmapPixels = (
    grid: SurfaceGrid,
    palette: string[],
    zMin: number,
    zMax: number,
): { width: number; height: number; pixels: Uint8ClampedArray; xMin: number; xMax: number; yMin: number; yMax: number } | null => {
    const { rows, columns } = grid;
    if (rows < 2 || columns < 2) return null;
    const { xs, ys } = gridAxes(grid);
    const z = gridValues(grid);
    const xMin = Math.min(xs[0], xs[columns - 1]);
    const xMax = Math.max(xs[0], xs[columns - 1]);
    const yMin = Math.min(ys[0], ys[rows - 1]);
    const yMax = Math.max(ys[0], ys[rows - 1]);
    if (!(xMax > xMin) || !(yMax > yMin)) return null;
    const width = Math.min(PICTURE_MAX, Math.max(64, columns * PICTURE_PER_POINT));
    const height = Math.min(PICTURE_MAX, Math.max(64, rows * PICTURE_PER_POINT));
    const table = paletteTable(palette);
    const cap = grid.cap;
    const span = zMax - zMin || 1;
    // a cut fades out over about a pixel's change of z: its edge is not jagged
    const pixels = new Uint8ClampedArray(width * height * 4);
    const fcs = Array.from({ length: width }, (_, i) => fractionalIndex(xs, xMin + ((i + 0.5) / width) * (xMax - xMin)));
    for (let j = 0; j < height; j++) {
        const fr = fractionalIndex(ys, yMax - ((j + 0.5) / height) * (yMax - yMin));
        for (let i = 0; i < width; i++) {
            const v = sampleGrid(z, rows, columns, fcs[i], fr);
            if (!Number.isFinite(v)) continue;
            let alpha = 255;
            if (cap !== undefined) {
                if (v > cap) {
                    // how far above, in pixels: the value one pixel to the side
                    const next = sampleGrid(z, rows, columns, fcs[Math.min(width - 1, i + 1)] ?? fcs[i], fr);
                    const step = Math.abs(next - v) || span / 500;
                    const over = (v - cap) / step;
                    if (over >= 1) continue;
                    alpha = Math.round(255 * (1 - over));
                }
            }
            const t = Math.round(((Math.min(zMax, Math.max(zMin, v)) - zMin) / span) * 255);
            const p = (j * width + i) * 4;
            pixels[p] = table[t * 3];
            pixels[p + 1] = table[t * 3 + 1];
            pixels[p + 2] = table[t * 3 + 2];
            pixels[p + 3] = alpha;
        }
    }
    return { width, height, pixels, xMin, xMax, yMin, yMax };
};

// the picture as a canvas (none where the page cannot draw: tests)
export const heatmapCanvas = (pixels: NonNullable<ReturnType<typeof heatmapPixels>>): HTMLCanvasElement | null => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    let context: CanvasRenderingContext2D | null = null;
    try {
        context = canvas.getContext("2d");
    } catch {
        context = null;
    }
    if (!context) return null;
    const image = context.createImageData(pixels.width, pixels.height);
    image.data.set(pixels.pixels);
    context.putImageData(image, 0, 0);
    return canvas;
};

const niceStep = (span: number, count: number) => {
    const raw = span / count;
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / power;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * power;
};

// About `count` levels of round values strictly inside (lo, hi)
export const contourLevels = (lo: number, hi: number, count: number): number[] => {
    if (!(hi > lo) || count < 1) return [];
    const step = niceStep(hi - lo, count);
    const levels: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v < hi - step * 1e-9 && levels.length < CONTOUR_LEVELS_MAX * 2; v += step) {
        if (v > lo + step * 1e-9) levels.push(Number(v.toPrecision(12)));
    }
    return levels;
};

// The contour lines of a level, as polylines of [x, y] (marching squares on the grid, joined across the cells)
export const contourLines = (grid: SurfaceGrid, level: number): [number, number][][] => {
    const { rows, columns } = grid;
    const { xs, ys } = gridAxes(grid);
    const z = gridValues(grid);
    const at = (r: number, c: number) => z[r * columns + c];
    // a point on an edge: "h r c" between (r, c) and (r, c+1), "v r c" between (r, c) and (r+1, c)
    const points = new Map<string, [number, number]>();
    const crossing = (kind: "h" | "v", r: number, c: number): string => {
        const key = `${kind}${r},${c}`;
        if (!points.has(key)) {
            const a = at(r, c);
            const b = kind === "h" ? at(r, c + 1) : at(r + 1, c);
            const t = b === a ? 0.5 : (level - a) / (b - a);
            const fc = kind === "h" ? c + t : c;
            const fr = kind === "v" ? r + t : r;
            points.set(key, [atIndex(xs, fc), atIndex(ys, fr)]);
        }
        return key;
    };
    const links = new Map<string, string[]>();
    const link = (a: string, b: string) => {
        (links.get(a) ?? links.set(a, []).get(a)!).push(b);
        (links.get(b) ?? links.set(b, []).get(b)!).push(a);
    };
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < columns - 1; c++) {
            const v = [at(r, c), at(r, c + 1), at(r + 1, c + 1), at(r + 1, c)];
            if (!v.every(Number.isFinite)) continue;
            const code = (v[0] > level ? 1 : 0) | (v[1] > level ? 2 : 0) | (v[2] > level ? 4 : 0) | (v[3] > level ? 8 : 0);
            if (code === 0 || code === 15) continue;
            const bottom = () => crossing("h", r, c);
            const right = () => crossing("v", r, c + 1);
            const top = () => crossing("h", r + 1, c);
            const left = () => crossing("v", r, c);
            const center = (v[0] + v[1] + v[2] + v[3]) / 4 > level;
            switch (code) {
                case 1:
                case 14:
                    link(left(), bottom());
                    break;
                case 2:
                case 13:
                    link(bottom(), right());
                    break;
                case 3:
                case 12:
                    link(left(), right());
                    break;
                case 4:
                case 11:
                    link(right(), top());
                    break;
                case 6:
                case 9:
                    link(bottom(), top());
                    break;
                case 7:
                case 8:
                    link(left(), top());
                    break;
                case 5:
                    if (center) {
                        link(left(), top());
                        link(bottom(), right());
                    } else {
                        link(left(), bottom());
                        link(right(), top());
                    }
                    break;
                case 10:
                    if (center) {
                        link(left(), bottom());
                        link(right(), top());
                    } else {
                        link(left(), top());
                        link(bottom(), right());
                    }
                    break;
            }
        }
    }
    // walk the links: open lines from their ends first, then the closed ones
    const used = new Set<string>();
    const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const walk = (start: string): [number, number][] => {
        const line: [number, number][] = [points.get(start)!];
        let current = start;
        for (;;) {
            const next = (links.get(current) ?? []).find((n) => !used.has(edgeKey(current, n)));
            if (next === undefined) break;
            used.add(edgeKey(current, next));
            line.push(points.get(next)!);
            current = next;
        }
        return line;
    };
    const lines: [number, number][][] = [];
    for (const [key, around] of links) if (around.length === 1 && !used.has(edgeKey(key, around[0]))) lines.push(walk(key));
    for (const [key, around] of links) if (around.some((n) => !used.has(edgeKey(key, n)))) lines.push(walk(key));
    return lines.filter((l) => l.length > 1);
};

const lengthOf = (line: [number, number][], sx: number, sy: number) => {
    let total = 0;
    for (let i = 1; i < line.length; i++) total += Math.hypot((line[i][0] - line[i - 1][0]) * sx, (line[i][1] - line[i - 1][1]) * sy);
    return total;
};

// a point at a fraction of the length of a line (lengths as on a unit square)
const pointAlong = (points: [number, number][], fraction: number, sx: number, sy: number, total: number): [number, number] => {
    let walked = 0;
    const goal = total * fraction;
    for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1], points[i]];
        const d = Math.hypot((b[0] - a[0]) * sx, (b[1] - a[1]) * sy);
        if (walked + d >= goal) {
            const t = d ? (goal - walked) / d : 0;
            return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        }
        walked += d;
    }
    return points[points.length - 1];
};

// where along a line its value is tried, the middle first
const LABEL_SPOTS = [0.5, 0.35, 0.65, 0.2, 0.8, 0.42, 0.58, 0.27, 0.73, 0.1, 0.9];
// labels closer than this (a fraction of the plot) are not written
const LABEL_GAP = 0.09;

// The contour lines of the levels, and where to write their values: one on each line long enough (at least the
// longest of each level), at a spot of it away from the values already written (the middle if it can)
export const contours = (
    grid: SurfaceGrid,
    levels: number[],
): { lines: { level: number; points: [number, number][] }[]; labels: { level: number; at: [number, number] }[] } => {
    const { xs, ys } = gridAxes(grid);
    // lengths measured on the plot as if it were a unit square
    const sx = 1 / (Math.abs(xs[xs.length - 1] - xs[0]) || 1);
    const sy = 1 / (Math.abs(ys[ys.length - 1] - ys[0]) || 1);
    const lines: { level: number; points: [number, number][] }[] = [];
    const labels: { level: number; at: [number, number] }[] = [];
    const free = ([x, y]: [number, number]) => labels.every((l) => Math.hypot((l.at[0] - x) * sx, (l.at[1] - y) * sy) >= LABEL_GAP);
    for (const level of levels) {
        const own = contourLines(grid, level).map((points) => ({ points, length: lengthOf(points, sx, sy) }));
        if (!own.length) continue;
        const longest = Math.max(...own.map((l) => l.length));
        for (const line of own) {
            lines.push({ level, points: line.points });
            if (line.length !== longest && line.length < 0.25) continue;
            for (const spot of LABEL_SPOTS) {
                const at = pointAlong(line.points, spot, sx, sy, line.length);
                if (free(at)) {
                    labels.push({ level, at });
                    break;
                }
            }
        }
    }
    return { lines, labels };
};
