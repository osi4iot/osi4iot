import { Column } from 'react-table';


export interface IMasterDeviceInOrgsColumns {
    id: number;
    orgId: number;
    masterDeviceHash: string;
    groupId: number;
    deviceId: number;
}


export const MASTER_DEVICE_IN_ORGS_COLUMNS: Column<IMasterDeviceInOrgsColumns>[] = [
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
        Header: "Device Id",
        accessor: "deviceId",
    },
    {
        Header: "Master device hash",
        accessor: "masterDeviceHash"
    }
];
