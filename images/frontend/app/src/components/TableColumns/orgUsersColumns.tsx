import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';

export interface IOrgUser {
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
        Header: "TelegramId",
        accessor: "telegramId"
    },
    {
        Header: "Role",
        accessor: "roleInOrg"
    },
    {
        Header: "Seen",
        accessor: "lastSeenAtAge"
    },
    {
        Header: "",
        accessor: "edit",
        Cell: props => {
            const userId = props.rows[props.row.id as unknown as number].cells[0].value;
            return <EditIcon id={userId} />
        }
    },
    {
        Header: "",
        accessor: "delete",
        Cell: props => {
            const userId = props.rows[props.row.id as unknown as number].cells[0].value;
            return <DeleteIcon id={userId} />
        }
    }
]