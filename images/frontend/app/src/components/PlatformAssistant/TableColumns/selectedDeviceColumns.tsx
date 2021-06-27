import { Column } from 'react-table';


export interface ISelectDevice {
    id: number;
    name: string;
    description: string;
    type: string;
    groupId: number;
}

export const SELECT_DEVICE_COLUMNS: Column<ISelectDevice>[] = [
    {
        Header: "DeviceId",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "Name",
        accessor: "name",
    },
    {
        Header: "Description",
        accessor: "description"
    },
    {
        Header: "Type",
        accessor: "type",
        disableFilters: true
    },
    {
        Header: "GroupId",
        accessor: "groupId"
    },    
]