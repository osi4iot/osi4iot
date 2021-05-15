import { Column } from 'react-table';
import DeleteIcon from '../DeleteIcon';

export interface IRefreshToken {
	id: number;
	userId: string;
    token: string;
    createdAtAge: string;
    updatedAtAge: string;
    delete: string;
}

export const REFRESH_TOKENS_COLUMNS: Column<IRefreshToken>[] = [
    {
        Header: "Id",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "UserId",
        accessor: "userId",
        filter: 'equals'
    },
    {
        Header: "Refresh Token",
        accessor: "token",
        filter: 'equals'
    },
    {
        Header: "Created",
        accessor: "createdAtAge",
        disableFilters: true,
    },
    {
        Header: "Updated",
        accessor: "updatedAtAge",
        disableFilters: true,
    },
    {
        Header: "",
        accessor: "delete",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const globalUserId = props.rows[props.row.id as unknown as number]?.cells[0].value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0].row.id;
            return <DeleteIcon id={globalUserId} rowIndex={parseInt(rowIndex)} />
        }
    }
]