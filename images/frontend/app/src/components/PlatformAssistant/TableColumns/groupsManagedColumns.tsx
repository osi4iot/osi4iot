import { Column } from 'react-table';
import DownloadFileIcon from '../DownloadFileIcon';
import ExChangeIcon from '../ExchangeIcon';

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
    sslCerts: string;
    changeGroupHash: string;
}

export const GROUPS_MANAGED_COLUMNS: Column<IGroupsManaged>[] = [
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
        Header: "OrgId",
        accessor: "orgId",
        filter: 'equals'
    },
    {
        Header: () => <div style={{backgroundColor: '#202226'}}>Folder<br/>permission</div>,
        accessor: "folderPermission",
        disableFilters: true
    },
    {
        Header: "Group hash",
        accessor: "groupUid",
        disableFilters: true
    },
    {
        Header: "Telegram Invitation Link",
        accessor: "telegramInvitationLink",
        disableFilters: true,
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
        Header: () => <div style={{backgroundColor: '#202226'}}>SSL<br/>certs</div>,
        accessor: "sslCerts",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const groupId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <DownloadFileIcon id={groupId} rowIndex={parseInt(rowIndex,10)}/>
        }
    },
    {
        Header: () => <div style={{backgroundColor: '#202226'}}>Change<br/>hash</div>,
        accessor: "changeGroupHash",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const groupId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
            const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
            return <ExChangeIcon id={groupId} rowIndex={parseInt(rowIndex,10)}/>
        }
    }
]