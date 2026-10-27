/**
 * Capa común de tablas sobre TanStack Table v9.
 *
 * La aplicación define sus columnas (carpeta TableColumns) con el formato de react-table v7
 * (`Header`, `accessor`, `Cell`, `filter`, `disableFilters`, `disableSortBy`...). Para no reescribir
 * ~300 definiciones de columnas, este módulo:
 *   - exporta los tipos `Column` y `CellProps` con ese formato (sustituyen a los de "react-table"),
 *   - convierte esas columnas a `ColumnDef` de TanStack v9 (`useLegacyColumns`),
 *   - reproduce la semántica de v7: filtros "text"/"equals", orden "alphanumeric" ascendente primero,
 *     filtro global sobre todas las columnas y las props que recibían los `Cell`
 *     (`value`, `row.id`, `row.index`, `row.original`, `row.cells[n].value`, `rows`...).
 */
import { ComponentType, MouseEvent, ReactNode, useEffect, useMemo, useRef } from "react";
import {
    columnFilteringFeature,
    columnVisibilityFeature,
    constructFilterFn,
    createFilteredRowModel,
    createPaginatedRowModel,
    createSortedRowModel,
    globalFilteringFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    sortFn_alphanumeric,
    tableFeatures,
    type CellContext,
    type ColumnDef,
    type HeaderContext,
    type ReactTable,
    type Row,
    type Table,
} from "@tanstack/react-table";
import { matchSorter } from "match-sorter";

// ─── Tipos con el formato de columnas de react-table v7 ─────────────────────────────────────────

export interface LegacyCell<V = any> {
    value: V;
    column: { id: string };
}

export interface LegacyRow<T = any> {
    id: string;
    index: number;
    original: T;
    values: Record<string, any>;
    /** Celdas visibles, en el orden de las columnas visibles (igual que `row.cells` en v7). */
    cells: LegacyCell[];
    isSelected: boolean;
}

export interface CellProps<T extends object = any, V = any> {
    value: V;
    row: LegacyRow<T>;
    /** Filas filtradas y ordenadas (antes de paginar), como `instance.rows` en v7. */
    rows: LegacyRow<T>[];
    column: { id: string };
    cell: LegacyCell<V>;
}

export interface LegacyFilterProps {
    column: {
        id: string;
        filterValue: any;
        setFilter: (value: any) => void;
        preFilteredRows: LegacyRow[];
    };
}

export type LegacyFilterType = "text" | "equals" | "fuzzyText" | "numeric";

export interface Column<T extends object = any> {
    Header: string | ((props: any) => ReactNode);
    accessor?: (keyof T & string) | (string & {});
    id?: string;
    Cell?: (props: CellProps<T, any>) => ReactNode;
    Filter?: ComponentType<LegacyFilterProps>;
    filter?: LegacyFilterType;
    disableFilters?: boolean;
    disableSortBy?: boolean;
    width?: number | string;
    maxWidth?: number | string;
}

// ─── Funciones de filtrado equivalentes a las de v7 ─────────────────────────────────────────────

// v7 "text": contiene, sin distinguir mayúsculas.
const filterFnText = constructFilterFn({
    filter: (dataValue: unknown, filterValue: unknown) =>
        String(dataValue).toLowerCase().includes(String(filterValue).toLowerCase()),
    autoRemove: (val: unknown) => !val,
});

// v7 "equals": igualdad "débil" (==), p. ej. el texto "5" coincide con el número 5.
const filterFnEquals = constructFilterFn({
    // eslint-disable-next-line eqeqeq
    filter: (dataValue: unknown, filterValue: unknown) => dataValue == filterValue,
    autoRemove: (val: unknown) => val == null,
});

const filterFnFuzzyText = constructFilterFn({
    filter: (dataValue: unknown, filterValue: unknown) =>
        matchSorter([String(dataValue ?? "")], String(filterValue)).length > 0,
    autoRemove: (val: unknown) => !val,
});

const numericRegex = /([=<>!]*)\s*((?:[0-9].?[0-9]*)+)/;
const filterFnNumeric = constructFilterFn({
    filter: (dataValue: any, filterValue: any) => {
        const tokens = numericRegex.exec(filterValue);
        // eslint-disable-next-line eqeqeq
        if (!tokens) return dataValue == filterValue;
        const target = parseFloat(tokens[2]);
        const val = parseFloat(dataValue);
        switch (tokens[1]) {
            case ">": return val > target;
            case "<": return val < target;
            case "<=": return val <= target;
            case ">=": return val >= target;
            case "=": return val === target;
            case "!": return val !== target;
            // eslint-disable-next-line eqeqeq
            default: return dataValue == filterValue;
        }
    },
    autoRemove: (val: unknown) => !val,
});

// ─── Features de TanStack v9 (deben ser estables: ámbito de módulo) ─────────────────────────────

export const platformTableFeatures = tableFeatures({
    columnVisibilityFeature,
    columnFilteringFeature,
    globalFilteringFeature,
    rowSortingFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    filteredRowModel: createFilteredRowModel(),
    sortedRowModel: createSortedRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
    filterFns: {
        text: filterFnText,
        equals: filterFnEquals,
        fuzzyText: filterFnFuzzyText,
        numeric: filterFnNumeric,
    },
    sortFns: { alphanumeric: sortFn_alphanumeric },
});

export type PlatformFeatures = typeof platformTableFeatures;
export type PlatformTable = Table<PlatformFeatures, any>;
export type PlatformRow = Row<PlatformFeatures, any>;
export type PlatformColumnDef = ColumnDef<PlatformFeatures, any, any>;

/** Opciones comunes para todas las tablas de la plataforma (comportamiento de react-table v7). */
export const platformTableOptions = {
    globalFilterFn: "text" as const,
    // v7 aplicaba el filtro global a todas las columnas (incluidas las ocultas).
    getColumnCanGlobalFilter: () => true,
    // v7 no tenía selección por rangos con Shift.
    enableRowRangeSelection: false,
};

// ─── Conversión de filas al formato de v7 (para los `Cell` existentes) ──────────────────────────

const legacyRowsCache = new WeakMap<object, LegacyRow[]>();

function toLegacyRow(row: PlatformRow): LegacyRow {
    let cells: LegacyCell[] | null = null;
    let values: Record<string, any> | null = null;
    return {
        id: row.id,
        index: row.index,
        original: row.original,
        get values() {
            if (!values) {
                values = {};
                for (const cell of row.getAllCells()) values[cell.column.id] = cell.getValue();
            }
            return values;
        },
        get cells() {
            if (!cells) {
                cells = row.getVisibleCells().map((cell) => ({
                    value: cell.getValue(),
                    column: { id: cell.column.id },
                }));
            }
            return cells;
        },
        get isSelected() {
            return row.getIsSelected();
        },
    };
}

/** Filas filtradas y ordenadas, sin paginar, en formato v7 (memorizadas por modelo de filas). */
export function getLegacyRows(table: PlatformTable): LegacyRow[] {
    const rows = table.getPrePaginatedRowModel().rows;
    let legacyRows = legacyRowsCache.get(rows);
    if (!legacyRows) {
        legacyRows = rows.map(toLegacyRow);
        legacyRowsCache.set(rows, legacyRows);
    }
    return legacyRows;
}

function getLegacyRow(table: PlatformTable, row: PlatformRow): LegacyRow {
    return getLegacyRows(table).find((legacyRow) => legacyRow.id === row.id) ?? toLegacyRow(row);
}

const defaultLegacyCell = ({ value = "" }: { value?: any }) => value;

// ─── Conversión de columnas ────────────────────────────────────────────────────────────────────

export function legacyColumnId(column: Column<any>, index: number): string {
    if (column.id) return column.id;
    if (typeof column.accessor === "string") return column.accessor;
    return `column_${index}`;
}

/**
 * Convierte columnas con formato v7 a `ColumnDef` de TanStack v9.
 *
 * Las definiciones resultantes son estables mientras no cambie la "forma" de las columnas
 * (cabecera, accessor, filtros...). Los `Cell`/`Header` se leen siempre de la última versión
 * recibida, así que los closures (p. ej. callbacks de refresco) nunca quedan obsoletos.
 */
export function useLegacyColumns(columnsTable: Column<any>[]): PlatformColumnDef[] {
    const latestColumnsRef = useRef(columnsTable);
    latestColumnsRef.current = columnsTable;

    const signature = columnsTable
        .map((col, index) =>
            [
                legacyColumnId(col, index),
                typeof col.Header === "function" ? "ƒ" : col.Header,
                col.accessor ?? "",
                col.filter ?? "",
                col.disableFilters ? 1 : 0,
                col.disableSortBy ? 1 : 0,
                col.Filter ? 1 : 0,
            ].join("|"),
        )
        .join("§");

    return useMemo(() => {
        return latestColumnsRef.current.map((col, index): PlatformColumnDef => {
            const id = legacyColumnId(col, index);
            const hasAccessor = typeof col.accessor === "string";
            const def: Record<string, any> = {
                id,
                header:
                    typeof col.Header === "function"
                        ? (ctx: HeaderContext<PlatformFeatures, any, any>) => {
                              const header = latestColumnsRef.current[index]?.Header;
                              return typeof header === "function" ? header({ column: ctx.column, table: ctx.table }) : header;
                          }
                        : col.Header,
                cell: (ctx: CellContext<PlatformFeatures, any, any>) => {
                    const Cell = latestColumnsRef.current[index]?.Cell ?? defaultLegacyCell;
                    const value = ctx.getValue();
                    const props: CellProps = {
                        value,
                        row: getLegacyRow(ctx.table as PlatformTable, ctx.row as PlatformRow),
                        get rows() {
                            return getLegacyRows(ctx.table as PlatformTable);
                        },
                        column: { id },
                        cell: { value, column: { id } },
                    };
                    return Cell(props);
                },
                enableColumnFilter: hasAccessor && !col.disableFilters,
                enableSorting: hasAccessor && !col.disableSortBy,
                enableGlobalFilter: hasAccessor,
                filterFn: col.filter ?? "text",
                sortFn: "alphanumeric",
                // v7: primer clic ordena siempre ascendente (v9 empezaría en descendente con números).
                sortDescFirst: false,
                meta: { legacyColumn: col },
            };
            if (hasAccessor) def.accessorKey = col.accessor;
            return def as PlatformColumnDef;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);
}

/** Estado inicial de visibilidad: columnas ocultas según el criterio de cada tabla. */
export function hiddenColumnsVisibility(
    columnsTable: Column<any>[],
    isHidden: (column: Column<any>) => boolean,
): Record<string, boolean> {
    const visibility: Record<string, boolean> = {};
    columnsTable.forEach((col, index) => {
        if (isHidden(col)) visibility[legacyColumnId(col, index)] = false;
    });
    return visibility;
}

/** Componente de filtro por columna: el definido en la columna (`Filter`) o el filtro por defecto. */
export function renderColumnFilter(
    table: PlatformTable,
    column: ReturnType<PlatformTable["getAllLeafColumns"]>[number],
    DefaultFilter: ComponentType<LegacyFilterProps>,
): ReactNode {
    const legacyColumn = (column.columnDef.meta as { legacyColumn?: Column<any> } | undefined)?.legacyColumn;
    const FilterComponent = legacyColumn?.Filter ?? DefaultFilter;
    return (
        <FilterComponent
            column={{
                id: column.id,
                filterValue: column.getFilterValue(),
                setFilter: (value: any) => column.setFilterValue(value),
                get preFilteredRows() {
                    return table.getPreFilteredRowModel().rows.map(toLegacyRow);
                },
            }}
        />
    );
}

// Equivalente a useAsyncDebounce de react-table v7 (200 ms).
export const useDebouncedCallback = <A extends unknown[]>(callback: (...args: A) => void, wait: number) => {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }, []);
    return useMemo(
        () =>
            (...args: A) => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => callbackRef.current(...args), wait);
            },
        [wait],
    );
};


// En v7 el clic para ordenar estaba en todo el <th>; se ignoran los clics dentro del campo de filtro.
export const isClickInsideFormControl = (e: MouseEvent) =>
    (e.target as HTMLElement).closest("input, select, textarea, button") !== null;

/**
 * react-table v7 (autoResetPage) volvía a la primera página al cambiar la ordenación, los filtros de
 * columna o el filtro global. Se reproduce explícitamente (los cambios de `data` ya los reinicia v9).
 */
export function useResetPageOnSortOrFilter(table: ReactTable<PlatformFeatures, any>) {
    const { sorting, columnFilters, globalFilter } = table.state;
    const isFirstRun = useRef(true);
    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }
        if (table.state.pagination.pageIndex !== 0) table.setPageIndex(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sorting, columnFilters, globalFilter]);
}
