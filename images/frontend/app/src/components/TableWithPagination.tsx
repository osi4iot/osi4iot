import { useTable, usePagination } from 'react-table';
import { FC,  useMemo } from 'react';
import { Column } from 'react-table';
import styled from "styled-components";


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
    }

    th,
    td {
		font-weight: 100;
      	margin: 0;
      	padding: 10px;
	  	text-align: left;
    }
  }
`
const Pagination = styled.div`
    padding: 10px;
    background-color: #202226;
`;



type TableProps<T extends object> = {
    dataTable: T[];
    columnsTable: Column<T>[];
}

const TableWithPagination: FC<TableProps<any>> = ({ dataTable, columnsTable }) => {
    const columns = useMemo(() => columnsTable, [columnsTable]);
    const data = useMemo(() => dataTable, [dataTable]);

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
        state: { pageIndex, pageSize },
    } = useTable(
        {
            columns,
            data,
            initialState: { pageIndex: 0 },
        },
        usePagination
    )

    // Render the UI for your table
    return (
        <>
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
                        onChange={e => {
                            const page = e.target.value ? Number(e.target.value) - 1 : 0
                            gotoPage(page)
                        }}
                        style={{ width: '100px' }}
                    />
                </span>{' '}
                <select
                    value={pageSize}
                    onChange={e => {
                        setPageSize(Number(e.target.value))
                    }}
                >
                    {[10, 20, 30, 40, 50].map(pageSize => (
                        <option key={pageSize} value={pageSize}>
                            Show {pageSize}
                        </option>
                    ))}
                </select>
            </Pagination>
            <TableStyles>
                <table {...getTableProps()}>
                    <thead>
                        {headerGroups.map(headerGroup => (
                            <tr {...headerGroup.getHeaderGroupProps()}>
                                {headerGroup.headers.map(column => (
                                    <th {...column.getHeaderProps()}>{column.render('Header')}</th>
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
        </>
    )
}

export default TableWithPagination;