import { Column } from 'react-table';
import { StatusLed } from '../Geolocation/StatusLed';


export interface ISelectFloor {
    id: number;
    state: string;
    floorNumber: number
}

export const SELECT_FLOORS_COLUMNS: Column<ISelectFloor>[] = [
    {
        Header: "Floor number",
        accessor: "floorNumber",
        disableFilters: true,
    },
    {
        Header: "FloorId",
        accessor: "id",
    },
    {
        Header: "Status",
        accessor: "state",
        disableFilters: true,
        Cell: props => {
            const rowIndex = parseInt(props.row.id, 10);
            const row = props.rows.filter(row => row.index === rowIndex)[0];
            const status = row?.cells[2]?.value;
            return <StatusLed status={status} size="12px"/>
        }
    }
]