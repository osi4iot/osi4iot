import katex from "katex";
import "katex/dist/katex.min.css";
import styled from "styled-components";

// Configuración optimizada de KaTeX
const KATEX_OPTIONS = {
    throwOnError: false,
    errorColor: '#ff6b6b',
    strict: false,
    trust: true,
    fleqn: false,
    macros: {
        "\\tr": "\\operatorname{tr}",
        "\\det": "\\operatorname{det}",
        "\\rank": "\\operatorname{rank}",
        "\\span": "\\operatorname{span}",
        "\\null": "\\operatorname{null}",
    }
} as const;

// Cache para renderizado (mejora performance)
const renderCache = new Map<string, string>();

// Función para normalizar espacios en LaTeX
const normalizeLatex = (latex: string): string => {
    return latex
        .replace(/\s*\\\\\s*/g, ' \\\\ ')
        .replace(/\s*&\s*/g, ' & ')
        .replace(/\s+/g, ' ')
        .trim();
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
            displayMode
        });
        
        renderCache.set(cacheKey, rendered);
        return rendered;
    } catch (error: any) {
        const errorResult = createErrorSpan(error.message);
        renderCache.set(cacheKey, errorResult);
        return errorResult;
    }
};

// Patrones de LaTeX optimizados
const LATEX_PATTERNS = {
    // Display math: $$...$$
    displayBlock: /\$\$([\s\S]*?)\$\$/g,
    
    // Display math: \[...\]
    displayBracket: /\\\[([\s\S]*?)\\\]/g,
    
    // Inline math: \(...\)
    inlineParen: /\\\(([\s\S]*?)\\\)/g,
    
    // Inline math: $...$
    inlineDollar: /\$([^$\n]+?)\$/g,
    
    // Matrices multilínea con asignación opcional
    matrixWithAssignment: /((?:[A-Za-z](?:\^?(?:\{[^}]*\})?(?:_{[^}]*})?|\\\w+)*(?:\s*[=·+\-*]\s*)?)+)?\\begin\{(pmatrix|bmatrix|vmatrix|Vmatrix|matrix|array)\}([\s\S]*?)\\end\{\2\}/g,
    
    // Expresiones matemáticas complejas en línea
    complexInline: /\\(?:frac|sqrt|sum|int|prod|lim|operatorname)\{[^}]*\}(?:\{[^}]*\})?(?:\[[^\]]*\])?(?:\([^)]*\))?/g,
    
    // Variables con exponentes/subíndices
    variableExp: /[A-Za-z](?:\^(?:\{[^}]*\}|[^{\s]))?(?:_(?:\{[^}]*\}|[^{\s]))?/g,
    
    // Operadores y símbolos especiales
    operators: /\\(?:cdot|times|div|pm|mp|ast|star|circ|bullet|cap|cup|subset|supset|in|notin|equiv|approx|neq|leq|geq|ll|gg)\b/g
};

/**
 * Función principal mejorada para renderizar LaTeX
 */
export const renderLatexMessage = (message: string): string => {
    if (!message || typeof message !== 'string') {
        return message || '';
    }

    // Si el mensaje ya contiene HTML renderizado, evitar procesamiento múltiple
    if (message.includes('<span class="katex">') || message.includes('latex-error')) {
        return message;
    }

    let rendered = message;

    try {
        // PASO 1: Procesar bloques de display math primero (mayor prioridad)
        
        // $$...$$ 
        rendered = rendered.replace(LATEX_PATTERNS.displayBlock, (match, latex) => {
            return renderLatexWithCache(latex, true);
        });

        // \[...\]
        rendered = rendered.replace(LATEX_PATTERNS.displayBracket, (match, latex) => {
            return renderLatexWithCache(latex, true);
        });

        // PASO 3: Procesar inline math ANTES de las matrices
        
        // \(...\)
        rendered = rendered.replace(LATEX_PATTERNS.inlineParen, (match, latex) => {
            return renderLatexWithCache(latex, false);
        });

        // $...$ - Procesamiento mejorado para múltiples expresiones
        rendered = rendered.replace(LATEX_PATTERNS.inlineDollar, (match, latex) => {
            return renderLatexWithCache(latex, false);
        });

        // PASO 4: Procesar matrices con asignación (después del inline math)
        // PASO 4: Procesar matrices con asignación (después del inline math)
        rendered = rendered.replace(LATEX_PATTERNS.matrixWithAssignment, (match, assignment, matrixType, content) => {
            // Solo procesar si no está ya renderizado
            if (match.includes('<span class="katex">')) {
                return match;
            }
            
            const assignmentPart = assignment ? assignment.trim() : '';
            const fullLatex = `${assignmentPart}\\begin{${matrixType}}${content}\\end{${matrixType}}`;
            
            // Detectar si es una expresión inline o display basándose en el contexto
            const beforeMatch = rendered.substring(0, rendered.indexOf(match));
            const afterMatch = rendered.substring(rendered.indexOf(match) + match.length);
            
            // Si hay texto antes o después en la misma línea, usar modo inline
            const lineBeforeMatch = beforeMatch.split('\n').pop() || '';
            const lineAfterMatch = afterMatch.split('\n')[0] || '';
            const hasTextBefore = lineBeforeMatch.trim().length > 0;
            const hasTextAfter = lineAfterMatch.trim().length > 0;
            
            // Si es una matriz pequeña (3x3 o menor) y tiene texto alrededor, usar inline
            const matrixLines = content.split('\\\\').length;
            const isSmallMatrix = matrixLines <= 3;
            const shouldBeInline = (hasTextBefore || hasTextAfter) && isSmallMatrix;
            
            return renderLatexWithCache(fullLatex, !shouldBeInline);
        });

        // PASO 5: Procesar expresiones matemáticas específicas que quedaron sin renderizar
        
        // Expresiones complejas como \frac{}{}, \sqrt{}, etc.
        rendered = rendered.replace(LATEX_PATTERNS.complexInline, (match) => {
            // Solo procesar si no está ya renderizado
            if (!rendered.includes(`>${match}<`)) {
                return renderLatexWithCache(match, false);
            }
            return match;
        });

        // PASO 6: Detectar y procesar líneas completas que son puramente matemáticas
        const lines = rendered.split('\n');
        const processedLines = lines.map(line => {
            const trimmed = line.trim();
            
            // Si ya está renderizado, no tocar
            if (trimmed.includes('<span class="katex">') || trimmed.includes('latex-error')) {
                return line;
            }
            
            // Detectar líneas puramente matemáticas
            const isMathLine = (
                /^[A-Za-z]\s*=/.test(trimmed) ||  // Asignaciones: A = ...
                /^\\[a-zA-Z]+/.test(trimmed) ||   // Comandos LaTeX
                (/^[A-Za-z\s=+\-*/()[\]{}\\^_]+$/.test(trimmed) && /[=\\^_{}]/.test(trimmed)) // Expresiones matemáticas simples
            );
            
            if (isMathLine && trimmed.length > 1) {
                return renderLatexWithCache(trimmed, false);
            }
            
            return line;
        });

        rendered = processedLines.join('\n');

        // PASO 7: Limpiar el cache periódicamente para evitar memory leaks
        if (renderCache.size > 1000) {
            renderCache.clear();
        }

    } catch (error) {
        console.error('Error rendering LaTeX message:', error);
        return message; // Retornar mensaje original en caso de error
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
        keys: Array.from(renderCache.keys()).slice(0, 10) // Mostrar solo las primeras 10 para debugging
    };
};

// Estilos CSS mejorados para el componente MessageContent
export const MessageContent = styled.div`
    /* Contenedor principal optimizado */
    overflow: hidden;
    max-width: 100%;
    line-height: 1.6;
    word-wrap: break-word;
    overflow-wrap: anywhere;
    
    /* Configuración base para KaTeX */
    .katex {
        font-size: 1.3em;
        color: #f1f1f1 !important;
        font-family: 'KaTeX_Math', 'Times New Roman', serif;
    }
    
    /* Display math (ecuaciones centradas) */
    .katex-display {
        margin: 1em 0;
        text-align: center;
        padding: 0.5em;
        overflow-x: auto;
        overflow-y: hidden;
        max-width: 100%;
        background: rgba(255, 255, 255, 0.02);
        border-radius: 4px;
        border-left: 3px solid rgba(50, 116, 217, 0.3);
    }
    
    /* Inline math */
    .katex:not(.katex-display) {
        display: inline-block;
        vertical-align: middle;
        margin: 0 2px;
        line-height: 1;
    }
    
    /* Matrices inline específicas */
    .katex:not(.katex-display) .mtable {
        font-size: 0.9em;
        vertical-align: middle;
    }
    
    /* Ajuste para matrices inline pequeñas */
    .katex:not(.katex-display) .arraycolsep {
        width: 0.6em;
    }
    
    /* Errores personalizados */
    .latex-error {
        display: inline-block !important;
        color: #ff6b6b;
        background: rgba(255, 107, 107, 0.15);
        border: 1px solid rgba(255, 107, 107, 0.4);
        border-radius: 4px;
        padding: 2px 6px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 0.85em;
        margin: 0 2px;
        cursor: help;
        transition: all 0.2s ease;
    }
    
    .latex-error:hover {
        background: rgba(255, 107, 107, 0.25);
        border-color: rgba(255, 107, 107, 0.6);
    }
    
    /* Ocultar errores nativos de KaTeX */
    .katex-error {
        display: none !important;
    }
    
    /* Mejorar renderizado de elementos matemáticos */
    .katex .mord.mathrm,
    .katex .mord,
    .katex .mbin,
    .katex .mrel,
    .katex .mopen,
    .katex .mclose,
    .katex .mpunct {
        color: #f1f1f1 !important;
    }
    
    /* Delimitadores de matrices */
    .katex .delim-size1,
    .katex .delim-size2,
    .katex .delim-size3,
    .katex .delim-size4 {
        color: #e0e0e0 !important;
    }
    
    /* Tablas/matrices específicas */
    .katex .mtable {
        max-width: 100%;
        margin: 0.2em 0;
    }
    
    .katex .arraycolsep {
        width: 1em;
    }
    
    /* Fracciones */
    .katex .frac-line {
        border-bottom-color: #f1f1f1 !important;
    }
    
    /* Raíces */
    .katex .sqrt > .root {
        color: #f1f1f1 !important;
    }
    
    /* SVG elements */
    .katex svg {
        fill: #f1f1f1;
        stroke: #f1f1f1;
        max-width: 100%;
        height: auto;
    }
    
    /* Responsive adjustments */
    @media (max-width: 600px) {
        .katex {
            font-size: 1em;
        }
        
        .katex-display {
            margin: 0.5em 0;
            padding: 0.3em;
        }
    }
    
    /* Mejoras de legibilidad */
    .katex .mspace {
        color: transparent;
    }
    
    /* Operadores */
    .katex .mop {
        color: #a8dadc !important;
    }
    
    /* Números */
    .katex .mord.mathrm {
        color: #f1f3f4 !important;
    }
    
    /* Variables */
    .katex .mathit {
        color: #e8f4f8 !important;
        font-style: italic;
    }
    
    /* Manejo de texto mixto */
    & > *:not(.katex-display) {
        display: inline;
        vertical-align: middle;
    }
    
    /* Espaciado entre elementos */
    white-space: pre-wrap;
    
    /* Prevenir saltos de línea innecesarios */
    & .katex-display + br,
    & br + .katex-display {
        display: none;
    }
    
    /* Manejo de overflow horizontal para matrices grandes */
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
    }
    
    .katex-display::-webkit-scrollbar-thumb:hover {
        background: rgba(50, 116, 217, 0.7);
    }
`;