import { FC } from 'react';
import { Column } from 'react-table';
import AddUsersIcon from '../AddUsersIcon';
import RemoveUsersIcon from '../RemoveUsersIcon';
import { ORGS_MANAGED_OPTIONS } from '../platformAssistantOptions';
import { useOrgsManagedDispatch, setOrgManagedIdToCreateOrgUsers, setOrgManagedRowIndex, setOrgsManagedOptionToShow } from '../../../contexts/orgsManagedOptions';


interface AddOrgUsersProps {
    rowIndex: number;
    orgManagedId: number;
}


const AddOrgUsers: FC<AddOrgUsersProps> = ({ rowIndex, orgManagedId }) => {
    const orgsManagedDispatch = useOrgsManagedDispatch()

    const handleClick = () => {
        const orgManagedIdToCreateOrgUsers = { orgManagedIdToCreateOrgUsers: orgManagedId };
        setOrgManagedIdToCreateOrgUsers(orgsManagedDispatch, orgManagedIdToCreateOrgUsers);

        const orgManagedRowIndex = { orgManagedRowIndex: rowIndex };
        setOrgManagedRowIndex(orgsManagedDispatch, orgManagedRowIndex);

        const orgsManagedOptionToShow = { orgsManagedOptionToShow: ORGS_MANAGED_OPTIONS.CREATE_ORG_USERS };
        setOrgsManagedOptionToShow(orgsManagedDispatch, orgsManagedOptionToShow);
    };

    return (
        <span onClick={handleClick}>
            <AddUsersIcon rowIndex={rowIndex} />
        </span>
    )
}

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

interface IOrgManagedColumn extends IOrgManaged {
    addOrgUsers: string;
    removeAllOrgUsers: string;
}

export const ORGS_MANAGED_COLUMNS: Column<IOrgManagedColumn>[] = [
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
    },
    {
        Header: () => <div style={{backgroundColor: '#202226'}}>Add<br/>users</div>,
        accessor: "addOrgUsers",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const orgManagedId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <AddOrgUsers rowIndex={parseInt(rowIndex, 10)} orgManagedId={parseInt(orgManagedId, 10)}/>
        }
    },
    {
        Header: () => <div style={{backgroundColor: '#202226'}}>Remove<br/>all users</div>,
        accessor: "removeAllOrgUsers",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const groupId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <RemoveUsersIcon id={groupId} rowIndex={parseInt(rowIndex,10)}/>
        }
    }
]