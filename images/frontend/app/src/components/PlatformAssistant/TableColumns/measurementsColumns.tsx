import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, axiosInstance } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../EditIcon';
import DeleteIcon from '../DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { MEASUREMENTS_OPTIONS } from '../platformAssistantOptions';
import {
    useMeasurementsDispatch,
    setMeasurementsOptionToShow,
    setMeasurementTimestampToEdit,
    setMeasurementRowIndexToEdit
} from '../../../contexts/measurementsOptions';

export interface IMeasurement {
    timestamp: number;
    topic: string;
    payload: string;
}

interface IMeasurementColumn extends IMeasurement {
    edit: string;
    delete: string;
}

interface DeleteMeasurementModalProps {
    groupId: number;
    topic: string;
    rowIndex: number;
    timestamp: number;
    refreshMeasurements: () => void;
}

const domainName = getDomainName();

const DeleteMeasurementModal: FC<DeleteMeasurementModalProps> = ({ groupId, topic, rowIndex, timestamp, refreshMeasurements }) => {
    const [isMeasurementDeleted, setIsMeasurementDeleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const title = "DELETE MEASUREMENT";
    const question = "Are you sure to delete this measurement?";
    const consequences = "This measurement can be recovered.";
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();

    const showLoader = () => {
        setIsSubmitting(true);
    }

    useEffect(() => {
        if (isMeasurementDeleted) {
            refreshMeasurements();
        }
    }, [isMeasurementDeleted, refreshMeasurements]);

    const action = (hideModal: () => void) => {
        const payload = {
            timestamp,
            topic
        }
        const url = `https://${domainName}/admin_api/measurement/${groupId}`;
        const config: { headers: { Authorization: string } } = axiosAuth(accessToken);
        const headers = config.headers;
        axiosInstance(refreshToken, authDispatch)
            .delete(url, { data: payload, headers })
            .then((response) => {
                setIsMeasurementDeleted(true);
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

interface EditMeasurementProps {
    rowIndex: number;
    timestamp: number;
}

const EditMeasurement: FC<EditMeasurementProps> = ({ rowIndex, timestamp}) => {
    const measurementsDispatch = useMeasurementsDispatch()

    const handleClick = () => {
        const measurementTimestampToEdit = { measurementTimestampToEdit: timestamp };
        setMeasurementTimestampToEdit(measurementsDispatch, measurementTimestampToEdit);

        const measurementRowIndexToEdit = { measurementRowIndexToEdit: rowIndex };
        setMeasurementRowIndexToEdit(measurementsDispatch, measurementRowIndexToEdit);

        const measurementsOptionToShow = { measurementsOptionToShow: MEASUREMENTS_OPTIONS.EDIT_MEASUREMENT };
        setMeasurementsOptionToShow(measurementsDispatch, measurementsOptionToShow);
    };


    return (
        <span onClick={handleClick}>
            <EditIcon rowIndex={rowIndex} />
        </span>
    )
}


export const Create_MEASUREMENTS_COLUMNS =
    (
        groupId: number,
        measurementTopic: string,
        refreshMeasurements: () => void
    ): Column<IMeasurementColumn>[] => {
        return [
            {
                Header: "Timestamp",
                accessor: "timestamp",
                filter: 'equals'
            },
            {
                Header: "topic",
                accessor: "topic",
            },
            {
                Header: "Payload",
                accessor: "payload",
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
                    const timestamp = row?.cells[0]?.value;
                    return <EditMeasurement timestamp={timestamp} rowIndex={rowIndex} />
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
                    const timestamp = row?.cells[0]?.value;
                    return <DeleteMeasurementModal
                        groupId={groupId}
                        topic={measurementTopic}
                        timestamp={timestamp}
                        rowIndex={rowIndex}
                        refreshMeasurements={refreshMeasurements}
                    />
                }
            }
        ]
    }
