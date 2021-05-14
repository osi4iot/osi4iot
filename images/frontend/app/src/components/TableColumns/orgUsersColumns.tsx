import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';

export interface IOrgUser {
	userId: number;
	firstName: string;
	surname: string;
	login: string;
    email: string;
    orgId: number;
	telegramId: string;
	roleInOrg: string;
    lastSeenAtAge: string;
    edit: string;
    delete: string;
}

export const ORG_USERS_COLUMNS: Column<IOrgUser>[] = [
    {
        Header: "UserId",
        accessor: "userId"
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
        Header: "OrgId",
        accessor: "orgId"
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
            const userId = props.rows[props.row.id as unknown as number]?.cells[0].value;
            return <EditIcon id={userId} />
        }
    },
    {
        Header: "",
        accessor: "delete",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const userId = props.rows[props.row.id as unknown as number]?.cells[0].value;
            return <DeleteIcon id={userId} />
        }
    }
]