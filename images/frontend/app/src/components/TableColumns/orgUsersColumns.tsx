import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';

export interface IOrgUser {
    orgId: number;
	userId: number;
	firstName: string;
	surname: string;
	login: string;
    email: string;
	telegramId: string;
	roleInOrg: string;
    lastSeenAtAge: string;
    edit: string;
    delete: string;
}

export const ORG_USERS_COLUMNS: Column<IOrgUser>[] = [
    {
        Header: "OrgId",
        accessor: "orgId",
        filter: 'equals'
    }, 
    {
        Header: "UserId",
        accessor: "userId",
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
        disableFilters: true,
    },
    {
        Header: () => <div style={{backgroundColor: '#202226'}}>Role<br/>in org</div>,
        accessor: "roleInOrg",
        disableFilters: true,
    },
    {
        Header: "Seen",
        accessor: "lastSeenAtAge",
        disableFilters: true
    },
    {
        Header: "",
        accessor: "edit",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const userId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <EditIcon id={userId} rowIndex={parseInt(rowIndex)} />
        }
    },
    {
        Header: "",
        accessor: "delete",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const userId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <DeleteIcon id={userId} rowIndex={parseInt(rowIndex)} />
        }
    }
]