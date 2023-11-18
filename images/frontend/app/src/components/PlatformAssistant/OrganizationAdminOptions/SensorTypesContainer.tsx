import React, { FC, useCallback } from 'react';
import TableWithPagination from '../Utils/TableWithPagination';
import { ASSET_TYPES_OPTIONS, SENSOR_TYPES_OPTIONS } from '../Utils/platformAssistantOptions';
import { Create_SENSOR_TYPES_COLUMNS, ISensorType } from '../TableColumns/sensorTypesColumns';
import {
    setSensorTypesOptionToShow,
    useSensorTypesDispatch,
    useSensorTypesOptionToShow
} from '../../../contexts/sensorTypesOptions';
import CreateSensorType from './CreateSensorType';
import EditSensorType from './EditSensorType';

interface SensorTypesContainerProps {
    sensorTypes: ISensorType[];
    refreshSensorTypes: () => void;
}

const SensorTypesContainer: FC<SensorTypesContainerProps> = ({
    sensorTypes,
    refreshSensorTypes
}) => {
    const sensorTypesDispatch = useSensorTypesDispatch();
    const sensorTypesOptionToShow = useSensorTypesOptionToShow();

    const showSensorTypesTableOption = useCallback(() => {
        setSensorTypesOptionToShow(sensorTypesDispatch, { sensorTypesOptionToShow: SENSOR_TYPES_OPTIONS.TABLE });
    }, [sensorTypesDispatch]);

    return (
        <>

            {sensorTypesOptionToShow === SENSOR_TYPES_OPTIONS.CREATE_SENSOR_TYPE &&
                <CreateSensorType
                    backToTable={showSensorTypesTableOption}
                    refreshSensorTypes={refreshSensorTypes}
                />
            }
            {sensorTypesOptionToShow === SENSOR_TYPES_OPTIONS.EDIT_SENSOR_TYPE &&
                <EditSensorType
                    sensorTypes={sensorTypes}
                    backToTable={showSensorTypesTableOption}
                    refreshSensorTypes={refreshSensorTypes}
                />
            }
            {sensorTypesOptionToShow === ASSET_TYPES_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={sensorTypes}
                    columnsTable={Create_SENSOR_TYPES_COLUMNS(refreshSensorTypes)}
                    componentName="sensor type"
                    reloadTable={refreshSensorTypes}
                    createComponent={() =>
                        setSensorTypesOptionToShow(
                            sensorTypesDispatch,
                            { sensorTypesOptionToShow: SENSOR_TYPES_OPTIONS.CREATE_SENSOR_TYPE })
                    }
                />
            }
        </>
    )
}

export default SensorTypesContainer;
