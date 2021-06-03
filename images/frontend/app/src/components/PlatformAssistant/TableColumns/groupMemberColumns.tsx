import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName } from '../../../tools/tools';
import { useAuthState } from '../../../contexts/authContext';
import axios from 'axios';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { GROUP_MEMBERS_OPTIONS } from '../platformAssistantOptions';
import {
    useGroupMembersDispatch,
    setGroupMemberGroupIdToEdit,
    setGroupMemberUserIdToEdit,
    setGroupMemberRowIndexToEdit,
    setGroupMembersOptionToShow
} from '../../../contexts/groupMembers';

export interface IGroupMember {
    groupId: number;
    userId: number;
    firstName: string;
    surname: string;
    login: string;
    email: string;
    telegramId: string;
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

const DeleteGroupMemberModal: FC<DeleteGroupMemberModalProps> = ({ rowIndex, groupId, userId, refreshGroupMembers }) => {
    const [isGroupMemberDeleted, setIsGroupMemberDeleted] = useState(false);
    const component = "group member";
    const consequences = "The member are going to be remove of the group but continues active in the org.";
    const { accessToken } = useAuthState();

    useEffect(() => {
        if (isGroupMemberDeleted) {
            refreshGroupMembers();
        }
    }, [isGroupMemberDeleted, refreshGroupMembers])

    const action = (hideModal: () => void) => {
        const url = `https://${domainName}/admin_api/group/${groupId}/member/id/${userId}`;
        const config = axiosAuth(accessToken);
        axios
            .delete(url, config)
            .then((response) => {
                setIsGroupMemberDeleted(true)
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
            Header: "TelegramId",
            accessor: "telegramId",
            disableFilters: true
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
                const groupId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const userId = props.rows[props.row.id as unknown as number]?.cells[1]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <EditGroupMember groupId={groupId} userId={userId} rowIndex={parseInt(rowIndex)} />
            }
        },
        {
            Header: "",
            accessor: "delete",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const groupId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const userId = props.rows[props.row.id as unknown as number]?.cells[1]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <DeleteGroupMemberModal groupId={groupId} userId={userId} rowIndex={parseInt(rowIndex)} refreshGroupMembers={refreshGroupMembers} />
            }
        }
    ]
}
