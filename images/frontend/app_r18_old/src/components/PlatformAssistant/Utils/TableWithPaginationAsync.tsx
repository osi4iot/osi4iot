import { useTable, usePagination, Column } from 'react-table';
import { FC, useEffect } from 'react';
import styled from "styled-components";
import { TimeRangeSelection } from './TimeRangeSelection';
import DeleteMeasurementsIcon from './DeleteMeasurementsIcon';
import Loader from "../../Tools/Loader";
import { ISensor } from '../TableColumns/sensorsColumns';
import SensorSelection from './SensorSelection';

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
            width: 240px;
            min-width: 240px;
            max-width: 240px;
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
        margin-right: 4px;
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


const hiddenColumnCondition = (col: any) => {
    const condition =
        col.accessor === "topic"
    return condition;
}


type TableProps<T extends object> = {
    data: T[];
    columns: Column<T>[];
    fetchData: (pageIndex: number, itemsPerPage: number) => void;
    refreshMeasurements: () => void;
    measurementTopic: string;
    loading: boolean;
    pageCount: number;
    showMeasurementSelectionTable: () => void;
    selectedSensor: ISensor;
    selectedTimeRange: string;
    setSelectedTimeRange: (selectedTimeRange: string) => void;
    setStartDate: (startDateString: string) => void;
    setEndDate: (endDateString: string) => void;
}

const TableWithPaginationAsync: FC<TableProps<any>> = (
    {
        data,
        columns,
        fetchData,
        refreshMeasurements,
        pageCount: controlledPageCount,
        showMeasurementSelectionTable,
        measurementTopic,
        loading,
        selectedSensor,
        selectedTimeRange,
        setSelectedTimeRange,
        setStartDate,
        setEndDate
    }) => {
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
            manualPagination: true,
            pageCount: controlledPageCount,
        },
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
            <SensorSelection
                showMeasurementSelectionTable={showMeasurementSelectionTable}
                selectedSensor={selectedSensor}
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
                    <DeleteMeasurementsIcon
                        measurementTopic={measurementTopic}
                        selectedSensor={selectedSensor}
                        refreshMeasurements={refreshMeasurements}
                    />
                </Pagination>
                <TimeRangeSelection
                    selectedTimeRange={selectedTimeRange}
                    setSelectedTimeRange={setSelectedTimeRange}
                    setStartDate={setStartDate}
                    setEndDate={setEndDate}
                />
            </TableOptionsContainer>
            {
                loading ?
                    <Loader />
                    :
                    <TableStyles >
                        <table {...getTableProps()}>
                            <thead>
                                {headerGroups.map(headerGroup => (
                                    <tr {...headerGroup.getHeaderGroupProps()}>
                                        {headerGroup.headers.map(column => (
                                            <th {...column.getHeaderProps()}>
                                                <HeaderContainer>
                                                    <HeaderTtileContainer>
                                                        {column.render('Header')}
                                                    </HeaderTtileContainer>
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
            }

        </TableContainer>
    )
}

export default TableWithPaginationAsync;