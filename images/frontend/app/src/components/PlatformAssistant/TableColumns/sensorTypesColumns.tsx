import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { usePlatformAssitantDispatch } from '../../../contexts/platformAssistantContext';
import { SENSOR_TYPES_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    setSensorTypeIdToEdit,
    setSensorTypeRowIndexToEdit,
    setSensorTypesOptionToShow,
    useSensorTypesDispatch
} from '../../../contexts/sensorTypesOptions';

export interface ISensorType {
	id: number;
	orgId: number;
	sensorTypeUid: string;
	type: string;
	iconSvgFileName: string;
	iconSvgString: string;
	markerSvgFileName: string;
	markerSvgString: string;
    isPredefined: boolean;
    isPredefinedString: string;
	defaultPayloadJsonSchema: string;
	dashboardRefreshString: string;
	dashboardTimeWindow: string;   
}

interface ISensorTypeColumn extends ISensorType {
    edit: string;
    delete: string;
}

interface DeleteSensorTypeModalProps {
    rowIndex: number;
    orgId: number;
    sensorTypeId: number;
    refreshSensorTypes: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteSensorTypeModal: FC<DeleteSensorTypeModalProps> = ({ rowIndex, orgId, sensorTypeId, refreshSensorTypes }) => {
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [isSensorTypeDeleted, setIsSensorTypeDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE SENSOR TYPE";
    const question = "Are you sure to delete this sensor type?";
    const consequences = "Icon and marker svg data are going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isSensorTypeDeleted) {
            refreshSensorTypes();
        }
    }, [isSensorTypeDeleted, plaformAssistantDispatch, refreshSensorTypes]);

    const action = (hideModal: () => void) => {
        const url = `${protocol}://${domainName}/admin_api/asset_type/${orgId}/id/${sensorTypeId}`;
        const config = axiosAuth(accessToken);
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsSensorTypeDeleted(true);
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

interface EditSensorTypeProps {
    rowIndex: number;
    sensorTypeId: number;
}

const EditSensorType: FC<EditSensorTypeProps> = ({ rowIndex, sensorTypeId }) => {
    const sensorTypesDispatch = useSensorTypesDispatch()

    const handleClick = () => {
        const sensorTypeIdToEdit = { sensorTypeIdToEdit: sensorTypeId };
        setSensorTypeIdToEdit(sensorTypesDispatch, sensorTypeIdToEdit);


        const sensorTypeRowIndexToEdit = { sensorTypeRowIndexToEdit: rowIndex };
        setSensorTypeRowIndexToEdit(sensorTypesDispatch, sensorTypeRowIndexToEdit);

        const sensorTypesOptionToShow = { sensorTypesOptionToShow: SENSOR_TYPES_OPTIONS.EDIT_SENSOR_TYPE };
        setSensorTypesOptionToShow(sensorTypesDispatch, sensorTypesOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


export const Create_SENSOR_TYPES_COLUMNS = (refreshSensorTypes: () => void): Column<ISensorTypeColumn>[] => {
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
            Header: "SensorTypeUid",
            accessor: "sensorTypeUid",
            filter: 'equals'
        },
        {
            Header: "Type",
            accessor: "type",
            filter: 'equals'
        },
        {
            Header: "Predefined",
            accessor: "isPredefinedString",
            filter: 'equals'
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Dashboard<br />refresh</div>,
            accessor: "dashboardRefreshString",
            filter: 'equals'
        },
        {
            Header: () => <div style={{ backgroundColor: '#202226' }}>Dashboard<br />time window</div>,
            accessor: "dashboardTimeWindow",
            filter: 'equals'
        }, 
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const sensorTypeId = row?.cells[0]?.value;
                return <EditSensorType sensorTypeId={sensorTypeId} rowIndex={rowIndex} />
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
                const sensorTypeId = row?.cells[0]?.value;
                const orgId = row?.cells[1]?.value;
                return <DeleteSensorTypeModal
                    sensorTypeId={sensorTypeId}
                    orgId={orgId}
                    rowIndex={rowIndex}
                    refreshSensorTypes={refreshSensorTypes}
                />
            }
        }
    ]
}
