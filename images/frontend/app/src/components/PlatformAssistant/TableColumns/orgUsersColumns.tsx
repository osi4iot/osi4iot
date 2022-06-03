import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, axiosInstance } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { ORG_USERS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setOrgUserOrgIdToEdit,
    setOrgUsersOptionToShow,
    setOrgUserUserIdToEdit,
    setOrgUserRowIndexToEdit,
    useOrgUsersDispatch
} from '../../../contexts/orgUsersOptions';

export interface IOrgUser {
    orgId: number;
    userId: number;
    firstName: string;
    surname: string;
    login: string;
    email: string;
    roleInOrg: string;
    lastSeenAtAge: string;
    edit: string;
    delete: string;
}

interface IOrgUserColumn extends IOrgUser {
    edit: string;
    delete: string;
}

interface DeleteOrgUserModalProps {
    rowIndex: number;
    orgId: number;
    userId: number;
    refreshOrgUsers: () => void;
}

const domainName = getDomainName();

const DeleteOrgUserModal: FC<DeleteOrgUserModalProps> = ({ rowIndex, orgId, userId, refreshOrgUsers }) => {
    const [isOrgUserDeleted, setIsOrgUserDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "REMOVE USER FROM ORG";
    const question = "Are you sure to delete this org user?";
    const consequences = "The user are going be removed of all groups beloging to the org.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isOrgUserDeleted) {
            refreshOrgUsers();
        }
    }, [isOrgUserDeleted, refreshOrgUsers]);

    const action = (hideModal: () => void) => {
        const url = `${domainName}/admin_api/organization/${orgId}/user/id/${userId}`;
        const config = axiosAuth(accessToken);
        axiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsOrgUserDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                hideModal();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                setIsSubmitting(false);
                hideModal();
            })
    }

    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader);

    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}

interface EditOrgUserProps {
    rowIndex: number;
    orgId: number;
    userId: number;
}

const EditOrgUser: FC<EditOrgUserProps> = ({ rowIndex, orgId, userId }) => {
    const orgUsersDispatch = useOrgUsersDispatch()

    const handleClick = () => {
        const orgUserOrgIdToEdit = { orgUserOrgIdToEdit: orgId };
        setOrgUserOrgIdToEdit(orgUsersDispatch, orgUserOrgIdToEdit);

        const orgUserUserIdToEdit = { orgUserUserIdToEdit: userId };
        setOrgUserUserIdToEdit(orgUsersDispatch, orgUserUserIdToEdit);

        const orgUserRowIndexToEdit = { orgUserRowIndexToEdit: rowIndex };
        setOrgUserRowIndexToEdit(orgUsersDispatch, orgUserRowIndexToEdit);

        const orgUsersOptionToShow = { orgUsersOptionToShow: ORG_USERS_OPTIONS.EDIT_ORG_USER };
        setOrgUsersOptionToShow(orgUsersDispatch, orgUsersOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}

export const Create_ORG_USERS_COLUMNS = (refreshOrgUsers: () => void): Column<IOrgUserColumn>[] => {
    return [
        {
            Header: "OrgId",
            accessor: "orgId",
            filter: 'equals'
        },
        {
            Header: "UserId",
            accessor: "userId",
            filter: 'equals'
        },
        {
            Header: "First Name",
            accessor: "firstName"
        },
        {
            Header: "Surname",
            accessor: "surname"
        },
        {
            Header: "Username",
            accessor: "login"
        },
        {
            Header: "Email",
            accessor: "email"
        },
        {
            Header: "Role",
            accessor: "roleInOrg",
            disableFilters: true,
        },
        {
            Header: "Seen",
            accessor: "lastSeenAtAge",
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
                const userId = row?.cells[1]?.value;
                return <EditOrgUser orgId={orgId} userId={userId} rowIndex={rowIndex} />
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
                const userId = row?.cells[1]?.value;
                return <DeleteOrgUserModal orgId={orgId} userId={userId} rowIndex={rowIndex} refreshOrgUsers={refreshOrgUsers} />
            }
        }
    ]
}
