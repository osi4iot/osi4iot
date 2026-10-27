import { FC, useEffect, useState } from 'react';
import { useTable } from '@tanstack/react-table';
import { Column, hiddenColumnsVisibility, platformTableFeatures, platformTableOptions, useLegacyColumns } from './platformTable';
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
    const tableColumns = useLegacyColumns(columns);
    const [initialState] = useState(() => ({
        pagination: { pageIndex: 0, pageSize: 10 },
        columnVisibility: hiddenColumnsVisibility(columns, hiddenColumnCondition),
    }));

    const table = useTable({
        features: platformTableFeatures,
        ...platformTableOptions,
        columns: tableColumns,
        data,
        initialState,
        // Paginación en servidor: `data` ya es la página actual
        manualPagination: true,
        pageCount: controlledPageCount,
        // v7: esta tabla no tenía ordenación ni filtros
        enableSorting: false,
        enableFilters: false,
        enableGlobalFilter: false,
    });

    const { pageIndex, pageSize } = table.state.pagination;
    const pageCount = table.getPageCount();
    const canPreviousPage = table.getCanPreviousPage();
    const canNextPage = table.getCanNextPage();

    const gotoPage = (page: number) => {
        if (page >= 0 && (pageCount === -1 || page < pageCount)) table.setPageIndex(page);
    };

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
                    <button onClick={() => table.previousPage()} disabled={!canPreviousPage}>
                        {'<'}
                    </button>{' '}
                    <button onClick={() => table.nextPage()} disabled={!canNextPage}>
                        {'>'}
                    </button>{' '}
                    <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>
                        {'>>'}
                    </button>{' '}
                    <span>
                        Page{' '}
                        <strong>
                            {pageIndex + 1} of {pageCount}
                        </strong>{' '}
                    </span>
                    <span>
                        | Go to page:{' '}
                        <input
                            type="number"
                            defaultValue={pageIndex + 1}
                            min={1}
                            max={pageCount}
                            onChange={e => {
                                const page = e.target.value ? Number(e.target.value) - 1 : 0
                                gotoPage(page)
                            }}
                        />
                    </span>{' '}
                    <select
                        value={pageSize}
                        onChange={e => {
                            table.setPageSize(Number(e.target.value))
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
                        <table role="table">
                            <thead>
                                {table.getHeaderGroups().map(headerGroup => (
                                    <tr key={headerGroup.id} role="row">
                                        {headerGroup.headers.map(header => (
                                            <th key={header.id} colSpan={header.colSpan} role="columnheader">
                                                <HeaderContainer>
                                                    <HeaderTtileContainer>
                                                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                                                    </HeaderTtileContainer>
                                                </HeaderContainer>
                                            </th>
                                        ))}
                                    </tr>
                                ))}
                            </thead>
                            <tbody role="rowgroup">
                                {table.getRowModel().rows.map(row => (
                                    <tr key={row.id} role="row">
                                        {row.getVisibleCells().map(cell => (
                                            <td key={cell.id} role="cell"><table.FlexRender cell={cell} /></td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </TableStyles>
            }

        </TableContainer>
    )
}

export default TableWithPaginationAsync;