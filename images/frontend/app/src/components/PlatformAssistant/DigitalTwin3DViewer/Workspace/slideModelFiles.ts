// Which slides lose the files of their 3D model when the group's layout is saved (or goes back to the automatic one):
// the same rule as admin_api (slideModels.ts, removedModelSlides), to ask first. Each slide has its own model and FEM
// results in S3; they go with the slide, or with its 3D Model panel. On a canvas each frame can have its own model:
// its scope is "<slideId>:<frameId>" (scopeOf); a model panel moved to another frame takes its files (movedModels).
import type { SlideModelInfo } from "../ViewerTools/ViewerUtils";
import { scopeOf, slideOfScope, type WorkspaceLayout } from "./workspaceLayout";

// the slide of the automatic layout
export const FIRST_SLIDE_ID = "slide-1";

// the scopes of the 3D Model panels of a layout
const modelSlides = (layout: Pick<WorkspaceLayout, "slides"> | null | undefined): Set<string> =>
    new Set((layout?.slides ?? []).flatMap((s) => s.panels.filter((p) => p.type === "model").map((p) => scopeOf(s.id, p.frame))));

export interface ModelMove {
    from: string;
    to: string;
}

// the 3D Model panels whose scope changes (the same panel of the same slide in another frame): their files go with
// them when the layout is saved (admin_api moveModels)
export const movedModels = (previous: Pick<WorkspaceLayout, "slides"> | null | undefined, next: Pick<WorkspaceLayout, "slides"> | null): ModelMove[] => {
    if (!previous || !next) return [];
    const moves: ModelMove[] = [];
    for (const slide of next.slides) {
        const before = previous.slides.find((s) => s.id === slide.id);
        if (!before) continue;
        for (const panel of slide.panels) {
            if (panel.type !== "model") continue;
            const old = before.panels.find((p) => p.id === panel.id && p.type === "model");
            if (!old) continue;
            const from = scopeOf(slide.id, old.frame);
            const to = scopeOf(slide.id, panel.frame);
            if (from !== to) moves.push({ from, to });
        }
    }
    return moves;
};

// previous: the group's layout saved until now (null: the automatic one); next: the one saved now (null: back to the
// automatic one); stored: the slides with files
export const removedModelSlides = (
    previous: Pick<WorkspaceLayout, "slides"> | null | undefined,
    next: Pick<WorkspaceLayout, "slides"> | null,
    stored: string[],
): string[] => {
    const nextIds = new Set(next ? next.slides.map((s) => s.id) : [FIRST_SLIDE_ID]);
    const before = previous ? modelSlides(previous) : new Set([FIRST_SLIDE_ID]);
    const after = next ? modelSlides(next) : new Set([FIRST_SLIDE_ID]);
    return stored.filter((id) => !nextIds.has(slideOfScope(id)) || (before.has(id) && !after.has(id)));
};

export interface LostModel {
    slideId: string;
    // the slide's title (in the layout being left), or its id
    title: string;
    fileName: string;
    femResults: number;
}

// what saving `next` removes, to say it before
export const lostModels = (
    previous: Pick<WorkspaceLayout, "slides"> | null | undefined,
    next: Pick<WorkspaceLayout, "slides"> | null,
    shown: Pick<WorkspaceLayout, "slides">,
    slideModels: Record<string, SlideModelInfo> | undefined,
): LostModel[] =>
    removedModelSlides(previous, next, Object.keys(slideModels ?? {}))
        // a model moved to another frame keeps its files
        .filter((scope) => !movedModels(previous, next).some((m) => m.from === scope))
        .map((slideId) => {
            const info = (slideModels ?? {})[slideId];
            const id = slideOfScope(slideId);
            const slide = shown.slides.find((s) => s.id === id) ?? previous?.slides.find((s) => s.id === id);
            const title = slide?.title ?? id;
            return { slideId, title: id === slideId ? title : `${title} (a frame of its canvas)`, fileName: info?.gltfFileName ?? "", femResults: info?.femResults ?? 0 };
        });

export const describeLostModel = (lost: LostModel): string => {
    const parts = [lost.fileName ? `the 3D model ${lost.fileName}` : "", lost.femResults > 0 ? `${lost.femResults} FEM result ${lost.femResults === 1 ? "file" : "files"}` : ""].filter(Boolean);
    return `${lost.title}: ${parts.join(" and ") || "its files"}`;
};
