import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName } from '../../../tools/tools';
import { useAuthState } from '../../../contexts/authContext';
import axios from 'axios';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import ExChangeIcon from '../ExchangeIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { DEVICES_OPTIONS } from '../platformAssistantOptions';
import { setDeviceIdToEdit, setDevicesOptionToShow, setDeviceRowIndexToEdit, useDevicesDispatch } from '../../../contexts/devices';

export interface IDevices {
    orgId: number;
    groupId: string;
    id: number;
    name: string;
    description: string;
    deviceUid: string;
    latitude: number;
    longitude: number;
    isDefaultGroupDevice: boolean;
    changeDeviceHash: string;
}

interface IDevicesColumn extends IDevices {
    edit: string;
    delete: string;
}

interface DeleteDeviceModalProps {
    rowIndex: number;
    groupId: number;
    deviceId: number;
    refreshDevices: () => void;
}

const domainName = getDomainName();

const DeleteDeviceModal: FC<DeleteDeviceModalProps> = ({ rowIndex, groupId, deviceId, refreshDevices }) => {
    const [isDeviceDeleted, setIsDeviceDeleted] = useState(false);
    const component = "device";
    const consequences = "All measurements of this device and its mesurements are going to be lost.";
    const { accessToken } = useAuthState();

    useEffect(() => {
        if (isDeviceDeleted) {
            refreshDevices();
        }
    }, [isDeviceDeleted, refreshDevices]);

    const action = (hideModal: () => void) => {
        const url = `https://${domainName}/admin_api/device/${groupId}/id/${deviceId}`;
        const config = axiosAuth(accessToken);
        axios
            .delete(url, config)
            .then((response) => {
                setIsDeviceDeleted(true);
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

    const [showModal] = DeleteModal(component, consequences, action);

    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}

interface EditDeviceProps {
    rowIndex: number;
    deviceId: number;
}

const EditDevice: FC<EditDeviceProps> = ({ rowIndex, deviceId }) => {
    const devicesDispatch = useDevicesDispatch()

    const handleClick = () => {
        const deviceIdToEdit = { deviceIdToEdit: deviceId };
        setDeviceIdToEdit(devicesDispatch , deviceIdToEdit);

        const deviceRowIndexToEdit = { deviceRowIndexToEdit: rowIndex };
        setDeviceRowIndexToEdit(devicesDispatch , deviceRowIndexToEdit);

        const devicesOptionToShow = { devicesOptionToShow: DEVICES_OPTIONS.EDIT_DEVICE };
        setDevicesOptionToShow(devicesDispatch, devicesOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}

export const Create_DEVICES_COLUMNS = (refreshDevices: () => void): Column<IDevicesColumn>[] => {
    return [
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
            Header: "DeviceId",
            accessor: "id",
            filter: 'equals'
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
            Header: "Device hash",
            accessor: "deviceUid",
            disableFilters: true,
            disableSortBy: true
        },
        {
            Header: "Longitude",
            accessor: "longitude",
            disableFilters: true,
            disableSortBy: true
        },
        {
            Header: "Latitude",
            accessor: "latitude",
            disableFilters: true,
            disableSortBy: true
        },
        {
            Header: "Type",
            accessor: "isDefaultGroupDevice",
            disableFilters: true
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Change<br />hash</div>,
            accessor: "changeDeviceHash",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const groupId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <ExChangeIcon id={groupId} rowIndex={parseInt(rowIndex, 10)} />
            }
        },
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const deviceId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <EditDevice deviceId={deviceId} rowIndex={parseInt(rowIndex)} />
            }
        },
        {
            Header: "",
            accessor: "delete",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const deviceId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const groupId = props.rows[props.row.id as unknown as number]?.cells[1]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <DeleteDeviceModal groupId={groupId} deviceId={deviceId} rowIndex={parseInt(rowIndex)} refreshDevices={refreshDevices} />
            }
        }
    ]
}
