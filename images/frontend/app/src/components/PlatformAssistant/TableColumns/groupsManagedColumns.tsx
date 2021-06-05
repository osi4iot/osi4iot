import { FC } from 'react';
import { Column } from 'react-table';
import styled from "styled-components";
import DownloadFileIcon from '../DownloadFileIcon';
import ExChangeIcon from '../ExchangeIcon';
import AddUsersIcon from '../AddUsersIcon';
import RemoveUsersIcon from '../RemoveUsersIcon';
import { setGroupManagedIdToCreateGroupMembers, setGroupManagedRowIndex, setGroupsManagedOptionToShow, useGroupsManagedDispatch } from '../../../contexts/groupsManagedOptions';
import { GROUPS_MANAGED_OPTIONS } from '../platformAssistantOptions';


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

const StyledHeader = styled.div`
    background-color: #202226;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    flex-direction: column;
    height: 100%;
    width: 80px;
`;

export interface IGroupsManaged {
    id: number;
    name: string;
    acronym: string;
    orgId: number;
    folderPermission: string;
    groupUid: string;
    telegramInvitationLink: string;
    telegramChatId: string;
    isOrgDefaultGroup: boolean;

}

interface IGroupsManagedColumn extends IGroupsManaged {
    addGroupMembers: string;
    removeAllGroupMembers: string;
    sslCerts: string;
    changeGroupHash: string;
}

export const GROUPS_MANAGED_COLUMNS: Column<IGroupsManagedColumn>[] = [
    {
        Header: "OrgId",
        accessor: "orgId",
        filter: 'equals'
    },
    {
        Header: "Id",
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
        Header: "ChatId",
        accessor: "telegramChatId",
        disableFilters: true,
        disableSortBy: true,
    },
    {
        Header: "Type",
        accessor: "isOrgDefaultGroup",
        disableFilters: true
    },
    {
        Header: () => <div style={{ backgroundColor: '#202226' }}>Add<br />members</div>,
        accessor: "addGroupMembers",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const groupId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <AddGroupMembers rowIndex={parseInt(rowIndex, 10)} groupManagedId={parseInt(groupId, 10)} />
        }
    },
    {
        Header: () => <StyledHeader><div>Remove</div><div>all members</div></StyledHeader>,
        accessor: "removeAllGroupMembers",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const groupId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <RemoveUsersIcon id={groupId} rowIndex={parseInt(rowIndex, 10)} />
        }
    },
    {
        Header: () => <div style={{ backgroundColor: '#202226' }}>SSL<br />certs</div>,
        accessor: "sslCerts",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const groupId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <DownloadFileIcon id={groupId} rowIndex={parseInt(rowIndex, 10)} />
        }
    },
    {
        Header: () => <div style={{ backgroundColor: '#202226' }}>Change<br />hash</div>,
        accessor: "changeGroupHash",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const groupId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <ExChangeIcon id={groupId} rowIndex={parseInt(rowIndex, 10)} />
        }
    }
]