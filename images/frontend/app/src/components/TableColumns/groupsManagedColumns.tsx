import { Column } from 'react-table';

export interface IGroupsManaged {
    id: number;
    name: string;
    acronym: string;
    orgId: number;
    folderPermission: string;
    groupUid: string;
    telegramInvitationLink: string;
    telegramChatId: string;
    isOrgDefaultGroup: boolean;
}

export const GROUPS_MANAGED_COLUMNS: Column<IGroupsManaged>[] = [
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
        disableFilters: true,
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
    }
]