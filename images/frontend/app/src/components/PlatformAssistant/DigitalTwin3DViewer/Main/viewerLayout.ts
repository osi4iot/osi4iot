// The Viewer page: the 3D model and the Image (the frames that reach the twin, e.g. the phone's camera or a
// pipeline's annotated frame) as two panels side by side, or one of them full page.
//
//   split  both panels below the top bar, left of the assistant panel: side by side, or one above the other
//          when the page is narrower than STACK_BELOW px; a splitter between them sets their share
//   3d     the 3D model full page (as the view always was: under the floating top bar)
//   image  the Image full page
//
// Without a camera on the asset there is only the 3D model; without a 3D model, only the Image.
// Pure (no React): the rectangles of the panels for a size of the page.

export type ViewerLayout = "split" | "3d" | "image";

export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface ViewerRects {
    layout: ViewerLayout | null; // null: nothing to show (no model, no camera)
    model: Rect | null;
    image: Rect | null;
    splitter: Rect | null;
    stacked: boolean; // split one above the other
    // both panels exist: each one can go full page and come back
    canSplit: boolean;
}

export const STACK_BELOW = 900; // px of the area of the panels
export const SPLITTER_SIZE = 12;
export const PANEL_HEADER_HEIGHT = 44;
export const DEFAULT_MODEL_SHARE = 0.62;
export const MIN_SHARE = 0.2;
export const MAX_SHARE = 0.8;

export const clampShare = (share: number): number =>
    Number.isFinite(share) ? Math.min(MAX_SHARE, Math.max(MIN_SHARE, share)) : DEFAULT_MODEL_SHARE;

// The layout shown for what the twin has
export const effectiveLayout = (layout: ViewerLayout, hasModel: boolean, hasImage: boolean): ViewerLayout | null => {
    if (hasModel && hasImage) return layout;
    if (hasModel) return "3d";
    if (hasImage) return "image";
    return null;
};

export interface ViewerRectsInput {
    width: number; // of the page (the viewer's container)
    height: number;
    top: number; // where the panels start in split (below the top bar)
    right: number; // free space at the right in split (the assistant panel, when open)
    gap: number;
    layout: ViewerLayout;
    hasModel: boolean;
    hasImage: boolean;
    modelShare: number; // share of the 3D model in split (0.2..0.8)
}

export const viewerRects = (input: ViewerRectsInput): ViewerRects => {
    const { width, height, gap, hasModel, hasImage } = input;
    const layout = effectiveLayout(input.layout, hasModel, hasImage);
    const canSplit = hasModel && hasImage;
    const full: Rect = { left: 0, top: 0, width: Math.max(0, width), height: Math.max(0, height) };
    if (layout === null) return { layout, model: null, image: null, splitter: null, stacked: false, canSplit };
    if (layout === "3d") return { layout, model: full, image: null, splitter: null, stacked: false, canSplit };
    if (layout === "image") return { layout, model: null, image: full, splitter: null, stacked: false, canSplit };

    // split: the area below the top bar and left of the assistant panel
    const left = gap;
    const top = Math.max(gap, input.top);
    const areaW = Math.max(0, width - left - Math.max(gap, input.right));
    const areaH = Math.max(0, height - top - gap);
    const share = clampShare(input.modelShare);
    const stacked = areaW < STACK_BELOW;
    if (stacked) {
        const modelH = Math.round((areaH - SPLITTER_SIZE) * share);
        return {
            layout,
            model: { left, top, width: areaW, height: Math.max(0, modelH) },
            splitter: { left, top: top + modelH, width: areaW, height: SPLITTER_SIZE },
            image: { left, top: top + modelH + SPLITTER_SIZE, width: areaW, height: Math.max(0, areaH - modelH - SPLITTER_SIZE) },
            stacked,
            canSplit,
        };
    }
    const modelW = Math.round((areaW - SPLITTER_SIZE) * share);
    return {
        layout,
        model: { left, top, width: Math.max(0, modelW), height: areaH },
        splitter: { left: left + modelW, top, width: SPLITTER_SIZE, height: areaH },
        image: { left: left + modelW + SPLITTER_SIZE, top, width: Math.max(0, areaW - modelW - SPLITTER_SIZE), height: areaH },
        stacked,
        canSplit,
    };
};

// The share of the 3D model when the splitter is dragged to a point of the page
export const shareAt = (rects: ViewerRects, x: number, y: number): number => {
    const { model, image } = rects;
    if (!model || !image) return DEFAULT_MODEL_SHARE;
    if (rects.stacked) {
        const total = model.height + image.height;
        return clampShare(total > 0 ? (y - model.top - SPLITTER_SIZE / 2) / total : DEFAULT_MODEL_SHARE);
    }
    const total = model.width + image.width;
    return clampShare(total > 0 ? (x - model.left - SPLITTER_SIZE / 2) / total : DEFAULT_MODEL_SHARE);
};
