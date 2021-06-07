import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName } from '../../../tools/tools';
import { useAuthState } from '../../../contexts/authContext';
import axios from 'axios';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { GROUPS_OPTIONS } from '../platformAssistantOptions';
import {
    setGroupIdToEdit,
    setGroupRowIndexToEdit,
    setGroupsOptionToShow,
    useGroupsDispatch
} from '../../../contexts/groupsOptions';

export interface IGroup {
    orgId: number;
    id: number;
    name: string;
    acronym: string;
    folderPermission: string;
    groupUid: string;
    telegramInvitationLink: string;
    telegramChatId: string;
    isOrgDefaultGroup: boolean;
}

interface IGroupColumn extends IGroup {
    edit: string;
    delete: string;
}

interface DeleteGroupModalProps {
    rowIndex: number;
    orgId: number;
    groupId: number;
    refreshGroups: () => void;
}

const domainName = getDomainName();

const DeleteGroupModal: FC<DeleteGroupModalProps> = ({ rowIndex, orgId, groupId, refreshGroups }) => {
    const [isGroupDeleted, setIsGroupDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE GROUP";
    const question = "Are you sure to delete this group?";
    const consequences = "All teams, folders, devices and sensor measurements belonging to this group are going to be lost.";
    const { accessToken } = useAuthState();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isGroupDeleted) {
            refreshGroups();
        }
    }, [isGroupDeleted, refreshGroups]);

    const action = (hideModal: () => void) => {
        const url = `https://${domainName}/admin_api/group/${orgId}/id/${groupId}`;
        const config = axiosAuth(accessToken);
        axios
            .delete(url, config)
            .then((response) => {
                setIsGroupDeleted(true);
                setIsSubmitting(false);
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


    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader);

    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}

interface EditGroupProps {
    rowIndex: number;
    groupId: number;
}

const EditGroup: FC<EditGroupProps> = ({ rowIndex, groupId }) => {
    const groupsDispatch = useGroupsDispatch()

    const handleClick = () => {
        const groupIdToEdit = { groupIdToEdit: groupId };
        setGroupIdToEdit(groupsDispatch, groupIdToEdit);

        const groupRowIndexToEdit = { groupRowIndexToEdit: rowIndex };
        setGroupRowIndexToEdit(groupsDispatch, groupRowIndexToEdit);

        const groupsOptionToShow = { groupsOptionToShow: GROUPS_OPTIONS.EDIT_GROUP };
        setGroupsOptionToShow(groupsDispatch, groupsOptionToShow);
    };

    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}

export const Create_GROUPS_COLUMNS = (refreshGroups: () => void): Column<IGroupColumn>[] => {
    return [
        {
            Header: "OrgId",
            accessor: "orgId",
            filter: 'equals'
        },
        {
            Header: "GroupId",
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
            Header: () => <div style={{ backgroundColor: '#202226' }}>Folder<br />permission</div>,
            accessor: "folderPermission",
            disableFilters: true
        },
        {
            Header: "Group Hash",
            accessor: "groupUid",
            disableFilters: true
        },
        {
            Header: "Telegram Invitation Link",
            accessor: "telegramInvitationLink",
            disableFilters: true
        },
        {
            Header: "ChatId",
            accessor: "telegramChatId",
            disableFilters: true
        },
        {
            Header: "Type",
            accessor: "isOrgDefaultGroup",
            disableFilters: true
        },
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                // const orgpId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const groupId = props.rows[props.row.id as unknown as number]?.cells[1]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <EditGroup groupId={groupId} rowIndex={parseInt(rowIndex)} />
            }
        },
        {
            Header: "",
            accessor: "delete",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const orgpId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const groupId = props.rows[props.row.id as unknown as number]?.cells[1]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <DeleteGroupModal orgId={orgpId} groupId={groupId} rowIndex={parseInt(rowIndex)} refreshGroups={refreshGroups} />
            }
        }
    ]
}
