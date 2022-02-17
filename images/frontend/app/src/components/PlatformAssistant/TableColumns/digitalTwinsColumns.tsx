import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, axiosInstance } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { DIGITAL_TWINS_OPTIONS } from '../Utils/platformAssistantOptions';
import { setDigitalTwinIdToEdit, setDigitalTwinRowIndexToEdit, setDigitalTwinsOptionToShow, useDigitalTwinsDispatch } from '../../../contexts/digitalTwinsOptions';

export interface IDigitalTwin {
    id: number;
    groupId: number;
    deviceId: number;
    name: string;
    description: string;
    type: string;
    dashboardId: string;
    gltfFileName: string;
    gltfFileLastModifDateString: string;
    femSimDataFileName: string;
    femSimDataFileLastModifDateString: string;
    digitalTwinSimulationFormat: string;
    sensorSimulationTopicId: number;
	assetStateTopicId: number;
	assetStateSimulationTopicId: number;
	femResultModalValuesTopicId: number;
	femResultModalValuesSimulationTopicId: number;
    dashboardUrl: string;
}

export interface IDigitalTwinSimulator {
    id: number;
    orgId: number;
    groupId: number;
    deviceId: number;
    name: string;
    description: string;
    digitalTwinSimulationFormat: string;
    sensorSimulationTopicId: number;
    mqttTopic: string;
}

interface IDigitalTwinColumn extends IDigitalTwin {
    edit: string;
    delete: string;
}

interface DeleteDigitalTwinModalProps {
    rowIndex: number;
    groupId: number;
    deviceId: number;
    digitalTwinId: number;
    refreshDigitalTwins: () => void;
}

const domainName = getDomainName();

const DeleteDigitalTwinModal: FC<DeleteDigitalTwinModalProps> = ({ rowIndex, groupId, deviceId, digitalTwinId, refreshDigitalTwins }) => {
    const [isDigitalTwinDeleted, setIsDigitalTwinDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE DIGIAL TWIN";
    const question = "Are you sure to delete this digital twin?";
    const consequences = "The visual presentation of this digital twin is going to be lost.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isDigitalTwinDeleted) {
            refreshDigitalTwins();
        }
    }, [isDigitalTwinDeleted, refreshDigitalTwins]);

    const action = (hideModal: () => void) => {
        const url = `https://${domainName}/admin_api/digital_twin/${groupId}/${deviceId}/${digitalTwinId}`;
        const config = axiosAuth(accessToken);
        axiosInstance(refreshToken, authDispatch)
            .delete(url, config)
            .then((response) => {
                setIsDigitalTwinDeleted(true);
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

interface EditDigitalTwinProps {
    rowIndex: number;
    digitalTwinId: number;
}

const EditDigitalTwin: FC<EditDigitalTwinProps> = ({ rowIndex, digitalTwinId }) => {
    const digitalTwinsDispatch = useDigitalTwinsDispatch()

    const handleClick = () => {
        const digitalTwinIdToEdit = { digitalTwinIdToEdit: digitalTwinId };
        setDigitalTwinIdToEdit(digitalTwinsDispatch, digitalTwinIdToEdit);

        const digitalTwinRowIndexToEdit = { digitalTwinRowIndexToEdit: rowIndex };
        setDigitalTwinRowIndexToEdit(digitalTwinsDispatch, digitalTwinRowIndexToEdit);

        const digitalTwinsOptionToShow = { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.EDIT_DIGITAL_TWIN };
        setDigitalTwinsOptionToShow(digitalTwinsDispatch, digitalTwinsOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


export const Create_DIGITAL_TWINS_COLUMNS = (refreshDigitalTwins: () => void): Column<IDigitalTwinColumn>[] => {
    return [
        {
            Header: "Id",
            accessor: "id",
            filter: 'equals'
        },
        {
            Header: "GroupId",
            accessor: "groupId",
            filter: 'equals'
        },
        {
            Header: "DeviceId",
            accessor: "deviceId",
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
            disableFilters: true,
            disableSortBy: true
        },
        {
            Header: "DashboardId",
            accessor: "dashboardId",
            disableFilters: true,
        },
        {
            Header: "gltfFileName",
            accessor: "gltfFileName",
            disableFilters: true,
        }, 
        {
            Header: "gltfFileLastModifDateString",
            accessor: "gltfFileLastModifDateString",
            disableFilters: true,
        },
        {
            Header: "femSimDataFileName",
            accessor: "femSimDataFileName",
            disableFilters: true,
        }, 
        {
            Header: "femSimDataFileLastModifDateString",
            accessor: "femSimDataFileLastModifDateString",
            disableFilters: true,
        },
        {
            Header: "digitalTwinSimulationFormat",
            accessor: "digitalTwinSimulationFormat",
            disableFilters: true
        },
        {
            Header: "sensorSimulationTopicId",
            accessor: "sensorSimulationTopicId",
            disableFilters: true
        },
        {
            Header: "assetStateTopicId",
            accessor: "assetStateTopicId",
            disableFilters: true
        },
        {
            Header: "assetStateSimulationTopicId",
            accessor: "assetStateSimulationTopicId",
            disableFilters: true
        },
        {
            Header: "femResultModalValuesTopicId",
            accessor: "femResultModalValuesTopicId",
            disableFilters: true
        },
        {
            Header: "femResultModalValuesSimulationTopicId",
            accessor: "femResultModalValuesSimulationTopicId",
            disableFilters: true
        },        
        {
            Header: "",
            accessor: "edit",
            disableFilters: true,
            disableSortBy: true,
            Cell: props => {
                const rowIndex = parseInt(props.row.id, 10);
                const row = props.rows.filter(row => row.index === rowIndex)[0];
                const digitalTwinId = row?.cells[0]?.value;
                return <EditDigitalTwin digitalTwinId={digitalTwinId} rowIndex={rowIndex} />
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
                const digitalTwinId = row?.cells[0]?.value;
                const groupId = row?.cells[1]?.value;
                const deviceId = row?.cells[2]?.value;
                return <DeleteDigitalTwinModal digitalTwinId={digitalTwinId} groupId={groupId} deviceId={deviceId} rowIndex={rowIndex} refreshDigitalTwins={refreshDigitalTwins} />
            }
        }
    ]
}
