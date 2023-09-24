import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import ExChangeIcon from '../Utils/ExchangeIcon';
import DeleteModal from '../../Tools/DeleteModal';
import ChangeModal from '../../Tools/ChangeModal';
import { DEVICES_OPTIONS } from '../Utils/platformAssistantOptions';
import { setDeviceIdToEdit, setDevicesOptionToShow, setDeviceRowIndexToEdit, useDevicesDispatch } from '../../../contexts/devicesOptions';
import { IDeviceInputData } from '../../../contexts/devicesOptions/interfaces';
import { setDeviceInputData } from '../../../contexts/devicesOptions/devicesAction';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import DownloadFileIcon from '../Utils/DownloadFileIcon';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';

export interface IDevice {
    id: number;
    orgId: number;
    groupId: number;
    type: string;
    latitude: number;
    longitude: number;
    deviceUid: string;
    iconRadio: number;
    masterDeviceUrl: string;
    sslCerts: string;
    mqttAccessControl: string;
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
    deviceType: string;
    refreshDevices: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteDeviceModal: FC<DeleteDeviceModalProps> = ({ rowIndex, groupId, deviceId, deviceType, refreshDevices }) => {
    const [isDeviceDeleted, setIsDeviceDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE DEVICE";
    const question = "Are you sure to delete this device?";
    const consequences = "All measurements of this device and sensor measurements are going to be lost.";
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
        const url = `${protocol}://${domainName}/admin_api/device/${groupId}/id/${deviceId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsDeviceDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                hideModal();
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                setIsSubmitting(false);
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
    deviceInputData: IDeviceInputData;
}

const EditDevice: FC<EditDeviceProps> = ({ rowIndex, deviceId, deviceInputData }) => {
    const devicesDispatch = useDevicesDispatch()

    const handleClick = () => {
        const deviceIdToEdit = { deviceIdToEdit: deviceId };
        setDeviceIdToEdit(devicesDispatch, deviceIdToEdit);

        const deviceInputFormData = { deviceInputFormData: deviceInputData }
        setDeviceInputData(devicesDispatch, deviceInputFormData);

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
        const url = `${protocol}://${domainName}/admin_api/device/${groupId}/changeUid/${deviceId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .patch(url, null, config)
            .then((response) => {
                setIsDeviceHashChanged(true);
                setIsSubmitting(false);
                const data = response.data;
                if (data.newDeviceUid !== undefined) {
                    const message = "Device hash changed successfully."
                    toast.success(message);
                }
                hideModal();
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
                setIsSubmitting(false);
                hideModal();
            })
    }

    const [showModal] = ChangeModal(title, question, consequences, action, isSubmitting, showLoader, width);

    return (
        <ExChangeIcon action={showModal} rowIndex={rowIndex} />
    )
}

interface DownLoadSslCertsProps {
    rowIndex: number;
    groupId: number;
    deviceId: number;
}

const DownLoadSslCerts: FC<DownLoadSslCertsProps> = ({ rowIndex, groupId, deviceId }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const handleClick = () => {
        const url = `${protocol}://${domainName}/admin_api/device_ssl_certs/${groupId}/${deviceId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .get(url, config)
            .then((response) => {
                const data = response.data;
                const validityDays = data.validityDays;
                const message = `Ssl certs created successfully. These are valid for ${validityDays} days`;
                var zip = new JSZip();
                const fileName = `device_${deviceId}_certs`;
                const secrets = `username=${data.username}\npassword=${data.password}\n`
                var device_certs = zip.folder(`${fileName}`);
                device_certs?.file("ca.crt", data.caCert);
                device_certs?.file(`device_${deviceId}.crt`, data.clientCert);
                device_certs?.file(`device_${deviceId}.key`, data.clientKey);
                device_certs?.file(`device_${deviceId}.secrets`, secrets);
                zip.generateAsync({ type: "blob" })
                    .then(function (content) {
                        saveAs(content, `${fileName}.zip`);
                    });
                toast.success(message);
            })
            .catch((error) => {
                axiosErrorHandler(error, authDispatch);
            })
    };

    return (
        <span onClick={handleClick}>
            <DownloadFileIcon rowIndex={rowIndex} />
        </span>
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
            Header: "Type",
            accessor: "type",
            disableFilters: true
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Icon<br />radio</div>,
            accessor: "iconRadio",
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
            Header: () => <div style={{ backgroundColor: '#202226' }}>Mqtt<br />acc</div>,
            accessor: "mqttAccessControl",
            disableFilters: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const mqttAccessControl = row?.cells[7]?.value;
                const style: React.CSSProperties = {
                    color: mqttAccessControl === "None" ? 'red' : 'white'
                };
                return <span style={style}>{mqttAccessControl}</span>;
            }
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
            Header: () => <div style={{ backgroundColor: '#202226' }}>SSL<br />certs</div>,
            accessor: "sslCerts",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const deviceId = row?.cells[0]?.value;
                const groupId = row?.cells[2]?.value;
                return <DownLoadSslCerts groupId={groupId} deviceId={deviceId} rowIndex={rowIndex} />
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
                const groupId = row?.cells[2]?.value;
                const type = row?.cells[3]?.value;
                const iconRadio = row?.cells[4]?.value;
                const longitude = row?.cells[5]?.value;
                const latitude = row?.cells[6]?.value;
                const mqttAccessControl = row?.cells[7]?.value;
                const deviceUid = row?.cells[8]?.value;
                const deviceInputData = {
                    groupId,
                    type,
                    iconRadio,
                    longitude,
                    latitude,
                    mqttAccessControl,
                    deviceUid
                }
                return <EditDevice deviceId={deviceId} rowIndex={rowIndex} deviceInputData={deviceInputData} />
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
                const deviceType = row?.cells[5]?.value
                return <DeleteDeviceModal
                    groupId={groupId}
                    deviceId={deviceId}
                    rowIndex={rowIndex}
                    deviceType={deviceType}
                    refreshDevices={refreshDevices}
                />
            }
        }
    ]
}
