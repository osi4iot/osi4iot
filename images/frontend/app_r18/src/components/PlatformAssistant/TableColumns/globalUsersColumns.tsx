import { FC, useEffect, useState } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { useGlobalUsersDispatch } from '../../../contexts/globalUsersOptions';
import { GLOBAL_USERS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setGlobalUserIdToEdit,
    setGlobalUserRowIndexToEdit,
    setGlobalUsersOptionToShow
} from '../../../contexts/globalUsersOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';

export interface IGlobalUser {
    id: number;
    firstName: string;
    surname: string;
    login: string;
    email: string;
    roleInPlatform: string;
    lastSeenAtAge: string;

}

interface IGlobalUserColumn extends IGlobalUser {
    edit: string;
    delete: string;
}

interface DeleteGlobalUserModalProps {
    rowIndex: number;
    globalUserId: number;
    refreshGlobalUsers: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteGlobalUserModal: FC<DeleteGlobalUserModalProps> = ({ rowIndex, globalUserId, refreshGlobalUsers }) => {
    const [isGlobalUserDeleted, setIsGlobalUserDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE GLOBAL USER";
    const question = "Are you sure to delete this global user?";
    const consequences = "The user are going to be removed of the platform.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isGlobalUserDeleted) {
            refreshGlobalUsers();
        }
    }, [isGlobalUserDeleted, refreshGlobalUsers]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/application/global_user/id/${globalUserId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsGlobalUserDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                hideModal();
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                setIsSubmitting(false);
                hideModal();
            })
    }

    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader);

    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}

interface EditGlobalUsersProps {
    rowIndex: number;
    globalUserId: number;
}

const EditGlobalUsers: FC<EditGlobalUsersProps> = ({ rowIndex, globalUserId }) => {
    const globalUsersDispatch = useGlobalUsersDispatch()

    const handleClick = () => {
        const globalUserIdToEdit = { globalUserIdToEdit: globalUserId };
        setGlobalUserIdToEdit(globalUsersDispatch, globalUserIdToEdit);

        const globalUserRowIndexToEdit = { globalUserRowIndexToEdit: rowIndex };
        setGlobalUserRowIndexToEdit(globalUsersDispatch, globalUserRowIndexToEdit);

        const globalUsersOptionToShow = { globalUsersOptionToShow: GLOBAL_USERS_OPTIONS.EDIT_GLOBAL_USER };
        setGlobalUsersOptionToShow(globalUsersDispatch, globalUsersOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


export const Create_GLOBAL_USERS_COLUMNS = (refreshGlobalUsers: () => void): Column<IGlobalUserColumn>[] => {
    return [
        {
            Header: "Id",
            accessor: "id",
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
            accessor: "roleInPlatform",
            disableFilters: true
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
                const globalUserId = row?.cells[0]?.value;
                return <EditGlobalUsers globalUserId={globalUserId} rowIndex={rowIndex} />
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
                const globalUserId = row?.cells[0]?.value;
                return <DeleteGlobalUserModal globalUserId={globalUserId} rowIndex={rowIndex} refreshGlobalUsers={refreshGlobalUsers} />
            }
        }
    ]
}