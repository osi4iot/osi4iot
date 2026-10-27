import { Column } from '../Utils/platformTable';


export interface ISelectFloor {
    id: number;
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
    }
]