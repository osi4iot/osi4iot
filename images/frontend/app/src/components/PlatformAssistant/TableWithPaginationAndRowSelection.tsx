import { useTable, usePagination, useFilters, useGlobalFilter, useAsyncDebounce, useSortBy, useRowSelect } from 'react-table';
import { FC, useMemo, useState, forwardRef, useRef, useEffect, Ref, MutableRefObject, ChangeEvent } from 'react';
import { Column } from 'react-table';
import styled from "styled-components";
import { matchSorter } from 'match-sorter';
import { FaSearch } from "react-icons/fa";



const TableStyles = styled.div`
  padding: 1rem;
  background-color: #202226;

  table {
        font-size: 14px;
        border-collapse: collapse;
        border-spacing: 0;
        background-color: #202226;

        tr {
            :nth-child(even) {
                td {
                    background-color: #202226;
                }
            }

            :nth-child(odd) {
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
            width: 50px;
            min-width: 50px;
            max-width: 50px;

            div input[type=checkbox]:hover {
                cursor: pointer;
            }
        }

        tr td:nth-child(2),
        th td:nth-child(2) {
            width: 100px;
            min-width: 100px;
            max-width: 150px;
        }
           

        th:nth-child(6) {
            padding: 10px 0px 10px 10px;
        }
  }
`

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
        color: white;
        width: 100px;

        &:focus {
            outline: none;
            box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
        }
    }

    & button {
        &:hover {
            cursor: pointer;
        }
    }
`;


type GlobalFilterProps = {
    preGlobalFilteredRows: any,
    globalFilter: any,
    setGlobalFilter: any,
}

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
            box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
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

const SearchIcon = styled(FaSearch)`
    position: absolute;
    top: 10px;
    left: 5px;
	font-size: 12px;
	color: #3274d9;
    background-color: #0c0d0f;
`;

const GlobalSearchIcon = styled(FaSearch)`
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
            box-shadow: rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px;
        }
    }   
`;



const GlobalFilter = ({
    preGlobalFilteredRows,
    globalFilter,
    setGlobalFilter
}: GlobalFilterProps) => {
    const [value, setValue] = useState(globalFilter)
    const onChange = useAsyncDebounce(value => {
        setGlobalFilter(value || undefined)
    }, 200)

    return (
        <SearchContainer>
            <SearchGlobal>
                <GlobalSearchIcon />
                <input
                    value={value || ""}
                    onChange={e => {
                        setValue(e.target.value);
                        onChange(e.target.value);
                    }}
                    placeholder="Global search"
                />
            </SearchGlobal>
        </SearchContainer>
    )
};

type DefaultColumnFilterProps = {
    column: {
        filterValue: any,
        preFilteredRows: any,
        setFilter: any,
    }
}

// Define a default UI for filtering
const DefaultColumnFilter = ({
    column: { filterValue, preFilteredRows, setFilter },
}: DefaultColumnFilterProps) => {

    return (
        <input
            value={filterValue || ''}
            onChange={e => {
                setFilter(e.target.value || undefined) // Set undefined to remove the filter entirely
            }}
            placeholder={`Search`}
            style={{ width: '100%' }}
        />
    )
}

type row = {
    values: string[];
}

function fuzzyTextFilterFn(rows: row[], id: number, filterValue: string) {
    return matchSorter(rows, filterValue, { keys: [row => row.values[id]] })
}



interface Props {
    indeterminate?: boolean;
}

const IndeterminateCheckbox = forwardRef<HTMLInputElement, Props & Record<string, any>>(
    ({ indeterminate, ...rest }, ref: Ref<HTMLInputElement>) => {
        const defaultRef = useRef()
        const resolvedRef = ref || defaultRef

        useEffect(() => {
            if ((resolvedRef as MutableRefObject<HTMLInputElement>)?.current) {
                (resolvedRef as MutableRefObject<HTMLInputElement>).current.indeterminate = indeterminate ?? false;;
            }

        }, [resolvedRef, indeterminate])

        return (
            <>
                <input type="checkbox" ref={resolvedRef as MutableRefObject<HTMLInputElement>} {...rest} />
            </>
        )
    }
)

interface IndeterminateCheckboxUniqueSelectionProps {
    indeterminate?: boolean;
    isSelected?: boolean;
    numRowsSelected: number;
    toggleRowSelected: () => void;
    uncheckAllRowsSelected: () => void;
}

const IndeterminateCheckboxUniqueSelection = forwardRef<HTMLInputElement, IndeterminateCheckboxUniqueSelectionProps & Record<string, any>>(
    ({ indeterminate, isSelected, numRowsSelected, toggleRowSelected, uncheckAllRowsSelected, ...rest }, ref: Ref<HTMLInputElement>) => {
        const defaultRef = useRef();
        const resolvedRef = ref || defaultRef;

        const handleClick = (e: ChangeEvent<HTMLInputElement>) => {
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
        }

        useEffect(() => {
            if ((resolvedRef as MutableRefObject<HTMLInputElement>)?.current) {
                (resolvedRef as MutableRefObject<HTMLInputElement>).current.indeterminate = indeterminate ?? false;
                (resolvedRef as MutableRefObject<HTMLInputElement>).current.checked = !!isSelected;
            }

        }, [resolvedRef, indeterminate, isSelected])

        return (
            <>
                <input
                    type="checkbox"
                    ref={resolvedRef as MutableRefObject<HTMLInputElement>}
                    onChange={handleClick}
                />
            </>
        )

    }
)



type TableProps<T extends object> = {
    dataTable: T[];
    columnsTable: Column<T>[];
    setSelectedUsers?: (selectedUsers: never[]) => void;
    setSelectedOrgOfGroupsManaged?: (selectedOrgOfGroupsManaged: never) => void;
    setSelectedGroupManaged?: (selectedGroupManaged: never) => void;
    setSelectedDevice?: (selectedDevice: never) => void;
    setSelectedDigitalTwin?: (selecteDigitalTwin: never) => void;
    multipleSelection?: boolean;
}

const TableWithPaginationAndRowSelection: FC<TableProps<any>> = (
    {
        dataTable,
        columnsTable,
        setSelectedUsers,
        setSelectedOrgOfGroupsManaged,
        setSelectedGroupManaged,
        setSelectedDevice,
        setSelectedDigitalTwin,
        multipleSelection = true
    }) => {
    const columns = useMemo(() => columnsTable, [columnsTable]);
    const data = useMemo(() => dataTable, [dataTable]);

    const filterTypes = useMemo(
        () => ({
            // Add a new fuzzyTextFilterFn filter type.
            fuzzyText: fuzzyTextFilterFn,
            // Or, override the default text filter to use
            // "startWith"
            text: (rows: row[], id: number, filterValue: string) => {
                return rows.filter(row => {
                    const rowValue = row.values[id]
                    return rowValue !== undefined
                        ? String(rowValue)
                            .toLowerCase()
                            .startsWith(String(filterValue).toLowerCase())
                        : true
                })
            },
        }),
        []
    )

    const defaultColumn = useMemo(
        () => ({
            // Let's set up our default Filter UI
            Filter: DefaultColumnFilter,
        }),
        []
    )


    const {
        getTableProps,
        getTableBodyProps,
        headerGroups,
        prepareRow,
        page, // Instead of using 'rows', we'll use page,
        canPreviousPage,
        canNextPage,
        pageOptions,
        pageCount,
        gotoPage,
        nextPage,
        previousPage,
        setPageSize,
        state,
        preGlobalFilteredRows,
        setGlobalFilter,
        selectedFlatRows,
        toggleAllRowsSelected,
    } = useTable(
        {
            columns,
            data,
            initialState: {
                pageIndex: 0,
                hiddenColumns: columns.filter((col: any) => (col.accessor === "geoJsonData" || col.accessor === "geoJsonDataBase")).map(col => col.id || col.accessor) as any
            },
            defaultColumn, // Be sure to pass the defaultColumn option
            filterTypes,
        },
        useFilters, // useFilters!
        useGlobalFilter, // useGlobalFilter!
        useSortBy,
        usePagination,
        useRowSelect,
        hooks => {
            hooks.visibleColumns.push(columns => [
                // Let's make a column for selection
                {
                    id: 'selection',
                    // The header can use the table's getToggleAllRowsSelectedProps method
                    // to render a checkbox
                    Header: ({ getToggleAllPageRowsSelectedProps }) => {
                        if (multipleSelection) {
                            return (
                                <div>
                                    <IndeterminateCheckbox
                                        {...getToggleAllPageRowsSelectedProps()}
                                    />
                                </div>
                            )
                        } else {
                            return <div></div>
                        }
                    },
                    Cell: ({ row }) => {
                        const numRowsSelected = page.filter((row) => row.isSelected).length;
                        if (multipleSelection) {
                            return (
                                <div>
                                    <IndeterminateCheckbox {...row.getToggleRowSelectedProps()} />
                                </div>
                            )
                        } else {
                            return (
                                <div>
                                    <IndeterminateCheckboxUniqueSelection
                                        isSelected={row.isSelected}
                                        toggleRowSelected={() => row.toggleRowSelected()}
                                        numRowsSelected={numRowsSelected}
                                        uncheckAllRowsSelected={() => toggleAllRowsSelected(false)}
                                        {...row.getToggleRowSelectedProps()} />
                                </div>
                            );
                        }
                    }
                },
                ...columns,
            ])
        }
    )

    const { globalFilter, pageIndex, pageSize } = state;

    useEffect(() => {
        const selectedRows = selectedFlatRows.map(d => d.original);
        if (setSelectedUsers) setSelectedUsers(selectedRows as never[]);
        else if (setSelectedOrgOfGroupsManaged) setSelectedOrgOfGroupsManaged(selectedRows[0] as never);
        else if (setSelectedGroupManaged) setSelectedGroupManaged(selectedRows[0] as never);
        else if (setSelectedDevice) setSelectedDevice(selectedRows[0] as never);
        else if (setSelectedDigitalTwin) setSelectedDigitalTwin(selectedRows[0] as never);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFlatRows]);


    // Render the UI for your table
    return (
        <TableContainer>
            <TableOptionsContainer>
                <Pagination>
                    <button onClick={() => gotoPage(0)} disabled={!canPreviousPage}>
                        {'<<'}
                    </button>{' '}
                    <button onClick={() => previousPage()} disabled={!canPreviousPage}>
                        {'<'}
                    </button>{' '}
                    <button onClick={() => nextPage()} disabled={!canNextPage}>
                        {'>'}
                    </button>{' '}
                    <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>
                        {'>>'}
                    </button>{' '}
                    <span>
                        Page{' '}
                        <strong>
                            {pageIndex + 1} of {pageOptions.length}
                        </strong>{' '}
                    </span>
                    <span>
                        | Go to page:{' '}
                        <input
                            type="number"
                            defaultValue={pageIndex + 1}
                            min={1}
                            max={pageOptions.length}
                            onChange={e => {
                                const page = e.target.value ? Number(e.target.value) - 1 : 0
                                gotoPage(page)
                            }}
                        />
                    </span>{' '}
                    <select
                        value={pageSize}
                        onChange={e => {
                            setPageSize(Number(e.target.value))
                        }}
                    >
                        {[10, 15, 20, 25, 30, 35, 40, 45, 50].map(pageSize => (
                            <option key={pageSize} value={pageSize} style={{ fontSize: '15px' }}>
                                Show {pageSize}
                            </option>
                        ))}
                    </select>
                </Pagination>
                <GlobalFilter
                    preGlobalFilteredRows={preGlobalFilteredRows}
                    globalFilter={globalFilter}
                    setGlobalFilter={setGlobalFilter}
                />
            </TableOptionsContainer>
            <TableStyles >
                <table {...getTableProps()}>
                    <thead>
                        {headerGroups.map(headerGroup => (
                            <tr {...headerGroup.getHeaderGroupProps()}>
                                {headerGroup.headers.map(column => (
                                    <th {...column.getHeaderProps(column.getSortByToggleProps())}>
                                        <HeaderContainer>
                                            <HeaderTtileContainer>
                                                {column.render('Header')}
                                                <ArrowIcon>
                                                    {column.isSorted
                                                        ? column.isSortedDesc
                                                            ? ' ▼'
                                                            : ' ▲'
                                                        : ''}
                                                </ArrowIcon>
                                            </HeaderTtileContainer>
                                            <SearchContainer>
                                                {column.canFilter ? <SearchIcon /> : null}
                                                <SearchColumn>{column.canFilter ? column.render('Filter') : null}</SearchColumn>
                                            </SearchContainer>
                                        </HeaderContainer>
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody {...getTableBodyProps()}>
                        {page.map((row, i) => {
                            prepareRow(row)
                            return (
                                <tr {...row.getRowProps()}>
                                    {row.cells.map(cell => {
                                        return <td {...cell.getCellProps()}>{cell.render('Cell')}</td>
                                    })}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </TableStyles>
        </TableContainer>
    )
}

export default TableWithPaginationAndRowSelection;