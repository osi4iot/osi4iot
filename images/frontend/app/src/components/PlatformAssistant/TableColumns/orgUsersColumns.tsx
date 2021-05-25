import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName } from '../../../tools/tools';
import { useAuthState } from '../../../contexts/authContext';
import axios from 'axios';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { ORG_USERS_OPTIONS } from '../platformAssistantOptions';
import {
    setOrgUserOrgIdToEdit,
    setOrgUsersOptionToShow,
    setOrgUserUserIdToEdit,
    setOrgUserRowIndexToEdit,
    useOrgUsersDispatch
} from '../../../contexts/orgUsers';

export interface IOrgUser {
    orgId: number;
    userId: number;
    firstName: string;
    surname: string;
    login: string;
    email: string;
    telegramId: string;
    roleInOrg: string;
    lastSeenAtAge: string;
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
    const component = "org user";
    const consequences = "The user are going be removed of all groups beloging to the org.";
    const { accessToken } = useAuthState();

    useEffect(() => {
        if (isOrgUserDeleted) {
            refreshOrgUsers();
        }
    }, [isOrgUserDeleted, refreshOrgUsers]);

    const action = (hideModal: () => void) => {
        const url = `https://${domainName}/admin_api/organization/${orgId}/user/id/${userId}`;
        const config = axiosAuth(accessToken);
        axios
            .delete(url, config)
            .then((response) => {
                setIsOrgUserDeleted(true);
                const data = response.data;
                toast.success(data.message);
                hideModal();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                hideModal();
            })
    }

    const [showModal] = DeleteModal(component, consequences, action);

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

export const Create_ORG_USERS_COLUMNS = (refreshOrgUsers: () => void): Column<IOrgUser>[] => {
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
            Header: "TelegramId",
            accessor: "telegramId",
            disableFilters: true,
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
                const orgId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const userId = props.rows[props.row.id as unknown as number]?.cells[1]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <EditOrgUser orgId={orgId} userId={userId} rowIndex={parseInt(rowIndex)} />
            }
        },
        {
            Header: "",
            accessor: "delete",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const orgId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const userId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <DeleteOrgUserModal orgId={orgId} userId={userId} rowIndex={parseInt(rowIndex)} refreshOrgUsers={refreshOrgUsers} />
            }
        }
    ]
}
