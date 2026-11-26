// Where the viewer of a twin opens: the Viewer page ("3D": its model, its camera, its panels) or its pipeline.
//   - opened from a camera: the Viewer page (its image full page)
//   - a group's control room, the organization overview: the Viewer page (their panels)
//   - an asset's twin without a model nor a camera: its panels if the group's layout has any (a presentation with
//     its Canvas, charts…), else its pipeline (nothing to see yet). The layout is waited for ("wait").
//   - else: as the user left it (null)
import type { WorkspaceLayout } from "../Workspace/workspaceLayout";

export interface OpeningViewerInput {
    fromCamera: boolean;
    scope: "asset" | "group" | "organization" | string;
    hasModels: boolean;
    hasImage: boolean;
    layoutLoaded: boolean;
    hasSlides: boolean;
}

export const layoutHasSlides = (layout: WorkspaceLayout | null | undefined): boolean =>
    !!layout?.slides?.some((slide) => (slide.panels?.length ?? 0) > 0 || !!slide.canvas);

export const openingViewer = ({ fromCamera, scope, hasModels, hasImage, layoutLoaded, hasSlides }: OpeningViewerInput): "3D" | "pipeline" | "wait" | null => {
    if (fromCamera || scope !== "asset") return "3D";
    if (hasModels || hasImage) return null;
    if (!layoutLoaded) return "wait";
    return hasSlides ? "3D" : "pipeline";
};
