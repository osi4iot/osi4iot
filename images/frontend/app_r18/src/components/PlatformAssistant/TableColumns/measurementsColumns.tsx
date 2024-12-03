import { FC, useState, useEffect } from 'react';
import { Column } from 'react-table';
import { toast } from 'react-toastify';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import EditIcon from '../Utils/EditIcon';
import DeleteIcon from '../Utils/DeleteIcon';
import DeleteModal from '../../Tools/DeleteModal';
import { MEASUREMENTS_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    useMeasurementsDispatch,
    setMeasurementsOptionToShow,
    setMeasurementTimestampToEdit,
    setMeasurementRowIndexToEdit
} from '../../../contexts/measurementsOptions';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { AxiosResponse, AxiosError } from 'axios';

export interface IMeasurement {
    timestamp: number;
    topic: string;
    payload: any;
}

export interface IGeolocationMeasurement {
	timestamp: string;
	assetUid: string;
	longitude: number;
	latitude: number;
}

interface IMeasurementColumn extends IMeasurement {
    edit: string;
    delete: string;
}

interface DeleteMeasurementModalProps {
    groupId: number;
    topic: string;
    payloadKey: string;
    rowIndex: number;
    timestamp: string;
    refreshMeasurements: () => void;
}

const domainName = getDomainName();
const protocol = getProtocol();

const DeleteMeasurementModal: FC<DeleteMeasurementModalProps> = ({
    groupId,
    topic,
    payloadKey,
    rowIndex,
    timestamp,
    refreshMeasurements
}) => {
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
            topic,
            payloadKey,
        }
        const url = `${protocol}://${domainName}/admin_api/sensor_measurement/${groupId}`;
        const config: { headers: { Authorization: string } } = axiosAuth(accessToken);
        const headers = config.headers;
        getAxiosInstance(refreshToken, authDispatch)
            .delete(url, { data: payload, headers })
            .then((response: AxiosResponse<any, any>) => {
                setIsMeasurementDeleted(true);
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

interface EditMeasurementProps {
    rowIndex: number;
    timestamp: number;
}

const EditMeasurement: FC<EditMeasurementProps> = ({ rowIndex, timestamp }) => {
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
        payloadKey: string,
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
                        payloadKey={payloadKey}
                        timestamp={timestamp}
                        rowIndex={rowIndex}
                        refreshMeasurements={refreshMeasurements}
                    />
                }
            }
        ]
    }
