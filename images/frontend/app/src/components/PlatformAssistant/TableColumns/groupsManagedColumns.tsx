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

}

interface IGroupsManagedColumn extends IGroupsManaged {
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
        Header: () => <div style={{backgroundColor: '#202226'}}>Folder<br/>permission</div>,
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