// LaTeX for the whole platform: MathJax 3, TeX in, SVG out (paths, no fonts), as a string. The same drawing in the
// chat, the Text panels and the formulas of a Canvas (a self-contained SVG: a picture of the drawing).
//
// Only the TeX packages listed below (no \require, no \href nor \class/\style/\cssId: nothing that loads code or
// adds links or attributes), and what comes out is cleaned again (sanitizeSvg). A formula already drawn is kept
// (texToSvg's cache): a message of the chat, drawn again with every piece that arrives, only draws its new ones.
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import "mathjax-full/js/input/tex/base/BaseConfiguration.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import "mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js";
import "mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js";
import "mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import "mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js";
import "mathjax-full/js/input/tex/mathtools/MathtoolsConfiguration.js";
import "mathjax-full/js/input/tex/cancel/CancelConfiguration.js";
import "mathjax-full/js/input/tex/color/ColorConfiguration.js";
import "mathjax-full/js/input/tex/braket/BraketConfiguration.js";
import "mathjax-full/js/input/tex/cases/CasesConfiguration.js";
import "mathjax-full/js/input/tex/gensymb/GensymbConfiguration.js";
import "mathjax-full/js/input/tex/upgreek/UpgreekConfiguration.js";

export const TEX_PACKAGES = [
    "base",
    "ams",
    "newcommand",
    "noundefined",
    "boldsymbol",
    "textmacros",
    "mathtools",
    "cancel",
    "color",
    "braket",
    "cases",
    "gensymb",
    "upgreek",
];

type MathDocument = ReturnType<typeof mathjax.document>;
let adaptor: ReturnType<typeof liteAdaptor> | null = null;
let doc: MathDocument | null = null;

const documentOf = (): { adaptor: ReturnType<typeof liteAdaptor>; doc: MathDocument } => {
    if (!adaptor || !doc) {
        adaptor = liteAdaptor();
        RegisterHTMLHandler(adaptor);
        doc = mathjax.document("", {
            InputJax: new TeX({ packages: TEX_PACKAGES }),
            // paths in each formula: no fonts, nothing shared between formulas (no ids, no links)
            OutputJax: new SVG({ fontCache: "none" }),
        });
    }
    return { adaptor, doc };
};

// Anything of an SVG that could run or go somewhere: scripts, foreign content, events, links, styles with urls
export const sanitizeSvg = (svg: string): string =>
    svg
        .replace(/<(script|foreignObject|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
        .replace(/<(script|foreignObject|iframe|object|embed)[^>]*\/?>/gi, "")
        .replace(/\s(on[a-z]+|href|xlink:href|src)\s*=\s*("[^"]*"|'[^']*')/gi, "")
        .replace(/url\s*\([^)]*\)/gi, "none");

export interface TexSvg {
    // the <svg> (its color: currentColor), sized in ex of the text around it
    svg: string;
    // its size, in ex
    width: number;
    height: number;
    // TeX it could not read (MathJax draws the error in its place)
    error: boolean;
}

// The accents of the words of a \text{…} as TeX's (drawn as paths too: without them a system font draws them)
const TEXT_ACCENTS: Record<string, string> = {
    á: "\\'a",
    é: "\\'e",
    í: "\\'{ı}",
    ó: "\\'o",
    ú: "\\'u",
    Á: "\\'A",
    É: "\\'E",
    Í: "\\'I",
    Ó: "\\'O",
    Ú: "\\'U",
    ñ: "\\~n",
    Ñ: "\\~N",
    ü: '\\"u',
    à: "\\`a",
    è: "\\`e",
    ò: "\\`o",
    ç: "\\c{c}",
};
export const withTexAccents = (tex: string): string =>
    tex.replace(
        /\\(text|textrm|textit|textbf|mbox)\{([^{}]*)\}/g,
        (_m, cmd: string, body: string) => `\\${cmd}{${body.replace(/[áéíóúÁÉÍÓÚñÑüàèòç]/g, (c) => TEXT_ACCENTS[c] ?? c)}}`,
    );

// The LaTeX of MathLive (the visual editor) as MathJax reads it: its empty boxes (\placeholder) as □ and its own
// commands as standard ones
export const fromMathlive = (latex: string): string =>
    latex
        .replace(/\\placeholder(?:\[[^\]]*\])?\{([^{}]*)\}/g, (_m, inside: string) => (inside.trim() ? inside : "\\square"))
        .replace(/\\mleft/g, "\\left")
        // MathLive writes \boldsymbol as \bm, which MathJax does not know
        .replace(/\\bm(?![a-zA-Z])/g, "\\boldsymbol")
        .replace(/\\mright/g, "\\right")
        .replace(/\\differentialD/g, "\\mathrm{d}")
        .replace(/\\exponentialE/g, "\\mathrm{e}")
        .replace(/\\imaginaryI/g, "\\mathrm{i}")
        .replace(/\\imaginaryJ/g, "\\mathrm{j}");

const CACHE_MAX = 600;
const cache = new Map<string, TexSvg>();

// A formula drawn: display (a block) or inline
export const texToSvg = (tex: string, display: boolean): TexSvg => {
    const key = `${display ? "D" : "I"}${tex}`;
    const kept = cache.get(key);
    if (kept) {
        // the most recent last (the oldest go first)
        cache.delete(key);
        cache.set(key, kept);
        return kept;
    }
    const { adaptor: a, doc: d } = documentOf();
    const node = d.convert(withTexAccents(tex), { display });
    const svg = sanitizeSvg(a.innerHTML(node));
    const size = (name: string) => Number(new RegExp(`${name}="([\\d.]+)ex"`).exec(svg)?.[1] ?? 0);
    const drawn: TexSvg = { svg, width: size("width"), height: size("height"), error: svg.includes("data-mjx-error") || svg.includes("merror") };
    cache.set(key, drawn);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    return drawn;
};

// The HTML of a formula in a text (the chat, a Text panel): a block (math-display) or inline (math)
export const texToHtml = (tex: string, display: boolean): string => {
    const { svg, error } = texToSvg(tex, display);
    const cls = `${display ? "math-display" : "math"}${error ? " math-error" : ""}`;
    return display ? `<span class="${cls}"><span class="math">${svg}</span></span>` : `<span class="${cls}">${svg}</span>`;
};

// A formula as a self-contained picture (a Canvas): the SVG with its size in px (ex: px of an ex) and a color
export const texToPicture = (tex: string, color: string, exPx: number, display = true): { svg: string; width: number; height: number; error: boolean } => {
    const drawn = texToSvg(tex, display);
    const width = drawn.width * exPx;
    const height = drawn.height * exPx;
    const svg = drawn.svg
        .replace(/currentColor/g, color)
        .replace(/width="[\d.]+ex"/, `width="${width.toFixed(1)}"`)
        .replace(/height="[\d.]+ex"/, `height="${height.toFixed(1)}"`)
        .replace(/^<svg(?![^>]*xmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"');
    return { svg, width, height, error: drawn.error };
};
