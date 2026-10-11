import styled from "styled-components";

export const CodeMirrorWrapper = styled.div<{ fontSize?: string }>`
    margin-top: 10px;
    .cm-editor {
        border: 1px solid #4b5563;
        border-radius: 6px;
        font-size: ${({ fontSize }) => fontSize ?? "16px"};
        font-family: Arial, monospace;
    }

    .cm-wrapper {
        margin-top: 5px;
    }

    .cm-scroller {
        overflow-x: auto;
        background-color: #2a2a2a;

        &::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        &::-webkit-scrollbar-track {
            background: #2a2a2a;
        }

        &::-webkit-scrollbar-thumb {
            background: #4b5563;
            border-radius: 4px;
        }

        &::-webkit-scrollbar-thumb:hover {
            background: #6b7280;
        }
    }

    .cm-focused {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    /* === ESTILOS PARA EL DESPLEGABLE DE AUTOCOMPLETADO === */

    /* Contenedor principal del desplegable */
    .cm-tooltip-autocomplete {
        background: #1e1e1e !important;
        border: 1px solid #404040 !important;
        border-radius: 8px !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
        backdrop-filter: blur(10px) !important;
        max-height: 300px !important;
        min-width: 350px !important;
        max-width: min(900px, 95vw) !important;
        font-family: "Consolas", "Monaco", "Courier New", monospace !important;
        font-size: 13px !important;
    }

    /* Lista de opciones */
    .cm-tooltip-autocomplete > ul {
        padding: 2px !important;
        margin: 0 !important;
        background: transparent !important;
        max-width: min(900px, 95vw) !important;
    }

    /* Cada opción individual */
    .cm-tooltip-autocomplete ul li {
        padding: 6px 12px !important;
        margin: 0 !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        transition: all 0.15s ease !important;
        border-left: 3px solid transparent !important;
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
    }

    /* Opción normal (no seleccionada) */
    .cm-tooltip-autocomplete ul li:not([aria-selected="true"]) {
        background: transparent !important;
        color: #d4d4d4 !important;
    }

    /* Opción seleccionada - MÁXIMO CONTRASTE */
    .cm-tooltip-autocomplete ul li[aria-selected="true"] {
        background: #0066cc !important;
        color: #ffffff !important;
        border-left-color: #ffffff !important;
        transform: translateX(3px) !important;
        box-shadow: 0 2px 8px rgba(0, 102, 204, 0.4) !important;
    }

    /* Hover - CONTRASTE MEDIO */
    .cm-tooltip-autocomplete ul li:hover:not([aria-selected="true"]) {
        background: #333333 !important;
        color: #ffffff !important;
        border-left-color: #666666 !important;
        transform: translateX(1px) !important;
    }

    /* === ESTILOS PARA DIFERENTES TIPOS === */

    /* Métodos */
    .cm-tooltip-autocomplete ul li[data-type="method"]::before {
        content: "⚡";
        color: #4fc3f7;
        font-weight: bold;
    }

    /* Variables/Instancias */
    .cm-tooltip-autocomplete ul li[data-type="variable"]::before,
    .cm-tooltip-autocomplete ul li[data-type="class"]::before {
        content: "📦";
        color: #81c784;
        font-weight: bold;
    }

    /* === TEXTO DE LAS OPCIONES ===  REVISAR */

    /* Nombre principal de la opción */
    .cm-completionLabel {
        font-weight: 600 !important;
        color: inherit !important;
    }

    /* Información detallada (tipos, parámetros) */
    .cm-completionDetail {
        color: #f0efefff !important;
        font-style: italic !important;
        font-size: 14px !important;
        margin-right: auto !important;
    }

    /* Información adicional */
    .cm-completionInfo {
        color: #aaaaaa !important;
        font-size: 14px !important;
        max-width: 250px !important;
    }

    /* === ANIMACIONES === */
    .cm-tooltip-autocomplete {
        animation: slideIn 0.2s ease-out !important;
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* === SCROLL PERSONALIZADO === */
    .cm-tooltip-autocomplete::-webkit-scrollbar {
        width: 6px !important;
    }

    .cm-tooltip-autocomplete::-webkit-scrollbar-track {
        background: #2d2d2d !important;
        border-radius: 3px !important;
    }

    .cm-tooltip-autocomplete::-webkit-scrollbar-thumb {
        background: #555555 !important;
        border-radius: 3px !important;
    }

    .cm-tooltip-autocomplete::-webkit-scrollbar-thumb:hover {
        background: #666666 !important;
    }

    /* === ESTILOS ADICIONALES PARA MEJOR UX === */

    /* Separador visual entre diferentes tipos */
    .cm-tooltip-autocomplete ul li + li[data-type]:not([data-type=""]) {
        border-top: 1px solid #333333;
        margin-top: 4px !important;
        padding-top: 8px !important;
    }

    /* Texto de ayuda para el comando "help" */
    .cm-tooltip-autocomplete ul li[data-type="class"] .cm-completionLabel {
        color: #ffb74d !important;
    }

    /* === RESPONSIVE === */
    @media (max-width: 768px) {
        .cm-tooltip-autocomplete {
            max-width: 90vw !important;
            font-size: 12px !important;
        }

        .cm-tooltip-autocomplete ul li {
            padding: 6px 10px !important;
        }
    }
`;