// Which slides lose the files of their 3D model when the group's layout is saved (or goes back to the automatic one):
// the same rule as admin_api (slideModels.ts, removedModelSlides), to ask first. Each slide has its own model and FEM
// results in S3; they go with the slide, or with its 3D Model panel.
import type { SlideModelInfo } from "../ViewerTools/ViewerUtils";
import type { WorkspaceLayout } from "./workspaceLayout";

// the slide of the automatic layout
export const FIRST_SLIDE_ID = "slide-1";

const modelSlides = (layout: Pick<WorkspaceLayout, "slides"> | null | undefined): Set<string> =>
    new Set((layout?.slides ?? []).filter((s) => s.panels.some((p) => p.type === "model")).map((s) => s.id));

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
    return stored.filter((id) => !nextIds.has(id) || (before.has(id) && !after.has(id)));
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
    removedModelSlides(previous, next, Object.keys(slideModels ?? {})).map((slideId) => {
        const info = (slideModels ?? {})[slideId];
        const slide = shown.slides.find((s) => s.id === slideId) ?? previous?.slides.find((s) => s.id === slideId);
        return { slideId, title: slide?.title ?? slideId, fileName: info?.gltfFileName ?? "", femResults: info?.femResults ?? 0 };
    });

export const describeLostModel = (lost: LostModel): string => {
    const parts = [lost.fileName ? `the 3D model ${lost.fileName}` : "", lost.femResults > 0 ? `${lost.femResults} FEM result ${lost.femResults === 1 ? "file" : "files"}` : ""].filter(Boolean);
    return `${lost.title}: ${parts.join(" and ") || "its files"}`;
};
