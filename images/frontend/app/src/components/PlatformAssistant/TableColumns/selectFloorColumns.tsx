import { Column } from 'react-table';


export interface ISelectFloor {
    id: number;
    state: string;
    floorNumber: number
}

export const SELECT_FLOORS_COLUMNS: Column<ISelectFloor>[] = [
    {
        Header: "id",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "State",
        accessor: "state",
        disableFilters: true,
    },
    {
        Header: "Floor number",
        accessor: "floorNumber"
    }
]