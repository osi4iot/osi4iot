import { Column } from 'react-table';
import { FeatureCollection } from 'geojson';


export interface IOrgOfGroupsManaged {
    id: number;
    name: string;
    acronym: string;
    role: string;
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    geoJsonData: FeatureCollection;
    buildingId: number;
    orgHash: string;
    mqttAccessControl: string;
}


export const ORGS_OF_GROUPS_MANAGED_COLUMNS: Column<IOrgOfGroupsManaged>[] = [
    {
        Header: "Id",
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
        Header: "Role",
        accessor: "role"
    },    
    {
        Header: "City",
        accessor: "city",
        disableFilters: true,
    },
    {
        Header: "Country",
        accessor: "country",
        disableFilters: true
    },
    {
        Header: "Building_Id",
        accessor: "buildingId",
        disableFilters: true
    }
];
