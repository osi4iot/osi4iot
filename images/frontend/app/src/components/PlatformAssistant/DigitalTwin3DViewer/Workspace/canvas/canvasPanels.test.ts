import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE, panelIdOf, panelLink, panelsInScene, rectOfCell, reconcilePanels } from "./canvasPanels";
import { CanvasElement } from "./canvasScene";
import { WorkspacePage } from "../workspaceLayout";

const frame = (id: string, name: string, x: number): CanvasElement => ({ id, type: "frame", name, x, y: 0, width: 1600, height: 900 });

describe("panels in the canvas", () => {
    const page: WorkspacePage = {
        canvas: { style: "clean" },
        panels: [
            { id: "chart-1", type: "chart", x: 24, y: 0, w: 24, h: 12 },
            { id: "text-1", type: "markdown", x: 0, y: 36, w: 12, h: 12 },
        ],
    };

    it("puts the panels of the layout in the first frame, at the place of their cell", () => {
        const elements = [frame("f2", "2 Next", 1800), frame("f1", "1 First", 0), { id: "r", type: "rectangle" }];
        const next = reconcilePanels(elements, page)!;
        const placed = next.filter((e) => panelIdOf(e));
        expect(placed.map((e) => [panelIdOf(e), e.x, e.y, e.width, e.height, e.frameId])).toEqual([
            ["chart-1", 800, 0, 800, 225, "f1"],
            ["text-1", 0, 675, 400, 225, "f1"],
        ]);
        expect(placed[0]).toMatchObject({ type: "embeddable", link: panelLink("chart-1"), strokeWidth: 0 });
        // nothing to do once they are there
        expect(reconcilePanels(next, page)).toBeNull();
        expect(panelsInScene(next)).toEqual(new Set(["chart-1", "text-1"]));
    });

    it("puts a new panel in the area shown, and removes those the layout no longer has (and copies)", () => {
        const elements: CanvasElement[] = [
            { id: "a", type: "embeddable", link: panelLink("chart-1"), x: 5, y: 5, width: 10, height: 10 },
            { id: "b", type: "embeddable", link: panelLink("chart-1"), x: 50, y: 5, width: 10, height: 10 },
            { id: "c", type: "embeddable", link: panelLink("gone"), x: 0, y: 0, width: 10, height: 10 },
            { id: "d", type: "embeddable", link: "https://youtube.com/x", x: 0, y: 0, width: 10, height: 10 },
        ];
        const next = reconcilePanels(elements, page, { x: 1000, y: 1000, width: 480, height: 480 })!;
        expect(next.map((e) => e.id).slice(0, 2)).toEqual(["a", "d"]);
        const text = next.find((e) => panelIdOf(e) === "text-1")!;
        expect([text.x, text.y, text.width, text.height, text.frameId]).toEqual([1000, 1360, 160, 120, null]);
        expect(rectOfCell(page.panels[0], page, DEFAULT_PAGE)).toEqual({ x: 800, y: 0, width: 800, height: 225 });
    });
});
