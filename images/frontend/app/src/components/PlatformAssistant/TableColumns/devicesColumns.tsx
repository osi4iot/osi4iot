import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, axiosInstance } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import ExChangeIcon from '../ExchangeIcon';
import DeleteModal from '../../Tools/DeleteModal';
import ChangeModal from '../../Tools/ChangeModal';
import { DEVICES_OPTIONS } from '../platformAssistantOptions';
import { setDeviceIdToEdit, setDevicesOptionToShow, setDeviceRowIndexToEdit, useDevicesDispatch } from '../../../contexts/devicesOptions';

export interface IDevice {
    id: number;
    orgId: number;
    groupId: number;
    name: string;
    description: string;
    type: string;
    latitude: number;
    longitude: number;
    deviceUid: string;
}


interface IDeviceColumn extends IDevice {
    changeDeviceHash: string;
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE DEVICE";
    const question = "Are you sure to delete this device?";
    const consequences = "All measurements of this device and sensor mesurements are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isDeviceDeleted) {
            refreshDevices();
        }
    }, [isDeviceDeleted, refreshDevices]);

    const action = (hideModal: () => void) => {
        const url = `https://${domainName}/admin_api/device/${groupId}/id/${deviceId}`;
        const config = axiosAuth(accessToken);
        axiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsDeviceDeleted(true);
                setIsSubmitting(false);
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

    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader);

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
        setDeviceIdToEdit(devicesDispatch, deviceIdToEdit);

        const deviceRowIndexToEdit = { deviceRowIndexToEdit: rowIndex };
        setDeviceRowIndexToEdit(devicesDispatch, deviceRowIndexToEdit);

        const devicesOptionToShow = { devicesOptionToShow: DEVICES_OPTIONS.EDIT_DEVICE };
        setDevicesOptionToShow(devicesDispatch, devicesOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}

interface ChangeDeviceHashModalProps {
    rowIndex: number;
    groupId: number;
    deviceId: number;
    refreshDevices: () => void;
}

const ChangeDeviceHashModal: FC<ChangeDeviceHashModalProps> = ({ rowIndex, groupId, deviceId, refreshDevices }) => {
    const [isDeviceHashChanged, setIsDeviceHashChanged] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "CHANGE DEVICE HASH";
    const question = "Are you sure to change hash of this device?";
    const consequences = "The mqtt topics of this device must be change to reference to new the hash. Device hash used in dashboards are going to be updated automatically.";
    const width = 380;
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isDeviceHashChanged) {
            refreshDevices();
        }
    }, [isDeviceHashChanged, refreshDevices]);

    const action = (hideModal: () => void) => {
        const url = `https://${domainName}/admin_api/device/${groupId}/changeUid/${deviceId}`;
        const config = axiosAuth(accessToken);
        axiosInstance(refreshToken, authDispatch)
            .patch(url, null, config)
            .then((response) => {
                setIsDeviceHashChanged(true);
                setIsSubmitting(false);
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

    const [showModal] = ChangeModal(title, question, consequences, action, isSubmitting, showLoader, width);

    return (
        <ExChangeIcon action={showModal} rowIndex={rowIndex} />
    )
}

export const Create_DEVICES_COLUMNS = (refreshDevices: () => void): Column<IDeviceColumn>[] => {
    return [
        {
            Header: "DeviceId",
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
            Header: "Name",
            accessor: "name"
        },
        {
            Header: "Description",
            accessor: "description"
        },
        {
            Header: "Type",
            accessor: "type",
            disableFilters: true
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
            Header: "Device hash",
            accessor: "deviceUid",
            disableFilters: true,
            disableSortBy: true
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Change<br />hash</div>,
            accessor: "changeDeviceHash",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const deviceId = row?.cells[0]?.value;
                const groupId = row?.cells[2]?.value;
                return <ChangeDeviceHashModal groupId={groupId} deviceId={deviceId} rowIndex={rowIndex} refreshDevices={refreshDevices} />
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
                const deviceId = row?.cells[0]?.value;
                return <EditDevice deviceId={deviceId} rowIndex={rowIndex} />
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
                const deviceId = row?.cells[0]?.value;
                const groupId = row?.cells[2]?.value;
                return <DeleteDeviceModal groupId={groupId} deviceId={deviceId} rowIndex={rowIndex} refreshDevices={refreshDevices} />
            }
        }
    ]
}
