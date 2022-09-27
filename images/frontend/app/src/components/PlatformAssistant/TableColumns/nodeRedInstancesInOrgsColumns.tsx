import { Column } from 'react-table';

export interface INodeRedInstance {
	id: number;
	orgId: number;
	groupId: number;
	nriHash: string;
	instanceNumber: number;
	longitude: number;
	latitude: number;
}


export interface INodeRedInstanceInOrgsColumns {
    id: number;
    orgId: number;
    nriHash: string;
    groupId: number;
    longitude: number;
    latitude: number;
}


export const NODERED_INSTANCE_IN_ORGS_COLUMNS: Column<INodeRedInstanceInOrgsColumns>[] = [
    {
        Header: "Id",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "Org Id",
        accessor: "orgId"
    },
    {
        Header: "Group Id",
        accessor: "groupId"
    },
    {
        Header: "Nodered instance hash",
        accessor: "nriHash"
    },
    {
        Header: "Longitude",
        accessor: "longitude",
        disableFilters: true,
        disableSortBy: true
    },
    {
        Header: "Latitude",
        accessor: "latitude",
        disableFilters: true,
        disableSortBy: true
    },
];
