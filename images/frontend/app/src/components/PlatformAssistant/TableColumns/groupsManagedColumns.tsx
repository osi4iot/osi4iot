import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import styled from "styled-components";
import ExChangeIcon from '../Utils/ExchangeIcon';
import EditIcon from '../Utils/EditIcon';
import AddUsersIcon from '../Utils/AddUsersIcon';
import RemoveUsersIcon from '../Utils/RemoveUsersIcon';
import {
    setGroupManagedIdToCreateGroupMembers,
    setGroupManagedIdToEdit,
    setGroupManagedInputFormData,
    setGroupManagedRowIndex,
    setGroupsManagedOptionToShow,
    useGroupsManagedDispatch
} from '../../../contexts/groupsManagedOptions';
import { GROUPS_MANAGED_OPTIONS } from '../Utils/platformAssistantOptions';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, axiosInstance, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import DeleteModal from '../../Tools/DeleteModal';
import ChangeModal from '../../Tools/ChangeModal';
import { IGroupManagedData } from '../../../contexts/groupsManagedOptions/interfaces';


interface AddGroupMembersProps {
    rowIndex: number;
    groupManagedId: number;
}

const AddGroupMembers: FC<AddGroupMembersProps> = ({ rowIndex, groupManagedId }) => {
    const groupsManagedDispatch = useGroupsManagedDispatch()

    const handleClick = () => {
        const groupManagedIdToCreateGroupMembers = { groupManagedIdToCreateGroupMembers: groupManagedId };
        setGroupManagedIdToCreateGroupMembers(groupsManagedDispatch, groupManagedIdToCreateGroupMembers);

        const groupManagedRowIndex = { groupManagedRowIndex: rowIndex };
        setGroupManagedRowIndex(groupsManagedDispatch, groupManagedRowIndex);

        const groupsManagedOptionToShow = { groupsManagedOptionToShow: GROUPS_MANAGED_OPTIONS.CREATE_GROUP_MEMBERS };
        setGroupsManagedOptionToShow(groupsManagedDispatch, groupsManagedOptionToShow);
    };

    return (
        <span onClick={handleClick}>
            <AddUsersIcon rowIndex={rowIndex} />
        </span>
    )
}

interface RemoveAllGroupMembersModalProps {
    rowIndex: number;
    groupId: number;
    refreshGroupMembers: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const RemoveAllGroupMembersModal: FC<RemoveAllGroupMembersModalProps> = ({ rowIndex, groupId, refreshGroupMembers }) => {
    const [isGroupMembersRemoved, setIsGroupMembersRemoved] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "REMOVE ALL GROUP MEMBERS";
    const question = "Are you sure to remove all members of this group?";
    const consequences = "All members with Viewer or Editor role are going to be remove of the group but continue active in the org.";
    const width = 380;
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isGroupMembersRemoved) {
            refreshGroupMembers();
        }
    }, [isGroupMembersRemoved, refreshGroupMembers]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/group/${groupId}/members`;
        const config = axiosAuth(accessToken);
        axiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsGroupMembersRemoved(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                hideModal();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                if (errorMessage !== "jwt expired") toast.error(errorMessage);
                setIsSubmitting(false);
                hideModal();
            })
    }

    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader, width);

    return (
        <RemoveUsersIcon action={showModal} rowIndex={rowIndex} />
    )
}


interface ChangeGroupHashModalProps {
    rowIndex: number;
    groupId: number;
    refreshGroupsManaged: () => void;
}

const ChangeGroupHashModal: FC<ChangeGroupHashModalProps> = ({ rowIndex, groupId, refreshGroupsManaged }) => {
    const [isGroupHashChanged, setIsGroupHashChanged] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "CHANGE GROUP HASH";
    const question = "Are you sure to change the group hash?";
    const consequences = "The mqtt topics of this group must be change to reference to new the hash. Group hash used in dashboards are going to be updated automatically.";
    const width = 380;
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isGroupHashChanged) {
            refreshGroupsManaged();
        }
    }, [isGroupHashChanged, refreshGroupsManaged]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/group/${groupId}/change_uid`;
        const config = axiosAuth(accessToken);
        axiosInstance(refreshToken, authDispatch)
            .patch(url, null, config)
            .then((response) => {
                setIsGroupHashChanged(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                hideModal();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                if (errorMessage !== "jwt expired") toast.error(errorMessage);
                setIsSubmitting(false);
                hideModal();
            })
    }

    const [showModal] = ChangeModal(title, question, consequences, action, isSubmitting, showLoader, width);

    return (
        <ExChangeIcon action={showModal} rowIndex={rowIndex} />
    )
}

interface EditGroupManagedProps {
    rowIndex: number;
    groupId: number;
    groupManagedData: IGroupManagedData;
}

const EditGroupManaged: FC<EditGroupManagedProps> = ({ rowIndex, groupId, groupManagedData}) => {
    const groupsManagedDispatch = useGroupsManagedDispatch();

    const handleClick = () => {
        const groupManagedIdToEdit = { groupManagedIdToEdit: groupId };
        setGroupManagedIdToEdit(groupsManagedDispatch, groupManagedIdToEdit);

        const groupManagedInputFormData = { groupManagedInputFormData: groupManagedData }
        setGroupManagedInputFormData(groupsManagedDispatch, groupManagedInputFormData);

        const groupManagedRowIndex = { groupManagedRowIndex: rowIndex };
        setGroupManagedRowIndex(groupsManagedDispatch, groupManagedRowIndex);

        const groupsManagedOptionToShow = { groupsManagedOptionToShow: GROUPS_MANAGED_OPTIONS.EDIT_GROUP_MANAGED };
        setGroupsManagedOptionToShow(groupsManagedDispatch, groupsManagedOptionToShow);
    };

    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}

const StyledHeader = styled.div`
    background-color: #202226;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    flex-direction: column;
    height: 100%;
    width: 80px;
`;

export interface IGroupManaged {
    id: number;
    name: string;
    acronym: string;
    orgId: number;
    folderPermission: string;
    groupUid: string;
    mqttActionAllowed: string;
    telegramInvitationLink: string;
    telegramChatId: string;
    isOrgDefaultGroup: boolean;
    floorNumber: number;
    featureIndex: number;
    outerBounds: number[][];
    nriInGroupId: number;
    nriInGroupHash: string;
    nriInGroupIconLongitude: number;
    nriInGroupIconLatitude: number;
    nriInGroupIconRadio: number;
}

interface IGroupManagedColumn extends IGroupManaged {
    addGroupMembers: string;
    removeAllGroupMembers: string;
    changeGroupHash: string;
    edit: string;
}

export const CREATE_GROUPS_MANAGED_COLUMNS = (refreshGroupMembers: () => void, refreshGroupsManaged: () => void): Column<IGroupManagedColumn>[] => {
    return [
        {
            Header: "GroupId",
            accessor: "id",
            filter: 'equals'
        },
        {
            Header: "OrgId",
            accessor: "orgId",
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
            Header: "Type",
            accessor: "isOrgDefaultGroup",
            disableFilters: true
        },        
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Folder<br />permission</div>,
            accessor: "folderPermission",
            disableFilters: true
        },
        {
            Header: "Group hash",
            accessor: "groupUid",
            disableFilters: true,
            disableSortBy: true,
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Mqtt<br />acc</div>,
            accessor: "mqttActionAllowed",
            disableFilters: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const mqttActionAllowed = row?.cells[7]?.value;
                const style: React.CSSProperties = {
                    color: mqttActionAllowed === "None" ? 'red' : 'white'
                };
                return <span style={style}>{mqttActionAllowed}</span>;
            }
        },        
        {
            Header: "telegramInvitationLink",
            accessor: "telegramInvitationLink",
            disableFilters: true,
            disableSortBy: true,
        },
        {
            Header: "telegramChatId",
            accessor: "telegramChatId",
            disableFilters: true
        },        
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Floor<br />number</div>,
            accessor: "floorNumber",
            disableFilters: true
        },
        {
            Header: "featureIndex",
            accessor: "featureIndex",
            disableFilters: true
        },
        {
            Header: "outerBounds",
            accessor: "outerBounds",
            disableFilters: true
        },
        {
            Header: "nriInGroupId",
            accessor: "nriInGroupId",
            disableFilters: true
        },
        {
            Header: "nriInGroupHash",
            accessor: "nriInGroupHash",
            disableFilters: true
        },
        {
            Header: "nriInGroupIconLongitude",
            accessor: "nriInGroupIconLongitude",
            disableFilters: true
        },
        {
            Header: "nriInGroupIconLatitude",
            accessor: "nriInGroupIconLatitude",
            disableFilters: true
        },
        {
            Header: "nriInGroupIconRadio",
            accessor: "nriInGroupIconRadio",
            disableFilters: true
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Add<br />members</div>,
            accessor: "addGroupMembers",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const groupId = row?.cells[0]?.value;
                return <AddGroupMembers rowIndex={rowIndex} groupManagedId={parseInt(groupId, 10)} />
            }
        },
        {
            Header: () => <StyledHeader><div>Remove</div><div>all members</div></StyledHeader>,
            accessor: "removeAllGroupMembers",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const groupId = row?.cells[0]?.value;
                return <RemoveAllGroupMembersModal groupId={groupId} rowIndex={rowIndex} refreshGroupMembers={refreshGroupMembers} />
            }
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Change<br />hash</div>,
            accessor: "changeGroupHash",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const groupId = row?.cells[0]?.value;
                return <ChangeGroupHashModal groupId={groupId} rowIndex={rowIndex} refreshGroupsManaged={refreshGroupsManaged} />
            }
        },
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const groupId = row?.original?.id;
                const name = row?.original?.name;
                const acronym = row?.original?.acronym;
                const orgId = row?.original?.orgId;
                const folderPermission = row?.original?.folderPermission;
                const mqttActionAllowed = row?.original?.mqttActionAllowed;
                const telegramInvitationLink = row?.original?.telegramInvitationLink;
                const telegramChatId = row?.original?.telegramChatId;
                const nriInGroupId = row?.original?.nriInGroupId;
                const nriInGroupHash = row?.original?.nriInGroupHash;
                const nriInGroupIconLongitude = row?.original?.nriInGroupIconLongitude;
                const nriInGroupIconLatitude = row?.original?.nriInGroupIconLatitude;
                const nriInGroupIconRadio = row?.original?.nriInGroupIconRadio;
                const groupManagedData = {
                    groupId,
                    name,
                    acronym,
                    orgId,
                    folderPermission,
                    mqttActionAllowed,
                    telegramInvitationLink,
                    telegramChatId,
                    nriInGroupId,
                    nriInGroupHash,
                    nriInGroupIconLongitude,
                    nriInGroupIconLatitude,
                    nriInGroupIconRadio
                }
                return <EditGroupManaged rowIndex={rowIndex} groupId={groupId} groupManagedData={groupManagedData} />
            }
        },
    ]
}