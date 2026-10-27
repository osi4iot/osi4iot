// Estilos adaptables comunes de las tablas (TableWithPagination, TableWithPaginationAndRowSelection y
// TableWithPaginationAsync).
//  - La tabla ocupa todo el ancho disponible; si sus columnas no caben, se desplaza en horizontal dentro de
//    su recuadro (nunca la página).
//  - Cuando el espacio de la tabla es estrecho (consulta de contenedor, no de ventana: también funciona con
//    el menú lateral abierto o dentro de un formulario) cada fila se muestra como una tarjeta con pares
//    "columna: valor" y los iconos de acción abajo a la derecha.
//  - La barra de paginación, búsqueda y botones se reparte en varias líneas si no cabe.
import { isValidElement } from "react";
import { css } from "styled-components";

export const TABLE_CARD_BREAKPOINT = 760;

// Texto de una cabecera hecha con elementos (p. ej. "Floor<br />number" -> "Floor number")
const textOf = (node: unknown): string => {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join(" ");
    if (isValidElement(node)) {
        if (node.type === "br") return " ";
        return textOf((node.props as { children?: unknown }).children);
    }
    return "";
};

interface LabelledCell {
    getValue: () => unknown;
    column: { columnDef: { header?: unknown } };
}

// Nombre de la columna de una celda para la vista de tarjetas. Las columnas sin dato en la fila (iconos de
// acción: editar, borrar, añadir miembros... y la casilla de selección) no llevan nombre y se muestran
// juntas al final de la tarjeta.
export const cellLabel = (cell: LabelledCell): string => {
    const value = cell.getValue();
    if (value === undefined || value === null) return "";
    const header = cell.column.columnDef.header;
    if (typeof header === "string") return header;
    if (typeof header !== "function") return "";
    try {
        return textOf(header({ column: cell.column, table: undefined })).replace(/\s+/g, " ").trim();
    } catch {
        return "";
    }
};

export const tableContainerCss = css`
    width: 100%;
    max-width: 100%;
    min-width: 0;
    align-items: stretch;
    margin-left: 0;
    margin-right: 0;
    margin-top: 8px;
    padding: 12px 16px;
    container-type: inline-size;
    container-name: platform-table;

    @media (max-width: 600px) {
        padding: 8px 2px;
    }
`;

export const tableToolbarCss = css`
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 12px 20px;
    padding-right: 0;

    & > * {
        margin-left: 0 !important;
        margin-right: 0 !important;
    }

    /* el botón "New ..." a la derecha */
    & > button:last-child {
        margin-left: auto !important;
    }
`;

export const paginationCss = css`
    margin-left: 0;
    margin-right: 0;
    flex-wrap: wrap;
    row-gap: 8px;

    & span input,
    & select {
        width: 90px;
    }
`;

export const globalSearchCss = css`
    width: min(280px, 100%);
    margin-left: 0;
`;

export const tableBodyCss = css`
    padding: 0;
    width: 100%;
    overflow-x: auto;

    &::-webkit-scrollbar {
        height: 10px;
    }
    &::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    &::-webkit-scrollbar-thumb {
        background: #2c3235;
        border-radius: 5px;
    }

    table {
        width: 100%;
    }

    @container platform-table (max-width: ${TABLE_CARD_BREAKPOINT}px) {
        overflow-x: visible;

        table,
        tbody {
            display: block;
            width: 100%;
        }

        thead {
            display: none;
        }

        table tr {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 2px 6px;
            margin-bottom: 10px;
            padding: 8px 6px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            background-color: #17191d;
        }

        table tr td {
            display: grid;
            grid-template-columns: minmax(90px, 35%) minmax(0, 1fr);
            gap: 10px;
            width: 100% !important;
            min-width: 0 !important;
            max-width: none !important;
            padding: 5px 8px;
            background-color: transparent !important;
            overflow-wrap: anywhere;
        }

        table tr td::before {
            content: attr(data-label);
            color: #9aa3ad;
            font-size: 12px;
            font-weight: 500;
            line-height: 20px;
        }

        /* columnas sin nombre: iconos de acción (editar, borrar...) y casillas de selección */
        table tr td[data-label=""] {
            display: inline-flex;
            width: auto !important;
            flex: 0 0 auto;
            padding: 6px 8px;
        }

        table tr td[data-label=""]::before {
            display: none;
        }

        table tr td:not([data-label=""]) + td[data-label=""] {
            margin-left: auto;
        }

        table tr td[data-label=""]:first-child {
            order: -1;
        }
    }
`;
