import katex from "katex";
import "katex/dist/katex.min.css";
import styled from "styled-components";

// Configuración optimizada de KaTeX
const KATEX_OPTIONS = {
    throwOnError: false,
    errorColor: "#ff6b6b",
    strict: false,
    trust: true,
    fleqn: false,
    macros: {
        "\\tr": "\\operatorname{tr}",
        "\\det": "\\operatorname{det}",
        "\\rank": "\\operatorname{rank}",
        "\\span": "\\operatorname{span}",
        "\\null": "\\operatorname{null}",
    },
} as const;

// Cache para renderizado (mejora performance)
const renderCache = new Map<string, string>();

// Función para pre-procesar matrices y mejorar alineación
const preprocessMatrix = (latex: string): string => {
    // Detectar matrices y mejorar su formato
    return latex.replace(
        /\\begin\{(pmatrix|bmatrix|vmatrix|Vmatrix|matrix)\}([\s\S]*?)\\end\{\1\}/g,
        (match, matrixType, content) => {
            // Procesar cada fila de la matriz
            const rows = content
                .split("\\\\")
                .map((row: string) => row.trim())
                .filter((row: string | any[]) => row.length > 0);

            const processedRows = rows.map((row: string) => {
                // Separar elementos por &
                const elements = row.split("&").map((el) => el.trim());

                // Asegurar espaciado consistente alrededor de números
                const formattedElements = elements.map((el) => {
                    // Si es un número, asegurar formato consistente
                    if (/^-?\d/.test(el)) {
                        // Agregar espacios para números para mejor alineación
                        return el.replace(/^(-?\d+(?:\.\d+)?)/, "\\phantom{+}$1").replace(/^\\phantom\{\+\}-/, "-");
                    }
                    return el;
                });

                return formattedElements.join(" & ");
            });

            const processedContent = processedRows.join(" \\\\ ");
            return `\\begin{${matrixType}}${processedContent}\\end{${matrixType}}`;
        }
    );
};

// Función para corregir comandos LaTeX mal formateados
const fixLatexCommands = (latex: string): string => {
    // Corregir comandos LaTeX que tienen dobles backslashes incorrectos
    // Pero preservar \\\\ que son saltos de línea legítimos en matrices

    let fixed = latex;

    // Lista de comandos LaTeX comunes que podrían tener \\ por error
    const latexCommands = [
        "operatorname",
        "text",
        "mathbf",
        "mathit",
        "mathrm",
        "mathcal",
        "mathfrak",
        "frac",
        "sqrt",
        "sum",
        "int",
        "prod",
        "lim",
        "sin",
        "cos",
        "tan",
        "log",
        "ln",
        "alpha",
        "beta",
        "gamma",
        "delta",
        "epsilon",
        "theta",
        "lambda",
        "mu",
        "pi",
        "sigma",
        "cdot",
        "times",
        "div",
        "pm",
        "mp",
        "leq",
        "geq",
        "neq",
        "approx",
        "equiv",
        "begin",
        "end",
        "left",
        "right",
    ];

    // Corregir cada comando
    latexCommands.forEach((cmd) => {
        const wrongPattern = new RegExp(`\\\\\\\\${cmd}\\b`, "g");
        const correctReplacement = `\\${cmd}`;
        fixed = fixed.replace(wrongPattern, correctReplacement);
    });

    return fixed;
};

// Función para normalizar espacios en LaTeX
const normalizeLatex = (latex: string): string => {
    // Primero corregir comandos LaTeX mal formateados
    let normalized = fixLatexCommands(latex);

    // Luego pre-procesar matrices
    normalized = preprocessMatrix(normalized);

    // Finalmente normalizar espacios generales
    normalized = normalized
        .replace(/\s*\\\\\s*/g, " \\\\ ") // Mantener \\\\ para saltos de línea en matrices
        .replace(/\s*&\s*/g, " & ")
        .replace(/\s+/g, " ")
        .trim();

    return normalized;
};

// Función para crear mensajes de error personalizados
const createErrorSpan = (message: string): string => {
    return `<span class="latex-error" title="${message}">[LaTeX Error]</span>`;
};

// Función para renderizar LaTeX con cache
const renderLatexWithCache = (latex: string, displayMode: boolean = false): string => {
    const cacheKey = `${latex}|${displayMode}`;

    if (renderCache.has(cacheKey)) {
        return renderCache.get(cacheKey)!;
    }

    try {
        const normalized = normalizeLatex(latex);
        if (!normalized) return latex;

        const rendered = katex.renderToString(normalized, {
            ...KATEX_OPTIONS,
            displayMode,
        });

        renderCache.set(cacheKey, rendered);
        return rendered;
    } catch (error: any) {
        const errorResult = createErrorSpan(error.message);
        renderCache.set(cacheKey, errorResult);
        return errorResult;
    }
};

// Función para detectar si una expresión contiene una matriz
const containsMatrix = (latex: string): boolean => {
    return /\\begin\{(?:pmatrix|bmatrix|vmatrix|Vmatrix|matrix|array)\}/.test(latex);
};

// Función para detectar si una expresión es compleja (contiene matrices, fracciones, etc.)
const isComplexMath = (latex: string): boolean => {
    return (
        containsMatrix(latex) ||
        /\\(?:frac|sqrt|sum|int|prod|lim|operatorname)\{/.test(latex) ||
        latex.includes("\\\\") || // Saltos de línea
        latex.length > 50
    ); // Expresiones muy largas
};

const LATEX_PATTERNS = {
    // $$...$$ (no escapados)
    displayBlock: /(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g,

    // \[...\]
    displayBracket: /\\\[([\s\S]*?)\\\]/g,

    // \(...\)
    inlineParen: /\\\(([\s\S]*?)\\\)/g,

    // $...$ (no escapados, una sola línea para evitar “abrir” en una línea y “cerrar” en otra)
    inlineDollar: /(?<!\\)\$([^\n]*?)(?<!\\)\$/g,

    // Cualquier matriz/array explícita, aunque no vaya entre $...$
    standaloneMatrix: /\\begin\{(pmatrix|bmatrix|vmatrix|Vmatrix|matrix|array)\}([\s\S]*?)\\end\{\1\}/g,
};

// Ayuda: ¿hay delimitadores explícitos o entornos?
const containsExplicitMath = (s: string): boolean => {
    return (
        /(?<!\\)\$\$/.test(s) ||
        /\\\[/.test(s) ||
        /\\\(/.test(s) ||
        /(?<!\\)\$/.test(s) ||
        /\\begin\{(?:pmatrix|bmatrix|vmatrix|Vmatrix|matrix|array)\}/.test(s)
    );
};

export const renderLatexMessage = (message: string): string => {
    if (!message || typeof message !== "string") return message || "";

    // Evitar reprocesado
    if (message.includes('<span class="katex">') || message.includes("latex-error")) {
        return message;
    }

    if (!containsExplicitMath(message)) {
        return message;
    }

    let rendered = message;

    try {
        // 1) Display: $$...$$
        rendered = rendered.replace(LATEX_PATTERNS.displayBlock, (_m, latex) => renderLatexWithCache(latex, true));

        // 2) Display: \[...\]
        rendered = rendered.replace(LATEX_PATTERNS.displayBracket, (_m, latex) => renderLatexWithCache(latex, true));

        // 3) Inline: \(...\)
        rendered = rendered.replace(LATEX_PATTERNS.inlineParen, (_m, latex) => renderLatexWithCache(latex, false));

        // 4) Inline: $...$ (si la expresión es “compleja”, puedes forzar display)
        rendered = rendered.replace(LATEX_PATTERNS.inlineDollar, (_m, latex) =>
            isComplexMath(latex) ? renderLatexWithCache(latex, true) : renderLatexWithCache(latex, false)
        );

        // 5) Entornos de matrices sueltos
        rendered = rendered.replace(LATEX_PATTERNS.standaloneMatrix, (match, matrixType, content) => {
            if (match.includes('<span class="katex">')) return match;
            const full = `\\begin{${matrixType}}${content}\\end{${matrixType}}`;
            return renderLatexWithCache(full, true);
        });

        // Limpieza de cache (igual que antes)
        if (renderCache.size > 1000) renderCache.clear();
    } catch (err) {
        console.error("Error rendering LaTeX message:", err);
        return message;
    }

    return rendered;
};

// Función para limpiar el cache manualmente (útil para tests o reinicio)
export const clearLatexCache = (): void => {
    renderCache.clear();
};

// Función para obtener estadísticas del cache (útil para debugging)
export const getLatexCacheStats = () => {
    return {
        size: renderCache.size,
        keys: Array.from(renderCache.keys()).slice(0, 10), // Mostrar solo las primeras 10 para debugging
    };
};

export const containsLatex = (text: string): boolean => {
    if (!text || typeof text !== 'string') return false;
    
    // Patrones comunes de LaTeX
    const latexPatterns = [
        // Delimitadores de ecuaciones
        /\$\$[\s\S]*?\$\$/,           // $$...$$
        /\$[^$\n]+\$/,                // $...$
        /\\\[[\s\S]*?\\\]/,           // \[...\]
        /\\\([\s\S]*?\\\)/,           // \(...\)
        
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
        /\\[a-zA-Z]+/
    ];
    
    // Verificar si algún patrón coincide
    return latexPatterns.some(pattern => pattern.test(text));
};

export const MessageContent = styled.div`
    /* Contenedor principal */
    overflow: hidden;
    max-width: 100%;
    line-height: 1.6; /* para el texto normal */
    word-wrap: break-word;
    overflow-wrap: anywhere;
    white-space: pre-wrap;

    /* ===== KaTeX: estilos seguros ===== */
    .katex {
        /* No forzar font-family: KaTeX usa sus propias familias */
        font-size: 1.05em; /* escala global suave */
        line-height: 1; /* importante para la baseline */
        color: #f1f1f1; /* color de tema */
        vertical-align: baseline; /* inline correcto */
    }

    /* Bloques display */
    .katex-display {
        margin: 0.8em 0;
        text-align: left; /* cámbialo a center si prefieres */
        padding: 0.5em;
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
