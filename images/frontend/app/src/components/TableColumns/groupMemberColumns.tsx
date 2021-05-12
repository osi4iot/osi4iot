import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';

export interface IGroupMember {
	userId: number;
	firstName: string;
	surname: string;
	login: string;
	email: string;
	telegramId: string;
    roleInGroup: string;
    edit: string;
    delete: string;
}

export const GROUP_MEMBERS_COLUMNS: Column<IGroupMember>[] = [
    {
        Header: "userId",
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
        accessor: "roleInGroup"
    },
    {
        Header: "",
        accessor: "edit",
        Cell: props => {
            const groupMemberId = props.rows[props.row.id as unknown as number].cells[0].value;
            return <EditIcon id={groupMemberId} />
        }
    },
    {
        Header: "",
        accessor: "delete",
        Cell: props => {
            const groupMemberId = props.rows[props.row.id as unknown as number].cells[0].value;
            return <DeleteIcon id={groupMemberId} />
        }
    }
]