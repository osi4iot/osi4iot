import React, { FC, useCallback, useState } from 'react'
import { useAuthState, useAuthDispatch } from '../../contexts/authContext';
import { axiosAuth, getDomainName, axiosInstance } from '../../tools/tools';
import { MEASUREMENTS_OPTIONS } from './platformAssistantOptions';
import { ITopic } from './TableColumns/topicsColumns';
import {
    useMeasurementsDispatch,
    useMeasurementsOptionToShow,
    setMeasurementsOptionToShow,
} from '../../contexts/measurementsOptions';
import SelectTopic from './SelectTopic';
import { Create_MEASUREMENTS_COLUMNS, IMeasurement } from './TableColumns/measurementsColumns';
import TableWithPaginationAsync from './TableWithPaginationAsync';
import { ISelectTopic } from './TableColumns/selectTopicColumns';
import EditMeasurement from './EditMeasurement';
import { IDevice } from './TableColumns/devicesColumns';
import timeRangeCalculator from '../../tools/timeRangeCalculator';

const giveMeasurementTopic = (devices: IDevice[], selectedTopic: ITopic) => {
    const deviceId = selectedTopic.deviceId;
    const deviceUid = devices.filter(device => device.id === deviceId)[0].deviceUid;
    const topicUid = selectedTopic.topicUid;
    const topic = `Device_${deviceUid}/Topic_${topicUid}`;
    return topic;
}

const domainName = getDomainName();

interface MeasurementsContainerProps {
    devices: IDevice[];
    topics: ITopic[];
}

const MeasurementsContainer: FC<MeasurementsContainerProps> = ({ devices, topics }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const measurementsDispatch = useMeasurementsDispatch();
    const measurementsOptionToShow = useMeasurementsOptionToShow();
    const [selectedTopic, setSelectedTopic] = useState<ITopic>(topics[0]);
    const [measurementsTable, setMeasurementsTable] = useState<IMeasurement[]>([]);
    const [measurementsLoading, setMeasurementsLoading] = useState(false);
    const [pageCount, setPageCount] = useState(0);
    const [initialStartDate, initialEndDate] = timeRangeCalculator("Last 15 minutes");
    const [startDate, setStartDate] = useState(initialStartDate);
    const [endDate, setEndDate] = useState(initialEndDate);
    const [selectedTimeRange, setSelectedTimeRange] = useState("Last 15 minutes");

    const groupId = selectedTopic.groupId;
    const measurementTopic = giveMeasurementTopic(devices, selectedTopic);

    const updateMeasurementsTable = (measurementsTable: IMeasurement[]) => {
        setMeasurementsTable(measurementsTable);
    }

    const refreshMeasurements = () => {
        fetchMeasurements(0, 10);
    }

    const fetchMeasurements = useCallback(
        (pageIndex: number, itemsPerPage: number) => {
            const config = axiosAuth(accessToken);
            let urlMeasurements = `https://${domainName}/admin_api/measurements_pagination/${groupId}`
            const paginationData = {
                topic: measurementTopic,
                startDate,
                endDate,
                pageIndex,
                itemsPerPage
            }
            axiosInstance(refreshToken, authDispatch)
                .post(urlMeasurements, paginationData, config)
                .then((response) => {
                    const measurements = response.data;
                    measurements.map((measurement: { payload: Object; }) => {
                        measurement.payload = JSON.stringify(measurement.payload);
                        return measurement;
                    })
                    setMeasurementsTable(measurements);
                    if (measurements.length !== 0) {
                        if (pageIndex === 0) {
                            setPageCount(Math.ceil(measurements[0].totalRows / itemsPerPage))
                        }
                    } else {
                        setPageCount(0);
                    }
                    setMeasurementsLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });
        }, [accessToken, refreshToken, authDispatch, startDate, endDate, groupId, measurementTopic])

    const showMeasurementsTableOption = () => {
        setMeasurementsOptionToShow(measurementsDispatch, { measurementsOptionToShow: MEASUREMENTS_OPTIONS.TABLE });
    }

    const showMeasurementSelectionTable = () => {
        setMeasurementsOptionToShow(measurementsDispatch, { measurementsOptionToShow: MEASUREMENTS_OPTIONS.SELECT_TOPIC });
    }

    const giveSelectedTopic = (selectedTopic: ISelectTopic | null) => {
        if (selectedTopic) {
            const topicsFiltered = topics.filter(topic => topic.id === selectedTopic.id);
            setSelectedTopic(topicsFiltered[0])
        }
    }

    return (
        <>
            {
                measurementsOptionToShow === MEASUREMENTS_OPTIONS.SELECT_TOPIC &&
                <SelectTopic
                    backToTable={showMeasurementsTableOption}
                    giveSelectedTopic={giveSelectedTopic}
                />
            }
            {measurementsOptionToShow === MEASUREMENTS_OPTIONS.EDIT_MEASUREMENT &&
                <EditMeasurement
                    groupId={selectedTopic.groupId}
                    measurements={measurementsTable}
                    backToTable={showMeasurementsTableOption}
                    updateMeasurementsTable={updateMeasurementsTable}
                />
            }
            {measurementsOptionToShow === MEASUREMENTS_OPTIONS.TABLE &&
                <TableWithPaginationAsync
                    dataTable={measurementsTable}
                    columnsTable={Create_MEASUREMENTS_COLUMNS(selectedTopic.groupId, measurementTopic, refreshMeasurements)}
                    componentName="measurement"
                    fetchData={fetchMeasurements}
                    loading={measurementsLoading}
                    pageCount={pageCount}
                    showMeasurementSelectionTable={showMeasurementSelectionTable}
                    selectedTopic={selectedTopic}
                    selectedTimeRange={selectedTimeRange}
                    setSelectedTimeRange={(selectedTimeRange: string) => setSelectedTimeRange(selectedTimeRange)}
                    setStartDate={(startDateString: string) => setStartDate(startDateString)}
                    setEndDate={(endDateString: string) => setEndDate(endDateString)}
                />
            }
        </>
    )
}

export default MeasurementsContainer;