import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';

export interface IDevices {
    id: number;
    name: string;
    description: string;
    orgId: number;
    groupId: string;
    deviceUid: string;
	latitude: number;
	longitude: number;
    isDefaultGroupDevice: boolean;
    edit: string;
    delete: string;
}

export const DEVICES_COLUMNS: Column<IDevices>[] = [
    {
        Header: "Id",
        accessor: "id"
    },
    {
        Header: "Name",
        accessor: "name"
    },
    {
        Header: "Description",
        accessor: "description"
    },
    {
        Header: "OrgId",
        accessor: "orgId"
    },
    {
        Header: "GroupId",
        accessor: "groupId"
    },
    {
        Header: "Device Hash",
        accessor: "deviceUid",
        disableFilters: true
    },
    {
        Header: "Longitude",
        accessor: "longitude",
        disableFilters: true
    },
    {
        Header: "Latitude",
        accessor: "latitude",
        disableFilters: true
    },
    {
        Header: () => <div style={{backgroundColor: '#202226'}}>Is group<br/>default?</div>,
        accessor: "isDefaultGroupDevice",
        disableFilters: true
    },
    {
        Header: "",
        accessor: "edit",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const deviceId = props.rows[props.row.id as unknown as number]?.cells[0].value;
            return <EditIcon id={deviceId} />
        }
    },
    {
        Header: "",
        accessor: "delete",
        disableFilters: true,
        disableSortBy: true,
        Cell: props => {
            const deviceId = props.rows[props.row.id as unknown as number]?.cells[0].value;
            return <DeleteIcon id={deviceId} />
        }
    }
]