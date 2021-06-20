import { Column } from 'react-table';


export interface ISelectGroupManaged {
    id: number;
    name: string;
    acronym: string;
    folderPermission: string;
    isOrgDefaultGroup: boolean;
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
        Header: () => <div style={{ backgroundColor: '#202226' }}>Folder<br />permission</div>,
        accessor: "folderPermission",
        disableFilters: true
    },
    {
        Header: "Type",
        accessor: "isOrgDefaultGroup",
        disableFilters: true
    },    
]