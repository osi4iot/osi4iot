import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';

export interface IGroup {
    id: number;
    name: string;
    acronym: string;
    orgId: number;
    folderPermission: string;
    groupUid: string;
    telegramInvitationLink: string;
    telegramChatId: string;
    isOrgDefaultGroup: boolean;
    edit: string;
    delete: string;
}

export const GROUPS_COLUMNS: Column<IGroup>[] = [
    {
        Header: "Id",
        accessor: "id"
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
        Header: "OrgId",
        accessor: "orgId"
    },
    {
        Header: "Folder Permission",
        accessor: "folderPermission"
    },
    {
        Header: "Group Hash",
        accessor: "groupUid"
    },
    {
        Header: "Telegram Invitation Link",
        accessor: "telegramInvitationLink"
    },
    {
        Header: "Telegram ChatId",
        accessor: "telegramChatId"
    },
    {
        Header: "Org Default",
        accessor: "isOrgDefaultGroup"
    },
    {
        Header: "",
        accessor: "edit",
        Cell: props => {
            const groupId = props.rows[props.row.id as unknown as number].cells[0].value;
            return <EditIcon id={groupId} />
        }
    },
    {
        Header: "",
        accessor: "delete",
        Cell: props => {
            const groupId = props.rows[props.row.id as unknown as number].cells[0].value;
            return <DeleteIcon id={groupId} />
        }
    }
]