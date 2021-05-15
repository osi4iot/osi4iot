import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import DisableRefreshTokenIcon from '../DisableRefreshTokenIcon';

export interface IGlobalUser {
	id: number;
	firstName: string;
	surname: string;
	login: string;
	email: string;
	telegramId: string;
	roleInPlatform: string;
    lastSeenAtAge: string;
    cancelRefreshToken: string;
    edit: string;
    delete: string;
}

export const GLOBAL_USERS_COLUMNS: Column<IGlobalUser>[] = [
    {
        Header: "Id",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "First Name",
        accessor: "firstName"
    },
    {
        Header: "Surname",
        accessor: "surname"
    },
    {
        Header: "Username",
        accessor: "login"
    },
    {
        Header: "Email",
        accessor: "email"
    },
    {
        Header: "TelegramId",
        accessor: "telegramId",
        disableFilters: true
    },
    {
        Header: () => <div style={{backgroundColor: '#202226'}}>Platform<br/>role</div>,
        accessor: "roleInPlatform",
        disableFilters: true
    },
    {
        Header: "Seen",
        accessor: "lastSeenAtAge",
        disableFilters: true
    },
    {
        Header:  () => <div style={{backgroundColor: '#202226'}}>Disable user<br/>refresh tokens</div>,
        accessor: "cancelRefreshToken",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const globalUserId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <DisableRefreshTokenIcon id={globalUserId} rowIndex={parseInt(rowIndex)} />
        }
    },
    {
        Header: "",
        accessor: "edit",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const globalUserId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <EditIcon id={globalUserId} rowIndex={parseInt(rowIndex)} />
        }
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