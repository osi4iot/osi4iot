import { describe, expect, it } from "vitest";
import { renderExplicitMathBlocks } from "./MathMessage";

describe("chat markdown", () => {
    it("renders a GFM table with alignment", () => {
        const html = renderExplicitMathBlocks(
            "Aceleraciones:\n\n| Hora (UTC) | Ax | Az |\n|---|---:|---:|\n| 08:04:17 | 0.0129 | 4.0986 |\n| 08:04:18 | -0.0440 | 3.6541 |\n\nNota: fin"
        );
        expect(html).toContain("<table>");
        expect(html).toContain('<th style="text-align:left">Hora (UTC)</th>');
        expect(html).toContain('<td style="text-align:right">-0.0440</td>');
        expect(html.match(/<tr>/g)).toHaveLength(3);
        expect(html).toContain("Aceleraciones:");
        expect(html).toContain("Nota: fin");
        expect(html).not.toContain("|");
    });

    it("renders headings and lists", () => {
        const html = renderExplicitMathBlocks("## Resumen\n- uno **dos**\n- tres\n1. a\n2. b");
        expect(html).toContain('<h4 class="md-heading">Resumen</h4>');
        expect(html).toContain('<ul class="md-list"><li>uno <strong>dos</strong></li><li>tres</li></ul>');
        expect(html).toContain('<ol class="md-list"><li>a</li><li>b</li></ol>');
    });

    it("keeps names with underscores and inline code intact", () => {
        const html = renderExplicitMathBlocks("El campo mobile_accelerations y `Disp_X *no*` son _datos_");
        expect(html).toContain("mobile_accelerations");
        expect(html).toContain("<code>Disp_X *no*</code>");
        expect(html).toContain("<em>datos</em>");
    });

    it("does not let the model inject HTML", () => {
        const html = renderExplicitMathBlocks('Hola <img src=x onerror="alert(1)"> y <span onmouseover="x()">s</span> <strong>ok</strong>');
        expect(html).not.toContain("<img");
        expect(html).not.toContain("<span onmouseover");
        expect(html).toContain("&lt;img");
        expect(html).toContain("<strong>ok</strong>");
    });

    it("still renders LaTeX, also inside a table", () => {
        const html = renderExplicitMathBlocks("| a | b |\n|---|---|\n| \\(x^2\\) | 1 |");
        expect(html).toContain("katex");
        expect(html).toContain("<table>");
    });

    it("a dashed line after text is not a table", () => {
        const html = renderExplicitMathBlocks("a | b\n---\nc");
        expect(html).not.toContain("<table>");
    });

    it("renders other fenced code blocks as preformatted text", () => {
        const html = renderExplicitMathBlocks("```text\n⎡ 100  2  3 ⎤\n⎣   3  1 80 ⎦\n```\nEs simétrica");
        expect(html).toContain('<pre class="md-code"><code>⎡ 100  2  3 ⎤\n⎣   3  1 80 ⎦</code></pre>');
        expect(html).not.toContain("```");
        expect(html).toContain("Es simétrica");
    });

    it("renders $…$ and inline $$…$$ but not amounts", () => {
        expect(renderExplicitMathBlocks("La matriz $A = \\begin{bmatrix} 1 & 2 \\\\ 2 & 1 \\end{bmatrix}$ es simétrica")).toContain("katex");
        expect(renderExplicitMathBlocks("Resultado: $$E = mc^2$$ en línea")).toContain("katex-display");
        const money = renderExplicitMathBlocks("Cuesta de $5 a $10");
        expect(money).not.toContain("katex");
        expect(money).toContain("$5 a $10");
    });

    it("keeps $ and LaTeX inside code as text", () => {
        const html = renderExplicitMathBlocks("Usa `$x^2$` así y ```\nprint('$a$')\n```");
        expect(html).not.toContain("katex");
        expect(html).toContain("<code>$x^2$</code>");
    });
});
