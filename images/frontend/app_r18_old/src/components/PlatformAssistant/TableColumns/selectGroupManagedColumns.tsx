import { Column } from 'react-table';
import { StatusLed } from '../Geolocation/StatusLed';


export interface ISelectGroupManaged {
    id: number;
    name: string;
    acronym: string;
    isOrgDefaultGroup: boolean;
    state: boolean;
}

export const SELECT_GROUP_MANAGED_COLUMNS: Column<ISelectGroupManaged>[] = [
    {
        Header: "GroupId",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "Name",
        accessor: "name",
    },
    {
        Header: "Acronym",
        accessor: "acronym"
    },
    {
        Header: "Type",
        accessor: "isOrgDefaultGroup",
        disableFilters: true
    },
    {
        Header: "Status",
        accessor: "state",
        disableFilters: true,
        Cell: props => {
            const rowIndex = parseInt(props.row.id, 10);
            const row = props.rows.filter(row => row.index === rowIndex)[0];
            const status = row?.cells[5]?.value;
            return <StatusLed status={status} size="12px"/>
        }
    },
]