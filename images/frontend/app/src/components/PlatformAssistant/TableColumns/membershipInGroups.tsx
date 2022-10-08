import { Column } from 'react-table';

export interface IMembershipInGroups {
	groupId: number;
	orgId: number;
	name: string;
	acronym: string;
	telegramInvitationLink: string;
	telegramChatId: string;
	roleInGroup: StringConstructor;
}

export const MEMBERSHIP_IN_GROUPS: Column<IMembershipInGroups>[] = [
    {
        Header: "OrdId",
        accessor: "orgId",
        filter: 'equals'
    },
    {
        Header: "GroupId",
        accessor: "groupId",
        filter: 'equals'
    },
    {
        Header: "Name",
        accessor: "name",
        filter: 'equals'
    },    
    {
        Header: "Acronym",
        accessor: "acronym",
        filter: 'equals'
    },
    {
        Header: "Telegram invitation link",
        accessor: "telegramInvitationLink",
        disableFilters: true
    },
    {
        Header: "ChatId",
        accessor: "telegramChatId",
        disableFilters: true
    },
    {
        Header: "Role",
        accessor: "roleInGroup",
        disableFilters: true
    }
]