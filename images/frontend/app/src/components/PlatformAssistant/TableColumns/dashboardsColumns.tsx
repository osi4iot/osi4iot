import { Column } from 'react-table';

export interface IDashboard {
	id: number;
	orgId: number;
	groupId: number;
	uid: string;
	slug: string;
    title: string;
    refresh: string;
    timeRangeFrom: string,
    timeRangeTo: string;
}

export const DASHBOARD_COLUMNS: Column<IDashboard>[] = [
    {
        Header: "Id",
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
        Header: "Uid",
        accessor: "uid",
        filter: 'equals'
    },
    {
        Header: "Title",
        accessor: "title",
        filter: 'equals'
    },
    {
        Header: "Refresh",
        accessor: "refresh",
        disableFilters: true,
        disableSortBy: true
    },
    {
        Header: "Time from",
        accessor: "timeRangeFrom",
        disableFilters: true,
        disableSortBy: true
    },
    {
        Header: "Time to",
        accessor: "timeRangeTo",
        disableFilters: true,
        disableSortBy: true
    }, 
]