import { Column } from 'react-table';

export interface IOrgManaged {
	id: number;
	name: string;
	acronym: string;
	address: string;
	city: string;
	zipCode: string;
	state: string;
	country: string;
	latitude: number;
    longitude: number;
}

export const ORGS_MANAGED_COLUMNS: Column<IOrgManaged>[] = [
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
        Header: "Address",
        accessor: "address",
        disableFilters: true,
    },
    {
        Header: "City",
        accessor: "city",
        disableFilters: true,
    },
    {
        Header: "Zip code",
        accessor: "zipCode",
        disableFilters: true,
    },
    {
        Header: "State",
        accessor: "state",
        disableFilters: true
    },
    {
        Header: "Country",
        accessor: "country",
        disableFilters: true
    },
    {
        Header: "Longitude",
        accessor: "longitude",
        disableFilters: true
    },
    {
        Header: "Latitude",
        accessor: "latitude",
        disableFilters: true
    }
]