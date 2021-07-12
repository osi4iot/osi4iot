import { useTable, usePagination, useFilters, useSortBy } from 'react-table';
import { FC, useEffect, useMemo } from 'react';
import { Column } from 'react-table';
import styled from "styled-components";
import { matchSorter } from 'match-sorter';
import { FaSearch } from "react-icons/fa";
import { ITopic } from './TableColumns/topicsColumns';
import TopicSelection from './TopicSelection';
import { TimeRangeSelection } from './TimeRangeSelection';

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
            width: 200px;
            min-width: 200px;
            max-width: 200px;
        }

        tr td:nth-child(2),
        th td:nth-child(2) {
            width: 600px;
            min-width: 600px;
            max-width: 800px;
            word-wrap: break-word;
        }         

  }
`

const TableContainer = styled.div`
    margin-top: 20px;
    padding: 10px;
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
    margin-right: 20px;
    background-color: #202226;
    display: flex;
    justify-content: flex-start;
    align-items: center;

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

    & span input {
        height: 30px;
    }

    & button {
        margin: 0px 1px;
        
        &:hover {
            cursor: pointer;
        }
    }
`;

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

const hiddenColumnCondition = (col: any) => {
    const condition =
        col.accessor === "topic"
    return condition;
}

type row = {
    values: string[];
}

function fuzzyTextFilterFn(rows: row[], id: number, filterValue: string) {
    return matchSorter(rows, filterValue, { keys: [row => row.values[id]] })
}

type TableProps<T extends object> = {
    dataTable: T[];
    columnsTable: Column<T>[];
    componentName: string;
    fetchData: (pageIndex: number, itemsPerPage: number) => void;
    loading: boolean;
    pageCount: number;
    showMeasurementSelectionTable: () => void;
    selectedTopic: ITopic;
    selectedTimeRange: string;
    setSelectedTimeRange: (selectedTimeRange: string) => void;
    setStartDate: (startDateString: string) => void;
    setEndDate: (endDateString: string) => void;
}

const TableWithPaginationAsync: FC<TableProps<any>> = (
    {
        dataTable,
        columnsTable,
        componentName,
        fetchData,
        loading,
        pageCount: controlledPageCount,
        showMeasurementSelectionTable,
        selectedTopic,
        selectedTimeRange,
        setSelectedTimeRange,
        setStartDate,
        setEndDate
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
    } = useTable(
        {
            columns,
            data,
            initialState: {
                pageIndex: 0,
                hiddenColumns: columns.filter((col: any) => hiddenColumnCondition(col)).map(col => col.id || col.accessor) as any
            },
            defaultColumn, // Be sure to pass the defaultColumn option
            filterTypes,
        },
        useFilters, // useFilters!
        useSortBy,
        usePagination
    )

    const { pageIndex, pageSize } = state;

    // Listen for changes in pagination and use the state to fetch our new data
    useEffect(() => {
        fetchData(pageIndex, pageSize)
    }, [fetchData, pageIndex, pageSize])

    // Render the UI for your table
    return (
        <TableContainer>
            <TopicSelection
                showMeasurementSelectionTable={showMeasurementSelectionTable}
                selectedTopic={selectedTopic}
            />
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
                <TimeRangeSelection
                    selectedTimeRange={selectedTimeRange}
                    setSelectedTimeRange={setSelectedTimeRange}
                    setStartDate={setStartDate}
                    setEndDate={setEndDate}
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

export default TableWithPaginationAsync;