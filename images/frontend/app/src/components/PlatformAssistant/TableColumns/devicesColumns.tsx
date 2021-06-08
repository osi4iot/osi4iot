import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, axiosInstance } from '../../../tools/tools';
import { useAuthState } from '../../../contexts/authContext';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import ExChangeIcon from '../ExchangeIcon';
import DeleteModal from '../../Tools/DeleteModal';
import ChangeModal from '../../Tools/ChangeModal';
import { DEVICES_OPTIONS } from '../platformAssistantOptions';
import { setDeviceIdToEdit, setDevicesOptionToShow, setDeviceRowIndexToEdit, useDevicesDispatch } from '../../../contexts/devicesOptions';

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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE DEVICE";
    const question = "Are you sure to delete this device?";
    const consequences = "All measurements of this device and sensor mesurements are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();

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
        axiosInstance(refreshToken)
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
        axiosInstance(refreshToken)
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
                const deviceId = props.rows[props.row.id as unknown as number]?.cells[0]?.value;
                const groupId = props.rows[props.row.id as unknown as number]?.cells[1]?.value;
                const rowIndex = props.rows[props.row.id as unknown as number]?.cells[0]?.row?.id;
                return <ChangeDeviceHashModal groupId={groupId} deviceId={deviceId} rowIndex={parseInt(rowIndex)} refreshDevices={refreshDevices} />
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
