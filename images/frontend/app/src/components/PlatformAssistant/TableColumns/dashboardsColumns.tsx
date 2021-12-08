import { Column } from 'react-table';

export interface IDashboard {
	id: number;
	orgId: number;
	groupId: number;
	slug: string;
	title: string;
	uid: string;
}

export const DASHBOARD_COLUMNS: Column<IDashboard>[] = [
    {
        Header: "DashboardId",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "OrgId",
        accessor: "orgId",
        filter: 'equals'
    },
    {
        Header: "GroupId",
        accessor: "groupId",
        filter: 'equals'
    },
    {
        Header: "Slug",
        accessor: "slug",
        filter: 'equals'
    },    
    {
        Header: "Title",
        accessor: "title",
        filter: 'equals'
    },
    {
        Header: "Uid",
        accessor: "uid",
        filter: 'equals'
    }
]