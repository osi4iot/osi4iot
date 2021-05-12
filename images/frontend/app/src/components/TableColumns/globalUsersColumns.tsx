import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';

export interface IUser {
	id: number;
	firstName: string;
	surname: string;
	login: string;
	email: string;
	telegramId: string;
	roleInPlatform: string;
    lastSeenAtAge: string;
    edit: string;
    delete: string;
}

export const GLOBAL_USERS_COLUMNS: Column<IUser>[] = [
    {
        Header: "Id",
        accessor: "id"
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
        accessor: "roleInPlatform"
    },
    {
        Header: "Seen",
        accessor: "lastSeenAtAge"
    },
    {
        Header: "",
        accessor: "edit",
        Cell: props => {
            const globalUserId = props.rows[props.row.id as unknown as number].cells[0].value;
            return <EditIcon id={globalUserId} />
        }
    },
    {
        Header: "",
        accessor: "delete",
        Cell: props => {
            const globalUserId = props.rows[props.row.id as unknown as number].cells[0].value;
            return <DeleteIcon id={globalUserId} />
        }
    }
]