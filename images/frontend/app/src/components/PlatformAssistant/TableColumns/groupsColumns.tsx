import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { FeatureCollection } from 'geojson';
import { axiosAuth, getDomainName, axiosInstance, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { GROUPS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setGroupIdToEdit,
    setGroupRowIndexToEdit,
    setGroupsOptionToShow,
    setGroupInputData,
    useGroupsDispatch
} from '../../../contexts/groupsOptions';
import { IGroupInputData } from '../../../contexts/groupsOptions/interfaces';
import { setReloadDashboardsTable, setReloadDevicesTable, setReloadDigitalTwinsTable, setReloadGroupMembersTable, setReloadGroupsManagedTable, setReloadGroupsMembershipTable, setReloadOrgsOfGroupsManagedTable, setReloadTopicsTable, usePlatformAssitantDispatch } from '../../../contexts/platformAssistantContext';

export interface IGroup {
    id: number;
    orgId: number;
    name: string;
    acronym: string;
    folderPermission: string;
    groupUid: string;
    telegramInvitationLink: string;
    telegramChatId: string;
    isOrgDefaultGroup: boolean;
    floorNumber: number;
    featureIndex: number;
    geoJsonData: FeatureCollection;
    outerBounds: number[][];
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
const protocol = getProtocol();

const DeleteGroupModal: FC<DeleteGroupModalProps> = ({ rowIndex, orgId, groupId, refreshGroups }) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isGroupDeleted, setIsGroupDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE GROUP";
    const question = "Are you sure to delete this group?";
    const consequences = "All teams, folders, devices and sensor measurements belonging to this group are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isGroupDeleted) {
            refreshGroups();
        }
    }, [isGroupDeleted, refreshGroups]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/group/${orgId}/id/${groupId}`;
        const config = axiosAuth(accessToken);
        axiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsGroupDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                const reloadGroupsManagedTable = true;
                setReloadGroupsManagedTable(plaformAssistantDispatch, { reloadGroupsManagedTable })
                const reloadGroupsMembershipTable = true;
                setReloadGroupsMembershipTable(plaformAssistantDispatch, { reloadGroupsMembershipTable });                

                const reloadOrgsOfGroupsManagedTable = true;
                setReloadOrgsOfGroupsManagedTable(plaformAssistantDispatch, { reloadOrgsOfGroupsManagedTable });
                const reloadGroupMembersTable = true;
                setReloadGroupMembersTable(plaformAssistantDispatch, { reloadGroupMembersTable });
                const reloadDevicesTable = true;
                setReloadDevicesTable(plaformAssistantDispatch, { reloadDevicesTable });
                const reloadTopicsTable = true;
                setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
                const reloadDigitalTwinsTable = true;
                setReloadDigitalTwinsTable(plaformAssistantDispatch, { reloadDigitalTwinsTable });
                const reloadDashboardsTable = true;
                setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });                
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

interface EditGroupProps {
    rowIndex: number;
    groupId: number;
    groupInputData: IGroupInputData;
}

const EditGroup: FC<EditGroupProps> = ({ rowIndex, groupId, groupInputData }) => {
    const groupsDispatch = useGroupsDispatch()

    const handleClick = () => {
        const groupIdToEdit = { groupIdToEdit: groupId };
        setGroupIdToEdit(groupsDispatch, groupIdToEdit);

        const groupRowIndexToEdit = { groupRowIndexToEdit: rowIndex };
        setGroupRowIndexToEdit(groupsDispatch, groupRowIndexToEdit);

        const groupInputFormData = { groupInputFormData: groupInputData }
        setGroupInputData(groupsDispatch, groupInputFormData );

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
            Header: () => <div style={{ backgroundColor: '#202226' }}>Floor<br />number</div>,
            accessor: "floorNumber",
            disableFilters: true
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Feature<br />index</div>,
            accessor: "featureIndex",
            disableFilters: true
        },
        {
            Header: "outerBounds",
            accessor: "outerBounds",
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
                const name = row?.cells[2]?.value;
                const acronym = row?.cells[3]?.value;
                const folderPermission = row?.cells[4]?.value;
                const telegramInvitationLink = row?.cells[6]?.value;
                const telegramChatId = row?.cells[7]?.value;
                const floorNumber = row?.cells[9]?.value;
                const featureIndex = row?.cells[10]?.value;
                const groupInputData = { name, acronym, folderPermission, telegramInvitationLink, telegramChatId, floorNumber, featureIndex }
                return <EditGroup groupId={groupId} rowIndex={rowIndex} groupInputData={groupInputData} />
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
                const orgpId = row?.cells[1]?.value;
                return <DeleteGroupModal orgId={orgpId} groupId={groupId} rowIndex={rowIndex} refreshGroups={refreshGroups} />
            }
        }
    ]
}
