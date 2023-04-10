import React, { FC } from 'react'
import TableWithPagination from '../Utils/TableWithPagination';
import { DIGITAL_TWINS_OPTIONS } from '../Utils/platformAssistantOptions';
import { setDigitalTwinsOptionToShow, useDigitalTwinsDispatch, useDigitalTwinsOptionToShow } from '../../../contexts/digitalTwinsOptions';
import { Create_DIGITAL_TWINS_COLUMNS, IDigitalTwin } from '../TableColumns/digitalTwinsColumns';
import CreateDigitalTwin from './CreateDigitalTwin';
import EditDigitalTwin from './EditDigitalTwin';

interface DigitalTwinsContainerProps {
    digitalTwins: IDigitalTwin[];
    refreshDigitalTwins: () => void;
}

const DigitalTwinsContainer: FC<DigitalTwinsContainerProps> = ({ digitalTwins, refreshDigitalTwins }) => {
    const digitalTwinsDispatch = useDigitalTwinsDispatch();
    const digitalTwinsOptionToShow = useDigitalTwinsOptionToShow();

    const showhDigitalTwinsTableOption = () => {
        setDigitalTwinsOptionToShow(digitalTwinsDispatch, { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.TABLE });
    }

    return (
        <>
            {digitalTwinsOptionToShow === DIGITAL_TWINS_OPTIONS.CREATE_DIGITAL_TWIN && <CreateDigitalTwin backToTable={showhDigitalTwinsTableOption} refreshDigitalTwins={refreshDigitalTwins} />}
            {digitalTwinsOptionToShow === DIGITAL_TWINS_OPTIONS.EDIT_DIGITAL_TWIN && <EditDigitalTwin digitalTwins={digitalTwins} backToTable={showhDigitalTwinsTableOption} refreshDigitalTwins={refreshDigitalTwins} />}
            { digitalTwinsOptionToShow === DIGITAL_TWINS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={digitalTwins}
                    columnsTable={Create_DIGITAL_TWINS_COLUMNS(refreshDigitalTwins)}
                    componentName="digital twin"
                    reloadTable={refreshDigitalTwins}
                    createComponent={() => setDigitalTwinsOptionToShow(digitalTwinsDispatch, { digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.CREATE_DIGITAL_TWIN })}
                />
            }
        </>
    )
}

export default DigitalTwinsContainer;