import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { SENSORS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setSensorIdToEdit,
    setSensorRowIndexToEdit,
    setSensorsOptionToShow,
    useSensorsDispatch
} from '../../../contexts/sensorsOptions';

import {
    setReloadDashboardsTable,
    setReloadTopicsTable,
    setReloadSensorsTable,
    usePlatformAssitantDispatch
} from '../../../contexts/platformAssistantContext';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { AxiosResponse, AxiosError } from 'axios';


export interface ISensor {
    id: number;
    orgId: number;
    groupId: number;
    assetId: number;
    sensorUid: string;
    sensorRef: string;
    sensorType: string;
    sensorTypeId: number;
    topicId: number;
    topicUid: string;
    topicRef: string;
    description: string;
    dashboardId: string;
    dashboardUrl: string;
    payloadJsonSchema: string;
}



interface ISensorColumn extends  ISensor {
    edit: string;
    delete: string;
}

interface DeleteSensorModalProps {
    rowIndex: number;
    groupId: number;
    sensorId: number;
    refreshSensors: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteSensorModal: FC<DeleteSensorModalProps> = ({ rowIndex, groupId, sensorId, refreshSensors }) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isSensorDeleted, setIsSensorDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE ASSET";
    const question = "Are you sure to delete this sensor?";
    const consequences = "Sensors of this sensor are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isSensorDeleted) {
            refreshSensors();
            const reloadSensorsTable = true;
            setReloadSensorsTable(plaformAssistantDispatch, { reloadSensorsTable });
            const reloadTopicsTable = true;
            setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
            const reloadDashboardsTable = true;
            setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
        }
    }, [isSensorDeleted, plaformAssistantDispatch, refreshSensors]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/sensor/${groupId}/id/${sensorId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response: AxiosResponse<any, any>) => {
                setIsSensorDeleted(true);
                setIsSubmitting(false);
                const data = response.data;
                toast.success(data.message);
                hideModal();

            })
            .catch((error: AxiosError) => {
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

interface EditSensorProps {
    rowIndex: number;
    sensorId: number;
}

const EditSensor: FC<EditSensorProps> = ({ rowIndex, sensorId }) => {
    const sensorsDispatch = useSensorsDispatch()

    const handleClick = () => {
        const sensorIdToEdit = { sensorIdToEdit: sensorId };
        setSensorIdToEdit(sensorsDispatch, sensorIdToEdit);

        const sensorRowIndexToEdit = { sensorRowIndexToEdit: rowIndex };
        setSensorRowIndexToEdit(sensorsDispatch, sensorRowIndexToEdit);

        const sensorsOptionToShow = { sensorsOptionToShow: SENSORS_OPTIONS.EDIT_SENSOR };
        setSensorsOptionToShow(sensorsDispatch, sensorsOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


export const Create_SENSORS_COLUMNS = (refreshSensors: () => void): Column<ISensorColumn>[] => {
    return [
        {
            Header: "Id",
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
            Header: "AssetId",
            accessor: "assetId",
            filter: 'equals'
        },
        {
            Header: "SensorUid",
            accessor: "sensorUid",
            filter: 'equals'
        },
        {
            Header: "Type",
            accessor: "sensorType",
            filter: 'equals'
        },
        {
            Header: "Description",
            accessor: "description"
        },
        {
            Header: "SensorRef",
            accessor: "sensorRef",
            filter: 'equals'
        },
        {
            Header: "TopicRef",
            accessor: "topicRef",
            filter: 'equals'
        },
        {
            Header: "TopicId",
            accessor: "topicId",
            filter: 'equals'
        },
        {
            Header: "DashboardId",
            accessor: "dashboardId",
            disableFilters: true,
            disableSortBy: true,
        }, 
        {
            Header: "dashboardUrl",
            accessor: "dashboardUrl",
        },            
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const sensorId = row?.cells[0]?.value;
                return <EditSensor sensorId={sensorId} rowIndex={rowIndex} />
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
                const sensorId = row?.cells[0]?.value;
                const groupId = row?.cells[2]?.value;
                return <DeleteSensorModal sensorId={sensorId} groupId={groupId} rowIndex={rowIndex} refreshSensors={refreshSensors} />
            }
        }
    ]
}
