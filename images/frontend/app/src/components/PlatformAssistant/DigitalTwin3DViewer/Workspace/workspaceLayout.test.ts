import { describe, expect, it } from "vitest";
import {
    reorderSlide,
    searchSlides,
    ANY_IMAGE_SOURCE,
    GRID_COLS,
    addPanel,
    applyGridItems,
    canAddModelPanel,
    defaultWorkspaceLayout,
    effectiveWorkspaceLayout,
    freePlace,
    deviceImageSources,
    imageSourceLabel,
    imageSourceOptions,
    setPanelSource,
    panelTitle,
    removePanel,
    renamePanel,
    rowHeightFor,
    sameLayout,
    sanitizeWorkspaceLayout,
    replacePanel,
    setLayoutTime,
    canAddPanelType,
    sanitizeTime,
    WorkspaceLayout,
    WorkspacePanel,
    addSlide,
    currentSlideOf,
    duplicateSlide,
    moveSlide,
    removeSlide,
    slideTags,
    setSlidesHidden,
    stepSlide,
    updateSlide,
    visibleSlides,
    MAX_SLIDES,
} from "./workspaceLayout";

// a layout of one slide with these panels
const deck = (page: { panels: WorkspacePanel[] }): WorkspaceLayout => ({ version: 2, slides: [{ id: "slide-1", title: "Slide 1", tag: "Slide_1", panels: page.panels }] });

describe("workspace layout", () => {
    it("builds the automatic layout from the model and the camera", () => {
        const both = defaultWorkspaceLayout({ hasModel: true, hasCamera: true }).slides[0];
        expect(both).toMatchObject({ id: "slide-1", title: "Slide 1", tag: "Slide_1" });
        expect(both.panels.map((p) => [p.id, p.x, p.w])).toEqual([
            ["model", 0, 7],
            ["image", 7, 5],
        ]);
        expect(both.panels[1].source).toBe(ANY_IMAGE_SOURCE);
        expect(defaultWorkspaceLayout({ hasModel: true, hasCamera: false }).slides[0].panels).toHaveLength(1);
        expect(defaultWorkspaceLayout({ hasModel: false, hasCamera: true }).slides[0].panels[0].w).toBe(GRID_COLS);
        expect(defaultWorkspaceLayout({ hasModel: false, hasCamera: false }).slides[0].panels).toHaveLength(0);
    });

    it("cleans up a layout read from the server", () => {
        const raw = {
            version: 1,
            panels: [
                { id: "model", type: "model", x: 0, y: 0, w: 7, h: 12 },
                { id: "model2", type: "model", x: 0, y: 0, w: 7, h: 12 },
                { id: "img", type: "image", source: "dtm2sim", title: "  Detections ", x: 10, y: 0, w: 6, h: 6 },
                { id: "img", type: "image", source: "dev2sim", x: 0, y: 0, w: 1, h: 1 },
                { id: "bad", type: "chart", x: 0, y: 0, w: 1, h: 1 },
                { id: "noSource", type: "image", x: 0, y: 1.5, w: 1, h: 1 },
                { id: "weird", type: "image", source: "a b", x: 0, y: 2, w: 1, h: 1 },
            ],
        };
        const clean = sanitizeWorkspaceLayout(raw, { hasModel: true })!.slides[0];
        expect(clean.panels.map((p) => p.id)).toEqual(["model", "img", "weird"]);
        expect(clean.panels[1]).toEqual({ id: "img", type: "image", source: "dtm2sim", title: "Detections", x: 6, y: 0, w: 6, h: 6 });
        expect(clean.panels[2].source).toBe(ANY_IMAGE_SOURCE);
        expect(sanitizeWorkspaceLayout(raw, { hasModel: false })!.slides[0].panels.some((p) => p.type === "model")).toBe(false);
        expect(sanitizeWorkspaceLayout(null, { hasModel: true })).toBeNull();
        expect(sanitizeWorkspaceLayout({ version: 2, panels: [] }, { hasModel: true })).toBeNull();
    });

    it("chooses the user's layout, then the group's, then the automatic one", () => {
        const ctx = { hasModel: true, hasCamera: false };
        const group = { version: 1, panels: [{ id: "model", type: "model", x: 0, y: 0, w: 6, h: 6 }] };
        const local = { version: 1, panels: [{ id: "model", type: "model", x: 0, y: 0, w: 12, h: 3 }] };
        expect(effectiveWorkspaceLayout(local, group, ctx).origin).toBe("local");
        expect(effectiveWorkspaceLayout(null, group, ctx).origin).toBe("group");
        expect(effectiveWorkspaceLayout(null, null, ctx)).toMatchObject({ origin: "automatic" });
    });

    it("adds panels in the first free place, one model at most", () => {
        let layout = defaultWorkspaceLayout({ hasModel: true, hasCamera: false }).slides[0];
        layout = { ...layout, panels: [{ ...layout.panels[0], w: 6 }] };
        expect(canAddModelPanel(layout, true)).toBe(false);
        expect(addPanel(layout, { type: "model" })).toBe(layout);
        layout = addPanel(layout, { type: "image", source: "dtm2sim", title: "Detections" });
        expect(layout.panels[1]).toMatchObject({ id: "image-1", x: 6, y: 0, w: 4, h: 6, source: "dtm2sim", title: "Detections" });
        layout = addPanel(layout, { type: "image" });
        expect(layout.panels[2]).toMatchObject({ id: "image-2", x: 6, y: 6, source: ANY_IMAGE_SOURCE });
        layout = removePanel(layout, "model");
        expect(canAddModelPanel(layout, true)).toBe(true);
        expect(canAddModelPanel(layout, false)).toBe(false);
        expect(addPanel(layout, { type: "model" }).panels.at(-1)!.id).toBe("model");
        expect(freePlace([], 4, 4)).toEqual({ x: 0, y: 0 });
    });

    it("renames, moves and compares layouts", () => {
        const layout = defaultWorkspaceLayout({ hasModel: true, hasCamera: true }).slides[0];
        const renamed = renamePanel(layout, "image", " Phone ");
        expect(panelTitle(renamed.panels[1])).toBe("Phone");
        expect(panelTitle(renamePanel(renamed, "image", "  ").panels[1])).toBe("Image");
        expect(panelTitle({ id: "x", type: "image", source: "dtm2sim", x: 0, y: 0, w: 1, h: 1 })).toBe("Pipeline images");
        const same = applyGridItems(layout, layout.panels.map((p) => ({ i: p.id, x: p.x, y: p.y, w: p.w, h: p.h })));
        expect(same).toBe(layout);
        const moved = applyGridItems(layout, [{ i: "image", x: 0, y: 12, w: 12, h: 4 }]);
        expect(moved.panels[1]).toMatchObject({ x: 0, y: 12, w: 12, h: 4 });
        expect(sameLayout(deck(layout), deck(moved))).toBe(false);
        expect(sameLayout(deck(layout), deck({ ...layout, panels: [...layout.panels].reverse() }))).toBe(true);
    });

    it("offers the image sources, live ones first", () => {
        const options = imageSourceOptions(["dtm2sim", "dev2dtm_10", "dev2dtm_2"], ["dev2dtm_2", "custom_1"]);
        expect(options.map((o) => o.value)).toEqual(["any", "custom_1", "dev2dtm_2", "dtm2sim", "dev2dtm_10"]);
        expect(options.find((o) => o.value === "dev2dtm_2")).toMatchObject({ live: true, label: "Device (dev2dtm_2)" });
        expect(options.find((o) => o.value === "dtm2sim")).toMatchObject({ live: false, label: "Pipeline images (dtm2sim)" });
        expect(options[0].live).toBe(true);
        expect(imageSourceOptions([], [])[0].live).toBe(false);
    });

    it("keeps the series and settings of a chart, and turns an old range into its relative time", () => {
        const clean = sanitizeWorkspaceLayout(
            {
                version: 1,
                time: { from: "now-6h", to: "now", refresh: "30s" },
                panels: [
                    {
                        id: "c1",
                        type: "chart",
                        range: "6h",
                        series: [{ sensor: "s1", field: "t", agg: "max", alias: "T", color: "red", axis: "right", hide: true, junk: 1 }, { sensor: "s1", field: "t" }, { sensor: "bad ref", field: "t" }, { sensor: "s2", field: "acc", index: 1, agg: "median" }],
                        viz: "stat",
                        options: { colorMode: "background" },
                        fieldConfig: { defaults: { unit: "rotrpm" } },
                        timeShift: "1d",
                        interval: "bad",
                        maxDataPoints: 300,
                        x: 0,
                        y: 0,
                        w: 6,
                        h: 5,
                    },
                    { id: "c2", type: "chart", series: [], x: 0, y: 5, w: 6, h: 5 },
                ],
            },
            { hasModel: false },
        )!;
        const page = clean.slides[0];
        expect(clean.time).toEqual({ from: "now-6h", to: "now", refresh: "30s" });
        for (const refresh of ["200ms", "1s"]) expect(sanitizeTime({ from: "now-25s", to: "now", refresh })?.refresh).toBe(refresh);
        expect(page.panels).toEqual([
            {
                id: "c1",
                type: "chart",
                series: [{ sensor: "s1", field: "t", agg: "max", alias: "T", color: "red", axis: "right", hide: true }, { sensor: "s2", field: "acc", index: 1 }],
                viz: "stat",
                options: { colorMode: "background" },
                fieldConfig: { defaults: { unit: "rotrpm" } },
                timeShift: "1d",
                timeFrom: "6h",
                maxDataPoints: 300,
                x: 0,
                y: 0,
                w: 6,
                h: 5,
            },
        ]);
        expect(sanitizeWorkspaceLayout({ version: 1, time: { from: "yesterday", to: "now" }, panels: [] }, { hasModel: false })!.time).toBeUndefined();
        const empty: { panels: WorkspacePanel[] } = { panels: [] };
        expect(addPanel(empty, { type: "chart", series: [] })).toBe(empty);
        const added = addPanel(empty, { type: "chart", series: [{ sensor: "s1", field: "t" }], viz: "timeseries", title: "Temp" });
        expect(added.panels[0]).toMatchObject({ id: "chart-1", type: "chart", viz: "timeseries", w: 6, h: 5, title: "Temp" });
        const changed = replacePanel(added, { ...added.panels[0], fieldConfig: { defaults: { unit: "celsius" } } });
        expect(sameLayout(deck(added), deck(changed))).toBe(false);
        expect(sameLayout(deck(added), setLayoutTime(deck(added), { from: "now-1h", to: "now", refresh: "" }))).toBe(false);
        expect(panelTitle({ ...added.panels[0], title: undefined })).toBe("Chart");
    });

    it("allows one alarms and one approvals panel", () => {
        const empty: { panels: WorkspacePanel[] } = { panels: [] };
        const one = addPanel(empty, { type: "alarms" });
        expect(one.panels[0]).toMatchObject({ id: "alarms-1", type: "alarms", w: 5, h: 6 });
        expect(addPanel(one, { type: "alarms" })).toBe(one);
        expect(canAddPanelType(one, "alarms", true)).toBe(false);
        expect(canAddPanelType(one, "approvals", true)).toBe(true);
        expect(canAddPanelType(one, "model", false)).toBe(false);
        const clean = sanitizeWorkspaceLayout(
            { version: 1, panels: [{ id: "a", type: "alarms", x: 0, y: 0, w: 4, h: 4 }, { id: "b", type: "alarms", x: 4, y: 0, w: 4, h: 4 }, { id: "c", type: "approvals", x: 8, y: 0, w: 4, h: 4 }] },
            { hasModel: false },
        )!.slides[0];
        expect(clean.panels.map((p) => p.id)).toEqual(["a", "c"]);
        expect(panelTitle(clean.panels[1])).toBe("Approvals");
    });

    it("sizes the rows so that 12 fill the page", () => {
        expect(rowHeightFor(12 * 50 + 11 * 12)).toBe(50);
        expect(rowHeightFor(100)).toBe(24);
    });

    it("reads version 1 as one slide and keeps the slides of version 2", () => {
        const v1 = sanitizeWorkspaceLayout({ version: 1, panels: [{ id: "model", type: "model", x: 0, y: 0, w: 6, h: 6 }] }, { hasModel: true })!;
        expect(v1.version).toBe(2);
        expect(v1.slides).toEqual([{ id: "slide-1", title: "Slide 1", tag: "Slide_1", panels: [{ id: "model", type: "model", x: 0, y: 0, w: 6, h: 6 }] }]);
        const v2 = sanitizeWorkspaceLayout(
            {
                version: 2,
                slides: [
                    { id: "s1", title: " Overview ", tag: "Monitoring", panels: [{ id: "model", type: "model", x: 0, y: 0, w: 6, h: 6 }] },
                    { id: "s1", title: "Repeated", tag: "x", panels: [] },
                    { id: "s2", title: "", tag: "bad<tag>", panels: [{ id: "model", type: "model", x: 0, y: 0, w: 6, h: 6 }] },
                    { id: "bad id", title: "X", tag: "x", panels: [] },
                ],
            },
            { hasModel: true },
        )!;
        // a model on each slide is fine; a slide without a title or with a bad tag gets the default ones
        expect(v2.slides.map((s) => [s.id, s.title, s.tag, s.panels.length])).toEqual([
            ["s1", "Overview", "Monitoring", 1],
            ["s2", "Slide 2", "Slide_2", 1],
        ]);
        expect(sanitizeWorkspaceLayout({ version: 2, slides: [] }, { hasModel: true })).toBeNull();
    });

    it("adds, copies, moves, renames and removes slides with default names Slide N / Slide_N", () => {
        let layout = defaultWorkspaceLayout({ hasModel: true, hasCamera: false });
        const added = addSlide(layout, "slide-1");
        layout = added.layout;
        expect(added.id).toBe("slide-2");
        expect(layout.slides[1]).toEqual({ id: "slide-2", title: "Slide 2", tag: "Slide_2", panels: [] });
        layout = updateSlide(layout, "slide-1", { title: " Overview ", tag: "Monitoring" });
        expect(updateSlide(layout, "slide-1", { title: " ", tag: "x<y" }).slides[0]).toMatchObject({ title: "Overview", tag: "Monitoring" });
        const copy = duplicateSlide(layout, "slide-1");
        layout = copy.layout;
        expect(layout.slides.map((s) => [s.id, s.title, s.tag, s.panels.length])).toEqual([
            ["slide-1", "Overview", "Monitoring", 1],
            ["slide-3", "Overview (copy)", "Monitoring", 1],
            ["slide-2", "Slide 2", "Slide_2", 0],
        ]);
        expect(copy.layout.slides[1].panels[0]).not.toBe(copy.layout.slides[0].panels[0]);
        // a new slide does not repeat a name in use
        expect(addSlide(layout).layout.slides.at(-1)).toMatchObject({ id: "slide-4", title: "Slide 4", tag: "Slide_4" });
        layout = moveSlide(layout, "slide-2", -1);
        expect(layout.slides.map((s) => s.id)).toEqual(["slide-1", "slide-2", "slide-3"]);
        expect(moveSlide(layout, "slide-1", -1)).toBe(layout);
        const removed = removeSlide(layout, "slide-3");
        expect([removed.layout.slides.length, removed.id]).toEqual([2, "slide-2"]);
        const single = defaultWorkspaceLayout({ hasModel: true, hasCamera: false });
        expect(removeSlide(single, "slide-1").layout).toBe(single);
        let full = single;
        for (let i = 0; i < MAX_SLIDES + 3; i++) full = addSlide(full).layout;
        expect(full.slides).toHaveLength(MAX_SLIDES);
    });

    it("filters the slides by tag and steps through the ones shown", () => {
        const layout: WorkspaceLayout = {
            version: 2,
            slides: [
                { id: "a", title: "A", tag: "Monitoring", panels: [] },
                { id: "b", title: "B", tag: "Vision", panels: [] },
                { id: "c", title: "C", tag: "Monitoring", panels: [] },
            ],
        };
        expect(slideTags(layout)).toEqual(["Monitoring", "Vision"]);
        expect(visibleSlides(layout, ["b"]).map((s) => s.id)).toEqual(["a", "c"]);
        expect(visibleSlides(layout, ["a", "b", "c"])).toHaveLength(3);
        expect(currentSlideOf(layout, "b", ["b"]).id).toBe("a");
        expect(currentSlideOf(layout, "zzz", []).id).toBe("a");
        expect(stepSlide(layout, "a", 1, ["b"])).toBe("c");
        expect(stepSlide(layout, "c", 1, ["b"])).toBe("a");
        expect(setSlidesHidden(layout, [], ["b"], true)).toEqual(["b"]);
        expect(setSlidesHidden(layout, ["b", "gone"], ["a"], true)).toEqual(["b", "a"]);
        // some slide is always shown
        expect(setSlidesHidden(layout, ["b"], ["a", "c"], true)).toEqual(["b"]);
        expect(setSlidesHidden(layout, ["a", "b"], ["b"], false)).toEqual(["a"]);
        expect(stepSlide(layout, "a", -1, [])).toBe("c");
    });

    it("reorders slides and searches them", () => {
        const deck = {
            version: 2,
            slides: [
                { id: "a", title: "Overview", tag: "Slide_1", panels: [] },
                { id: "b", title: "Cámara", tag: "Vision", panels: [] },
                { id: "c", title: "Trends", tag: "Slide_3", panels: [] },
            ],
        };
        expect(reorderSlide(deck, "c", 0).slides.map((s) => s.id)).toEqual(["c", "a", "b"]);
        expect(reorderSlide(deck, "a", 9).slides.map((s) => s.id)).toEqual(["b", "c", "a"]);
        expect(reorderSlide(deck, "a", 0)).toBe(deck);
        expect(reorderSlide(deck, "zz", 1)).toBe(deck);
        expect(searchSlides(deck.slides, "camara").map((s) => s.id)).toEqual(["b"]);
        expect(searchSlides(deck.slides, " slide_ ").map((s) => s.id)).toEqual(["a", "c"]);
        expect(searchSlides(deck.slides, "")).toBe(deck.slides);
    });

    it("finds the device topics shown by the Image panels and changes the source of a panel", () => {
        const layout = {
            version: 2,
            slides: [
                { id: "a", title: "A", tag: "A", panels: [{ id: "i1", type: "image" as const, source: "dev2dtm_2", x: 0, y: 0, w: 4, h: 4 }] },
                {
                    id: "b",
                    title: "B",
                    tag: "B",
                    panels: [
                        { id: "i2", type: "image" as const, source: "dtm2sim", x: 0, y: 0, w: 4, h: 4 },
                        { id: "i3", type: "image" as const, source: "dev2dtm_1", x: 4, y: 0, w: 4, h: 4 },
                        { id: "i4", type: "image" as const, source: "dev2dtm_2", x: 8, y: 0, w: 4, h: 4 },
                    ],
                },
            ],
        };
        expect(deviceImageSources(layout)).toEqual(["dev2dtm_1", "dev2dtm_2"]);
        const page = layout.slides[1];
        expect(setPanelSource(page, "i2", "dev2dtm_3").panels[0].source).toBe("dev2dtm_3");
        expect(setPanelSource(page, "i2", "bad source!").panels[0].source).toBe("dtm2sim");
        expect(imageSourceLabel("dev2dtm_3")).toBe("Device (dev2dtm_3)");
    });
});
