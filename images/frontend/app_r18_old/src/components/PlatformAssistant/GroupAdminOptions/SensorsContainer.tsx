import React, { FC } from 'react'
import TableWithPagination from '../Utils/TableWithPagination';
import { SENSORS_OPTIONS } from '../Utils/platformAssistantOptions';
import CreateSensor from './CreateSensor';
import EditSensor from './EditSensor';
import { Create_SENSORS_COLUMNS, ISensor } from '../TableColumns/sensorsColumns';
import {
    setSensorsOptionToShow,
    useSensorsDispatch,
    useSensorsOptionToShow
} from '../../../contexts/sensorsOptions';

interface SensorsContainerProps {
    sensors: ISensor[];
    refreshSensors: () => void;
}

const SensorsContainer: FC<SensorsContainerProps> = ({ sensors, refreshSensors }) => {
    const sensorsDispatch = useSensorsDispatch();
    const sensorsOptionToShow = useSensorsOptionToShow();

    const showSensorsTableOption = () => {
        setSensorsOptionToShow(sensorsDispatch, { sensorsOptionToShow: SENSORS_OPTIONS.TABLE });
    }

    return (
        <>
            {sensorsOptionToShow === SENSORS_OPTIONS.CREATE_SENSOR &&
                <CreateSensor backToTable={showSensorsTableOption} refreshSensors={refreshSensors} />
            }
            {sensorsOptionToShow === SENSORS_OPTIONS.EDIT_SENSOR &&
                <EditSensor sensors={sensors} backToTable={showSensorsTableOption} refreshSensors={refreshSensors} />
            }
            {sensorsOptionToShow === SENSORS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={sensors}
                    columnsTable={Create_SENSORS_COLUMNS(refreshSensors)}
                    componentName="sensor"
                    reloadTable={refreshSensors}
                    createComponent={() => setSensorsOptionToShow(sensorsDispatch, { sensorsOptionToShow: SENSORS_OPTIONS.CREATE_SENSOR })}
                />
            }
        </>
    )
}

export default SensorsContainer;