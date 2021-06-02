import { FC, useEffect, useState } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import axios from 'axios';
import { axiosAuth, getDomainName } from '../../../tools/tools';
import { useAuthState } from '../../../contexts/authContext';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { useGlobalUsersDispatch } from '../../../contexts/globalUsers';
import { GLOBAL_USERS_OPTIONS } from '../platformAssistantOptions';
import { setGlobalUserIdToEdit, setGlobalUserRowIndexToEdit, setGlobalUsersOptionToShow } from '../../../contexts/globalUsers';

export interface IGlobalUser {
    id: number;
    firstName: string;
    surname: string;
    login: string;
    email: string;
    telegramId: string;
    roleInPlatform: string;
    lastSeenAtAge: string;
    edit: string;
    delete: string;
}

interface DeleteGlobalUserModalProps {
    rowIndex: number;
    globalUserId: number;
    refreshGlobalUsers: () => void;
}

const domainName = getDomainName();

const DeleteGlobalUserModal: FC<DeleteGlobalUserModalProps> = ({ rowIndex, globalUserId, refreshGlobalUsers }) => {
    const [isGlobalUserDeleted, setIsGlobalUserDeleted] = useState(false);
    const component = "global user";
    const consequences = "The user are going to be removed of the platform.";
    const { accessToken } = useAuthState();

    useEffect(() => {
        if (isGlobalUserDeleted) {
            refreshGlobalUsers();
        }
    }, [isGlobalUserDeleted, refreshGlobalUsers]);

    const action = (hideModal: () => void) => {
        const url = `https://${domainName}/admin_api/application/global_user/id/${globalUserId}`;
        const config = axiosAuth(accessToken);
        axios
            .delete(url, config)
            .then((response) => {
                setIsGlobalUserDeleted(true);
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

interface EditGlobalUsersProps {
    rowIndex: number;
    globalUserId: number;
}

const EditGlobalUsers: FC<EditGlobalUsersProps> = ({ rowIndex, globalUserId }) => {
    const globalUsersDispatch = useGlobalUsersDispatch()

    const handleClick = () => {
        const globalUserIdToEdit = { globalUserIdToEdit: globalUserId };
        setGlobalUserIdToEdit(globalUsersDispatch, globalUserIdToEdit);

        const globalUserRowIndexToEdit = { globalUserRowIndexToEdit: rowIndex};
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


export const Create_GLOBAL_USERS_COLUMNS = (refreshGlobalUsers: () => void): Column<IGlobalUser>[] => {
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
            Header: "TelegramId",
            accessor: "telegramId",
            disableFilters: true
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
                const globalUserId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <EditGlobalUsers globalUserId={globalUserId} rowIndex={parseInt(rowIndex)} />
            }
        },
        {
            Header: "",
            accessor: "delete",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const globalUserId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <DeleteGlobalUserModal globalUserId={globalUserId} rowIndex={parseInt(rowIndex)} refreshGlobalUsers={refreshGlobalUsers} />
            }
        }
    ]
}