import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';

export interface IOrganization {
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
    edit: string;
    delete: string;
}

export const ORGANIZATIONS_COLUMNS: Column<IOrganization>[] = [
    {
        Header: "Id",
        accessor: "id"
    },
    {
        Header: "Name",
        accessor: "name"
    },
    {
        Header: "Acronym",
        accessor: "acronym"
    },
    {
        Header: "Address",
        accessor: "address"
    },
    {
        Header: "City",
        accessor: "city"
    },
    {
        Header: "Zip code",
        accessor: "zipCode"
    },
    {
        Header: "State",
        accessor: "state"
    },
    {
        Header: "Country",
        accessor: "country"
    },
    {
        Header: "Longitude",
        accessor: "longitude"
    },
    {
        Header: "Latitude",
        accessor: "latitude"
    },
    {
        Header: "",
        accessor: "edit",
        Cell: props => {
            const orgId = props.rows[props.row.id as unknown as number].cells[0].value;
            return <EditIcon id={orgId} />
        }
    },
    {
        Header: "",
        accessor: "delete",
        Cell: props => {
            const orgId = props.rows[props.row.id as unknown as number].cells[0].value;
            return <DeleteIcon id={orgId} />
        }
    }
]