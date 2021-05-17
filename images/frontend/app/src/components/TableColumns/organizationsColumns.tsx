import { FC } from 'react';
import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import Modal from '../Modal';


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

interface DeleteOrgModalProps {
    rowIndex: number;
    orgId: number;
}

const DeleteOrgModal: FC<DeleteOrgModalProps> = ({ rowIndex, orgId }) => {
    const component = "organization";
    const consequences = "All groups, devices and its measurements belonging to this org are going to be lost.";
    const action = () => {
        console.log("Delete organization with id=", orgId);;
    }

    const [showModal] = Modal(component, consequences, action);

    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}


export const ORGANIZATIONS_COLUMNS: Column<IOrganization>[] = [
    {
        Header: "Id",
        accessor: "id",
        filter: 'equals'
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
        accessor: "address",
        disableFilters: true
    },
    {
        Header: "City",
        accessor: "city",
        disableFilters: true
    },
    {
        Header: "Zip code",
        accessor: "zipCode",
        disableFilters: true
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
    },
    {
        Header: "",
        accessor: "edit",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const orgId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <EditIcon id={orgId} rowIndex={parseInt(rowIndex)} />
        }
    },
    {
        Header: "",
        accessor: "delete",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const orgId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <DeleteOrgModal orgId={orgId} rowIndex={parseInt(rowIndex)} />
        }
    }
]