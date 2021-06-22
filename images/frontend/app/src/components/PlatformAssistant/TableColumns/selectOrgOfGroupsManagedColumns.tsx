import { Column } from 'react-table';


export interface ISelectOrgOfGroupsManaged {
    id: number;
    name: string;
    acronym: string;
    city: string;
    country: string;
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
        Header: "Acronym",
        accessor: "acronym"
    },
    {
        Header: "City",
        accessor: "city"
    },
    {
        Header: "Country",
        accessor: "country"
    },    
]