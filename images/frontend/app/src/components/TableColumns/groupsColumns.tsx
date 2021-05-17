import { FC } from 'react';
import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import Modal from '../Modal';

export interface IGroup {
    orgId: number;
    id: number;
    name: string;
    acronym: string;
    folderPermission: string;
    groupUid: string;
    telegramInvitationLink: string;
    telegramChatId: string;
    isOrgDefaultGroup: boolean;
    edit: string;
    delete: string;
}

interface DeleteGroupModalProps {
    rowIndex: number;
    groupId: number;
}

const DeleteGroupModal: FC<DeleteGroupModalProps> = ({ rowIndex, groupId }) => {
    const component = "group";
    const consequences = "All teams, folders, devices and its measurements belonging to this group are going to be lost.";
    const action = () => {
        console.log("Delete group with id=", groupId);;
    }

    const [showModal] = Modal(component, consequences, action);

    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}

export const GROUPS_COLUMNS: Column<IGroup>[] = [
    {
        Header: "OrgId",
        accessor: "orgId",
        filter: 'equals'
    },
    {
        Header: "GroupId",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "Name",
        accessor: "name"
    },
    {
        Header: "Acronym",
        accessor: "acronym"
    },
    {
        Header: () => <div style={{backgroundColor: '#202226'}}>Folder<br/>permission</div>,
        accessor: "folderPermission",
        disableFilters: true
    },
    {
        Header: "Group Hash",
        accessor: "groupUid",
        disableFilters: true
    },
    {
        Header: "Telegram Invitation Link",
        accessor: "telegramInvitationLink",
        disableFilters: true
    },
    {
        Header: () => <div style={{backgroundColor: '#202226'}}>Telegram<br/>chatId</div>,
        accessor: "telegramChatId",
        disableFilters: true
    },
    {
        Header: () => <div style={{backgroundColor: '#202226'}}>Is org<br/>default?</div>,
        accessor: "isOrgDefaultGroup",
        disableFilters: true
    },
    {
        Header: "",
        accessor: "edit",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const groupId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <EditIcon id={groupId} rowIndex={parseInt(rowIndex)} />
        }
    },
    {
        Header: "",
        accessor: "delete",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const groupId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <DeleteGroupModal groupId={groupId} rowIndex={parseInt(rowIndex)} />
        }
    }
]