import React, { FC, useCallback, useMemo, useState } from 'react'
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, getDomainName, axiosInstance } from '../../../tools/tools';
import { MEASUREMENTS_OPTIONS } from '../Utils/platformAssistantOptions';
import { ITopic } from '../TableColumns/topicsColumns';
import {
    useMeasurementsDispatch,
    useMeasurementsOptionToShow,
    setMeasurementsOptionToShow,
} from '../../../contexts/measurementsOptions';
import SelectTopic from './SelectTopic';
import { Create_MEASUREMENTS_COLUMNS, IMeasurement } from '../TableColumns/measurementsColumns';
import TableWithPaginationAsync from '../Utils/TableWithPaginationAsync';
import { ISelectTopic } from '../TableColumns/selectTopicColumns';
import EditMeasurement from './EditMeasurement';
import { IDevice } from '../TableColumns/devicesColumns';
import timeRangeCalculator from '../../../tools/timeRangeCalculator';

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
    const [initialStartDate, initialEndDate] = useMemo(() => timeRangeCalculator("Last 15 minutes"), []);
    const [startDate, setStartDate] = useState(initialStartDate);
    const [endDate, setEndDate] = useState(initialEndDate);
    const [selectedTimeRange, setSelectedTimeRange] = useState("Last 15 minutes");

    const groupId = selectedTopic.groupId;
    const measurementTopic = useMemo(() => giveMeasurementTopic(devices, selectedTopic), [devices, selectedTopic]);

    const updateMeasurementsTable = (measurementsTable: IMeasurement[]) => {
        setMeasurementsTable(measurementsTable);
    }

    const fetchMeasurements = useCallback(
        (pageIndex: number, itemsPerPage: number) => {
            const config = axiosAuth(accessToken);
            let urlMeasurements = `${domainName}/admin_api/measurements_pagination/${groupId}`
            const paginationData = {
                topic: measurementTopic,
                startDate,
                endDate,
                pageIndex,
                itemsPerPage
            }
            setMeasurementsLoading(true);
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
        }, [accessToken, refreshToken, authDispatch, startDate, endDate, groupId, measurementTopic]);

    const refreshMeasurements = useCallback(() => {
        fetchMeasurements(0, 10);
    }, [fetchMeasurements]);

    const showMeasurementsTableOption = useCallback(() => {
        setMeasurementsOptionToShow(measurementsDispatch, { measurementsOptionToShow: MEASUREMENTS_OPTIONS.TABLE });
    }, [measurementsDispatch])

    const showMeasurementSelectionTable = useCallback(() => {
        setMeasurementsOptionToShow(measurementsDispatch, { measurementsOptionToShow: MEASUREMENTS_OPTIONS.SELECT_TOPIC });
    }, [measurementsDispatch]);

    const giveStartDate = useCallback((startDateString: string) => {
        setStartDate(startDateString)
    }, []);

    const giveEndDate = useCallback((endDateString: string) => {
        setEndDate(endDateString);
    }, []);

    const giveSelectedTimeRange = useCallback((selectedTimeRange: string) => {
        setSelectedTimeRange(selectedTimeRange);
    }, []);


    const giveSelectedTopic = (selectedTopic: ISelectTopic | null) => {
        if (selectedTopic) {
            const topicsFiltered = topics.filter(topic => topic.id === selectedTopic.id);
            setSelectedTopic(topicsFiltered[0])
        }
    }

    const columnsTable = useMemo(() => Create_MEASUREMENTS_COLUMNS(selectedTopic.groupId, measurementTopic, refreshMeasurements),
        [selectedTopic.groupId, measurementTopic, refreshMeasurements]);

    const dataTable = useMemo(() => measurementsTable, [measurementsTable]);

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
                    data={dataTable}
                    columns={columnsTable}
                    fetchData={fetchMeasurements}
                    refreshMeasurements={refreshMeasurements}
                    measurementTopic={measurementTopic}
                    loading={measurementsLoading}
                    pageCount={pageCount}
                    showMeasurementSelectionTable={showMeasurementSelectionTable}
                    selectedTopic={selectedTopic}
                    selectedTimeRange={selectedTimeRange}
                    setSelectedTimeRange={giveSelectedTimeRange}
                    setStartDate={giveStartDate}
                    setEndDate={giveEndDate}
                />
            }
        </>
    )
}

export default MeasurementsContainer;