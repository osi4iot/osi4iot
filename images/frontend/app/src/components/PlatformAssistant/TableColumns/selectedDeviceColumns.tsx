import { Column } from 'react-table';
import { StatusLed } from '../Geolocation/StatusLed';


export interface ISelectDevice {
    id: number;
    groupId: number;
    name: string;
    description: string;
    type: string;
    state: string;
}

export const SELECT_DEVICE_COLUMNS: Column<ISelectDevice>[] = [
    {
        Header: "DeviceId",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "GroupId",
        accessor: "groupId"
    },
    {
        Header: "Device name",
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
        Header: "Status",
        accessor: "state",
        disableFilters: true,
        Cell: props => {
            const rowIndex = parseInt(props.row.id, 10);
            const row = props.rows.filter(row => row.index === rowIndex)[0];
            const status = row?.cells[6]?.value;
            return <StatusLed status={status} size="12px"/>
        }
    }
   
]