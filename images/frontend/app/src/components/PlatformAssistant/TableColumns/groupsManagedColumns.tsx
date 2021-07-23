import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import styled from "styled-components";
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import DownloadFileIcon from '../DownloadFileIcon';
import ExChangeIcon from '../ExchangeIcon';
import AddUsersIcon from '../AddUsersIcon';
import RemoveUsersIcon from '../RemoveUsersIcon';
import {
    setGroupManagedIdToCreateGroupMembers,
    setGroupManagedRowIndex,
    setGroupsManagedOptionToShow,
    useGroupsManagedDispatch
} from '../../../contexts/groupsManagedOptions';
import { GROUPS_MANAGED_OPTIONS } from '../platformAssistantOptions';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, axiosInstance } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import DeleteModal from '../../Tools/DeleteModal';
import ChangeModal from '../../Tools/ChangeModal';


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
        const url = `https://${domainName}/admin_api/group/${groupId}/members`;
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
                toast.error(errorMessage);
                setIsSubmitting(false);
                hideModal();
            })
    }

    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader, width);

    return (
        <RemoveUsersIcon action={showModal} rowIndex={rowIndex} />
    )
}


interface DownLoadSslCertsProps {
    rowIndex: number;
    groupId: number;
}

const DownLoadSslCerts: FC<DownLoadSslCertsProps> = ({ rowIndex, groupId }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const handleClick = () => {
        const url = `https://${domainName}/admin_api/group/${groupId}/ssl_certs`;
        const config = axiosAuth(accessToken);
        axiosInstance(refreshToken, authDispatch)
            .get(url, config)
            .then((response) => {
                const data = response.data;
                const validityDays = data.validityDays;
                const message = `Ssl certs created successfully. These are valid for ${validityDays} days`;
                var zip = new JSZip();
                const fileName = `group_${groupId}_certs`;
                var group_certs = zip.folder(`${fileName}`);
                group_certs?.file("ca.crt", data.caCert);
                group_certs?.file(`group_${groupId}.crt`, data.clientCert);
                group_certs?.file(`group_${groupId}.key`, data.clientKey);
                zip.generateAsync({ type: "blob" })
                    .then(function (content) {
                        saveAs(content, `${fileName}.zip`);
                    });
                toast.success(message);
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
            })
    };

    return (
        <span onClick={handleClick}>
            <DownloadFileIcon rowIndex={rowIndex} />
        </span>
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
        const url = `https://${domainName}/admin_api/group/${groupId}/change_uid`;
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
                toast.error(errorMessage);
                setIsSubmitting(false);
                hideModal();
            })
    }

    const [showModal] = ChangeModal(title, question, consequences, action, isSubmitting, showLoader, width);

    return (
        <ExChangeIcon action={showModal} rowIndex={rowIndex} />
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
    telegramInvitationLink: string;
    isOrgDefaultGroup: boolean;
    floorNumber: number;
    featureIndex: number;
    outerBounds: number[][];
}

interface IGroupManagedColumn extends IGroupManaged {
    addGroupMembers: string;
    removeAllGroupMembers: string;
    sslCerts: string;
    changeGroupHash: string;
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
            Header: "Telegram Invitation Link",
            accessor: "telegramInvitationLink",
            disableFilters: true,
            disableSortBy: true,
        },
        {
            Header: "Type",
            accessor: "isOrgDefaultGroup",
            disableFilters: true
        },
        {
            Header: "Floor Number",
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
            Header: () => <div style={{ backgroundColor: '#202226' }}>SSL<br />certs</div>,
            accessor: "sslCerts",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const groupId = row?.cells[0]?.value;
                return <DownLoadSslCerts groupId={groupId} rowIndex={rowIndex} />
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
        }
    ]
}