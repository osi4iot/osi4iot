import { FC } from 'react';
import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import Modal from '../Modal';

export interface IGroupMember {
    groupId: number;
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

interface DeleteGroupMemberModalProps {
    rowIndex: number;
    groupMemberId: number;
}

const DeleteGroupMemberModal: FC<DeleteGroupMemberModalProps> = ({ rowIndex, groupMemberId }) => {
    const component = "group member";
    const consequences = "The member are going to be remove of the group but continues active in the org.";
    const action = () => {
        console.log("Delete group member with id=", groupMemberId);;
    }

    const [showModal] = Modal(component, consequences, action);

    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}

export const GROUP_MEMBERS_COLUMNS: Column<IGroupMember>[] = [
    {
        Header: "GroupId",
        accessor: "groupId",
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
        disableFilters: true
    },
    {
        Header: () => <div style={{backgroundColor: '#202226'}}>Role in<br/>group</div>,
        accessor: "roleInGroup",
        disableFilters: true
    },
    {
        Header: "",
        accessor: "edit",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const groupMemberId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <EditIcon id={groupMemberId} rowIndex={parseInt(rowIndex)} />
        }
    },
    {
        Header: "",
        accessor: "delete",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const groupMemberId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <DeleteGroupMemberModal groupMemberId={groupMemberId} rowIndex={parseInt(rowIndex)} />
        }
    }
]