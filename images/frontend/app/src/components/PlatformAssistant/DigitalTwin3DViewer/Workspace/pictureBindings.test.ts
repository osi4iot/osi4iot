import { describe, expect, it } from "vitest";
import { applyEffects, bindingEffects, effectTransform, sanitizeBindings, sanitizeSvg, svgElementIds, thresholdColor } from "./pictureBindings";
import { createLiveValueStore } from "./liveValues";
import { viewerImageName } from "./viewerImagesApi";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100" onload="alert(1)">
  <script>alert(2)</script>
  <foreignObject><div>x</div></foreignObject>
  <a xlink:href="javascript:alert(3)"><rect id="led" width="10" height="10" fill="url(https://evil/x)"/></a>
  <image href="https://tracker/p.png"/><image id="bg" href="data:image/png;base64,AAAA"/>
  <g id="needle" transform="translate(100 90)"><line x2="80"/></g>
  <text id="speed" x="10" y="20"><tspan>0</tspan></text>
  <style>@import url(https://evil/x.css); .a { fill: url(https://evil/p) }</style>
</svg>`;

describe("picture animations", () => {
    it("cleans the SVG: nothing that runs or loads from elsewhere", () => {
        const clean = sanitizeSvg(SVG)!;
        expect(clean).not.toMatch(/script|alert|onload|foreignObject|javascript|evil|tracker/);
        expect(clean).toContain('href="data:image/png;base64,AAAA"');
        expect(clean).toContain('viewBox="0 0 200 100"');
        expect(clean).not.toMatch(/ width="200"/);
        expect(sanitizeSvg("<html><body/></html>")).toBeNull();
        expect(svgElementIds(clean).map((e) => e.id)).toEqual(["led", "bg", "needle", "speed"]);
    });

    it("turns values into what each element shows", () => {
        const store = createLiveValueStore();
        store.publish("dtm2sim", { rpm: 15, pose: { ok: true }, state: "run" });
        const bindings = sanitizeBindings([
            { element: "speed", topicRef: "dtm2sim", path: "rpm", action: "text", decimals: 1, suffix: " rpm" },
            { element: "needle", topicRef: "dtm2sim", path: "rpm", action: "rotate", inMin: 0, inMax: 20, outMin: -90, outMax: 90, cx: 0, cy: 0 },
            { element: "led", topicRef: "dtm2sim", path: "rpm", action: "color", thresholds: [{ value: null, color: "#73bf69" }, { value: 12, color: "#f2495c" }] },
            { element: "bg", topicRef: "dtm2sim", path: "pose.ok", action: "visible", op: "==", value: 1 },
            { element: "bg", topicRef: "dtm2sim", path: "missing", action: "opacity" },
            { element: "bad id!", topicRef: "dtm2sim", path: "rpm", action: "text" },
            { element: "x", topicRef: "dtm2sim", path: "rpm", action: "explode" },
        ]);
        expect(bindings).toHaveLength(5);
        const effects = bindingEffects(bindings, store.get);
        expect(effects.get("speed")).toEqual({ text: "15.0 rpm" });
        expect(effects.get("needle")).toEqual({ rotate: 45, cx: 0, cy: 0 });
        expect(effects.get("led")).toEqual({ fill: "#f2495c" });
        expect(effects.get("bg")).toEqual({ visible: true });
        expect(thresholdColor(5, [{ value: null, color: "g" }, { value: 12, color: "r" }])).toBe("g");
        expect(effectTransform("translate(100 90)", { rotate: 45, scale: 2 }, { x: 10, y: 5 })).toBe("translate(100 90) rotate(45 10 5) translate(10 5) scale(2) translate(-10 -5)");

        const host = document.createElement("div");
        host.innerHTML = sanitizeSvg(SVG)!;
        const root = host.querySelector("svg")!;
        applyEffects(root, effects);
        expect(root.querySelector("#speed tspan")!.textContent).toBe("15.0 rpm");
        expect(root.querySelector("#needle")!.getAttribute("transform")).toBe("translate(100 90) rotate(45 0 0)");
        expect((root.querySelector("#led") as SVGElement).style.fill).toBe("rgb(242, 73, 92)");
        // a second value: from the element's own transform again
        applyEffects(root, new Map([["needle", { rotate: -90, cx: 0, cy: 0 }]]));
        expect(root.querySelector("#needle")!.getAttribute("transform")).toBe("translate(100 90) rotate(-90 0 0)");
    });

    it("names an uploaded image as admin_api accepts it", () => {
        expect(viewerImageName("Pórtico frontal (v2).SVG")).toBe("Portico_frontal_v2_.svg");
        expect(viewerImageName("notes.pdf")).toBeNull();
    });

    it("keeps a warning hidden until its value arrives", () => {
        const store = createLiveValueStore();
        const warn = sanitizeBindings([{ element: "overspeed", topicRef: "dtm2sim", path: "rotorRpm", action: "visible", op: ">=", value: 15 }]);
        expect(bindingEffects(warn, store.get).get("overspeed")).toEqual({ visible: false });
        store.publish("dtm2sim", { rotorRpm: 17 });
        expect(bindingEffects(warn, store.get).get("overspeed")).toEqual({ visible: true });
    });
});
