import katex from "katex";
import "katex/dist/katex.min.css";
import styled from "styled-components";

function escapeHTML(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Options of the renderer: the chat (by default) or a document (the Text panels of the Viewer page), which
// also has links, images, rules and quotes, and headings of their real size
export interface MarkdownOptions {
    document?: boolean;
}

// the address of a link or an image ALREADY HTML-escaped: only web addresses (and mail for links, and data
// images that are not SVG for images), nothing that can run (javascript:)
const LINK_URL = /^(https?:\/\/|mailto:)[^\s]+$/i;
const IMAGE_URL = /^(https?:\/\/[^\s]+|data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+)$/i;

// Inline markdown on text that is ALREADY HTML-escaped: code, bold, italics (and in documents images and links).
// Inline code, images and links are set aside first, so that nothing inside them is formatted.
function processInlineMarkdown(text: string, options: MarkdownOptions = {}): string {
    const codes: string[] = [];
    const setAside = (html: string) => `\u0002${codes.push(html) - 1}\u0002`;
    let result = text.replace(/`([^`]+)`/g, (_m, code) => setAside(`<code>${code}</code>`));
    if (options.document) {
        result = result.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) =>
            IMAGE_URL.test(url) ? setAside(`<img class="md-image" src="${url}" alt="${alt}" loading="lazy"/>`) : m,
        );
        result = result.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) =>
            LINK_URL.test(url) ? setAside(`<a class="md-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`) : m,
        );
    }

    // Negrita: **texto**, luego *texto*
    result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    result = result.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<strong>$1</strong>");

    // Cursiva: _texto_, sin tocar nombres como mobile_accelerations o Disp_X
    result = result.replace(/(?<![\w])_([^_\n]+?)_(?![\w])/g, "<em>$1</em>");

    return result.replace(/\u0002(\d+)\u0002/g, (_m, i) => codes[Number(i)]);
}

// ---- Markdown de bloque: tablas, títulos y listas ----

const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function splitTableRow(line: string): string[] {
    let row = line.trim();
    if (row.startsWith("|")) row = row.slice(1);
    if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
    return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function isTableStart(lines: string[], i: number): boolean {
    return (
        i + 1 < lines.length &&
        lines[i].includes("|") &&
        TABLE_SEPARATOR_RE.test(lines[i + 1]) &&
        lines[i + 1].includes("|") && // "---" solo es una línea, no una tabla
        lines[i + 1].includes("-")
    );
}

function renderTable(lines: string[], start: number, options: MarkdownOptions = {}): { html: string; next: number } {
    const header = splitTableRow(lines[start]);
    const aligns = splitTableRow(lines[start + 1]).map((cell) => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        if (left && right) return "center";
        if (right) return "right";
        return "left";
    });
    const cellHtml = (tag: "th" | "td", text: string, col: number) =>
        `<${tag} style="text-align:${aligns[col] ?? "left"}">${processInlineMarkdown(text, options)}</${tag}>`;

    let html = `<div class="md-table"><table><thead><tr>${header.map((c, k) => cellHtml("th", c, k)).join("")}</tr></thead><tbody>`;
    let i = start + 2;
    for (; i < lines.length && lines[i].includes("|") && lines[i].trim() !== ""; i++) {
        const cells = splitTableRow(lines[i]);
        html += `<tr>${header.map((_h, k) => cellHtml("td", cells[k] ?? "", k)).join("")}</tr>`;
    }
    html += "</tbody></table></div>";
    return { html, next: i };
}

const BULLET_RE = /^\s*[-*+]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/;
const HEADING_RE = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/;

// Converts the lines (already escaped) to HTML. Blocks (tables, titles,
// lists) are joined without line breaks; plain lines are separated by <br/>.
function processBlockMarkdown(text: string, options: MarkdownOptions = {}): string {
    const inline = (t: string) => processInlineMarkdown(t, options);
    const doc = options.document === true;
    const lines = text.split(/\r?\n/);
    const out: string[] = [];
    let pendingBreak = false; // a <br/> before the next plain line
    const pushText = (html: string) => {
        if (pendingBreak) out.push("<br/>");
        out.push(html);
        pendingBreak = true;
    };
    const pushBlock = (html: string) => {
        out.push(html);
        pendingBreak = false;
    };

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        if (isTableStart(lines, i)) {
            const { html, next } = renderTable(lines, i, options);
            pushBlock(html);
            i = next;
            continue;
        }

        const heading = HEADING_RE.exec(line);
        if (heading) {
            const level = doc ? heading[1].length : Math.min(heading[1].length + 2, 6); // títulos discretos en el chat
            pushBlock(`<h${level} class="md-heading">${inline(heading[2])}</h${level}>`);
            i++;
            continue;
        }

        // documents: a rule (---) and quotes (> …)
        if (doc && /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
            pushBlock('<hr class="md-rule"/>');
            i++;
            continue;
        }
        if (doc && /^\s*&gt;\s?/.test(line)) {
            const quoted: string[] = [];
            while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
                quoted.push(inline(lines[i].replace(/^\s*&gt;\s?/, "")));
                i++;
            }
            pushBlock(`<blockquote class="md-quote">${quoted.join("<br/>")}</blockquote>`);
            continue;
        }

        const listMatch = BULLET_RE.exec(line) ?? ORDERED_RE.exec(line);
        if (listMatch) {
            const ordered = !BULLET_RE.test(line);
            const itemRE = ordered ? ORDERED_RE : BULLET_RE;
            const items: string[] = [];
            while (i < lines.length) {
                const m = itemRE.exec(lines[i]);
                if (!m) break;
                items.push(`<li>${inline(m[1])}</li>`);
                i++;
            }
            const tag = ordered ? "ol" : "ul";
            pushBlock(`<${tag} class="md-list">${items.join("")}</${tag}>`);
            continue;
        }

        if (line.trim() === "" && !pendingBreak) {
            // una línea vacía tras un bloque no añade más espacio
            i++;
            continue;
        }
        pushText(inline(line));
        i++;
    }
    return out.join("");
}

// 4) Render de bloques: ```math ...``` / ```latex ...``` y $$...$$ en líneas propias
export function renderExplicitMathBlocks(input: string, options: MarkdownOptions = {}): string {
    let src = input;

    // Marcadores para reinsertar el HTML de KaTeX sin ser escapado
    const chunks: string[] = [];
    const makeMarker = (html: string) => {
        const i = chunks.push(html) - 1;
        return `\u0001${i}\u0001`;
    };

    // 1) Fences ```math ...``` / ```latex ...```  (bloque display)
    const fenceRE = /```(math|latex)\r?\n([\s\S]*?)\r?\n```/g;
    src = src.replace(fenceRE, (_m, _lang, body) => {
        try {
            const html = katex.renderToString(body, {
                displayMode: true,
                throwOnError: false,
                strict: "ignore",
            });
            return makeMarker(html); // <span class="katex-display">…</span>
        } catch {
            return makeMarker(`<pre class="latex-error">${escapeHTML(body)}</pre>`);
        }
    });

    // 1b) Otros bloques de código (```text, ```python, ```…): se muestran
    //     tal cual, sin markdown ni LaTeX dentro
    const codeFenceRE = /```[\w+-]*[^\S\r\n]*\r?\n([\s\S]*?)\r?\n?```/g;
    src = src.replace(codeFenceRE, (_m, body) =>
        makeMarker(`<pre class="md-code"><code>${escapeHTML(body).replace(/"/g, "&quot;")}</code></pre>`)
    );

    // 1c) Código en línea: `…` (tampoco se interpreta lo de dentro)
    src = src.replace(/`([^`\n]+)`/g, (_m, code) =>
        makeMarker(`<code>${escapeHTML(code).replace(/"/g, "&quot;")}</code>`)
    );

    // 2) Bloques $$…$$ en líneas propias (bloque display)
    // $$ en una línea, contenido, $$ en otra línea
    const blockDollarRE = /(^|\n)\s*\$\$\s*\r?\n([\s\S]*?)\r?\n\s*\$\$\s*(?=\n|$)/g;
    src = src.replace(blockDollarRE, (_m, lead, body) => {
        try {
            const html = katex.renderToString(body, {
                displayMode: true,
                throwOnError: false,
                strict: "ignore",
            });
            return `${lead}${makeMarker(html)}`;
        } catch {
            return `${lead}${makeMarker(`<pre class="latex-error">${escapeHTML(body)}</pre>`)}`;
        }
    });

    // 2b) $$…$$ dentro de una línea (display)
    src = src.replace(/\$\$([^$\n]+?)\$\$/g, (_m, body) => {
        try {
            return makeMarker(
                katex.renderToString(body, { displayMode: true, throwOnError: false, strict: "ignore" })
            );
        } catch {
            return makeMarker(`<span class="latex-error">${escapeHTML(body)}</span>`);
        }
    });

    // 2c) $…$ en línea. Sin espacio justo dentro de los $ y sin letra o
    //     cifra justo fuera, para no confundir importes ("de $5 a $10").
    src = src.replace(/(?<![\\$\w])\$(?=\S)([^$\n]+?)(?<=\S)\$(?![\w$])/g, (_m, body) => {
        try {
            return makeMarker(
                katex.renderToString(body, { displayMode: false, throwOnError: false, strict: "ignore" })
            );
        } catch {
            return makeMarker(`<span class="latex-error">${escapeHTML(body)}</span>`);
        }
    });

    // 3) Bloques \[ … \]  (bloque display, multilinea permitido)
    const displayBracketRE = /\\\[\s*([\s\S]*?)\s*\\\]/g;
    src = src.replace(displayBracketRE, (_m, body) => {
        try {
            const html = katex.renderToString(body, {
                displayMode: true,
                throwOnError: false,
                strict: "ignore",
            });
            return makeMarker(html);
        } catch {
            return makeMarker(`<pre class="latex-error">${escapeHTML(body)}</pre>`);
        }
    });

    // 4) Inline \( … \)  (tolerante; match "lazy" hasta la primera \))
    const inlineParenRE = /\\\(([\s\S]*?)\\\)/g;
    src = src.replace(inlineParenRE, (_m, body) => {
        try {
            const html = katex.renderToString(body, {
                displayMode: false,
                throwOnError: false,
                strict: "ignore",
            });
            return makeMarker(html); // <span class="katex">…</span>
        } catch {
            return makeMarker(`<span class="latex-error">${escapeHTML(body)}</span>`);
        }
    });

    // 5) Heurística segura (opcional): línea "desnuda" que EMPIEZA con \comando LaTeX
    //    Sólo si esa línea NO contiene ya delimitadores.
    const hasAnyDelims = (line: string) => /(?<!\\)\$\$|(?<!\\)\$|\\\[|\\\(/.test(line);

    src = src
        .split(/\r?\n/)
        .map((line) => {
            // Si ya hay delimitadores o marcadores KaTeX, no tocar
            if (hasAnyDelims(line) || /\u0001\d+\u0001/.test(line)) return line;

            // Si la línea empieza con un comando LaTeX claro, la renderizamos como display
            if (/^\s*\\[a-zA-Z]+(?:\*?)\b/.test(line)) {
                try {
                    const html = katex.renderToString(line.trim(), {
                        displayMode: true,
                        throwOnError: false,
                        strict: "ignore",
                    });
                    return makeMarker(html);
                } catch {
                    return makeMarker(`<pre class="latex-error">${escapeHTML(line)}</pre>`);
                }
            }
            return line;
        })
        .join("\n");

    // 6) Todo el texto del modelo se escapa: el mensaje se pinta con
    //    dangerouslySetInnerHTML y su contenido puede venir de documentos, de
    //    sensores o de un usuario, así que no puede llevar HTML propio
    //    (<img onerror=…>). Solo se conservan las etiquetas de formato
    //    sencillas, SIN atributos.
    const allowedTags: string[] = [];
    let safe = src.replace(/<(\/?)(strong|em|code|b|i|br)\s*(\/?)>/gi, (_m, close, tag, selfClose) => {
        const i = allowedTags.push(`<${close}${tag.toLowerCase()}${selfClose ? "/" : ""}>`) - 1;
        return `\u0003${i}\u0003`;
    });
    safe = escapeHTML(safe).replace(/"/g, "&quot;");
    safe = safe.replace(/\u0003(\d+)\u0003/g, (_m, i) => allowedTags[Number(i)]);

    // 7) Markdown: tablas, títulos, listas, negrita, cursiva, código
    safe = processBlockMarkdown(safe, options);

    // 8) Reinyectar los fragmentos de KaTeX
    safe = safe.replace(/\u0001(\d+)\u0001/g, (_m, i) => chunks[Number(i)]);

    return safe;
}

// 8) Componente para mensajes
export const MathMessage: React.FC<{ html: string }> = ({ html }) => {
    const __html = renderExplicitMathBlocks(html);
    return <MessageContent dangerouslySetInnerHTML={{ __html }} />;
};

// the content of the messages, and of the Text panels (with the styles of documents: links, images...)
export const MessageContent = styled.div`
    /* Contenedor principal */
    overflow: hidden;
    max-width: 100%;
    padding: 0.2em;
    line-height: 1.6; /* para el texto normal */
    word-wrap: break-word;
    overflow-wrap: anywhere;
    white-space: pre-wrap;

    /* ===== Estilos para markdown ===== */
    strong {
        font-weight: bold;
        color: #ffffff;
    }

    em {
        font-style: italic;
        color: #f0f0f0;
    }

    code {
        background-color: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 3px;
        padding: 2px 4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Liberation Mono", monospace;
        font-size: 0.9em;
        color: #ff6b6b;
    }

    /* ===== Tablas, títulos y listas (markdown) ===== */
    .md-table {
        max-width: 100%;
        overflow-x: auto;
        margin: 0.4em 0;
        white-space: normal;
    }

    .md-table table {
        border-collapse: collapse;
        font-size: 0.85em;
        line-height: 1.35;
        font-variant-numeric: tabular-nums;
    }

    .md-table th,
    .md-table td {
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 2px 8px;
        white-space: nowrap;
    }

    .md-table th {
        background-color: rgba(255, 255, 255, 0.08);
        font-weight: bold;
    }

    .md-table tbody tr:nth-child(even) {
        background-color: rgba(255, 255, 255, 0.03);
    }

    pre.md-code {
        margin: 0.4em 0;
        padding: 0.5em 0.8em;
        overflow-x: auto;
        white-space: pre;
        background-color: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        line-height: 1.35;
    }

    pre.md-code code {
        background: none;
        border: none;
        padding: 0;
        color: inherit;
    }

    .md-heading {
        margin: 0.5em 0 0.2em;
        font-weight: bold;
        line-height: 1.3;
    }

    h3.md-heading {
        font-size: 1.1em;
    }

    h4.md-heading,
    h5.md-heading,
    h6.md-heading {
        font-size: 1em;
    }

    .md-list {
        margin: 0.2em 0;
        padding-left: 1.4em;
        white-space: normal;
    }

    /* ===== KaTeX: estilos seguros ===== */
    .katex {
        /* No forzar font-family: KaTeX usa sus propias familias */
        font-size: 1.05em; /* escala global suave */
        line-height: 1; /* importante para la baseline */
        color: #f1f1f1; /* color de tema */
        vertical-align: baseline; /* inline correcto */
    }

    /* Bloques display */
    span.katex-display {
        margin: 0.5em 0;
        text-align: left;
        padding: 1em;
        overflow-x: auto;
        overflow-y: hidden;
        max-width: 100%;
        background: rgba(255, 255, 255, 0.02);
        border-radius: 6px;
        border-left: 3px solid rgba(50, 116, 217, 0.4);
    }

    .katex-display > .katex {
        display: inline-block; /* mantiene alineación sin estirar */
    }

    /* Inline math */
    .katex:not(.katex-display) {
        display: inline-block;
        margin: 0 0.1em;
        /* No forzar vertical-align ni line-height aquí */
    }

    /* Matrices / tablas: sólo ajustes leves, sin cambiar la escala */
    .katex .mtable {
        margin: 0.2em 0;
    }
    .katex .arraycolsep {
        width: 0.8em;
    }

    /* Fracciones/raíces: color del tema sin tocar métricas */
    .katex .frac-line {
        border-bottom-color: currentColor;
    }
    .katex svg {
        fill: currentColor;
        stroke: currentColor;
    }

    /* Scrollbar horizontal en display (opcional) */
    .katex-display::-webkit-scrollbar {
        height: 4px;
    }
    .katex-display::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
    }
    .katex-display::-webkit-scrollbar-thumb {
        background: rgba(50, 116, 217, 0.5);
        border-radius: 2px;
        cursor: pointer;
    }
    .katex-display::-webkit-scrollbar-thumb:hover {
        background: rgba(50, 116, 217, 0.7);
    }

    /* Espaciado entre fórmulas consecutivas inline */
    .katex + .katex {
        margin-left: 0.5em;
    }

    /* No ocultes errores nativos mientras depuras */
    /* .katex-error { display: none !important; } */

    /* Error personalizado (si lo usas en tu app) */
    .latex-error {
        display: inline-block;
        color: #ff6b6b;
        background: rgba(255, 107, 107, 0.15);
        border: 1px solid rgba(255, 107, 107, 0.4);
        border-radius: 4px;
        padding: 2px 6px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Liberation Mono", monospace;
        font-size: 0.85em;
        margin: 0 2px;
        cursor: help;
    }

    /* ===== Documentos (paneles Text del Viewer) ===== */
    a.md-link {
        color: #8ab4ff;
        text-decoration: underline;
    }
    img.md-image {
        display: block;
        max-width: 100%;
        height: auto;
        margin: 0.4em 0;
        border-radius: 6px;
    }
    hr.md-rule {
        border: none;
        border-top: 1px solid rgba(255, 255, 255, 0.18);
        margin: 0.6em 0;
    }
    blockquote.md-quote {
        margin: 0.4em 0;
        padding: 0.2em 0.8em;
        border-left: 3px solid #3d82f0;
        color: #c7cbd1;
        white-space: normal;
    }
    h1.md-heading {
        font-size: 1.6em;
    }
    h2.md-heading {
        font-size: 1.35em;
    }

    /* Modo responsive */
    @media (max-width: 600px) {
        .katex {
            font-size: 1em;
        }
        .katex-display {
            margin: 0.5em 0;
            padding: 0.35em;
        }
    }
`;

export const containsLatex = (text: string): boolean => {
    if (!text || typeof text !== "string") return false;

    // Patrones comunes de LaTeX
    const latexPatterns = [
        // Delimitadores de ecuaciones
        /\$\$[\s\S]*?\$\$/, // $$...$$
        /\$[^$\n]+\$/, // $...$
        /\\\[[\s\S]*?\\\]/, // \[...\]
        /\\\([\s\S]*?\\\)/, // \(...\)

        // Entornos de ecuaciones
        /\\begin\{(equation|align|gather|multline|flalign|alignat)\*?\}[\s\S]*?\\end\{\1\*?\}/,
        /\\begin\{(array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\}[\s\S]*?\\end\{\1\}/,

        // Comandos LaTeX comunes
        /\\(frac|sqrt|sum|int|prod|lim|infty|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|omega)/,
        /\\(mathbb|mathcal|mathfrak|mathrm|mathit|mathbf|mathsf|mathtt)\{[^}]+\}/,
        /\\(text|textbf|textit|emph)\{[^}]+\}/,

        // Símbolos y comandos específicos
        /\\(cdot|times|div|pm|mp|leq|geq|neq|approx|equiv|sim|propto|subset|supset|in|notin)/,
        /\\(partial|nabla|exists|forall|emptyset|cap|cup|setminus)/,
        /\\(rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow)/,

        // Superíndices y subíndices con llaves
        /\w+[\^_]\{[^}]+\}/,

        // Fracciones y raíces
        /\\frac\{[^}]*\}\{[^}]*\}/,
        /\\sqrt(\[[^\]]*\])?\{[^}]*\}/,

        // Referencias y etiquetas
        /\\(label|ref|eqref|cite|bibliography)\{[^}]+\}/,

        // Espacios especiales en LaTeX
        /\\(quad|qquad|,|;|!|\s)/,

        // Comandos de formato matemático
        /\\(displaystyle|textstyle|scriptstyle|scriptscriptstyle)/,

        // Detectar múltiples backslashes (indicativo de LaTeX)
        /\\[a-zA-Z]+/,
    ];

    // Verificar si algún patrón coincide
    return latexPatterns.some((pattern) => pattern.test(text));
};
