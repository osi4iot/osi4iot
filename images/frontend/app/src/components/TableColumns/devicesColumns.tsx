import { Column } from 'react-table';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';

export interface IDevices {
    id: number;
    name: string;
    description: string;
    orgId: number;
    groupId: string;
    groupUid: string;
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
        Header: "Group Hash",
        accessor: "groupUid"
    },
    {
        Header: "Device Hash",
        accessor: "deviceUid"
    },
    {
        Header: "Longitude",
        accessor: "longitude"
    },
    {
        Header: "Latitude",
        accessor: "latitude"
    },
    {
        Header: "Group Default",
        accessor: "isDefaultGroupDevice"
    },
    {
        Header: "",
        accessor: "edit",
        Cell: props => {
            const deviceId = props.rows[props.row.id as unknown as number].cells[0].value;
            return <EditIcon id={deviceId} />
        }
    },
    {
        Header: "",
        accessor: "delete",
        Cell: props => {
            const deviceId = props.rows[props.row.id as unknown as number].cells[0].value;
            return <DeleteIcon id={deviceId} />
        }
    }
]