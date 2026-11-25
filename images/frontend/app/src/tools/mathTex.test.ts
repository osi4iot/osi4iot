import { describe, expect, it } from "vitest";
import { fromMathlive, sanitizeSvg, texToHtml, texToPicture, texToSvg, withTexAccents } from "./mathTex";

describe("LaTeX (MathJax, SVG)", () => {
    it("reads MathLive's LaTeX as MathJax's", () => {
        expect(fromMathlive("\\bm{\\sigma}:\\bm\\varepsilon+\\bmod")).toBe("\\boldsymbol{\\sigma}:\\boldsymbol\\varepsilon+\\bmod");
        expect(fromMathlive("\\mleft(x\\mright)\\placeholder{}")).toBe("\\left(x\\right)\\square");
        expect(texToSvg(fromMathlive("\\bm{\\sigma}"), true).svg).toBe(texToSvg("\\boldsymbol{\\sigma}", true).svg);
    });

    it("draws a formula as paths, with the color of the text", () => {
        const drawn = texToSvg("\\Pi(u_2,u_3)=\\tfrac12 k\\,u_2^2", true);
        expect(drawn.svg.startsWith("<svg")).toBe(true);
        expect(drawn.svg).toContain("<path");
        expect(drawn.svg).toContain("currentColor");
        expect(drawn.svg).not.toContain("<text");
        expect(drawn.width).toBeGreaterThan(5);
        expect(drawn.error).toBe(false);
        // kept: the same object the second time
        expect(texToSvg("\\Pi(u_2,u_3)=\\tfrac12 k\\,u_2^2", true)).toBe(drawn);
    });

    it("draws the accents of a text and marks what it cannot read", () => {
        expect(texToSvg("\\text{m\\'inimo}", false).error).toBe(false);
        expect(texToSvg("\\frac{1}{", false).error).toBe(true);
        expect(texToHtml("x", false)).toMatch(/^<span class="math"><svg/);
        expect(texToHtml("x", true)).toMatch(/^<span class="math-display"><span class="math"><svg/);
    });

    it("loads nothing and links nowhere", () => {
        for (const tex of ["\\require{html}\\class{x}{y}", "\\href{javascript:alert(1)}{x}", "\\style{background:url(x)}{y}", "\\cssId{a}{b}"]) {
            const { svg } = texToSvg(tex, false);
            expect(svg).not.toMatch(/href|javascript|url\(|onclick/i);
        }
        expect(sanitizeSvg('<svg onload="x()"><a href="http://x"><script>1</script><path style="fill:url(#a)"/></a></svg>')).toBe(
            '<svg><a><path style="fill:none"/></a></svg>',
        );
    });

    it("is a picture of its own for a Canvas", () => {
        const p = texToPicture("E=mc^2", "#1971c2", 10);
        expect(p.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(p.svg).toContain("#1971c2");
        expect(p.svg).toMatch(/width="[\d.]+"/);
        expect(p.width).toBeGreaterThan(30);
    });

    it("draws the accents of the words of a \\text as TeX's (paths, not a system font)", () => {
        expect(withTexAccents("\\text{mínimo único} á")).toBe("\\text{m\\'{ı}nimo \\'unico} á");
        expect(texToSvg("\\text{energía mínima}", false).svg).not.toContain("<text");
    });
});
