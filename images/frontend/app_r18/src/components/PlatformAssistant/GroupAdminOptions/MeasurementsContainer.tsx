import React, { FC, useCallback, useMemo, useState } from 'react'
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { MEASUREMENTS_OPTIONS } from '../Utils/platformAssistantOptions';
import { ITopic } from '../TableColumns/topicsColumns';
import {
    useMeasurementsDispatch,
    useMeasurementsOptionToShow,
    setMeasurementsOptionToShow,
} from '../../../contexts/measurementsOptions';
import { Create_MEASUREMENTS_COLUMNS, IMeasurement } from '../TableColumns/measurementsColumns';
import TableWithPaginationAsync from '../Utils/TableWithPaginationAsync';
import EditMeasurement from './EditMeasurement';
import timeRangeCalculator from '../../../tools/timeRangeCalculator';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { ISensor } from '../TableColumns/sensorsColumns';
import SelectSensor from './SelectSensor';
import { ISelectSensor } from '../TableColumns/selectSensorColumns';
import { AxiosError, AxiosResponse } from 'axios';

const giveMeasurementSensor = (selectedSensor: ISensor) => {
    const topicUid = selectedSensor.topicUid;
    const topic = `Topic_${topicUid}`;
    return topic;
}

const domainName = getDomainName();
const protocol = getProtocol();

interface MeasurementsContainerProps {
    sensors: ISensor[];
    topics: ITopic[];
}

const MeasurementsContainer: FC<MeasurementsContainerProps> = ({ sensors, topics }) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const measurementsDispatch = useMeasurementsDispatch();
    const measurementsOptionToShow = useMeasurementsOptionToShow();
    const [selectedSensor, setSelectedSensor] = useState<ISensor>(sensors[0]);
    const [measurementsTable, setMeasurementsTable] = useState<IMeasurement[]>([]);
    const [measurementsLoading, setMeasurementsLoading] = useState(false);
    const [pageCount, setPageCount] = useState(0);
    const [initialStartDate, initialEndDate] = useMemo(() => timeRangeCalculator("Last 15 minutes"), []);
    const [startDate, setStartDate] = useState(initialStartDate);
    const [endDate, setEndDate] = useState(initialEndDate);
    const [selectedTimeRange, setSelectedTimeRange] = useState("Last 15 minutes");

    const groupId = selectedSensor.groupId;
    const measurementTopic = useMemo(() => giveMeasurementSensor(selectedSensor), [selectedSensor]);

    const updateMeasurementsTable = (measurementsTable: IMeasurement[]) => {
        setMeasurementsTable(measurementsTable);
    }

    const fetchMeasurements = useCallback(
        (pageIndex: number, itemsPerPage: number) => {
            const config = axiosAuth(accessToken);
            let urlMeasurements = `${protocol}://${domainName}/admin_api/sensor_measurements_pagination/${groupId}`;
            const paginationData = {
                sensorId: selectedSensor.id,
                startDate,
                endDate,
                pageIndex,
                itemsPerPage
            }
            setMeasurementsLoading(true);
            getAxiosInstance(refreshToken, authDispatch)
                .post(urlMeasurements, paginationData, config)
                .then((response: AxiosResponse<any, any>) => {
                    const measurements = response.data;
                    const payloadKey = selectedSensor.payloadJsonSchema;
                    measurements.map((measurement: any) => {
                        const payload: Record<string, string> = {};
                        payload[payloadKey] = JSON.parse(measurement[payloadKey]);
                        measurement.payload = JSON.stringify(payload);
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
                .catch((error: AxiosError) => {
                    axiosErrorHandler(error, authDispatch);
                });
        },
        [
            accessToken,
            groupId,
            selectedSensor,
            startDate,
            endDate,
            refreshToken,
            authDispatch
        ]
    );

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



    const giveSelectedSensor = (selectedSensor: ISelectSensor | null) => {
        if (selectedSensor) {
            const sensorsFiltered = sensors.filter(sensor => sensor.id === selectedSensor.id);
            setSelectedSensor(sensorsFiltered[0])
        }
    }

    const columnsTable = useMemo(() => Create_MEASUREMENTS_COLUMNS(
        selectedSensor.groupId,
        measurementTopic,
        selectedSensor.payloadJsonSchema,
        refreshMeasurements
    ),
        [
            selectedSensor.groupId,
            selectedSensor.payloadJsonSchema,
            measurementTopic,
            refreshMeasurements
        ]
    );

    const dataTable = useMemo(() => measurementsTable, [measurementsTable]);

    return (
        <>
            {
                measurementsOptionToShow === MEASUREMENTS_OPTIONS.SELECT_SENSOR &&
                <SelectSensor
                    backToTable={showMeasurementsTableOption}
                    giveSelectedSensor={giveSelectedSensor}
                />
            }
            {measurementsOptionToShow === MEASUREMENTS_OPTIONS.EDIT_MEASUREMENT &&
                <EditMeasurement
                    groupId={selectedSensor.groupId}
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
                    selectedSensor={selectedSensor}
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