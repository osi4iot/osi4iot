import katex from "katex";
import "katex/dist/katex.min.css";
import styled from "styled-components";

function escapeHTML(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function processMarkdown(text: string): string {
    let result = text;

    // Procesar texto en negrita: **texto** o *texto*
    // Primero ** (doble asterisco) para evitar conflictos
    result = result.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Luego * (asterisco simple) - solo si no está ya procesado
    result = result.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<strong>$1</strong>");

    // Procesar texto en cursiva: _texto_
    result = result.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, "<em>$1</em>");

    // Procesar código inline: `código`
    result = result.replace(/`([^`]+)`/g, "<code>$1</code>");

    return result;
}

// 4) Render de bloques: ```math ...``` / ```latex ...``` y $$...$$ en líneas propias
export function renderExplicitMathBlocks(input: string): string {
    let src = input;

    // Marcadores para reinsertar el HTML de KaTeX sin ser escapado
    const chunks: string[] = [];
    const makeMarker = (html: string) => {
        const i = chunks.push(html) - 1;
        return `__KXCHUNK_${i}__`;
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
            if (hasAnyDelims(line) || /__KXCHUNK_\d+__/.test(line)) return line;

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

    // 6) Procesar markdown ANTES del escape HTML
    let safe = src;

    // Verificar si ya contiene etiquetas HTML
    const hasHTML = /<\/?(?:strong|em|code|b|i|span|div|p|br)\b[^>]*>/i.test(src);

    if (hasHTML) {
        // Ya tiene HTML - proteger las etiquetas existentes
        const htmlTagProtection: string[] = [];
        const protectHTML = (match: string) => {
            const index = htmlTagProtection.push(match) - 1;
            return `__HTMLTAG_${index}__`;
        };

        // Proteger etiquetas HTML válidas
        safe = safe.replace(/<\/?(?:strong|em|code|b|i|span|div|p|br|ul|ol|li)\b[^>]*>/gi, protectHTML);

        // Escapar el resto del contenido
        safe = escapeHTML(safe);

        // Restaurar las etiquetas HTML protegidas
        safe = safe.replace(/__HTMLTAG_(\d+)__/g, (_m, i) => htmlTagProtection[Number(i)]);
    } else {
        safe = processMarkdown(safe);
    }

    // Convertir saltos de línea
    safe = safe.replace(/\r?\n/g, "<br/>");

    // 7) Reinyectar los fragmentos de KaTeX
    safe = safe.replace(/__KXCHUNK_(\d+)__/g, (_m, i) => chunks[Number(i)]);

    return safe;
}

// 8) Componente para mensajes
export const MathMessage: React.FC<{ html: string }> = ({ html }) => {
    const __html = renderExplicitMathBlocks(html);
    return <MessageContent dangerouslySetInnerHTML={{ __html }} />;
};

const MessageContent = styled.div`
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
