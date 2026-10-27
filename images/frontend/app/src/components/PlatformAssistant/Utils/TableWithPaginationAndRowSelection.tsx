import { FC, useMemo, useState, forwardRef, useRef, useEffect, Ref, MutableRefObject, RefObject } from "react";
import { useTable } from "@tanstack/react-table";
import styled from "styled-components";
import { FaSearch } from "react-icons/fa";
import {
    Column,
    LegacyFilterProps,
    PlatformColumnDef,
    PlatformRow,
    PlatformTable,
    getLegacyRows,
    hiddenColumnsVisibility,
    isClickInsideFormControl,
    platformTableFeatures,
    platformTableOptions,
    renderColumnFilter,
    useDebouncedCallback,
    useLegacyColumns,
    useResetPageOnSortOrFilter,
} from "./platformTable";

interface TableStylesProps {
    columnsWidth: string[];
    columnsMaxWidth: string[];
}

const TableStyles = styled.div<TableStylesProps>`
    padding: 1rem;
    background-color: #202226;

    table {
        font-size: 14px;
        border-collapse: collapse;
        border-spacing: 0;
        background-color: #202226;

        tr {
            &:nth-child(even) {
                td {
                    background-color: #202226;
                }
            }

            &:nth-child(odd) {
                td {
                    background-color: #0c0d0f;
                }
            }
        }

        th,
        td {
            font-weight: 100;
            margin: 0;
            padding: 10px;
            text-align: left;
            vertical-align: top;
        }

        tr td:nth-child(1),
        th td:nth-child(1) {
            width: "50px";
            min-width: "50px";
            max-width: "50px";
            word-wrap: break-word;
            input {
                cursor: pointer;
            }
        }

        tr td:nth-child(2),
        th td:nth-child(2) {
            width: ${(props) => props.columnsWidth[0]};
            min-width: ${(props) => props.columnsWidth[0]};
            max-width: ${(props) => props.columnsMaxWidth[0]};
            word-wrap: break-word;
        }

        tr td:nth-child(3),
        th td:nth-child(3) {
            width: ${(props) => props.columnsWidth[1]};
            min-width: ${(props) => props.columnsWidth[1]};
            max-width: ${(props) => props.columnsMaxWidth[1]};
            word-wrap: break-word;
        }

        tr td:nth-child(4),
        th td:nth-child(4) {
            width: ${(props) => props.columnsWidth[2]};
            min-width: ${(props) => props.columnsWidth[2]};
            max-width: ${(props) => props.columnsMaxWidth[2]};
            word-wrap: break-word;
        }

        tr td:nth-child(5),
        th td:nth-child(5) {
            width: ${(props) => props.columnsWidth[3]};
            min-width: ${(props) => props.columnsWidth[3]};
            max-width: ${(props) => props.columnsMaxWidth[3]};
            word-wrap: break-word;
        }

        tr td:nth-child(6),
        th td:nth-child(6) {
            width: ${(props) => props.columnsWidth[4]};
            min-width: ${(props) => props.columnsWidth[4]};
            max-width: ${(props) => props.columnsMaxWidth[4]};
            word-wrap: break-word;
        }

        tr td:nth-child(7),
        th td:nth-child(7) {
            width: ${(props) => props.columnsWidth[5]};
            min-width: ${(props) => props.columnsWidth[5]};
            max-width: ${(props) => props.columnsMaxWidth[5]};
            word-wrap: break-word;
        }

        tr td:nth-child(8),
        th td:nth-child(8) {
            width: ${(props) => props.columnsWidth[6]};
            min-width: ${(props) => props.columnsWidth[6]};
            max-width: ${(props) => props.columnsMaxWidth[6]};
            word-wrap: break-word;
        }
    }
`;

const TableContainer = styled.div`
    margin-top: 10px;
    padding: 10px 0 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    background-color: #202226;
    margin-left: auto;
    margin-right: auto;
`;

const TableOptionsContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    background-color: #202226;
    width: 100%;
    margin-bottom: 10px;
    padding-right: 20px;
`;

const Pagination = styled.div`
    margin-left: 18px;
    background-color: #202226;

    & span {
        font-size: 15px;
    }

    & span input,
    & select {
        font-size: 15px;
        background-color: #0c0d0f;
        border: 2px solid #2c3235;
        padding: 3px;
        margin-left: 2px;
        margin-right: 4px;
        color: white;
        width: 100px;

        &:focus {
            outline: none;
            box-shadow:
                rgb(20 22 25) 0px 0px 0px 2px,
                rgb(31 96 196) 0px 0px 0px 4px;
        }
    }

    & button {
        &:hover {
            cursor: pointer;
        }
    }
`;

type GlobalFilterProps = {
    globalFilter: any;
    setGlobalFilter: (value: any) => void;
};

const SearchColumn = styled.div`
    background-color: #202226;

    & input {
        font-size: 14px;
        background-color: #0c0d0f;
        border: 2px solid #2c3235;
        margin-top: 3px;
        padding: 3px 3px 3px 20px;
        color: white;

        &:focus {
            outline: none;
            box-shadow:
                rgb(20 22 25) 0px 0px 0px 2px,
                rgb(31 96 196) 0px 0px 0px 4px;
        }
    }
`;

const ArrowIcon = styled.span`
    font-size: 14px;
    background-color: #202226;
    color: #3274d9;
    margin-left: 5px;
`;

const HeaderContainer = styled.div`
    background-color: #202226;
    display: flex;
    flex-direction: column;
`;

const HeaderTtileContainer = styled.div`
    background-color: #202226;
    display: flex;
    justify-content: flex-start;
    align-items: center;
`;

const SearchContainer = styled.div`
    background-color: #202226;
    position: relative;
`;

const SearchIcon = styled(FaSearch as any)`
    position: absolute;
    top: 10px;
    left: 5px;
    font-size: 12px;
    color: #3274d9;
    background-color: #0c0d0f;
`;

const GlobalSearchIcon = styled(FaSearch as any)`
    position: absolute;
    top: 8px;
    left: 7px;
    font-size: 12px;
    color: #3274d9;
    background-color: #0c0d0f;
`;

const SearchGlobal = styled.div`
    background-color: #202226;
    width: 250px;

    & input {
        font-size: 15px;
        background-color: #0c0d0f;
        border: 2px solid #2c3235;
        padding: 3px 3px 3px 20px;
        margin-left: 2px;
        color: white;
        width: 100%;

        &:focus {
            outline: none;
            box-shadow:
                rgb(20 22 25) 0px 0px 0px 2px,
                rgb(31 96 196) 0px 0px 0px 4px;
        }
    }
`;

const GlobalFilter = ({ globalFilter, setGlobalFilter }: GlobalFilterProps) => {
    const [value, setValue] = useState(globalFilter);
    const onChange = useDebouncedCallback((value: string) => {
        setGlobalFilter(value || undefined);
    }, 200);

    return (
        <SearchContainer>
            <SearchGlobal>
                <GlobalSearchIcon />
                <input
                    value={value || ""}
                    onChange={(e) => {
                        setValue(e.target.value);
                        onChange(e.target.value);
                    }}
                    placeholder="Global search"
                />
            </SearchGlobal>
        </SearchContainer>
    );
};

// Define a default UI for filtering
const DefaultColumnFilter = ({ column: { filterValue, setFilter } }: LegacyFilterProps) => {
    return (
        <input
            value={filterValue || ""}
            onChange={(e) => {
                setFilter(e.target.value || undefined); // Set undefined to remove the filter entirely
            }}
            placeholder={`Search`}
            style={{ width: "100%" }}
        />
    );
};

interface Props {
    indeterminate?: boolean;
}

const IndeterminateCheckbox = forwardRef<HTMLInputElement, Props & Record<string, any>>(
    ({ indeterminate, ...rest }, ref: Ref<HTMLInputElement>) => {
        const defaultRef = useRef(null);
        const resolvedRef = ref || defaultRef;

        useEffect(() => {
            if ((resolvedRef as MutableRefObject<HTMLInputElement>)?.current) {
                (resolvedRef as MutableRefObject<HTMLInputElement>).current.indeterminate = indeterminate ?? false;
            }
        }, [resolvedRef, indeterminate]);

        return (
            <>
                <input type="checkbox" ref={resolvedRef as MutableRefObject<HTMLInputElement>} {...rest} />
            </>
        );
    },
);

interface IndeterminateCheckboxUniqueSelectionProps {
    indeterminate?: boolean;
    isSelected?: boolean;
    numRowsSelected: number;
    toggleRowSelected: () => void;
    uncheckAllRowsSelected: () => void;
}

const IndeterminateCheckboxUniqueSelection = forwardRef<
    HTMLInputElement,
    IndeterminateCheckboxUniqueSelectionProps & Record<string, any>
>(
    (
        { indeterminate, isSelected, numRowsSelected, toggleRowSelected, uncheckAllRowsSelected, ...rest },
        ref: Ref<HTMLInputElement>,
    ) => {
        const defaultRef = useRef(null);
        const resolvedRef = ref || defaultRef;

        const handleClick = () => {
            if (numRowsSelected === 0) {
                toggleRowSelected();
            } else {
                if (!isSelected) {
                    uncheckAllRowsSelected();
                    toggleRowSelected();
                } else {
                    toggleRowSelected();
                }
            }
        };

       useEffect(() => {
            if ((resolvedRef as RefObject<HTMLInputElement>)?.current) {
                (resolvedRef as RefObject<HTMLInputElement>).current!.indeterminate = indeterminate ?? false;
                (resolvedRef as RefObject<HTMLInputElement>).current!.checked = !!isSelected;
            }
        }, [resolvedRef, indeterminate, isSelected]);

        return (
            <>
                <input type="checkbox" ref={resolvedRef as RefObject<HTMLInputElement>} onChange={handleClick} />
            </>
        );
    },
);

type TableProps<T extends object> = {
    dataTable: T[];
    columnsTable: Column<T>[];
    selectedItem?: any | null;
    setSelectedItem?: (selectedItem: never) => void;
    setSelectedItems?: (selectedItems: never[]) => void;
    multipleSelection?: boolean;
    isGlobalFilterRequired?: boolean;
};

const TableWithPaginationAndRowSelection: FC<TableProps<any>> = ({
    dataTable,
    columnsTable,
    selectedItem = null,
    setSelectedItem,
    setSelectedItems,
    multipleSelection = true.valueOf,
    isGlobalFilterRequired = true,
}) => {
    const legacyColumns = useLegacyColumns(columnsTable);
    const data = useMemo(() => dataTable, [dataTable]);

    const columnsWidth = columnsTable.map((column, index) => {
        if (typeof column.Header !== "function") {
            const headerName = column.Header as string;
            if (headerName.slice(-2) === "Id") return "100px";
            else return "auto";
        } else return "auto";
    });

    const columnsMaxWidth = columnsTable.map((column) => {
        if (typeof column.Header !== "function") {
            const headerName = column.Header as string;
            if (headerName === "Payload format") return "450px";
            else if (headerName === "Refresh tokens") return "1200px";
            else if (headerName === "Timestamp") return "400px";
            else return "auto";
        } else return "auto";
    });

    let selectedRowId: Record<string, true> = {};
    if (!multipleSelection && selectedItem) {
        let rowId = -1;
        for (let irow = 0; irow < data.length; irow++) {
            if (data[irow].id === (selectedItem as any).id) {
                rowId = irow;
                break;
            }
        }
        selectedRowId[rowId] = true;
    }
    const selectedRowIds = useState(selectedRowId)[0];

    // Columna de selección (en v7 se añadía con hooks.visibleColumns); va la primera, como antes.
    const selectionColumn = useMemo<PlatformColumnDef>(
        () => ({
            id: "selection",
            enableSorting: false,
            enableColumnFilter: false,
            enableGlobalFilter: false,
            header: ({ table }: { table: PlatformTable }) => {
                if (multipleSelection) {
                    return (
                        <div>
                            <IndeterminateCheckbox
                                checked={table.getIsAllPageRowsSelected()}
                                indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
                                onChange={table.getToggleAllPageRowsSelectedHandler()}
                                title="Toggle All Current Page Rows Selected"
                                style={{ cursor: "pointer" }}
                            />
                        </div>
                    );
                } else {
                    return <div></div>;
                }
            },
            cell: ({ row, table }: { row: PlatformRow; table: PlatformTable }) => {
                if (multipleSelection) {
                    return (
                        <div>
                            <IndeterminateCheckbox
                                checked={row.getIsSelected()}
                                indeterminate={row.getIsSomeSelected()}
                                onChange={row.getToggleSelectedHandler()}
                                title="Toggle Row Selected"
                                style={{ cursor: "pointer" }}
                            />
                        </div>
                    );
                } else {
                    const numRowsSelected = table.getPaginatedRowModel().rows.filter((r) => r.getIsSelected()).length;
                    return (
                        <div>
                            <IndeterminateCheckboxUniqueSelection
                                isSelected={row.getIsSelected()}
                                toggleRowSelected={() => row.toggleSelected()}
                                numRowsSelected={numRowsSelected}
                                uncheckAllRowsSelected={() => table.toggleAllRowsSelected(false)}
                            />
                        </div>
                    );
                }
            },
        }) as PlatformColumnDef,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [Boolean(multipleSelection)],
    );

    const columns = useMemo(() => [selectionColumn, ...legacyColumns], [selectionColumn, legacyColumns]);

    const [initialState] = useState(() => ({
        pagination: { pageIndex: 0, pageSize: 10 },
        columnVisibility: hiddenColumnsVisibility(
            columnsTable,
            (col) => col.accessor === "geoJsonData" || col.Header === "FloorId",
        ),
        rowSelection: selectedRowIds,
    }));

    const table = useTable({
        features: platformTableFeatures,
        ...platformTableOptions,
        columns,
        data,
        initialState,
    });
    useResetPageOnSortOrFilter(table);

    const { globalFilter, rowSelection } = table.state;
    const { pageIndex, pageSize } = table.state.pagination;
    const pageCount = table.getPageCount();
    const canPreviousPage = table.getCanPreviousPage();
    const canNextPage = table.getCanNextPage();

    const gotoPage = (page: number) => {
        if (page >= 0 && page < pageCount) table.setPageIndex(page);
    };

    // Equivalente a selectedFlatRows de v7: filas seleccionadas entre las filtradas/ordenadas.
    const legacyRows = getLegacyRows(table);
    const selectedFlatRows = useMemo(
        () => legacyRows.filter((row) => rowSelection[row.id]),
        [legacyRows, rowSelection],
    );

    useEffect(() => {
        const selectedRows = selectedFlatRows.map((d) => d.original);
        if (setSelectedItem) setSelectedItem(selectedRows[0] as never);
        else if (setSelectedItems) setSelectedItems(selectedRows as never);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFlatRows]);

    // Render the UI for your table
    return (
        <TableContainer>
            <TableOptionsContainer>
                <Pagination>
                    <button onClick={() => gotoPage(0)} disabled={!canPreviousPage}>
                        {"<<"}
                    </button>{" "}
                    <button onClick={() => table.previousPage()} disabled={!canPreviousPage}>
                        {"<"}
                    </button>{" "}
                    <button onClick={() => table.nextPage()} disabled={!canNextPage}>
                        {">"}
                    </button>{" "}
                    <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>
                        {">>"}
                    </button>{" "}
                    <span>
                        Page{" "}
                        <strong>
                            {pageIndex + 1} of {pageCount}
                        </strong>{" "}
                    </span>
                    <span>
                        | Go to page:{" "}
                        <input
                            type="number"
                            defaultValue={pageIndex + 1}
                            min={1}
                            max={pageCount}
                            onChange={(e) => {
                                const page = e.target.value ? Number(e.target.value) - 1 : 0;
                                gotoPage(page);
                            }}
                        />
                    </span>{" "}
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            table.setPageSize(Number(e.target.value));
                        }}
                    >
                        {[10, 15, 20, 25, 30, 35, 40, 45, 50].map((pageSize) => (
                            <option key={pageSize} value={pageSize} style={{ fontSize: "15px" }}>
                                Show {pageSize}
                            </option>
                        ))}
                    </select>
                </Pagination>
                {isGlobalFilterRequired && (
                    <GlobalFilter globalFilter={globalFilter} setGlobalFilter={(value) => table.setGlobalFilter(value)} />
                )}
            </TableOptionsContainer>
            <TableStyles columnsWidth={columnsWidth} columnsMaxWidth={columnsMaxWidth}>
                <table role="table">
                    <thead>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id} role="row">
                                {headerGroup.headers.map((header) => {
                                    const column = header.column;
                                    const canSort = column.getCanSort();
                                    const toggleSorting = column.getToggleSortingHandler();
                                    const isSorted = column.getIsSorted();
                                    return (
                                        <th
                                            key={header.id}
                                            colSpan={header.colSpan}
                                            role="columnheader"
                                            title={canSort ? "Toggle SortBy" : undefined}
                                            style={canSort ? { cursor: "pointer" } : undefined}
                                            onClick={(e) => {
                                                if (toggleSorting && !isClickInsideFormControl(e)) toggleSorting(e);
                                            }}
                                        >
                                            <HeaderContainer>
                                                <HeaderTtileContainer>
                                                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                                                    <ArrowIcon>
                                                        {isSorted ? (isSorted === "desc" ? " ▼" : " ▲") : ""}
                                                    </ArrowIcon>
                                                </HeaderTtileContainer>
                                                <SearchContainer>
                                                    {column.getCanFilter() ? <SearchIcon /> : null}
                                                    <SearchColumn>
                                                        {column.getCanFilter()
                                                            ? renderColumnFilter(table, column, DefaultColumnFilter)
                                                            : null}
                                                    </SearchColumn>
                                                </SearchContainer>
                                            </HeaderContainer>
                                        </th>
                                    );
                                })}
                            </tr>
                        ))}
                    </thead>
                    <tbody role="rowgroup">
                        {table.getRowModel().rows.map((row) => (
                            <tr key={row.id} role="row">
                                {row.getVisibleCells().map((cell) => (
                                    <td key={cell.id} role="cell">
                                        <table.FlexRender cell={cell} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </TableStyles>
        </TableContainer>
    );
};

export default TableWithPaginationAndRowSelection;
