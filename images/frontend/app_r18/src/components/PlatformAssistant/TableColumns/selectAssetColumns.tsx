import { Column } from 'react-table';
import { StatusLed } from '../Geolocation/StatusLed';

export interface ISelectAsset {
    id: number;
    orgId: number;
    groupId: number;
    type: string;
    assetName: string;
    description: string;
    state: string;
}

export const SELECT_ASSET_COLUMNS: Column<ISelectAsset>[] = [
    {
        Header: "AssetId",
        accessor: "id",
        filter: 'equals'
    },
    {
        Header: "OrgId",
        accessor: "orgId",
        filter: 'equals'
    },
    {
        Header: "GroupId",
        accessor: "groupId",
        filter: 'equals'
    },
    {
        Header: "Asset type",
        accessor: "type",
        filter: 'equals'
    },
    {
        Header: "Asset Name",
        accessor: "assetName",
        filter: 'equals'
    },    
    {
        Header: "Description",
        accessor: "description",
        filter: 'equals'
    },
    {
        Header: "Status",
        accessor: "state",
        disableFilters: true,
        Cell: props => {
            const rowIndex = parseInt(props.row.id, 10);
            const row = props.rows.filter(row => row.index === rowIndex)[0];
            const status = row?.cells[7]?.value;
            return <StatusLed status={status} size="12px"/>
        }
    },
]
   