import { Column } from 'react-table';
import { StatusLed } from '../Geolocation/StatusLed';


export interface ISelectOrgOfGroupsManaged {
    id: number;
    name: string;
    city: string;
    country: string;
    status: string;
}

export const SELECT_ORG_OF_GROUPS_MANAGED_COLUMNS: Column<ISelectOrgOfGroupsManaged>[] = [
    {
        Header: "OrgId",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "Name",
        accessor: "name",
    },
    {
        Header: "City",
        accessor: "city"
    },
    {
        Header: "Country",
        accessor: "country"
    },
    {
        Header: "Status",
        accessor: "status",
        disableFilters: true,
        Cell: props => {
            const rowIndex = parseInt(props.row.id, 10);
            const row = props.rows.filter(row => row.index === rowIndex)[0];
            const status = row?.cells[5]?.value;
            return <StatusLed status={status} size="12px"/>
        }
    }
]