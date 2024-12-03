import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { ORGS_OPTIONS } from '../Utils/platformAssistantOptions';
import { setOrgIdToEdit, setOrgRowIndexToEdit, setOrgsOptionToShow, useOrgsDispatch } from '../../../contexts/orgsOptions';
import {
    usePlatformAssitantDispatch,
    setReloadGroupsMembershipTable,
    setReloadGroupsTable,
    setReloadOrgsManagedTable,
    setReloadOrgsMembershipTable,
    setReloadOrgUsersTable,
    setReloadGroupsManagedTable,
    setReloadGroupMembersTable,
    setReloadDigitalTwinsTable,
    setReloadDashboardsTable,
    setReloadOrgsOfGroupsManagedTable,
    setReloadTopicsTable
} from '../../../contexts/platformAssistantContext';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { AxiosResponse, AxiosError } from 'axios';


export interface IOrganization {
    id: number;
    name: string;
    acronym: string;
    role: string;
    address: string;
    city: string;
    zipCode: string;
    state: string;
    country: string;
    buildingId: string;
    orgHash: string;
    mqttAccessControl: string;
}

interface IOrganizationColumn extends IOrganization {
    edit: string;
    delete: string;
}

interface DeleteOrgModalProps {
    rowIndex: number;
    orgId: number;
    refreshOrgs: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteOrgModal: FC<DeleteOrgModalProps> = ({ rowIndex, orgId, refreshOrgs }) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isOrgDeleted, setIsOrgDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE ORGANIZATION";
    const question = "Are you sure to delete this organization?";
    const consequences = "All groups, assets, sensors, and sensor measurements belonging to this org are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isOrgDeleted) {
            refreshOrgs();
            const reloadOrgsManagedTable = true;
            setReloadOrgsManagedTable(plaformAssistantDispatch, { reloadOrgsManagedTable });
            const reloadOrgUsersTable = true;
            setReloadOrgUsersTable(plaformAssistantDispatch, { reloadOrgUsersTable });
            const reloadOrgsMembershipTable = true;
            setReloadOrgsMembershipTable(plaformAssistantDispatch, { reloadOrgsMembershipTable });
            const reloadGroupsTable = true;
            setReloadGroupsTable(plaformAssistantDispatch, { reloadGroupsTable });
            const reloadGroupsMembershipTable = true;
            setReloadGroupsMembershipTable(plaformAssistantDispatch, { reloadGroupsMembershipTable });
            const reloadGroupsManagedTable = true;
            setReloadGroupsManagedTable(plaformAssistantDispatch, { reloadGroupsManagedTable });

            const reloadOrgsOfGroupsManagedTable = true;
            setReloadOrgsOfGroupsManagedTable(plaformAssistantDispatch, { reloadOrgsOfGroupsManagedTable });
            const reloadGroupMembersTable = true;
            setReloadGroupMembersTable(plaformAssistantDispatch, { reloadGroupMembersTable });
            const reloadTopicsTable = true;
            setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
            const reloadDigitalTwinsTable = true;
            setReloadDigitalTwinsTable(plaformAssistantDispatch, { reloadDigitalTwinsTable });
            const reloadDashboardsTable = true;
            setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
        }
    }, [isOrgDeleted, plaformAssistantDispatch, refreshOrgs]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/organization/id/${orgId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response: AxiosResponse<any, any>) => {
                setIsOrgDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                
                hideModal();
            })
            .catch((error: AxiosError) => {
                axiosErrorHandler(error, authDispatch);
                setIsSubmitting(false);
                hideModal();
            })
    }
    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader );


    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}

interface EditOrgProps {
    rowIndex: number;
    orgId: number;
}

const EditOrg: FC<EditOrgProps> = ({ rowIndex, orgId }) => {
    const orgsDispatch = useOrgsDispatch();

    const handleClick = () => {
        const orgIdToEdit = { orgIdToEdit: orgId };
        setOrgIdToEdit(orgsDispatch, orgIdToEdit);

        const orgRowIndexToEdit = { orgRowIndexToEdit: rowIndex };
        setOrgRowIndexToEdit(orgsDispatch, orgRowIndexToEdit);

        const orgsOptionToShow = { orgsOptionToShow: ORGS_OPTIONS.EDIT_ORG };
        setOrgsOptionToShow(orgsDispatch, orgsOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


export const Create_ORGANIZATIONS_COLUMNS = (refreshOrgs: () => void): Column<IOrganizationColumn>[] => {
    return [
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
            Header: "Role",
            accessor: "role"
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
            Header: "Building Id",
            accessor: "buildingId",
            disableFilters: true
        },
        {
            Header: "Org hash",
            accessor: "orgHash",
            disableFilters: true
        },
        {
            Header: "Mqtt acc",
            accessor: "mqttAccessControl",
            disableFilters: true
        },    
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const orgId = row?.cells[0]?.value;
                return <EditOrg orgId={orgId} rowIndex={rowIndex} />
            }
        },
        {
            Header: "",
            accessor: "delete",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const orgId = row?.cells[0]?.value;
                return <DeleteOrgModal orgId={orgId} rowIndex={rowIndex} refreshOrgs={refreshOrgs} />
            }
        }
    ]
}