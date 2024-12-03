import { Column } from 'react-table';

export interface ISelectSensor {
    id: number;
    orgId: number;
    groupId: number;
    assetId: number;
    name: string;
    type: string;
    description: string;
}

export const SELECT_SENSOR_COLUMNS: Column<ISelectSensor>[] = [
    {
        Header: "SensorId",
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
        Header: "AssetId",
        accessor: "assetId",
        filter: 'equals'
    },
    {
        Header: "Sensor name",
        accessor: "name",
        filter: 'equals'
    },
    {
        Header: "Sensor type",
        accessor: "type",
        filter: 'equals'
    },
    {
        Header: "Description",
        accessor: "description",
        filter: 'equals'
    }
]
   