import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { GROUP_MEMBERS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    useGroupMembersDispatch,
    setGroupMemberGroupIdToEdit,
    setGroupMemberUserIdToEdit,
    setGroupMemberRowIndexToEdit,
    setGroupMembersOptionToShow
} from '../../../contexts/groupMembersOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';

export interface IGroupMember {
    groupId: number;
    userId: number;
    firstName: string;
    surname: string;
    login: string;
    email: string;
    roleInGroup: string;
}

interface IGroupMemberColumn extends IGroupMember {
    edit: string;
    delete: string;
}

interface DeleteGroupMemberModalProps {
    rowIndex: number;
    groupId: number;
    userId: number;
    refreshGroupMembers: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteGroupMemberModal: FC<DeleteGroupMemberModalProps> = ({ rowIndex, groupId, userId, refreshGroupMembers }) => {
    const [isGroupMemberDeleted, setIsGroupMemberDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE GROUP MEMBER";
    const question = "Are you sure to delete this group member?";
    const consequences = "The member are going to be remove of the group but continues active in the org.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isGroupMemberDeleted) {
            refreshGroupMembers();
        }
    }, [isGroupMemberDeleted, refreshGroupMembers])

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/group/${groupId}/member/id/${userId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsGroupMemberDeleted(true);
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

interface EditGroupMemberProps {
    rowIndex: number;
    groupId: number;
    userId: number;
}

const EditGroupMember: FC<EditGroupMemberProps> = ({ rowIndex, groupId, userId }) => {
    const groupMembersDispatch = useGroupMembersDispatch()

    const handleClick = () => {
        const groupMemberGroupIdToEdit = { groupMemberGroupIdToEdit: groupId };
        setGroupMemberGroupIdToEdit(groupMembersDispatch, groupMemberGroupIdToEdit);

        const groupMemberUserIdToEdit = { groupMemberUserIdToEdit: userId };
        setGroupMemberUserIdToEdit(groupMembersDispatch, groupMemberUserIdToEdit);
        
        const groupMemberRowIndexToEdit = { groupMemberRowIndexToEdit: rowIndex };
        setGroupMemberRowIndexToEdit(groupMembersDispatch, groupMemberRowIndexToEdit );

        const groupMembersOptionToShow = { groupMembersOptionToShow: GROUP_MEMBERS_OPTIONS.EDIT_GROUP_MEMBER };
        setGroupMembersOptionToShow(groupMembersDispatch, groupMembersOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}

export const Create_GROUP_MEMBERS_COLUMNS = (refreshGroupMembers: () => void): Column<IGroupMemberColumn>[] => {
    return [
        {
            Header: "GroupId",
            accessor: "groupId",
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
            accessor: "roleInGroup",
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
                const groupId = row?.cells[0]?.value;
                const userId = row?.cells[1]?.value;
                return <EditGroupMember groupId={groupId} userId={userId} rowIndex={rowIndex} />
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
                const groupId = row?.cells[0]?.value;
                const userId = row?.cells[1]?.value;
                return <DeleteGroupMemberModal groupId={groupId} userId={userId} rowIndex={rowIndex} refreshGroupMembers={refreshGroupMembers} />
            }
        }
    ]
}
