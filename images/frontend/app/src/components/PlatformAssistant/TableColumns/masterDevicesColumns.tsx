import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { axiosAuth, getDomainName, axiosInstance } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { MASTER_DEVICES_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setMasterDeviceIdToEdit,
    setMasterDeviceRowIndexToEdit,
    setMasterDevicesOptionToShow,
    useMasterDevicesDispatch
} from '../../../contexts/masterDevicesOptions';


export interface IMasterDevice {
    id: number;
    orgId: number;
    masterDeviceHash: string;
    groupId: number;
    deviceId: number;
}

interface IMasterDeviceColumn extends IMasterDevice {
    edit: string;
    delete: string;
}

interface DeleteMasterDeviceModalProps {
    rowIndex: number;
    masterDeviceId: number;
    refreshMasterDevices: () => void;
}

const domainName = getDomainName();

const DeleteMasterDeviceModal: FC<DeleteMasterDeviceModalProps> = ({ rowIndex, masterDeviceId, refreshMasterDevices }) => {
    const [isMasterDeviceDeleted, setIsMasterDeviceDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE MASTER DEVICE";
    const question = "Are you sure to delete this master evice?";
    const consequences = "The geojson data of the master device are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isMasterDeviceDeleted) {
            refreshMasterDevices();
        }
    }, [isMasterDeviceDeleted, refreshMasterDevices]);

    const action = (hideModal: () => void) => {
        const url = `https://${domainName}/admin_api/master_device/${masterDeviceId}`;
        const config = axiosAuth(accessToken);
        axiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsMasterDeviceDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                hideModal();
            })
            .catch((error) => {
                const errorMessage = error.response.data.message;
                toast.error(errorMessage);
                setIsSubmitting(false);
                hideModal();
            })
    }
    const [showModal] = DeleteModal(title, question, consequences, action, isSubmitting, showLoader);


    return (
        <DeleteIcon action={showModal} rowIndex={rowIndex} />
    )
}

interface EditMasterDeviceProps {
    rowIndex: number;
    masterDeviceId: number;
}

const EditMasterDevice: FC<EditMasterDeviceProps> = ({ rowIndex, masterDeviceId }) => {
    const masterDevicesDispatch = useMasterDevicesDispatch();

    const handleClick = () => {
        const masterDeviceIdToEdit = { masterDeviceIdToEdit: masterDeviceId };
        setMasterDeviceIdToEdit(masterDevicesDispatch, masterDeviceIdToEdit);

        const masterDeviceRowIndexToEdit = { masterDeviceRowIndexToEdit: rowIndex };
        setMasterDeviceRowIndexToEdit(masterDevicesDispatch, masterDeviceRowIndexToEdit);

        const masterDevicesOptionToShow = { masterDevicesOptionToShow: MASTER_DEVICES_OPTIONS.EDIT_MASTER_DEVICE };
        setMasterDevicesOptionToShow(masterDevicesDispatch, masterDevicesOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


export const Create_MASTER_DEVICE_COLUMNS = (refreshMasterDevices: () => void): Column<IMasterDeviceColumn>[] => {
    return [
        {
            Header: "Id",
            accessor: "id",
            filter: 'equals'
        },
        {
            Header: "Org Id",
            accessor: "orgId"
        },
        {
            Header: "Group Id",
            accessor: "groupId"
        },
        {
            Header: "Device Id",
            accessor: "deviceId",
        },
        {
            Header: "Master device hash",
            accessor: "masterDeviceHash"
        },
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const masterDeviceId = row?.cells[0]?.value;
                return <EditMasterDevice masterDeviceId={masterDeviceId} rowIndex={rowIndex} />
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
                const masterDeviceId = row?.cells[0]?.value;
                return <DeleteMasterDeviceModal masterDeviceId={masterDeviceId} rowIndex={rowIndex} refreshMasterDevices={refreshMasterDevices} />
            }
        }
    ]
}