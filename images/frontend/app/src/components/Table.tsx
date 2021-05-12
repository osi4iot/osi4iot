import { useTable } from 'react-table';
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


type TableProps<T extends object> = {
	dataTable: T[];
	columnsTable: Column<T>[];
}

const Table: FC<TableProps<any>> = ({ dataTable, columnsTable }) => {
	const columns = useMemo(() => columnsTable, [columnsTable]);
	const data = useMemo(() => dataTable, [dataTable]);

	const {
		getTableProps,
		getTableBodyProps,
		headerGroups,
		rows,
		prepareRow,
	} = useTable({ columns, data })

	return (
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
					{rows.map((row, i) => {
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
	)
}

export default Table;